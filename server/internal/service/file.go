package service

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

type File struct {
	ID              uuid.UUID
	ProjectID       uuid.UUID
	BranchID        uuid.UUID
	Path            string
	FileName        string
	FileType        string
	IsBinary        bool
	ContentHash     string
	SizeBytes       int64
	PointerFilePath string
	Version         int
	OwnerID         *uuid.UUID
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

type UploadSession struct {
	ProjectID      string `json:"project_id"`
	Branch         string `json:"branch"`
	Path           string `json:"path"`
	FileName       string `json:"file_name"`
	FileSize       int64  `json:"file_size"`
	ContentHash    string `json:"content_hash"`
	UserID         string `json:"user_id"`
	TotalChunks    int    `json:"total_chunks"`
	ReceivedChunks []int  `json:"received_chunks"`
	CreatedAt      int64  `json:"created_at"`
}

type FileService struct {
	pool           *pgxpool.Pool
	rdb            *redis.Client
	storageService *StorageService
	projectService *ProjectService
	chunkSize      int64
}

func NewFileService(
	pool *pgxpool.Pool,
	rdb *redis.Client,
	storageService *StorageService,
	projectService *ProjectService,
	chunkSize int64,
) *FileService {
	return &FileService{
		pool:           pool,
		rdb:            rdb,
		storageService: storageService,
		projectService: projectService,
		chunkSize:      chunkSize,
	}
}

func (s *FileService) InitUpload(ctx context.Context, userID string, projectID, branch, path, fileName string, fileSize int64, contentHash string) (string, int64, int, error) {
	_, err := s.projectService.GetProject(ctx, projectID)
	if err != nil {
		return "", 0, 0, fmt.Errorf("project not found: %w", err)
	}

	_, err = s.projectService.GetBranchByName(ctx, projectID, branch)
	if err != nil {
		return "", 0, 0, fmt.Errorf("branch not found: %w", err)
	}

	if path == "" || fileName == "" {
		return "", 0, 0, fmt.Errorf("path and file_name are required")
	}
	if fileSize <= 0 {
		return "", 0, 0, fmt.Errorf("file_size must be positive")
	}

	totalChunks := int(fileSize / s.chunkSize)
	if fileSize%s.chunkSize > 0 {
		totalChunks++
	}

	sessionID := uuid.New().String()
	session := UploadSession{
		ProjectID:      projectID,
		Branch:         branch,
		Path:           path,
		FileName:       fileName,
		FileSize:       fileSize,
		ContentHash:    contentHash,
		UserID:         userID,
		TotalChunks:    totalChunks,
		ReceivedChunks: []int{},
		CreatedAt:      time.Now().Unix(),
	}

	data, err := json.Marshal(session)
	if err != nil {
		return "", 0, 0, fmt.Errorf("marshal session: %w", err)
	}

	key := fmt.Sprintf("upload_session:%s", sessionID)
	if err := s.rdb.Set(ctx, key, data, 24*time.Hour).Err(); err != nil {
		return "", 0, 0, fmt.Errorf("save session: %w", err)
	}

	return sessionID, s.chunkSize, totalChunks, nil
}

func (s *FileService) UploadChunk(ctx context.Context, sessionID string, chunkIndex int, data []byte) error {
	key := fmt.Sprintf("upload_session:%s", sessionID)
	raw, err := s.rdb.Get(ctx, key).Bytes()
	if err != nil {
		return fmt.Errorf("session not found or expired")
	}

	var session UploadSession
	if err := json.Unmarshal(raw, &session); err != nil {
		return fmt.Errorf("invalid session data")
	}

	if chunkIndex < 0 || chunkIndex >= session.TotalChunks {
		return fmt.Errorf("chunk_index %d out of range [0, %d)", chunkIndex, session.TotalChunks)
	}

	for _, received := range session.ReceivedChunks {
		if received == chunkIndex {
			return fmt.Errorf("chunk %d already received", chunkIndex)
		}
	}

	chunkKey := fmt.Sprintf("uploads/%s/chunk_%d", sessionID, chunkIndex)
	if err := s.storageService.UploadFromBytes(ctx, chunkKey, data); err != nil {
		return fmt.Errorf("store chunk: %w", err)
	}

	session.ReceivedChunks = append(session.ReceivedChunks, chunkIndex)
	updated, err := json.Marshal(session)
	if err != nil {
		return fmt.Errorf("marshal session: %w", err)
	}

	if err := s.rdb.Set(ctx, key, updated, 24*time.Hour).Err(); err != nil {
		return fmt.Errorf("update session: %w", err)
	}

	return nil
}

func (s *FileService) CompleteUpload(ctx context.Context, sessionID string) (*File, error) {
	key := fmt.Sprintf("upload_session:%s", sessionID)
	raw, err := s.rdb.Get(ctx, key).Bytes()
	if err != nil {
		return nil, fmt.Errorf("session not found or expired")
	}

	var session UploadSession
	if err := json.Unmarshal(raw, &session); err != nil {
		return nil, fmt.Errorf("invalid session data")
	}

	if len(session.ReceivedChunks) != session.TotalChunks {
		return nil, fmt.Errorf("not all chunks received: got %d, expected %d", len(session.ReceivedChunks), session.TotalChunks)
	}

	var buf bytes.Buffer
	hasher := sha256.New()
	multiWriter := io.MultiWriter(&buf, hasher)

	for i := 0; i < session.TotalChunks; i++ {
		chunkKey := fmt.Sprintf("uploads/%s/chunk_%d", sessionID, i)
		stream, err := s.storageService.Download(ctx, chunkKey)
		if err != nil {
			return nil, fmt.Errorf("download chunk %d: %w", i, err)
		}
		_, err = io.Copy(multiWriter, stream)
		stream.Close()
		if err != nil {
			return nil, fmt.Errorf("read chunk %d: %w", i, err)
		}
	}

	computedHash := hex.EncodeToString(hasher.Sum(nil))
	if session.ContentHash != "" && session.ContentHash != computedHash {
		return nil, fmt.Errorf("content hash mismatch: expected %s, got %s", session.ContentHash, computedHash)
	}

	contentKey := s.storageService.ContentKey(computedHash)
	exists, err := s.storageService.Exists(ctx, contentKey)
	if err != nil {
		return nil, fmt.Errorf("check existing object: %w", err)
	}
	if !exists {
		if err := s.storageService.UploadFromBytes(ctx, contentKey, buf.Bytes()); err != nil {
			return nil, fmt.Errorf("store final object: %w", err)
		}
	}

	for i := 0; i < session.TotalChunks; i++ {
		chunkKey := fmt.Sprintf("uploads/%s/chunk_%d", sessionID, i)
		_ = s.storageService.Delete(ctx, chunkKey)
	}
	s.rdb.Del(ctx, key)

	branch, err := s.projectService.GetBranchByName(ctx, session.ProjectID, session.Branch)
	if err != nil {
		return nil, fmt.Errorf("branch not found: %w", err)
	}

	ownerUUID, _ := uuid.Parse(session.UserID)
	fileType := filepath.Ext(session.FileName)
	if len(fileType) > 0 {
		fileType = fileType[1:]
	}

	var file File
	err = s.pool.QueryRow(ctx,
		`INSERT INTO files (project_id, branch_id, path, file_name, file_type, is_binary, content_hash, size_bytes, pointer_file_path, version, owner_id)
		 VALUES ($1, $2, $3, $4, $5, true, $6, $7, $8, 1, $9)
		 ON CONFLICT DO NOTHING
		 RETURNING id, project_id, branch_id, path, file_name, file_type, is_binary, content_hash, size_bytes, pointer_file_path, version, owner_id, created_at, updated_at`,
		session.ProjectID, branch.ID, session.Path, session.FileName, fileType,
		computedHash, session.FileSize, "", ownerUUID,
	).Scan(&file.ID, &file.ProjectID, &file.BranchID, &file.Path, &file.FileName, &file.FileType,
		&file.IsBinary, &file.ContentHash, &file.SizeBytes, &file.PointerFilePath, &file.Version,
		&file.OwnerID, &file.CreatedAt, &file.UpdatedAt)

	if err != nil {
		return nil, fmt.Errorf("insert file: %w", err)
	}

	return &file, nil
}

func (s *FileService) GetFile(ctx context.Context, fileID string) (*File, error) {
	var file File
	err := s.pool.QueryRow(ctx,
		`SELECT id, project_id, branch_id, path, file_name, file_type, is_binary,
		        content_hash, size_bytes, pointer_file_path, version, owner_id, created_at, updated_at
		 FROM files WHERE id = $1`,
		fileID,
	).Scan(&file.ID, &file.ProjectID, &file.BranchID, &file.Path, &file.FileName, &file.FileType,
		&file.IsBinary, &file.ContentHash, &file.SizeBytes, &file.PointerFilePath, &file.Version,
		&file.OwnerID, &file.CreatedAt, &file.UpdatedAt)
	if err != nil {
		if IsNotFound(err) {
			return nil, fmt.Errorf("file not found")
		}
		return nil, err
	}
	return &file, nil
}

func (s *FileService) BrowseFiles(ctx context.Context, projectID, branchName, pathPrefix string, page, limit int) ([]File, int64, error) {
	if branchName == "" {
		branchName = "main"
	}
	if pathPrefix == "" {
		pathPrefix = "/"
	}

	branch, err := s.projectService.GetBranchByName(ctx, projectID, branchName)
	if err != nil {
		return nil, 0, err
	}

	offset := (page - 1) * limit

	var total int64
	err = s.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM files WHERE project_id = $1 AND branch_id = $2 AND path LIKE $3 || '%'`,
		projectID, branch.ID, pathPrefix,
	).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	rows, err := s.pool.Query(ctx,
		`SELECT id, project_id, branch_id, path, file_name, file_type, is_binary,
		        content_hash, size_bytes, pointer_file_path, version, owner_id, created_at, updated_at
		 FROM files
		 WHERE project_id = $1 AND branch_id = $2 AND path LIKE $3 || '%'
		 ORDER BY path, file_name
		 LIMIT $4 OFFSET $5`,
		projectID, branch.ID, pathPrefix, limit, offset,
	)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var files []File
	for rows.Next() {
		var f File
		if err := rows.Scan(&f.ID, &f.ProjectID, &f.BranchID, &f.Path, &f.FileName, &f.FileType,
			&f.IsBinary, &f.ContentHash, &f.SizeBytes, &f.PointerFilePath, &f.Version,
			&f.OwnerID, &f.CreatedAt, &f.UpdatedAt); err != nil {
			return nil, 0, err
		}
		files = append(files, f)
	}

	return files, total, nil
}

func (s *FileService) DownloadFile(ctx context.Context, fileID string) (io.ReadCloser, *File, error) {
	file, err := s.GetFile(ctx, fileID)
	if err != nil {
		return nil, nil, err
	}

	contentKey := s.storageService.ContentKey(file.ContentHash)
	stream, err := s.storageService.Download(ctx, contentKey)
	if err != nil {
		return nil, nil, fmt.Errorf("download from storage: %w", err)
	}

	return stream, file, nil
}

func (s *FileService) DeleteFile(ctx context.Context, fileID string) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM files WHERE id = $1`, fileID)
	if err != nil {
		if IsNotFound(err) {
			return fmt.Errorf("file not found")
		}
		return err
	}
	return nil
}

func (s *FileService) CreateFolder(ctx context.Context, userID, projectID, branchName, folderPath string) (*File, error) {
	if folderPath == "" || folderPath == "/" {
		return nil, fmt.Errorf("folder path is required")
	}

	_, err := s.projectService.GetProject(ctx, projectID)
	if err != nil {
		return nil, fmt.Errorf("project not found: %w", err)
	}

	branch, err := s.projectService.GetBranchByName(ctx, projectID, branchName)
	if err != nil {
		return nil, fmt.Errorf("branch not found: %w", err)
	}

	_ = strings.Split(strings.Trim(folderPath, "/"), "/")
	placeholderName := ".artifact-folder"

	ownerUUID, _ := uuid.Parse(userID)

	filePath := strings.TrimRight(folderPath, "/")
	if !strings.HasPrefix(filePath, "/") {
		filePath = "/" + filePath
	}

	var file File
	err = s.pool.QueryRow(ctx,
		`INSERT INTO files (project_id, branch_id, path, file_name, file_type, is_binary, content_hash, size_bytes, pointer_file_path, version, owner_id)
		 VALUES ($1, $2, $3, $4, '', false, '', 0, '', 1, $5)
		 RETURNING id, project_id, branch_id, path, file_name, file_type, is_binary, content_hash, size_bytes, pointer_file_path, version, owner_id, created_at, updated_at`,
		projectID, branch.ID, filePath, placeholderName, ownerUUID,
	).Scan(&file.ID, &file.ProjectID, &file.BranchID, &file.Path, &file.FileName, &file.FileType,
		&file.IsBinary, &file.ContentHash, &file.SizeBytes, &file.PointerFilePath, &file.Version,
		&file.OwnerID, &file.CreatedAt, &file.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("create folder: %w", err)
	}

	return &file, nil
}
