-- name: GetWorkspace :one
SELECT * FROM workspaces
WHERE id = $1;

-- name: ListWorkspacesByProject :many
SELECT * FROM workspaces
WHERE project_id = $1
ORDER BY updated_at DESC;

-- name: ListWorkspacesByUser :many
SELECT * FROM workspaces
WHERE user_id = $1
ORDER BY updated_at DESC;

-- name: CreateWorkspace :one
INSERT INTO workspaces (project_id, user_id, branch_id, name, root_path)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: UpdateWorkspace :one
UPDATE workspaces
SET name = COALESCE($2, name),
    root_path = COALESCE($3, root_path),
    branch_id = COALESCE($4, branch_id),
    last_synced_at = COALESCE($5, last_synced_at),
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: DeleteWorkspace :exec
DELETE FROM workspaces
WHERE id = $1;

-- name: UpdateWorkspaceSyncTime :one
UPDATE workspaces
SET last_synced_at = now(),
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: GetWorkspaceFiles :many
SELECT wf.*, f.path, f.file_name, f.version as latest_version
FROM workspace_files wf
JOIN files f ON wf.file_id = f.id
WHERE wf.workspace_id = $1;

-- name: UpsertWorkspaceFile :one
INSERT INTO workspace_files (workspace_id, file_id, synced_version, local_path)
VALUES ($1, $2, $3, $4)
ON CONFLICT (workspace_id, file_id)
DO UPDATE SET synced_version = $3, local_path = $4, synced_at = now()
RETURNING *;

-- name: DeleteWorkspaceFile :exec
DELETE FROM workspace_files
WHERE workspace_id = $1 AND file_id = $2;
