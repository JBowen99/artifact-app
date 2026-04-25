package service

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Project struct {
	ID          uuid.UUID
	Name        string
	Description string
	RepoPath    string
	OwnerID     uuid.UUID
	TeamID      *uuid.UUID
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

type Branch struct {
	ID         uuid.UUID
	ProjectID  uuid.UUID
	Name       string
	IsDefault  bool
	HeadCommit *string
	CreatedAt  time.Time
}

type ProjectService struct {
	pool       *pgxpool.Pool
	gitService *GitService
}

func NewProjectService(pool *pgxpool.Pool, gitService *GitService) *ProjectService {
	return &ProjectService{
		pool:       pool,
		gitService: gitService,
	}
}

func (s *ProjectService) CreateProject(ctx context.Context, ownerID, name, description string, teamID *string) (*Project, *Branch, error) {
	if name == "" {
		return nil, nil, fmt.Errorf("project name is required")
	}

	projectID := uuid.New()

	repoPath, err := s.gitService.InitBareRepo(projectID.String())
	if err != nil {
		return nil, nil, fmt.Errorf("init repo: %w", err)
	}

	var teamUUID *uuid.UUID
	if teamID != nil && *teamID != "" {
		parsed, err := uuid.Parse(*teamID)
		if err != nil {
			return nil, nil, fmt.Errorf("invalid team_id: %w", err)
		}
		teamUUID = &parsed
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		s.gitService.DeleteRepo(projectID.String())
		return nil, nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	var project Project
	err = tx.QueryRow(ctx,
		`INSERT INTO projects (name, description, repo_path, owner_id, team_id)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, name, description, repo_path, owner_id, team_id, created_at, updated_at`,
		name, description, repoPath, ownerID, teamUUID,
	).Scan(&project.ID, &project.Name, &project.Description, &project.RepoPath,
		&project.OwnerID, &project.TeamID, &project.CreatedAt, &project.UpdatedAt)
	if err != nil {
		s.gitService.DeleteRepo(projectID.String())
		return nil, nil, fmt.Errorf("insert project: %w", err)
	}

	headHash, err := s.gitService.GetBranchHash(projectID.String(), "main")
	if err != nil {
		s.gitService.DeleteRepo(projectID.String())
		return nil, nil, fmt.Errorf("get initial commit hash: %w", err)
	}

	var branch Branch
	err = tx.QueryRow(ctx,
		`INSERT INTO branches (project_id, name, is_default, head_commit)
		 VALUES ($1, 'main', true, $2)
		 RETURNING id, project_id, name, is_default, head_commit, created_at`,
		project.ID, headHash,
	).Scan(&branch.ID, &branch.ProjectID, &branch.Name, &branch.IsDefault, &branch.HeadCommit, &branch.CreatedAt)
	if err != nil {
		s.gitService.DeleteRepo(projectID.String())
		return nil, nil, fmt.Errorf("insert default branch: %w", err)
	}

	_, err = tx.Exec(ctx,
		`INSERT INTO project_permissions (project_id, user_id, role)
		 VALUES ($1, $2, 'admin')`,
		project.ID, ownerID,
	)
	if err != nil {
		s.gitService.DeleteRepo(projectID.String())
		return nil, nil, fmt.Errorf("set owner permission: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		s.gitService.DeleteRepo(projectID.String())
		return nil, nil, fmt.Errorf("commit tx: %w", err)
	}

	return &project, &branch, nil
}

func (s *ProjectService) GetProject(ctx context.Context, projectID string) (*Project, error) {
	var project Project
	err := s.pool.QueryRow(ctx,
		`SELECT id, name, description, repo_path, owner_id, team_id, created_at, updated_at
		 FROM projects WHERE id = $1`,
		projectID,
	).Scan(&project.ID, &project.Name, &project.Description, &project.RepoPath,
		&project.OwnerID, &project.TeamID, &project.CreatedAt, &project.UpdatedAt)
	if err != nil {
		if IsNotFound(err) {
			return nil, fmt.Errorf("project not found")
		}
		return nil, err
	}
	return &project, nil
}

func (s *ProjectService) ListProjects(ctx context.Context, userID string, page, limit int) ([]Project, int64, error) {
	offset := (page - 1) * limit

	var total int64
	err := s.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM projects
		 WHERE owner_id = $1
		    OR id IN (SELECT project_id FROM project_permissions WHERE user_id = $1)`,
		userID,
	).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	rows, err := s.pool.Query(ctx,
		`SELECT id, name, description, repo_path, owner_id, team_id, created_at, updated_at
		 FROM projects
		 WHERE owner_id = $1
		    OR id IN (SELECT project_id FROM project_permissions WHERE user_id = $1)
		 ORDER BY updated_at DESC
		 LIMIT $2 OFFSET $3`,
		userID, limit, offset,
	)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var projects []Project
	for rows.Next() {
		var p Project
		if err := rows.Scan(&p.ID, &p.Name, &p.Description, &p.RepoPath,
			&p.OwnerID, &p.TeamID, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, 0, err
		}
		projects = append(projects, p)
	}

	return projects, total, nil
}

func (s *ProjectService) UpdateProject(ctx context.Context, projectID string, name, description *string) (*Project, error) {
	var project Project
	err := s.pool.QueryRow(ctx,
		`UPDATE projects
		 SET name = COALESCE($2, name),
		     description = COALESCE($3, description),
		     updated_at = now()
		 WHERE id = $1
		 RETURNING id, name, description, repo_path, owner_id, team_id, created_at, updated_at`,
		projectID, name, description,
	).Scan(&project.ID, &project.Name, &project.Description, &project.RepoPath,
		&project.OwnerID, &project.TeamID, &project.CreatedAt, &project.UpdatedAt)
	if err != nil {
		if IsNotFound(err) {
			return nil, fmt.Errorf("project not found")
		}
		return nil, err
	}
	return &project, nil
}

func (s *ProjectService) DeleteProject(ctx context.Context, projectID string) error {
	var repoPath string
	err := s.pool.QueryRow(ctx,
		`DELETE FROM projects WHERE id = $1 RETURNING repo_path`,
		projectID,
	).Scan(&repoPath)
	if err != nil {
		if IsNotFound(err) {
			return fmt.Errorf("project not found")
		}
		return err
	}

	_ = s.gitService.DeleteRepo(projectID)
	return nil
}

func (s *ProjectService) CreateBranch(ctx context.Context, projectID, name, sourceBranch string) (*Branch, error) {
	if name == "" {
		return nil, fmt.Errorf("branch name is required")
	}
	if sourceBranch == "" {
		return nil, fmt.Errorf("source branch is required")
	}

	_, err := s.GetProject(ctx, projectID)
	if err != nil {
		return nil, err
	}

	commitHash, err := s.gitService.CreateBranch(projectID, name, sourceBranch)
	if err != nil {
		return nil, fmt.Errorf("create git branch: %w", err)
	}

	var branch Branch
	err = s.pool.QueryRow(ctx,
		`INSERT INTO branches (project_id, name, is_default, head_commit)
		 VALUES ($1, $2, false, $3)
		 RETURNING id, project_id, name, is_default, head_commit, created_at`,
		projectID, name, commitHash,
	).Scan(&branch.ID, &branch.ProjectID, &branch.Name, &branch.IsDefault, &branch.HeadCommit, &branch.CreatedAt)
	if err != nil {
		s.gitService.DeleteBranch(projectID, name)
		if IsUniqueViolation(err) {
			return nil, fmt.Errorf("branch %q already exists", name)
		}
		return nil, fmt.Errorf("insert branch: %w", err)
	}

	return &branch, nil
}

func (s *ProjectService) GetBranch(ctx context.Context, projectID, branchID string) (*Branch, error) {
	var branch Branch
	err := s.pool.QueryRow(ctx,
		`SELECT id, project_id, name, is_default, head_commit, created_at
		 FROM branches WHERE id = $1 AND project_id = $2`,
		branchID, projectID,
	).Scan(&branch.ID, &branch.ProjectID, &branch.Name, &branch.IsDefault, &branch.HeadCommit, &branch.CreatedAt)
	if err != nil {
		if IsNotFound(err) {
			return nil, fmt.Errorf("branch not found")
		}
		return nil, err
	}
	return &branch, nil
}

func (s *ProjectService) ListBranches(ctx context.Context, projectID string) ([]Branch, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, project_id, name, is_default, head_commit, created_at
		 FROM branches WHERE project_id = $1
		 ORDER BY is_default DESC, name`,
		projectID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var branches []Branch
	for rows.Next() {
		var b Branch
		if err := rows.Scan(&b.ID, &b.ProjectID, &b.Name, &b.IsDefault, &b.HeadCommit, &b.CreatedAt); err != nil {
			return nil, err
		}
		branches = append(branches, b)
	}

	return branches, nil
}

func (s *ProjectService) DeleteBranch(ctx context.Context, projectID, branchID string) error {
	var branch Branch
	err := s.pool.QueryRow(ctx,
		`SELECT id, project_id, name, is_default, head_commit, created_at
		 FROM branches WHERE id = $1 AND project_id = $2`,
		branchID, projectID,
	).Scan(&branch.ID, &branch.ProjectID, &branch.Name, &branch.IsDefault, &branch.HeadCommit, &branch.CreatedAt)
	if err != nil {
		if IsNotFound(err) {
			return fmt.Errorf("branch not found")
		}
		return err
	}

	if branch.IsDefault {
		return fmt.Errorf("cannot delete the default branch")
	}

	_, err = s.pool.Exec(ctx,
		`DELETE FROM branches WHERE id = $1`,
		branchID,
	)
	if err != nil {
		return err
	}

	_ = s.gitService.DeleteBranch(projectID, branch.Name)
	return nil
}

func (s *ProjectService) GetBranchByName(ctx context.Context, projectID, branchName string) (*Branch, error) {
	var branch Branch
	err := s.pool.QueryRow(ctx,
		`SELECT id, project_id, name, is_default, head_commit, created_at
		 FROM branches WHERE project_id = $1 AND name = $2`,
		projectID, branchName,
	).Scan(&branch.ID, &branch.ProjectID, &branch.Name, &branch.IsDefault, &branch.HeadCommit, &branch.CreatedAt)
	if err != nil {
		if IsNotFound(err) {
			return nil, fmt.Errorf("branch %q not found", branchName)
		}
		return nil, err
	}
	return &branch, nil
}
