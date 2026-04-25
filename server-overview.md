# Artifact — Server Architecture

## 1. Tech Stack

| Component         | Technology                    | Purpose                              |
|-------------------|-------------------------------|--------------------------------------|
| Language          | Go 1.23+                      | Server runtime                       |
| HTTP Framework    | Fiber v2                      | Routing, middleware, request handling|
| Database          | PostgreSQL 16+                | Metadata, users, locks, workspaces   |
| ORM / Query       | sqlc + pgx                    | Type-safe SQL, connection pooling    |
| Cache / Locks     | Redis 7+                      | Distributed locks, session cache     |
| Object Storage    | MinIO / S3-compatible         | Binary blob storage                  |
| Git Operations    | go-git v5                     | Server-side repo management          |
| Migrations        | golang-migrate                | Database schema versioning           |
| Config            | envconfig / env vars          | Environment-based configuration      |
| Logging           | zerolog                       | Structured JSON logging              |
| Auth              | JWT (RS256)                   | Authentication tokens                |
| Hashing           | SHA-256                       | Content-addressable storage keys     |

---

## 2. Project Structure

```
server/
├── cmd/
│   └── server/
│       └── main.go              # Entry point
├── internal/
│   ├── config/
│   │   └── config.go            # Environment config loader
│   ├── database/
│   │   ├── db.go                # Connection setup, migration runner
│   │   └── queries/             # sqlc-generated query code
│   │       ├── models.go
│   │       ├── users.sql.go
│   │       ├── projects.sql.go
│   │       ├── files.sql.go
│   │       ├── locks.sql.go
│   │       ├── workspaces.sql.go
│   │       └── commits.sql.go
│   ├── handler/
│   │   ├── auth.go
│   │   ├── project.go
│   │   ├── workspace.go
│   │   ├── file.go
│   │   ├── lock.go
│   │   ├── sync.go
│   │   ├── commit.go
│   │   ├── branch.go
│   │   ├── team.go
│   │   ├── user.go
│   │   ├── search.go
│   │   └── health.go
│   ├── middleware/
│   │   ├── auth.go              # JWT verification
│   │   ├── rbac.go              # Role-based access control
│   │   ├── logger.go            # Request logging
│   │   └── recover.go           # Panic recovery
│   ├── service/
│   │   ├── auth.go
│   │   ├── project.go
│   │   ├── workspace.go
│   │   ├── file.go
│   │   ├── lock.go
│   │   ├── sync.go
│   │   ├── commit.go
│   │   ├── git.go               # Git repo operations
│   │   ├── storage.go           # Object storage operations
│   │   └── search.go
│   ├── model/
│   │   └── model.go             # Domain types, request/response structs
│   └── router/
│       └── router.go            # Route registration
├── migrations/
│   ├── 000001_init_schema.up.sql
│   └── 000001_init_schema.down.sql
├── sql/
│   └── queries/
│       ├── users.sql
│       ├── projects.sql
│       ├── files.sql
│       ├── locks.sql
│       ├── workspaces.sql
│       └── commits.sql
├── storage/
│   └── repos/                   # Bare Git repositories
├── .env.example
├── Makefile
├── go.mod
├── go.sum
├── sqlc.yaml
└── Dockerfile
```

---

## 3. Configuration (Environment Variables)

| Variable                  | Description                          | Default                     |
|---------------------------|--------------------------------------|-----------------------------|
| `SERVER_PORT`             | HTTP listen port                     | `8080`                      |
| `SERVER_HOST`             | Host bind address                    | `0.0.0.0`                   |
| `DATABASE_URL`            | PostgreSQL connection string         | —                           |
| `DATABASE_MAX_OPEN_CONNS` | Max open DB connections              | `25`                        |
| `DATABASE_MAX_IDLE_CONNS` | Max idle DB connections              | `5`                         |
| `REDIS_URL`               | Redis connection string              | `redis://localhost:6379/0`  |
| `S3_ENDPOINT`             | Object storage endpoint              | `localhost:9000`            |
| `S3_ACCESS_KEY`           | S3 access key                        | —                           |
| `S3_SECRET_KEY`           | S3 secret key                        | —                           |
| `S3_BUCKET`               | S3 bucket name for binaries          | `artifact-binaries`         |
| `S3_USE_SSL`              | Enable SSL for S3                    | `false`                     |
| `JWT_PRIVATE_KEY_PATH`    | Path to RSA private key              | `./keys/private.pem`        |
| `JWT_PUBLIC_KEY_PATH`     | Path to RSA public key               | `./keys/public.pem`         |
| `JWT_ACCESS_TTL`          | Access token TTL                     | `15m`                       |
| `JWT_REFRESH_TTL`         | Refresh token TTL                    | `7d`                        |
| `REPO_BASE_PATH`          | Root directory for bare Git repos    | `./storage/repos`           |
| `UPLOAD_CHUNK_SIZE`       | Chunk size for resumable uploads     | `8388608` (8MB)             |
| `LOG_LEVEL`               | Logging level (debug/info/warn/error)| `info`                      |
| `LOG_FORMAT`              | Logging format (json/text)           | `json`                      |

---

## 4. Database Schema Overview

### Tables

```sql
-- Users
users (id, email, password_hash, display_name, role, created_at, updated_at)

-- Teams
teams (id, name, description, created_at, updated_at)

-- Team membership (many-to-many with roles)
team_members (team_id, user_id, role, joined_at)

-- Projects
projects (id, name, description, repo_path, owner_id, team_id, created_at, updated_at)

-- Branches (tracked server-side)
branches (id, project_id, name, is_default, head_commit, created_at)

-- Files (metadata index; actual content in object storage or Git)
files (id, project_id, branch_id, path, file_name, file_type, is_binary,
       content_hash, size_bytes, pointer_file_path, version, owner_id,
       created_at, updated_at)

-- Locks
locks (id, file_id, user_id, workspace_id, locked_at, expires_at)

-- Workspaces
workspaces (id, project_id, user_id, branch_id, name, root_path,
            last_synced_at, created_at, updated_at)

-- Workspace files (tracks which files are synced at which version)
workspace_files (workspace_id, file_id, synced_version, local_path, synced_at)

-- Pending changes (files modified locally but not yet submitted)
pending_changes (id, workspace_id, file_id, change_type, detected_at)

-- Commits (Artifact-level commits mapping to Git commits)
commits (id, project_id, branch_id, git_commit_hash, message, author_id,
         created_at)

-- Commit files (files included in a commit)
commit_files (commit_id, file_id, action)  -- action: add, modify, delete

-- Tags (user-defined labels for files/projects)
tags (id, name, color)

-- File tags
file_tags (file_id, tag_id)

-- Project permissions
project_permissions (project_id, user_id, role)  -- admin, contributor, viewer
```

---

## 5. API Endpoints

All endpoints are prefixed with `/api/v1`. Protected routes require a valid JWT in the `Authorization: Bearer <token>` header.

---

### 5.1 Health

| Method | Path        | Auth | Description           |
|--------|-------------|------|-----------------------|
| GET    | `/health`   | No   | Server health check   |

---

### 5.2 Authentication

| Method | Path                        | Auth | Description                |
|--------|-----------------------------|------|----------------------------|
| POST   | `/api/v1/auth/register`     | No   | Register a new user        |
| POST   | `/api/v1/auth/login`        | No   | Login, returns JWT pair    |
| POST   | `/api/v1/auth/logout`       | Yes  | Invalidate refresh token   |
| POST   | `/api/v1/auth/refresh`      | No*  | Refresh access token       |
| GET    | `/api/v1/auth/me`           | Yes  | Get current user profile   |

**Register payload:**
```json
{
  "email": "user@example.com",
  "password": "securepassword",
  "display_name": "Alice"
}
```

**Login payload:**
```json
{
  "email": "user@example.com",
  "password": "securepassword"
}
```

**Login response:**
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "expires_in": 900
}
```

\* Refresh requires a valid refresh token in the request body.

---

### 5.3 Users

| Method | Path                    | Auth | Description          |
|--------|-------------------------|------|----------------------|
| GET    | `/api/v1/users/me`      | Yes  | Get current user     |
| PUT    | `/api/v1/users/me`      | Yes  | Update current user  |

---

### 5.4 Projects

| Method | Path                          | Auth | Description              |
|--------|-------------------------------|------|--------------------------|
| POST   | `/api/v1/projects`            | Yes  | Create project           |
| GET    | `/api/v1/projects`            | Yes  | List user's projects     |
| GET    | `/api/v1/projects/:projectId` | Yes  | Get project details      |
| PUT    | `/api/v1/projects/:projectId` | Yes  | Update project           |
| DELETE | `/api/v1/projects/:projectId` | Yes  | Delete project           |

**Create project payload:**
```json
{
  "name": "Engine Assembly v2",
  "description": "CAD project for engine redesign",
  "team_id": "uuid-optional"
}
```

Creating a project also initializes a bare Git repository at `REPO_BASE_PATH/<project-id>/` with a default `main` branch.

---

### 5.5 Branches

| Method | Path                                          | Auth | Description              |
|--------|-----------------------------------------------|------|--------------------------|
| GET    | `/api/v1/projects/:projectId/branches`        | Yes  | List branches            |
| POST   | `/api/v1/projects/:projectId/branches`        | Yes  | Create branch            |
| GET    | `/api/v1/projects/:projectId/branches/:branchId` | Yes | Get branch details    |
| DELETE | `/api/v1/projects/:projectId/branches/:branchId` | Yes | Delete branch         |

**Create branch payload:**
```json
{
  "name": "feature/new-housing",
  "source_branch": "main"
}
```

---

### 5.6 Files

| Method | Path                                          | Auth | Description                     |
|--------|-----------------------------------------------|------|---------------------------------|
| GET    | `/api/v1/projects/:projectId/files`           | Yes  | Browse file tree (query params for path, branch) |
| GET    | `/api/v1/files/:fileId`                       | Yes  | Get file metadata               |
| GET    | `/api/v1/files/:fileId/download`              | Yes  | Download file (streaming)       |
| POST   | `/api/v1/files/upload`                        | Yes  | Initialize chunked upload       |
| PUT    | `/api/v1/files/upload/:sessionId`             | Yes  | Upload a chunk                  |
| POST   | `/api/v1/files/upload/:sessionId/complete`    | Yes  | Finalize chunked upload         |
| DELETE | `/api/v1/files/:fileId`                       | Yes  | Delete file                     |

**Browse query params:** `?branch=main&path=/assembly/`

**Initialize upload payload:**
```json
{
  "project_id": "uuid",
  "branch": "main",
  "path": "/assembly/housing.step",
  "file_name": "housing.step",
  "file_size": 52428800,
  "content_hash": "sha256..."
}
```

**Initialize upload response:**
```json
{
  "session_id": "uuid",
  "chunk_size": 8388608,
  "total_chunks": 7
}
```

**Upload chunk:** Multipart form with `chunk_index` (int) and `data` (file).

**Complete upload response:**
```json
{
  "file_id": "uuid",
  "content_hash": "sha256...",
  "size_bytes": 52428800,
  "pointer_file": ".artifact/pointers/housing-abc123.step"
}
```

---

### 5.7 Locking

| Method | Path                                    | Auth | Description              |
|--------|-----------------------------------------|------|--------------------------|
| POST   | `/api/v1/files/:fileId/lock`            | Yes  | Lock a file              |
| DELETE | `/api/v1/files/:fileId/lock`            | Yes  | Unlock a file            |
| GET    | `/api/v1/projects/:projectId/locks`     | Yes  | List locks for project   |

**Lock response:**
```json
{
  "lock_id": "uuid",
  "file_id": "uuid",
  "user_id": "uuid",
  "locked_at": "2026-04-24T10:00:00Z",
  "expires_at": "2026-04-25T10:00:00Z"
}
```

Lock behavior:
- Only one user can hold a lock on a file at a time
- Lock expiration is enforced by a background worker (Redis TTL + DB cleanup)
- Locks are validated during submission — submitting a file you don't have locked for binary files is rejected

---

### 5.8 Workspaces

| Method | Path                                              | Auth | Description          |
|--------|---------------------------------------------------|------|----------------------|
| POST   | `/api/v1/projects/:projectId/workspaces`          | Yes  | Create workspace     |
| GET    | `/api/v1/projects/:projectId/workspaces`          | Yes  | List workspaces      |
| GET    | `/api/v1/workspaces/:workspaceId`                 | Yes  | Get workspace details|
| PUT    | `/api/v1/workspaces/:workspaceId`                 | Yes  | Update workspace     |
| DELETE | `/api/v1/workspaces/:workspaceId`                 | Yes  | Delete workspace     |
| GET    | `/api/v1/workspaces/:workspaceId/status`          | Yes  | Get workspace status |
| GET    | `/api/v1/workspaces/:workspaceId/files`           | Yes  | List synced files    |

**Create workspace payload:**
```json
{
  "name": "Alice's workspace",
  "branch": "main",
  "root_path": "/assembly/"
}
```

**Workspace status response:**
```json
{
  "workspace_id": "uuid",
  "branch": "main",
  "last_synced_at": "2026-04-24T10:00:00Z",
  "synced_file_count": 42,
  "pending_changes": [
    {
      "file_id": "uuid",
      "path": "/assembly/housing.step",
      "change_type": "modified",
      "detected_at": "2026-04-24T11:30:00Z"
    }
  ],
  "locks": [
    {
      "file_id": "uuid",
      "path": "/assembly/housing.step",
      "locked_by": "Alice"
    }
  ]
}
```

---

### 5.9 Sync

| Method | Path                                         | Auth | Description                     |
|--------|----------------------------------------------|------|---------------------------------|
| POST   | `/api/v1/workspaces/:workspaceId/sync`       | Yes  | Compute and return sync delta   |

**Sync request payload:**
```json
{
  "local_versions": {
    "/assembly/housing.step": "v3",
    "/assembly/bolt-a.step": "v1"
  }
}
```

**Sync response:**
```json
{
  "actions": [
    {
      "type": "download",
      "path": "/assembly/housing.step",
      "version": "v4",
      "size_bytes": 52428800,
      "content_hash": "sha256...",
      "download_url": "/api/v1/files/uuid/download"
    },
    {
      "type": "delete",
      "path": "/assembly/old-part.step"
    }
  ]
}
```

---

### 5.10 Commits / Submit

| Method | Path                                            | Auth | Description              |
|--------|-------------------------------------------------|------|--------------------------|
| POST   | `/api/v1/projects/:projectId/submit`            | Yes  | Submit a changeset       |
| GET    | `/api/v1/projects/:projectId/commits`           | Yes  | List commits             |
| GET    | `/api/v1/commits/:commitId`                     | Yes  | Get commit details       |

**Submit payload:**
```json
{
  "workspace_id": "uuid",
  "branch": "main",
  "message": "Updated engine housing and mounting bolts",
  "files": [
    {
      "file_id": "uuid",
      "path": "/assembly/housing.step",
      "action": "modify",
      "upload_session_id": "uuid-optional-if-already-uploaded"
    },
    {
      "file_id": "uuid",
      "path": "/assembly/bolt-a.step",
      "action": "modify",
      "upload_session_id": "uuid"
    }
  ],
  "release_locks": true
}
```

**Submit response:**
```json
{
  "commit_id": "uuid",
  "git_commit_hash": "abc1234...",
  "branch": "main",
  "message": "Updated engine housing and mounting bolts",
  "files_affected": 2,
  "created_at": "2026-04-24T12:00:00Z"
}
```

Submit flow (server-side):
1. Validate all binary files are locked by the submitting user
2. Verify uploaded binaries exist in object storage (or upload now)
3. Verify content hashes match
4. Generate/update pointer files
5. Stage changes in the Git repo
6. Create a Git commit via go-git
7. Update file metadata (version, content_hash, etc.)
8. Release locks if `release_locks` is true
9. Update workspace state (clear pending changes)

---

### 5.11 Teams

| Method | Path                                  | Auth | Description              |
|--------|---------------------------------------|------|--------------------------|
| POST   | `/api/v1/teams`                       | Yes  | Create team              |
| GET    | `/api/v1/teams`                       | Yes  | List user's teams        |
| GET    | `/api/v1/teams/:teamId`              | Yes  | Get team details         |
| PUT    | `/api/v1/teams/:teamId`              | Yes  | Update team              |
| DELETE | `/api/v1/teams/:teamId`              | Yes  | Delete team              |
| POST   | `/api/v1/teams/:teamId/members`      | Yes  | Add team member          |
| DELETE | `/api/v1/teams/:teamId/members/:userId` | Yes | Remove team member    |
| PUT    | `/api/v1/teams/:teamId/members/:userId` | Yes | Update member role    |

**Member roles:** `admin`, `contributor`, `viewer`

---

### 5.12 Search / Metadata

| Method | Path                         | Auth | Description                        |
|--------|------------------------------|------|------------------------------------|
| GET    | `/api/v1/search`             | Yes  | Search files across projects       |
| POST   | `/api/v1/files/:fileId/tags` | Yes  | Add tags to a file                 |
| DELETE | `/api/v1/files/:fileId/tags/:tagId` | Yes | Remove tag from file       |

**Search query params:** `?q=engine+housing&type=step&project=uuid&branch=main&owner=uuid&tags=cad,assembly&sort=updated_at&order=desc&page=1&limit=20`

**Search response:**
```json
{
  "results": [
    {
      "file_id": "uuid",
      "path": "/assembly/housing.step",
      "project": "Engine Assembly v2",
      "version": "v4",
      "size_bytes": 52428800,
      "owner": "Alice",
      "tags": ["cad", "assembly"],
      "updated_at": "2026-04-24T12:00:00Z"
    }
  ],
  "total": 15,
  "page": 1,
  "limit": 20
}
```

---

## 6. Middleware Pipeline

Requests pass through the following middleware in order:

```
Request
  → Recovery          (panic handling)
  → Logger            (structured request logging)
  → CORS              (configure allowed origins)
  → Rate Limiter      (per-IP rate limiting via Redis)
  → JWT Auth          (verify Bearer token, populate user context)
  → RBAC              (check project/team-level permissions)
  → Handler
Response
```

Public routes (health, login, register) skip JWT Auth and RBAC.

---

## 7. Initialization & Setup

### 7.1 Prerequisites

- Go 1.23+
- PostgreSQL 16+
- Redis 7+
- MinIO (or S3-compatible storage)
- sqlc (for code generation from SQL queries)
- golang-migrate CLI

### 7.2 First-Time Setup

```bash
# 1. Clone the repository
git clone <repo-url> && cd artifact/server

# 2. Copy environment template
cp .env.example .env
# Edit .env with your local configuration

# 3. Install Go dependencies
go mod download

# 4. Generate RSA key pair for JWT
mkdir -p keys
openssl genrsa -out keys/private.pem 2048
openssl rsa -in keys/private.pem -pubout -out keys/public.pem

# 5. Start infrastructure (PostgreSQL, Redis, MinIO)
# Option A: Docker Compose (recommended for development)
docker compose up -d

# Option B: Local installs
# Ensure PostgreSQL, Redis, and MinIO are running and configured in .env

# 6. Create the S3 bucket
# Using MinIO client (mc):
mc alias set local http://localhost:9000 minioadmin minioadmin
mc mb local/artifact-binaries

# 7. Run database migrations
make migrate-up
# Or manually:
# migrate -path migrations -database "$DATABASE_URL" up

# 8. Generate sqlc code from SQL queries
make generate
# Or: sqlc generate

# 9. Create the repository storage directory
mkdir -p storage/repos

# 10. Build and run the server
make run
# Or: go run cmd/server/main.go
```

### 7.3 Docker Compose (Development)

```yaml
# docker-compose.yml
version: "3.8"
services:
  postgres:
    image: postgres:16-alpine
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: artifact
      POSTGRES_USER: artifact
      POSTGRES_PASSWORD: artifact
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  minio:
    image: minio/minio
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    command: server /data --console-address ":9001"
    volumes:
      - miniodata:/data

volumes:
  pgdata:
  miniodata:
```

### 7.4 Makefile Targets

```makefile
.PHONY: run build test migrate-up migrate-down generate lint

run:
	go run cmd/server/main.go

build:
	go build -o bin/artifact-server cmd/server/main.go

test:
	go test ./... -v -race

migrate-up:
	migrate -path migrations -database "$(DATABASE_URL)" up

migrate-down:
	migrate -path migrations -database "$(DATABASE_URL)" down 1

generate:
	sqlc generate

lint:
	golangci-lint run ./...
```

---

## 8. Server Startup Sequence

`main.go` performs the following in order:

```
1. Load configuration from environment variables
2. Initialize structured logger
3. Connect to PostgreSQL (verify with ping)
4. Run pending database migrations
5. Connect to Redis (verify with ping)
6. Initialize S3/MinIO client (verify bucket exists, create if missing)
7. Ensure REPO_BASE_PATH directory exists
8. Load JWT keys from disk
9. Initialize service layer (pass in DB, Redis, S3, config)
10. Initialize handler layer (pass in services)
11. Create Fiber app with middleware pipeline
12. Register all routes
13. Start background workers:
    - Lock expiration sweeper (every 1 min, cleans expired locks)
    - Orphan blob cleaner (every 1 hour, removes unreferenced objects)
14. Start HTTP server on configured port
15. Register graceful shutdown (SIGINT/SIGTERM):
    - Stop accepting new requests
    - Drain in-flight requests
    - Close DB, Redis connections
    - Exit
```

---

## 9. Key Design Decisions

### Content-Addressable Storage
Binary files are stored by their SHA-256 hash: `s3://bucket/<first-2-chars>/<hash>`. This provides automatic deduplication — uploading the same file twice stores it once.

### Pointer Files
When a binary is uploaded, a pointer file is generated in the Git repo:
```ini
# .artifact/pointers/<file-path>
version=1
oid=sha256:<hash>
size=52428800
```

### Commit Strategy
Each submit creates one Git commit representing a logical changeset (not per-file commits). This keeps history clean and meaningful.

### Lock Storage
Locks are stored in both PostgreSQL (durable record) and Redis (fast lookup). Redis TTL handles auto-expiration. The background sweeper reconciles Redis state with the DB.

### Partial Sync
Clients send their local file versions to the server. The server computes a diff and returns only the actions needed (download new versions, delete removed files). This avoids full repository downloads.

---

## 10. Error Handling

All API errors follow a consistent format:

```json
{
  "error": {
    "code": "FILE_LOCKED",
    "message": "File '/assembly/housing.step' is locked by another user",
    "details": {
      "locked_by": "Bob",
      "locked_at": "2026-04-24T09:00:00Z"
    }
  }
}
```

Standard HTTP status codes are used:
- `200` — Success
- `201` — Created
- `204` — No Content (successful delete)
- `400` — Bad Request (validation error)
- `401` — Unauthorized (missing/invalid token)
- `403` — Forbidden (insufficient permissions)
- `404` — Not Found
- `409` — Conflict (e.g., file already locked)
- `422` — Unprocessable Entity (business rule violation)
- `500` — Internal Server Error
