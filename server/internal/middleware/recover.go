package middleware

import (
	"fmt"
	"runtime"

	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog"
)

func Recover(log zerolog.Logger) fiber.Handler {
	return func(c *fiber.Ctx) error {
		defer func() {
			if r := recover(); r != nil {
				buf := make([]byte, 4096)
				n := runtime.Stack(buf, false)
				stackTrace := string(buf[:n])

				log.Error().
					Str("method", c.Method()).
					Str("path", c.Path()).
					Str("ip", c.IP()).
					Str("stack", stackTrace).
					Interface("panic", r).
					Msg("panic recovered")

				c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
					"error": fiber.Map{
						"code":    "INTERNAL_ERROR",
						"message": "An internal error occurred",
					},
				})
			}
		}()

		return c.Next()
	}
}

func RecoverWithStackTrace() string {
	buf := make([]byte, 4096)
	n := runtime.Stack(buf, false)
	return fmt.Sprintf("%s", buf[:n])
}
