-- name: GetProject :one
SELECT * FROM projects
WHERE id = $1;

-- name: ListProjectsByOwner :many
SELECT * FROM projects
WHERE owner_id = $1
ORDER BY updated_at DESC
LIMIT $2 OFFSET $3;

-- name: ListProjectsByTeam :many
SELECT * FROM projects
WHERE team_id = $1
ORDER BY updated_at DESC
LIMIT $2 OFFSET $3;

-- name: CreateProject :one
INSERT INTO projects (name, description, repo_path, owner_id, team_id)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: UpdateProject :one
UPDATE projects
SET name = COALESCE($2, name),
    description = COALESCE($3, description),
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: DeleteProject :exec
DELETE FROM projects
WHERE id = $1;
