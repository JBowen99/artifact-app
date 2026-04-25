package main

import (
	"context"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"

	"github.com/jobo/artifact/server/internal/config"
	"github.com/jobo/artifact/server/internal/database"
	"github.com/jobo/artifact/server/internal/router"
	"github.com/jobo/artifact/server/internal/service"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}
}

func run() error {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("load config: %w", err)
	}

	log := initLogger(cfg.Log)

	log.Info().
		Str("port", cfg.Server.Port).
		Str("host", cfg.Server.Host).
		Str("log_level", cfg.Log.Level).
		Msg("starting artifact server")

	db, err := database.New(ctx, cfg.Database.URL, cfg.Database.MaxOpenConns, cfg.Database.MaxIdleConns, log)
	if err != nil {
		return fmt.Errorf("init database: %w", err)
	}
	defer db.Close()

	if err := database.RunMigrations(cfg.Database.URL, cfg.Database.MigrationsPath, log); err != nil {
		return fmt.Errorf("run migrations: %w", err)
	}

	rdb, err := initRedis(ctx, cfg.Redis.URL, log)
	if err != nil {
		return fmt.Errorf("init redis: %w", err)
	}
	defer rdb.Close()

	if err := initStorageDir(cfg.Storage.RepoBasePath); err != nil {
		return fmt.Errorf("init storage dir: %w", err)
	}

	_ = initMinIO(cfg, log)

	storageService, err := service.NewStorageService(cfg.S3)
	if err != nil {
		return fmt.Errorf("init storage service: %w", err)
	}
	if err := storageService.EnsureBucket(ctx); err != nil {
		return fmt.Errorf("ensure bucket: %w", err)
	}
	log.Info().Str("bucket", cfg.S3.Bucket).Msg("storage service initialized")

	privateKey, publicKey, err := loadJWTKeys(cfg.JWT.PrivateKeyPath, cfg.JWT.PublicKeyPath)
	if err != nil {
		return fmt.Errorf("load jwt keys: %w", err)
	}
	log.Info().Msg("jwt keys loaded")

	gitService := service.NewGitService(cfg.Storage.RepoBasePath)
	log.Info().Str("path", cfg.Storage.RepoBasePath).Msg("git service initialized")

	authService := service.NewAuthService(
		db.Pool, rdb,
		privateKey, publicKey,
		cfg.JWT.AccessTTL, cfg.JWT.RefreshTTL,
	)

	projectService := service.NewProjectService(db.Pool, gitService)

	fileService := service.NewFileService(db.Pool, rdb, storageService, projectService, cfg.Storage.UploadChunkSize)

	lockService := service.NewLockService(db.Pool, rdb, cfg.Lock.SweepInterval, cfg.Lock.DefaultTTL)
	go lockService.StartSweeper(ctx, log.With().Str("component", "lock_sweeper").Logger())

	workspaceService := service.NewWorkspaceService(db.Pool, projectService, lockService)

	commitService := service.NewCommitService(db.Pool, projectService, gitService, lockService, authService, fileService)

	teamService := service.NewTeamService(db.Pool)

	searchService := service.NewSearchService(db.Pool)

	app := fiber.New(fiber.Config{
		AppName:               "Artifact Server",
		ReadTimeout:           30 * time.Second,
		WriteTimeout:          30 * time.Second,
		IdleTimeout:           60 * time.Second,
		DisableStartupMessage: true,
	})

	r := router.New(app, log, authService, projectService, fileService, lockService, workspaceService, commitService, teamService, searchService)
	r.Register()

	addr := fmt.Sprintf("%s:%s", cfg.Server.Host, cfg.Server.Port)

	go func() {
		log.Info().Str("addr", addr).Msg("server listening")
		if err := app.Listen(addr); err != nil {
			log.Fatal().Err(err).Msg("server failed")
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Info().Msg("shutting down server")

	cancel()

	if err := app.Shutdown(); err != nil {
		log.Error().Err(err).Msg("server shutdown error")
	}

	db.Close()
	rdb.Close()

	log.Info().Msg("server stopped")
	return nil
}

func initLogger(cfg config.LogConfig) zerolog.Logger {
	level, err := zerolog.ParseLevel(cfg.Level)
	if err != nil {
		level = zerolog.InfoLevel
	}
	zerolog.SetGlobalLevel(level)
	zerolog.TimeFieldFormat = time.RFC3339

	log := zerolog.New(os.Stdout).With().Timestamp().Logger()

	if cfg.Format == "text" {
		log = log.Output(zerolog.ConsoleWriter{Out: os.Stdout})
	}

	return log
}

func initRedis(ctx context.Context, url string, log zerolog.Logger) (*redis.Client, error) {
	opts, err := redis.ParseURL(url)
	if err != nil {
		return nil, fmt.Errorf("parse redis url: %w", err)
	}

	rdb := redis.NewClient(opts)
	if err := rdb.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("ping redis: %w", err)
	}

	log.Info().Str("url", url).Msg("connected to redis")
	return rdb, nil
}

func initStorageDir(path string) error {
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return os.MkdirAll(path, 0755)
	}
	return nil
}

func initMinIO(cfg *config.Config, log zerolog.Logger) error {
	log.Info().
		Str("endpoint", cfg.S3.Endpoint).
		Str("bucket", cfg.S3.Bucket).
		Msg("minio client configured (bucket ensure deferred to upload)")
	return nil
}

func loadJWTKeys(privatePath, publicPath string) (*rsa.PrivateKey, *rsa.PublicKey, error) {
	privateBytes, err := os.ReadFile(privatePath)
	if err != nil {
		return nil, nil, fmt.Errorf("read private key: %w", err)
	}

	block, _ := pem.Decode(privateBytes)
	if block == nil {
		return nil, nil, fmt.Errorf("failed to decode private key PEM")
	}

	privateKey, err := x509.ParsePKCS1PrivateKey(block.Bytes)
	if err != nil {
		pkcs8Key, err2 := x509.ParsePKCS8PrivateKey(block.Bytes)
		if err2 != nil {
			return nil, nil, fmt.Errorf("parse private key: tried PKCS1 (%w) and PKCS8 (%w)", err, err2)
		}
		rsaKey, ok := pkcs8Key.(*rsa.PrivateKey)
		if !ok {
			return nil, nil, fmt.Errorf("private key is not RSA")
		}
		privateKey = rsaKey
	}

	publicBytes, err := os.ReadFile(publicPath)
	if err != nil {
		return nil, nil, fmt.Errorf("read public key: %w", err)
	}

	pubBlock, _ := pem.Decode(publicBytes)
	if pubBlock == nil {
		return nil, nil, fmt.Errorf("failed to decode public key PEM")
	}

	pub, err := x509.ParsePKIXPublicKey(pubBlock.Bytes)
	if err != nil {
		return nil, nil, fmt.Errorf("parse public key: %w", err)
	}

	publicKey, ok := pub.(*rsa.PublicKey)
	if !ok {
		return nil, nil, fmt.Errorf("public key is not RSA")
	}

	return privateKey, publicKey, nil
}
