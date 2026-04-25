package middleware

import (
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog"
)

func Logger(log zerolog.Logger) fiber.Handler {
	return func(c *fiber.Ctx) error {
		start := time.Now()

		err := c.Next()

		duration := time.Since(start)

		event := log.Info()
		if err != nil {
			event = log.Error().Err(err)
		}

		event.
			Str("method", c.Method()).
			Str("path", c.Path()).
			Int("status", c.Response().StatusCode()).
			Dur("latency", duration).
			Str("ip", c.IP()).
			Str("user_agent", c.Get("User-Agent")).
			Int("body_size", len(c.Response().Body())).
			Msg("request")

		return err
	}
}
