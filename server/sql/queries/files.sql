-- name: GetFile :one
SELECT * FROM files
WHERE id = $1;

-- name: ListFilesByProjectBranch :many
SELECT * FROM files
WHERE project_id = $1 AND branch_id = $2
ORDER BY path
LIMIT $3 OFFSET $4;

-- name: ListFilesByProjectBranchPath :many
SELECT * FROM files
WHERE project_id = $1 AND branch_id = $2 AND path LIKE $3 || '%'
ORDER BY path
LIMIT $4 OFFSET $5;

-- name: CreateFile :one
INSERT INTO files (project_id, branch_id, path, file_name, file_type, is_binary, content_hash, size_bytes, pointer_file_path, version, owner_id)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
RETURNING *;

-- name: UpdateFile :one
UPDATE files
SET content_hash = COALESCE($2, content_hash),
    size_bytes = COALESCE($3, size_bytes),
    pointer_file_path = COALESCE($4, pointer_file_path),
    version = version + 1,
    owner_id = COALESCE($5, owner_id),
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: DeleteFile :exec
DELETE FROM files
WHERE id = $1;

-- name: GetFileByContentHash :one
SELECT * FROM files
WHERE content_hash = $1
LIMIT 1;
