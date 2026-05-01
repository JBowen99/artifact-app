.PHONY: dev build migrate studio test

dev:
	bun run --watch src/index.ts

start:
	bun run src/index.ts

build:
	bun build src/index.ts --outdir dist --target bun

migrate:
	bunx drizzle-kit generate

push:
	bunx drizzle-kit push

studio:
	bunx drizzle-kit studio

test:
	bun test

docker-build:
	docker build -t artifact-server .

docker-run:
	docker run --env-file .env -p 8080:8080 artifact-server
