package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	Server   ServerConfig
	Database DatabaseConfig
	Redis    RedisConfig
	S3       S3Config
	JWT      JWTConfig
	Storage  StorageConfig
	Lock     LockConfig
	Log      LogConfig
}

type ServerConfig struct {
	Port string
	Host string
}

type DatabaseConfig struct {
	URL            string
	MaxOpenConns   int
	MaxIdleConns   int
	MigrationsPath string
}

type RedisConfig struct {
	URL string
}

type S3Config struct {
	Endpoint  string
	AccessKey string
	SecretKey string
	Bucket    string
	UseSSL    bool
}

type JWTConfig struct {
	PrivateKeyPath string
	PublicKeyPath  string
	AccessTTL      time.Duration
	RefreshTTL     time.Duration
}

type StorageConfig struct {
	RepoBasePath    string
	UploadChunkSize int64
}

type LockConfig struct {
	SweepInterval time.Duration
	DefaultTTL    time.Duration
}

type LogConfig struct {
	Level  string
	Format string
}

func Load() (*Config, error) {
	_ = godotenv.Load()

	accessTTL, err := parseDuration(envOr("JWT_ACCESS_TTL", "15m"))
	if err != nil {
		return nil, fmt.Errorf("invalid JWT_ACCESS_TTL: %w", err)
	}

	refreshTTL, err := parseDuration(envOr("JWT_REFRESH_TTL", "168h"))
	if err != nil {
		return nil, fmt.Errorf("invalid JWT_REFRESH_TTL: %w", err)
	}

	maxOpen, _ := strconv.Atoi(envOr("DATABASE_MAX_OPEN_CONNS", "25"))
	maxIdle, _ := strconv.Atoi(envOr("DATABASE_MAX_IDLE_CONNS", "5"))
	chunkSize, _ := strconv.ParseInt(envOr("UPLOAD_CHUNK_SIZE", "8388608"), 10, 64)
	useSSL, _ := strconv.ParseBool(envOr("S3_USE_SSL", "false"))

	lockSweep, err := parseDuration(envOr("LOCK_SWEEP_INTERVAL", "1m"))
	if err != nil {
		return nil, fmt.Errorf("invalid LOCK_SWEEP_INTERVAL: %w", err)
	}
	lockTTL, err := parseDuration(envOr("LOCK_DEFAULT_TTL", "720h"))
	if err != nil {
		return nil, fmt.Errorf("invalid LOCK_DEFAULT_TTL: %w", err)
	}

	dbURL := envOr("DATABASE_URL", "")
	if dbURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}

	cfg := &Config{
		Server: ServerConfig{
			Port: envOr("SERVER_PORT", "8080"),
			Host: envOr("SERVER_HOST", "0.0.0.0"),
		},
		Database: DatabaseConfig{
			URL:            dbURL,
			MaxOpenConns:   maxOpen,
			MaxIdleConns:   maxIdle,
			MigrationsPath: envOr("MIGRATIONS_PATH", "migrations"),
		},
		Redis: RedisConfig{
			URL: envOr("REDIS_URL", "redis://localhost:6379/0"),
		},
		S3: S3Config{
			Endpoint:  envOr("S3_ENDPOINT", "localhost:9000"),
			AccessKey: envOr("S3_ACCESS_KEY", ""),
			SecretKey: envOr("S3_SECRET_KEY", ""),
			Bucket:    envOr("S3_BUCKET", "artifact-binaries"),
			UseSSL:    useSSL,
		},
		JWT: JWTConfig{
			PrivateKeyPath: envOr("JWT_PRIVATE_KEY_PATH", "./keys/private.pem"),
			PublicKeyPath:  envOr("JWT_PUBLIC_KEY_PATH", "./keys/public.pem"),
			AccessTTL:      accessTTL,
			RefreshTTL:     refreshTTL,
		},
		Storage: StorageConfig{
			RepoBasePath:    envOr("REPO_BASE_PATH", "./storage/repos"),
			UploadChunkSize: chunkSize,
		},
		Lock: LockConfig{
			SweepInterval: lockSweep,
			DefaultTTL:    lockTTL,
		},
		Log: LogConfig{
			Level:  envOr("LOG_LEVEL", "info"),
			Format: envOr("LOG_FORMAT", "json"),
		},
	}

	return cfg, nil
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func parseDuration(s string) (time.Duration, error) {
	if d, err := time.ParseDuration(s); err == nil {
		return d, nil
	}
	if strings.HasSuffix(s, "d") {
		days, err := strconv.ParseFloat(strings.TrimSuffix(s, "d"), 64)
		if err != nil {
			return 0, fmt.Errorf("cannot parse %q as duration", s)
		}
		return time.Duration(days * 24 * float64(time.Hour)), nil
	}
	hours, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return 0, fmt.Errorf("cannot parse %q as duration", s)
	}
	return time.Duration(hours * float64(time.Hour)), nil
}
