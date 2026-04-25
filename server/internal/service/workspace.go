package service

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Workspace struct {
	ID           uuid.UUID
	ProjectID    uuid.UUID
	UserID       uuid.UUID
	BranchID     uuid.UUID
	Name         string
	RootPath     string
	LastSyncedAt *time.Time
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

type WorkspaceFile struct {
	WorkspaceID   uuid.UUID
	FileID        uuid.UUID
	SyncedVersion int
	LocalPath     string
	SyncedAt      time.Time
	Path          string
	FileName      string
	LatestVersion int
}

type WorkspaceService struct {
	pool           *pgxpool.Pool
	projectService *ProjectService
	lockService    *LockService
}

func NewWorkspaceService(pool *pgxpool.Pool, projectService *ProjectService, lockService *LockService) *WorkspaceService {
	return &WorkspaceService{
		pool:           pool,
		projectService: projectService,
		lockService:    lockService,
	}
}

func (s *WorkspaceService) CreateWorkspace(ctx context.Context, projectID, userID, name, branch, rootPath string) (*Workspace, error) {
	if name == "" {
		return nil, fmt.Errorf("workspace name is required")
	}
	if branch == "" {
		branch = "main"
	}

	_, err := s.projectService.GetProject(ctx, projectID)
	if err != nil {
		return nil, fmt.Errorf("project not found: %w", err)
	}

	branchObj, err := s.projectService.GetBranchByName(ctx, projectID, branch)
	if err != nil {
		return nil, fmt.Errorf("branch not found: %w", err)
	}

	if rootPath == "" {
		rootPath = "/"
	}

	var ws Workspace
	err = s.pool.QueryRow(ctx,
		`INSERT INTO workspaces (project_id, user_id, branch_id, name, root_path)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, project_id, user_id, branch_id, name, root_path, last_synced_at, created_at, updated_at`,
		projectID, userID, branchObj.ID, name, rootPath,
	).Scan(&ws.ID, &ws.ProjectID, &ws.UserID, &ws.BranchID, &ws.Name, &ws.RootPath,
		&ws.LastSyncedAt, &ws.CreatedAt, &ws.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("insert workspace: %w", err)
	}

	return &ws, nil
}

func (s *WorkspaceService) ListWorkspacesByProject(ctx context.Context, projectID string) ([]Workspace, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, project_id, user_id, branch_id, name, root_path, last_synced_at, created_at, updated_at
		 FROM workspaces WHERE project_id = $1
		 ORDER BY updated_at DESC`,
		projectID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var workspaces []Workspace
	for rows.Next() {
		var ws Workspace
		if err := rows.Scan(&ws.ID, &ws.ProjectID, &ws.UserID, &ws.BranchID, &ws.Name, &ws.RootPath,
			&ws.LastSyncedAt, &ws.CreatedAt, &ws.UpdatedAt); err != nil {
			return nil, err
		}
		workspaces = append(workspaces, ws)
	}

	return workspaces, nil
}

func (s *WorkspaceService) GetWorkspace(ctx context.Context, workspaceID string) (*Workspace, error) {
	var ws Workspace
	err := s.pool.QueryRow(ctx,
		`SELECT id, project_id, user_id, branch_id, name, root_path, last_synced_at, created_at, updated_at
		 FROM workspaces WHERE id = $1`,
		workspaceID,
	).Scan(&ws.ID, &ws.ProjectID, &ws.UserID, &ws.BranchID, &ws.Name, &ws.RootPath,
		&ws.LastSyncedAt, &ws.CreatedAt, &ws.UpdatedAt)
	if err != nil {
		if IsNotFound(err) {
			return nil, fmt.Errorf("workspace not found")
		}
		return nil, err
	}
	return &ws, nil
}

func (s *WorkspaceService) UpdateWorkspace(ctx context.Context, workspaceID string, name, rootPath *string, branch *string) (*Workspace, error) {
	var branchID *uuid.UUID
	if branch != nil && *branch != "" {
		ws, err := s.GetWorkspace(ctx, workspaceID)
		if err != nil {
			return nil, err
		}
		branchObj, err := s.projectService.GetBranchByName(ctx, ws.ProjectID.String(), *branch)
		if err != nil {
			return nil, fmt.Errorf("branch not found: %w", err)
		}
		branchID = &branchObj.ID
	}

	var ws Workspace
	err := s.pool.QueryRow(ctx,
		`UPDATE workspaces
		 SET name = COALESCE($2, name),
		     root_path = COALESCE($3, root_path),
		     branch_id = COALESCE($4, branch_id),
		     updated_at = now()
		 WHERE id = $1
		 RETURNING id, project_id, user_id, branch_id, name, root_path, last_synced_at, created_at, updated_at`,
		workspaceID, name, rootPath, branchID,
	).Scan(&ws.ID, &ws.ProjectID, &ws.UserID, &ws.BranchID, &ws.Name, &ws.RootPath,
		&ws.LastSyncedAt, &ws.CreatedAt, &ws.UpdatedAt)
	if err != nil {
		if IsNotFound(err) {
			return nil, fmt.Errorf("workspace not found")
		}
		return nil, err
	}
	return &ws, nil
}

func (s *WorkspaceService) DeleteWorkspace(ctx context.Context, workspaceID string) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM workspaces WHERE id = $1`, workspaceID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("workspace not found")
	}
	return nil
}

func (s *WorkspaceService) GetWorkspaceStatus(ctx context.Context, workspaceID string) (*Workspace, string, int, []PendingChangeDetail, []LockDetail, error) {
	ws, err := s.GetWorkspace(ctx, workspaceID)
	if err != nil {
		return nil, "", 0, nil, nil, err
	}

	var branchName string
	err = s.pool.QueryRow(ctx,
		`SELECT name FROM branches WHERE id = $1`,
		ws.BranchID,
	).Scan(&branchName)
	if err != nil {
		branchName = "unknown"
	}

	var syncedCount int
	err = s.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM workspace_files WHERE workspace_id = $1`,
		workspaceID,
	).Scan(&syncedCount)
	if err != nil {
		syncedCount = 0
	}

	pendingRows, err := s.pool.Query(ctx,
		`SELECT pc.id, pc.file_id, f.path, pc.change_type, pc.detected_at
		 FROM pending_changes pc
		 JOIN files f ON pc.file_id = f.id
		 WHERE pc.workspace_id = $1
		 ORDER BY pc.detected_at DESC`,
		workspaceID,
	)
	if err != nil {
		return nil, "", 0, nil, nil, err
	}
	defer pendingRows.Close()

	var pending []PendingChangeDetail
	for pendingRows.Next() {
		var p PendingChangeDetail
		if err := pendingRows.Scan(&p.ID, &p.FileID, &p.Path, &p.ChangeType, &p.DetectedAt); err != nil {
			return nil, "", 0, nil, nil, err
		}
		pending = append(pending, p)
	}

	lockRows, err := s.pool.Query(ctx,
		`SELECT l.file_id, f.path, u.display_name
		 FROM locks l
		 JOIN files f ON l.file_id = f.id
		 JOIN users u ON l.user_id = u.id
		 JOIN workspace_files wf ON wf.file_id = l.file_id AND wf.workspace_id = $1`,
		workspaceID,
	)
	if err != nil {
		return nil, "", 0, nil, nil, err
	}
	defer lockRows.Close()

	var locks []LockDetail
	for lockRows.Next() {
		var l LockDetail
		if err := lockRows.Scan(&l.FileID, &l.Path, &l.LockedBy); err != nil {
			return nil, "", 0, nil, nil, err
		}
		locks = append(locks, l)
	}

	return ws, branchName, syncedCount, pending, locks, nil
}

func (s *WorkspaceService) GetWorkspaceFiles(ctx context.Context, workspaceID string) ([]WorkspaceFile, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT wf.workspace_id, wf.file_id, wf.synced_version, wf.local_path, wf.synced_at,
		        f.path, f.file_name, f.version as latest_version
		 FROM workspace_files wf
		 JOIN files f ON wf.file_id = f.id
		 WHERE wf.workspace_id = $1
		 ORDER BY f.path`,
		workspaceID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var files []WorkspaceFile
	for rows.Next() {
		var wf WorkspaceFile
		if err := rows.Scan(&wf.WorkspaceID, &wf.FileID, &wf.SyncedVersion, &wf.LocalPath, &wf.SyncedAt,
			&wf.Path, &wf.FileName, &wf.LatestVersion); err != nil {
			return nil, err
		}
		files = append(files, wf)
	}

	return files, nil
}

func (s *WorkspaceService) SyncWorkspace(ctx context.Context, workspaceID, userID string, localVersions map[string]string) ([]SyncActionDetail, error) {
	ws, err := s.GetWorkspace(ctx, workspaceID)
	if err != nil {
		return nil, err
	}

	if ws.UserID.String() != userID {
		return nil, fmt.Errorf("workspace does not belong to this user")
	}

	serverRows, err := s.pool.Query(ctx,
		`SELECT f.id, f.path, f.version, f.size_bytes, f.content_hash
		 FROM files f
		 WHERE f.project_id = $1 AND f.branch_id = $2`,
		ws.ProjectID, ws.BranchID,
	)
	if err != nil {
		return nil, err
	}
	defer serverRows.Close()

	type serverFile struct {
		ID          uuid.UUID
		Path        string
		Version     int
		SizeBytes   int64
		ContentHash string
	}

	serverFiles := make(map[string]serverFile)
	for serverRows.Next() {
		var sf serverFile
		if err := serverRows.Scan(&sf.ID, &sf.Path, &sf.Version, &sf.SizeBytes, &sf.ContentHash); err != nil {
			return nil, err
		}
		serverFiles[sf.Path] = sf
	}

	var actions []SyncActionDetail

	for path, sf := range serverFiles {
		localVer, exists := localVersions[path]
		if !exists || localVer == "" {
			actions = append(actions, SyncActionDetail{
				Type:        "download",
				Path:        path,
				Version:     fmt.Sprintf("v%d", sf.Version),
				SizeBytes:   sf.SizeBytes,
				ContentHash: sf.ContentHash,
				DownloadURL: fmt.Sprintf("/api/v1/files/%s/download", sf.ID),
				FileID:      sf.ID.String(),
			})
		}
	}

	for path := range localVersions {
		if _, exists := serverFiles[path]; !exists {
			actions = append(actions, SyncActionDetail{
				Type: "delete",
				Path: path,
			})
		}
	}

	if len(actions) > 0 {
		tx, err := s.pool.Begin(ctx)
		if err == nil {
			for _, action := range actions {
				if action.Type == "download" && action.FileID != "" {
					fileUUID, _ := uuid.Parse(action.FileID)
					localPath := action.Path
					_, _ = tx.Exec(ctx,
						`INSERT INTO workspace_files (workspace_id, file_id, synced_version, local_path)
						 VALUES ($1, $2, 0, $3)
						 ON CONFLICT (workspace_id, file_id)
						 DO UPDATE SET synced_at = now()`,
						workspaceID, fileUUID, localPath,
					)
				} else if action.Type == "delete" {
					_, _ = tx.Exec(ctx,
						`DELETE FROM workspace_files
						 WHERE workspace_id = $1 AND local_path = $2`,
						workspaceID, action.Path,
					)
				}
			}
			tx.Exec(ctx, `UPDATE workspaces SET last_synced_at = now(), updated_at = now() WHERE id = $1`, workspaceID)
			tx.Commit(ctx)
		}
	} else {
		s.pool.Exec(ctx, `UPDATE workspaces SET last_synced_at = now(), updated_at = now() WHERE id = $1`, workspaceID)
	}

	return actions, nil
}

type PendingChangeDetail struct {
	ID         uuid.UUID
	FileID     uuid.UUID
	Path       string
	ChangeType string
	DetectedAt time.Time
}

type LockDetail struct {
	FileID   uuid.UUID
	Path     string
	LockedBy string
}

type SyncActionDetail struct {
	Type        string `json:"type"`
	Path        string `json:"path"`
	Version     string `json:"version,omitempty"`
	SizeBytes   int64  `json:"size_bytes,omitempty"`
	ContentHash string `json:"content_hash,omitempty"`
	DownloadURL string `json:"download_url,omitempty"`
	FileID      string `json:"-"`
}
