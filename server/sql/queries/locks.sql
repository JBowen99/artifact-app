-- name: GetLock :one
SELECT * FROM locks
WHERE file_id = $1;

-- name: GetLockByID :one
SELECT * FROM locks
WHERE id = $1;

-- name: ListLocksByProject :many
SELECT l.*, f.path as file_path, u.display_name as user_name
FROM locks l
JOIN files f ON l.file_id = f.id
JOIN users u ON l.user_id = u.id
WHERE f.project_id = $1
ORDER BY l.locked_at DESC;

-- name: CreateLock :one
INSERT INTO locks (file_id, user_id, workspace_id, expires_at)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: DeleteLock :exec
DELETE FROM locks
WHERE file_id = $1 AND user_id = $2;

-- name: DeleteLockByID :exec
DELETE FROM locks
WHERE id = $1;

-- name: DeleteExpiredLocks :exec
DELETE FROM locks
WHERE expires_at IS NOT NULL AND expires_at < now();
