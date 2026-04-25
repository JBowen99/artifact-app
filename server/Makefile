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
