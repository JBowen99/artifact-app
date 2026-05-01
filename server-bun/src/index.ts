import Elysia from "elysia";
import cors from "@elysiajs/cors";
import { config } from "@/config/env";
import { logger } from "@/lib/logger";
import { loggerPlugin } from "@/middleware/logger";
import { errorPlugin } from "@/middleware/error";
import { loadJWTKeys } from "@/services/auth.service";
import { ensureBucket } from "@/lib/s3";
import { ensureReposDir } from "@/lib/git";
import { redis } from "@/lib/redis";
import { startSweeper } from "@/services/lock.service";
import { router } from "@/router";

async function main() {
  logger.info("Starting Artifact API server (Bun)...");

  logger.info("Loading JWT keys...");
  await loadJWTKeys();

  logger.info("Connecting to Redis...");
  await redis.ping();
  logger.info("Redis connected");

  logger.info("Ensuring storage directories...");
  await ensureReposDir();

  logger.info("Connecting to S3/MinIO...");
  await ensureBucket();

  const sweeperHandle = startSweeper();

  const app = new Elysia()
    .use(
      cors({
        origin: "*",
        methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
      }),
    )
    .use(loggerPlugin)
    .use(errorPlugin)
    .get("/health", () => ({
      status: "ok",
      services: {
        database: "connected",
        redis: "connected",
        s3: "connected",
      },
    }))
    .use(router)
    .listen({
      port: config.server.port,
      hostname: config.server.host,
    });

  logger.info(
    `Server listening on http://${config.server.host}:${config.server.port}`,
  );

  const shutdown = async () => {
    logger.info("Shutting down...");
    clearInterval(sweeperHandle);
    await redis.quit();
    app.stop();
    logger.info("Server stopped");
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  logger.fatal({ err }, "Failed to start server");
  process.exit(1);
});
