-- name: GetCommit :one
SELECT * FROM commits
WHERE id = $1;

-- name: ListCommitsByProjectBranch :many
SELECT c.*, u.display_name as author_name
FROM commits c
JOIN users u ON c.author_id = u.id
WHERE c.project_id = $1 AND c.branch_id = $2
ORDER BY c.created_at DESC
LIMIT $3 OFFSET $4;

-- name: CreateCommit :one
INSERT INTO commits (project_id, branch_id, git_commit_hash, message, author_id)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: AddCommitFile :exec
INSERT INTO commit_files (commit_id, file_id, action)
VALUES ($1, $2, $3);

-- name: GetCommitFiles :many
SELECT cf.*, f.path, f.file_name
FROM commit_files cf
JOIN files f ON cf.file_id = f.id
WHERE cf.commit_id = $1;

-- name: UpdateBranchHead :exec
UPDATE branches
SET head_commit = $2
WHERE id = $1;
