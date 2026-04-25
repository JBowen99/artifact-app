package database

import (
	"context"
	"fmt"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/pgx"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog"
)

type DB struct {
	Pool *pgxpool.Pool
}

func New(ctx context.Context, databaseURL string, maxOpen, maxIdle int, log zerolog.Logger) (*DB, error) {
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse database url: %w", err)
	}

	config.MaxConns = int32(maxOpen)
	config.MinConns = int32(maxIdle)

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, fmt.Errorf("create connection pool: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}

	log.Info().Msg("connected to postgresql")
	return &DB{Pool: pool}, nil
}

func (db *DB) Close() {
	db.Pool.Close()
}

func RunMigrations(databaseURL, migrationsPath string, log zerolog.Logger) error {
	m, err := migrate.New(
		"file://"+migrationsPath,
		adaptDatabaseURL(databaseURL),
	)
	if err != nil {
		return fmt.Errorf("create migrator: %w", err)
	}
	defer m.Close()

	if err := m.Up(); err != nil && err != migrate.ErrNoChange {
		return fmt.Errorf("run migrations: %w", err)
	}

	log.Info().Msg("database migrations complete")
	return nil
}

func adaptDatabaseURL(url string) string {
	if len(url) > 11 && url[:11] == "postgres://" {
		return "pgx://" + url[11:]
	}
	if len(url) > 13 && url[:13] == "postgresql://" {
		return "pgx://" + url[13:]
	}
	return url
}
