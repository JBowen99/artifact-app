# Artifact App

This repository contains:

- `server/`: Go API backend
- `client/`: React Router frontend

## Prerequisites

- Go 1.23+
- Node.js 20+ and npm
- Docker (for PostgreSQL, Redis, and MinIO)
- `migrate` CLI
- `sqlc` CLI

## Start the Server

From the `server/` directory:

```bash
cd server
cp .env.example .env
go mod download

# one-time JWT keys (if not already present)
mkdir -p keys
openssl genrsa -out keys/private.pem 2048
openssl rsa -in keys/private.pem -pubout -out keys/public.pem

# start local infrastructure
docker compose up -d

# run migrations and generate DB code
make migrate-up
make generate

# start API server
make run
```

The server runs on `http://localhost:8080` by default.

## Start the Client

In a new terminal, from the `client/` directory:

```bash
cd client
npm install
npm run dev
```

The client runs on `http://localhost:5173` by default.

## Typical Local Workflow

1. Start infrastructure + backend from `server/`
2. Start frontend from `client/`
3. Open `http://localhost:5173`
