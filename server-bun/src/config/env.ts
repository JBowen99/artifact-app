function envOr(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

function parseDuration(s: string): number {
  const msMap: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60_000,
    h: 3_600_000,
  };

  const match = s.match(/^(\d+(?:\.\d+)?)(ms|s|m|h|d)$/);
  if (match) {
    const val = parseFloat(match[1]);
    const unit = match[2];
    if (unit === "d") return val * 24 * 3_600_000;
    return val * msMap[unit];
  }

  const asHours = parseFloat(s);
  if (!isNaN(asHours)) return asHours * 3_600_000;

  throw new Error(`Cannot parse "${s}" as duration`);
}

export const config = {
  server: {
    port: parseInt(envOr("SERVER_PORT", "8080"), 10),
    host: envOr("SERVER_HOST", "0.0.0.0"),
  },
  database: {
    url: envOr("DATABASE_URL", ""),
    maxOpenConns: parseInt(envOr("DATABASE_MAX_OPEN_CONNS", "25"), 10),
    maxIdleConns: parseInt(envOr("DATABASE_MAX_IDLE_CONNS", "5"), 10),
  },
  redis: {
    url: envOr("REDIS_URL", "redis://localhost:6379/0"),
  },
  s3: {
    endpoint: envOr("S3_ENDPOINT", "localhost:9000"),
    accessKey: envOr("S3_ACCESS_KEY", ""),
    secretKey: envOr("S3_SECRET_KEY", ""),
    bucket: envOr("S3_BUCKET", "artifact-binaries"),
    useSSL: envOr("S3_USE_SSL", "false") === "true",
  },
  jwt: {
    privateKeyPath: envOr("JWT_PRIVATE_KEY_PATH", "./keys/private.pem"),
    publicKeyPath: envOr("JWT_PUBLIC_KEY_PATH", "./keys/public.pem"),
    accessTTL: parseDuration(envOr("JWT_ACCESS_TTL", "15m")),
    refreshTTL: parseDuration(envOr("JWT_REFRESH_TTL", "168h")),
  },
  storage: {
    repoBasePath: envOr("REPO_BASE_PATH", "./storage/repos"),
    uploadChunkSize: parseInt(envOr("UPLOAD_CHUNK_SIZE", "8388608"), 10),
  },
  lock: {
    sweepInterval: parseDuration(envOr("LOCK_SWEEP_INTERVAL", "1m")),
    defaultTTL: parseDuration(envOr("LOCK_DEFAULT_TTL", "720h")),
  },
  log: {
    level: envOr("LOG_LEVEL", "info"),
    format: envOr("LOG_FORMAT", "json"),
  },
} as const;

if (!config.database.url) {
  throw new Error("DATABASE_URL is required");
}
