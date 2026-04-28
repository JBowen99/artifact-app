package model

import "time"

type ErrorResponse struct {
	Error ErrorDetail `json:"error"`
}

type ErrorDetail struct {
	Code    string         `json:"code"`
	Message string         `json:"message"`
	Details map[string]any `json:"details,omitempty"`
}

type PaginationParams struct {
	Page  int `query:"page"`
	Limit int `query:"limit"`
}

func (p PaginationParams) Offset() int {
	return (p.Page - 1) * p.Limit
}

func (p PaginationParams) Defaults() PaginationParams {
	if p.Page <= 0 {
		p.Page = 1
	}
	if p.Limit <= 0 {
		p.Limit = 20
	}
	if p.Limit > 100 {
		p.Limit = 100
	}
	return p
}

type PaginatedResponse struct {
	Data       any   `json:"data"`
	Total      int64 `json:"total"`
	Page       int   `json:"page"`
	Limit      int   `json:"limit"`
	TotalPages int   `json:"total_pages"`
}

type HealthResponse struct {
	Status   string            `json:"status"`
	Services map[string]string `json:"services"`
}

type RegisterRequest struct {
	Email       string `json:"email"`
	Password    string `json:"password"`
	DisplayName string `json:"display_name"`
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type LoginResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int64  `json:"expires_in"`
}

type RefreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}

type UserResponse struct {
	ID          string    `json:"id"`
	Email       string    `json:"email"`
	DisplayName string    `json:"display_name"`
	Role        string    `json:"role"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type UpdateUserRequest struct {
	DisplayName *string `json:"display_name"`
	Email       *string `json:"email"`
}

type CreateProjectRequest struct {
	Name        string  `json:"name"`
	Description string  `json:"description"`
	TeamID      *string `json:"team_id"`
}

type UpdateProjectRequest struct {
	Name        *string `json:"name"`
	Description *string `json:"description"`
}

type ProjectResponse struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	RepoPath    string    `json:"repo_path"`
	OwnerID     string    `json:"owner_id"`
	TeamID      *string   `json:"team_id"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type CreateBranchRequest struct {
	Name         string `json:"name"`
	SourceBranch string `json:"source_branch"`
}

type BranchResponse struct {
	ID         string    `json:"id"`
	ProjectID  string    `json:"project_id"`
	Name       string    `json:"name"`
	IsDefault  bool      `json:"is_default"`
	HeadCommit string    `json:"head_commit"`
	CreatedAt  time.Time `json:"created_at"`
}

type FileMetadata struct {
	ID              string    `json:"id"`
	ProjectID       string    `json:"project_id"`
	BranchID        string    `json:"branch_id"`
	Path            string    `json:"path"`
	FileName        string    `json:"file_name"`
	FileType        string    `json:"file_type"`
	IsBinary        bool      `json:"is_binary"`
	ContentHash     string    `json:"content_hash"`
	SizeBytes       int64     `json:"size_bytes"`
	PointerFilePath string    `json:"pointer_file_path"`
	Version         int       `json:"version"`
	OwnerID         string    `json:"owner_id"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

type InitUploadRequest struct {
	ProjectID   string `json:"project_id"`
	Branch      string `json:"branch"`
	Path        string `json:"path"`
	FileName    string `json:"file_name"`
	FileSize    int64  `json:"file_size"`
	ContentHash string `json:"content_hash"`
}

type CreateFolderRequest struct {
	ProjectID string `json:"project_id"`
	Branch    string `json:"branch"`
	Path      string `json:"path"`
}

type CreateFolderResponse struct {
	ID        string    `json:"id"`
	Path      string    `json:"path"`
	CreatedAt time.Time `json:"created_at"`
}

type InitUploadResponse struct {
	SessionID   string `json:"session_id"`
	ChunkSize   int64  `json:"chunk_size"`
	TotalChunks int    `json:"total_chunks"`
}

type CompleteUploadResponse struct {
	FileID      string `json:"file_id"`
	ContentHash string `json:"content_hash"`
	SizeBytes   int64  `json:"size_bytes"`
	PointerFile string `json:"pointer_file"`
}

type LockResponse struct {
	LockID    string     `json:"lock_id"`
	FileID    string     `json:"file_id"`
	UserID    string     `json:"user_id"`
	LockedAt  time.Time  `json:"locked_at"`
	ExpiresAt *time.Time `json:"expires_at,omitempty"`
}

type CreateWorkspaceRequest struct {
	Name     string `json:"name"`
	Branch   string `json:"branch"`
	RootPath string `json:"root_path"`
}

type WorkspaceResponse struct {
	ID           string     `json:"id"`
	ProjectID    string     `json:"project_id"`
	UserID       string     `json:"user_id"`
	BranchID     string     `json:"branch_id"`
	Name         string     `json:"name"`
	RootPath     string     `json:"root_path"`
	LastSyncedAt *time.Time `json:"last_synced_at"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
}

type WorkspaceStatus struct {
	WorkspaceID     string          `json:"workspace_id"`
	Branch          string          `json:"branch"`
	LastSyncedAt    *time.Time      `json:"last_synced_at"`
	SyncedFileCount int             `json:"synced_file_count"`
	PendingChanges  []PendingChange `json:"pending_changes"`
	Locks           []WorkspaceLock `json:"locks"`
}

type PendingChange struct {
	FileID     string    `json:"file_id"`
	Path       string    `json:"path"`
	ChangeType string    `json:"change_type"`
	DetectedAt time.Time `json:"detected_at"`
}

type WorkspaceLock struct {
	FileID   string `json:"file_id"`
	Path     string `json:"path"`
	LockedBy string `json:"locked_by"`
}

type SyncRequest struct {
	LocalVersions map[string]string `json:"local_versions"`
}

type SyncAction struct {
	Type        string `json:"type"`
	Path        string `json:"path"`
	Version     string `json:"version,omitempty"`
	SizeBytes   int64  `json:"size_bytes,omitempty"`
	ContentHash string `json:"content_hash,omitempty"`
	DownloadURL string `json:"download_url,omitempty"`
}

type SyncResponse struct {
	Actions []SyncAction `json:"actions"`
}

type SubmitRequest struct {
	WorkspaceID  string       `json:"workspace_id"`
	Branch       string       `json:"branch"`
	Message      string       `json:"message"`
	Files        []SubmitFile `json:"files"`
	ReleaseLocks bool         `json:"release_locks"`
}

type SubmitFile struct {
	FileID          string `json:"file_id"`
	Path            string `json:"path"`
	Action          string `json:"action"`
	UploadSessionID string `json:"upload_session_id,omitempty"`
	Message         string `json:"message,omitempty"`
}

type SubmitResponse struct {
	CommitID      string    `json:"commit_id"`
	GitCommitHash string    `json:"git_commit_hash"`
	Branch        string    `json:"branch"`
	Message       string    `json:"message"`
	FilesAffected int       `json:"files_affected"`
	CreatedAt     time.Time `json:"created_at"`
}

type CommitResponse struct {
	ID            string    `json:"id"`
	ProjectID     string    `json:"project_id"`
	BranchID      string    `json:"branch_id"`
	GitCommitHash string    `json:"git_commit_hash"`
	Message       string    `json:"message"`
	AuthorID      string    `json:"author_id"`
	CreatedAt     time.Time `json:"created_at"`
}

type CreateTeamRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

type UpdateTeamRequest struct {
	Name        *string `json:"name"`
	Description *string `json:"description"`
}

type TeamResponse struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type AddTeamMemberRequest struct {
	UserID string `json:"user_id"`
	Role   string `json:"role"`
}

type TeamMemberResponse struct {
	UserID      string    `json:"user_id"`
	Role        string    `json:"role"`
	DisplayName string    `json:"display_name"`
	Email       string    `json:"email"`
	JoinedAt    time.Time `json:"joined_at"`
}

type SearchResponse struct {
	Results []SearchResult `json:"results"`
	Total   int64          `json:"total"`
	Page    int            `json:"page"`
	Limit   int            `json:"limit"`
}

type SearchResult struct {
	FileID    string    `json:"file_id"`
	Path      string    `json:"path"`
	Project   string    `json:"project"`
	Version   string    `json:"version"`
	SizeBytes int64     `json:"size_bytes"`
	Owner     string    `json:"owner"`
	Tags      []string  `json:"tags"`
	UpdatedAt time.Time `json:"updated_at"`
}
