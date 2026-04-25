# Artifact Server

Backend service for the Artifact version control system — designed for managing large binary CAD files with Git-like workflows including locking, branching, and partial sync.

## Tech Stack

- **Go 1.23+** with [Fiber v2](https://docs.gofiber.io/)
- **PostgreSQL 16+** — metadata, users, locks, workspaces
- **Redis 7+** — distributed locks, session cache
- **MinIO / S3** — binary blob storage (content-addressable via SHA-256)
- **sqlc + pgx** — type-safe SQL queries
- **go-git v5** — server-side repository management
- **golang-migrate** — database migrations
- **zerolog** — structured JSON logging
- **JWT (RS256)** — authentication

## Prerequisites

- Go 1.23+
- PostgreSQL 16+
- Redis 7+
- MinIO (or S3-compatible storage)
- [sqlc](https://sqlc.dev/) (code generation)
- [golang-migrate](https://github.com/golang-migrate/migrate) CLI

## Quick Start

```bash
# 1. Copy environment template
cp .env.example .env

# 2. Install dependencies
go mod download

# 3. Generate RSA key pair for JWT
mkdir -p keys
openssl genrsa -out keys/private.pem 2048
openssl rsa -in keys/private.pem -pubout -out keys/public.pem

# 4. Start infrastructure (PostgreSQL, Redis, MinIO)
docker compose up -d

# 5. Create the S3 bucket
mc alias set local http://localhost:9000 minioadmin minioadmin
mc mb local/artifact-binaries

# 6. Run database migrations
make migrate-up

# 7. Generate sqlc code
make generate

# 8. Run the server
make run
```

## Docker Compose (Development)

```yaml
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

## Project Structure

```
server/
├── cmd/server/main.go          # Entry point
├── internal/
│   ├── config/                 # Environment config loader
│   ├── database/               # Connection setup, sqlc queries
│   ├── handler/                # HTTP handlers
│   ├── middleware/              # Auth, RBAC, logging, recovery
│   ├── service/                # Business logic
│   ├── model/                  # Domain types, request/response structs
│   └── router/                 # Route registration
├── migrations/                 # Database schema migrations
├── sql/queries/                # Raw SQL for sqlc code generation
├── storage/repos/              # Bare Git repositories
├── .env.example
├── Makefile
├── go.mod
└── sqlc.yaml
```

## Makefile Targets

| Target          | Description                          |
|-----------------|--------------------------------------|
| `make run`      | Run the server                       |
| `make build`    | Build binary to `bin/`               |
| `make test`     | Run tests with race detection        |
| `make migrate-up`   | Run database migrations up       |
| `make migrate-down` | Rollback last migration          |
| `make generate` | Generate sqlc code from SQL queries  |
| `make lint`     | Run golangci-lint                    |

## API

All endpoints are prefixed with `/api/v1`. Protected routes require `Authorization: Bearer <token>`.

| Area        | Key Endpoints                                         |
|-------------|-------------------------------------------------------|
| Health      | `GET /health`                                         |
| Auth        | `POST /auth/register`, `/auth/login`, `/auth/refresh` |
| Users       | `GET/PUT /users/me`                                   |
| Projects    | `CRUD /projects`                                      |
| Branches    | `CRUD /projects/:id/branches`                         |
| Files       | `GET/POST/DELETE /files`, chunked upload              |
| Locking     | `POST/DELETE /files/:id/lock`                         |
| Workspaces  | `CRUD /workspaces`, sync, status                      |
| Sync        | `POST /workspaces/:id/sync`                           |
| Commits     | `POST /projects/:id/submit`, `GET /commits`           |
| Teams       | `CRUD /teams`, member management                      |
| Search      | `GET /search`, file tagging                           |

## Configuration

All config is via environment variables (see `.env.example` for full list). Key variables:

| Variable        | Description                  | Default                  |
|-----------------|------------------------------|--------------------------|
| `SERVER_PORT`   | HTTP listen port             | `8080`                   |
| `DATABASE_URL`  | PostgreSQL connection string | —                        |
| `REDIS_URL`     | Redis connection string      | `redis://localhost:6379` |
| `S3_ENDPOINT`   | Object storage endpoint      | `localhost:9000`         |
| `REPO_BASE_PATH`| Root for bare Git repos      | `./storage/repos`        |
| `LOG_LEVEL`     | Logging level                | `info`                   |
