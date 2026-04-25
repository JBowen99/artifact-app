package service

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"
)

type Lock struct {
	ID          uuid.UUID
	FileID      uuid.UUID
	UserID      uuid.UUID
	WorkspaceID *uuid.UUID
	LockedAt    time.Time
	ExpiresAt   *time.Time
}

type LockWithDetails struct {
	Lock
	FilePath string
	UserName string
}

type redisLockData struct {
	LockID    string  `json:"lock_id"`
	UserID    string  `json:"user_id"`
	ExpiresAt float64 `json:"expires_at,omitempty"`
}

type LockService struct {
	pool          *pgxpool.Pool
	rdb           *redis.Client
	sweepInterval time.Duration
	defaultTTL    time.Duration
}

func NewLockService(pool *pgxpool.Pool, rdb *redis.Client, sweepInterval, defaultTTL time.Duration) *LockService {
	return &LockService{
		pool:          pool,
		rdb:           rdb,
		sweepInterval: sweepInterval,
		defaultTTL:    defaultTTL,
	}
}

func (s *LockService) LockFile(ctx context.Context, fileID, userID string, workspaceID *string, expiresAt *time.Time) (*Lock, error) {
	redisKey := fmt.Sprintf("lock:%s", fileID)
	existing, err := s.rdb.Get(ctx, redisKey).Result()
	if err == nil && existing != "" {
		var existingLock redisLockData
		if json.Unmarshal([]byte(existing), &existingLock) == nil {
			if existingLock.ExpiresAt == 0 || existingLock.ExpiresAt > float64(time.Now().Unix()) {
				return nil, fmt.Errorf("file is locked by another user")
			}
		}
	}

	var expiresAtVal *time.Time
	if expiresAt != nil {
		expiresAtVal = expiresAt
	} else {
		t := time.Now().Add(s.defaultTTL)
		expiresAtVal = &t
	}

	var wsUUID *uuid.UUID
	if workspaceID != nil && *workspaceID != "" {
		parsed, err := uuid.Parse(*workspaceID)
		if err != nil {
			return nil, fmt.Errorf("invalid workspace_id: %w", err)
		}
		wsUUID = &parsed
	}

	var lock Lock
	err = s.pool.QueryRow(ctx,
		`INSERT INTO locks (file_id, user_id, workspace_id, expires_at)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, file_id, user_id, workspace_id, locked_at, expires_at`,
		fileID, userID, wsUUID, expiresAtVal,
	).Scan(&lock.ID, &lock.FileID, &lock.UserID, &lock.WorkspaceID, &lock.LockedAt, &lock.ExpiresAt)
	if err != nil {
		if IsUniqueViolation(err) {
			return nil, fmt.Errorf("file is already locked")
		}
		return nil, fmt.Errorf("insert lock: %w", err)
	}

	data := redisLockData{
		LockID: lock.ID.String(),
		UserID: userID,
	}
	if lock.ExpiresAt != nil {
		data.ExpiresAt = float64(lock.ExpiresAt.Unix())
	}

	jsonData, _ := json.Marshal(data)
	ttl := time.Until(*expiresAtVal)
	if ttl > 0 {
		s.rdb.Set(ctx, redisKey, jsonData, ttl)
	}

	return &lock, nil
}

func (s *LockService) UnlockFile(ctx context.Context, fileID, userID string) error {
	var lock Lock
	err := s.pool.QueryRow(ctx,
		`SELECT id, file_id, user_id, workspace_id, locked_at, expires_at
		 FROM locks WHERE file_id = $1`,
		fileID,
	).Scan(&lock.ID, &lock.FileID, &lock.UserID, &lock.WorkspaceID, &lock.LockedAt, &lock.ExpiresAt)
	if err != nil {
		if IsNotFound(err) {
			return fmt.Errorf("file is not locked")
		}
		return err
	}

	if lock.UserID.String() != userID {
		return fmt.Errorf("lock is owned by another user")
	}

	_, err = s.pool.Exec(ctx, `DELETE FROM locks WHERE id = $1`, lock.ID)
	if err != nil {
		return fmt.Errorf("delete lock: %w", err)
	}

	redisKey := fmt.Sprintf("lock:%s", fileID)
	s.rdb.Del(ctx, redisKey)

	return nil
}

func (s *LockService) GetLock(ctx context.Context, fileID string) (*Lock, error) {
	var lock Lock
	err := s.pool.QueryRow(ctx,
		`SELECT id, file_id, user_id, workspace_id, locked_at, expires_at
		 FROM locks WHERE file_id = $1`,
		fileID,
	).Scan(&lock.ID, &lock.FileID, &lock.UserID, &lock.WorkspaceID, &lock.LockedAt, &lock.ExpiresAt)
	if err != nil {
		if IsNotFound(err) {
			return nil, nil
		}
		return nil, err
	}

	if lock.ExpiresAt != nil && lock.ExpiresAt.Before(time.Now()) {
		s.pool.Exec(ctx, `DELETE FROM locks WHERE id = $1`, lock.ID)
		s.rdb.Del(ctx, fmt.Sprintf("lock:%s", fileID))
		return nil, nil
	}

	return &lock, nil
}

func (s *LockService) IsFileLockedByUser(ctx context.Context, fileID, userID string) (bool, error) {
	lock, err := s.GetLock(ctx, fileID)
	if err != nil {
		return false, err
	}
	if lock == nil {
		return false, nil
	}
	return lock.UserID.String() == userID, nil
}

func (s *LockService) ListLocksByProject(ctx context.Context, projectID string) ([]LockWithDetails, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT l.id, l.file_id, l.user_id, l.workspace_id, l.locked_at, l.expires_at,
		        f.path as file_path, u.display_name as user_name
		 FROM locks l
		 JOIN files f ON l.file_id = f.id
		 JOIN users u ON l.user_id = u.id
		 WHERE f.project_id = $1
		 ORDER BY l.locked_at DESC`,
		projectID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var locks []LockWithDetails
	for rows.Next() {
		var l LockWithDetails
		if err := rows.Scan(
			&l.ID, &l.FileID, &l.UserID, &l.WorkspaceID, &l.LockedAt, &l.ExpiresAt,
			&l.FilePath, &l.UserName,
		); err != nil {
			return nil, err
		}
		locks = append(locks, l)
	}

	return locks, nil
}

func (s *LockService) StartSweeper(ctx context.Context, log zerolog.Logger) {
	ticker := time.NewTicker(s.sweepInterval)
	defer ticker.Stop()

	log.Info().Str("interval", s.sweepInterval.String()).Msg("lock expiration sweeper started")

	for {
		select {
		case <-ctx.Done():
			log.Info().Msg("lock expiration sweeper stopped")
			return
		case <-ticker.C:
			s.sweepExpiredLocks(log)
		}
	}
}

func (s *LockService) sweepExpiredLocks(log zerolog.Logger) {
	ctx := context.Background()

	tag, err := s.pool.Exec(ctx,
		`DELETE FROM locks WHERE expires_at IS NOT NULL AND expires_at < now()`,
	)
	if err != nil {
		log.Error().Err(err).Msg("failed to sweep expired locks")
		return
	}

	removed := tag.RowsAffected()
	if removed > 0 {
		log.Info().Int64("removed", removed).Msg("swept expired locks")
	}
}
