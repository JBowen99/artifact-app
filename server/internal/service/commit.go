package service

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Commit struct {
	ID            uuid.UUID
	ProjectID     uuid.UUID
	BranchID      uuid.UUID
	GitCommitHash string
	Message       string
	AuthorID      uuid.UUID
	CreatedAt     time.Time
}

type CommitFile struct {
	CommitID uuid.UUID
	FileID   uuid.UUID
	Action   string
	Path     string
	FileName string
	Message  string
}

type CommitWithAuthor struct {
	Commit
	AuthorName string
}

type CommitService struct {
	pool           *pgxpool.Pool
	projectService *ProjectService
	gitService     *GitService
	lockService    *LockService
	authService    *AuthService
	fileService    *FileService
}

func NewCommitService(
	pool *pgxpool.Pool,
	projectService *ProjectService,
	gitService *GitService,
	lockService *LockService,
	authService *AuthService,
	fileService *FileService,
) *CommitService {
	return &CommitService{
		pool:           pool,
		projectService: projectService,
		gitService:     gitService,
		lockService:    lockService,
		authService:    authService,
		fileService:    fileService,
	}
}

type SubmitFileInput struct {
	FileID          string
	Path            string
	Action          string
	UploadSessionID string
	Message         string
}

func (s *CommitService) Submit(ctx context.Context, projectID, userID string, workspaceID *string, branchName, message string, files []SubmitFileInput, releaseLocks bool) (*Commit, error) {
	if message == "" {
		return nil, fmt.Errorf("commit message is required")
	}
	if len(files) == 0 {
		return nil, fmt.Errorf("at least one file is required")
	}

	project, err := s.projectService.GetProject(ctx, projectID)
	if err != nil {
		return nil, fmt.Errorf("project not found: %w", err)
	}

	if branchName == "" {
		branchName = "main"
	}
	branch, err := s.projectService.GetBranchByName(ctx, projectID, branchName)
	if err != nil {
		return nil, fmt.Errorf("branch not found: %w", err)
	}

	author, err := s.authService.GetUserByID(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("author not found: %w", err)
	}

	for _, f := range files {
		if f.Action == "add" || f.Action == "modify" {
			locked, err := s.lockService.IsFileLockedByUser(ctx, f.FileID, userID)
			if err != nil {
				return nil, fmt.Errorf("check lock for %s: %w", f.Path, err)
			}
			if !locked {
				return nil, fmt.Errorf("file %s must be locked by you before submitting (binary file)", f.Path)
			}
		}
	}

	parentHash := ""
	if branch.HeadCommit != nil && *branch.HeadCommit != "" {
		parentHash = *branch.HeadCommit
	}

	var pointerEntries []PointerFileEntry
	for _, f := range files {
		var file *File
		if f.UploadSessionID != "" {
			completedFile, err := s.fileService.CompleteUpload(ctx, f.UploadSessionID)
			if err != nil {
				return nil, fmt.Errorf("complete upload for %s: %w", f.Path, err)
			}
			file = completedFile
			f.FileID = file.ID.String()
		} else {
			file, err = s.fileService.GetFile(ctx, f.FileID)
			if err != nil {
				return nil, fmt.Errorf("file not found %s: %w", f.Path, err)
			}
		}

		pointerContent := generatePointerFile(file.ContentHash, file.SizeBytes)
		pointerPath := fmt.Sprintf(".artifact/pointers/%s", file.ID.String())

		pointerEntries = append(pointerEntries, PointerFileEntry{
			Path:    pointerPath,
			Content: pointerContent,
		})
	}

	gitCommitHash, err := s.gitService.CreateCommitWithFiles(
		projectID, branchName, message,
		author.DisplayName, author.Email,
		parentHash, pointerEntries,
	)
	if err != nil {
		return nil, fmt.Errorf("create git commit: %w", err)
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	var commit Commit
	err = tx.QueryRow(ctx,
		`INSERT INTO commits (project_id, branch_id, git_commit_hash, message, author_id)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, project_id, branch_id, git_commit_hash, message, author_id, created_at`,
		project.ID, branch.ID, gitCommitHash, message, userID,
	).Scan(&commit.ID, &commit.ProjectID, &commit.BranchID, &commit.GitCommitHash,
		&commit.Message, &commit.AuthorID, &commit.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("insert commit: %w", err)
	}

	for _, f := range files {
		action := f.Action
		if action == "" {
			action = "modify"
		}
		_, err := tx.Exec(ctx,
			`INSERT INTO commit_files (commit_id, file_id, action, message)
			 VALUES ($1, $2, $3, $4)`,
			commit.ID, f.FileID, action, f.Message,
		)
		if err != nil {
			return nil, fmt.Errorf("insert commit file: %w", err)
		}

		if action == "add" || action == "modify" {
			pointerPath := fmt.Sprintf(".artifact/pointers/%s", f.FileID)
			_, err = tx.Exec(ctx,
				`UPDATE files SET version = version + 1, pointer_file_path = $1, updated_at = now()
				 WHERE id = $2`,
				pointerPath, f.FileID,
			)
			if err != nil {
				return nil, fmt.Errorf("update file version: %w", err)
			}
		} else if action == "delete" {
			_, err = tx.Exec(ctx, `DELETE FROM files WHERE id = $1`, f.FileID)
			if err != nil {
				return nil, fmt.Errorf("delete file: %w", err)
			}
		}
	}

	_, err = tx.Exec(ctx,
		`UPDATE branches SET head_commit = $1 WHERE id = $2`,
		gitCommitHash, branch.ID,
	)
	if err != nil {
		return nil, fmt.Errorf("update branch head: %w", err)
	}

	if releaseLocks {
		for _, f := range files {
			if f.Action != "delete" {
				_ = s.lockService.UnlockFile(ctx, f.FileID, userID)
			}
		}
	}

	if workspaceID != nil && *workspaceID != "" {
		_, _ = tx.Exec(ctx,
			`DELETE FROM pending_changes WHERE workspace_id = $1`,
			*workspaceID,
		)
		_, _ = tx.Exec(ctx,
			`UPDATE workspaces SET last_synced_at = now(), updated_at = now() WHERE id = $1`,
			*workspaceID,
		)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit transaction: %w", err)
	}

	return &commit, nil
}

func (s *CommitService) ListCommits(ctx context.Context, projectID, branchName string, page, limit int) ([]CommitWithAuthor, int64, error) {
	if branchName == "" {
		branchName = "main"
	}

	branch, err := s.projectService.GetBranchByName(ctx, projectID, branchName)
	if err != nil {
		return nil, 0, fmt.Errorf("branch not found: %w", err)
	}

	offset := (page - 1) * limit

	var total int64
	err = s.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM commits WHERE project_id = $1 AND branch_id = $2`,
		projectID, branch.ID,
	).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	rows, err := s.pool.Query(ctx,
		`SELECT c.id, c.project_id, c.branch_id, c.git_commit_hash, c.message, c.author_id, c.created_at,
		        u.display_name as author_name
		 FROM commits c
		 JOIN users u ON c.author_id = u.id
		 WHERE c.project_id = $1 AND c.branch_id = $2
		 ORDER BY c.created_at DESC
		 LIMIT $3 OFFSET $4`,
		projectID, branch.ID, limit, offset,
	)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var commits []CommitWithAuthor
	for rows.Next() {
		var c CommitWithAuthor
		if err := rows.Scan(&c.ID, &c.ProjectID, &c.BranchID, &c.GitCommitHash,
			&c.Message, &c.AuthorID, &c.CreatedAt, &c.AuthorName); err != nil {
			return nil, 0, err
		}
		commits = append(commits, c)
	}

	return commits, total, nil
}

func (s *CommitService) GetCommit(ctx context.Context, commitID string) (*CommitWithAuthor, []CommitFile, error) {
	var c CommitWithAuthor
	err := s.pool.QueryRow(ctx,
		`SELECT c.id, c.project_id, c.branch_id, c.git_commit_hash, c.message, c.author_id, c.created_at,
		        u.display_name as author_name
		 FROM commits c
		 JOIN users u ON c.author_id = u.id
		 WHERE c.id = $1`,
		commitID,
	).Scan(&c.ID, &c.ProjectID, &c.BranchID, &c.GitCommitHash,
		&c.Message, &c.AuthorID, &c.CreatedAt, &c.AuthorName)
	if err != nil {
		if IsNotFound(err) {
			return nil, nil, fmt.Errorf("commit not found")
		}
		return nil, nil, err
	}

	rows, err := s.pool.Query(ctx,
		`SELECT cf.commit_id, cf.file_id, cf.action, f.path, f.file_name, cf.message
		 FROM commit_files cf
		 JOIN files f ON cf.file_id = f.id
		 WHERE cf.commit_id = $1`,
		commitID,
	)
	if err != nil {
		return &c, nil, err
	}
	defer rows.Close()

	var files []CommitFile
	for rows.Next() {
		var cf CommitFile
		if err := rows.Scan(&cf.CommitID, &cf.FileID, &cf.Action, &cf.Path, &cf.FileName, &cf.Message); err != nil {
			return &c, nil, err
		}
		files = append(files, cf)
	}

	return &c, files, nil
}

func generatePointerFile(contentHash string, sizeBytes int64) string {
	return fmt.Sprintf("version=1\noid=sha256:%s\nsize=%d\n", contentHash, sizeBytes)
}
