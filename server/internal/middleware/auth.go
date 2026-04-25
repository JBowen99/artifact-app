package middleware

import (
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/jobo/artifact/server/internal/model"
	"github.com/jobo/artifact/server/internal/service"
)

const UserIDKey = "userID"

func Auth(authService *service.AuthService) fiber.Handler {
	return func(c *fiber.Ctx) error {
		authHeader := c.Get("Authorization")
		if authHeader == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(model.ErrorResponse{
				Error: model.ErrorDetail{
					Code:    "MISSING_TOKEN",
					Message: "Authorization header is required",
				},
			})
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			return c.Status(fiber.StatusUnauthorized).JSON(model.ErrorResponse{
				Error: model.ErrorDetail{
					Code:    "INVALID_TOKEN",
					Message: "Authorization header must be in format: Bearer <token>",
				},
			})
		}

		token := parts[1]
		if token == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(model.ErrorResponse{
				Error: model.ErrorDetail{
					Code:    "INVALID_TOKEN",
					Message: "Token cannot be empty",
				},
			})
		}

		userID, err := authService.ValidateAccessToken(token)
		if err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(model.ErrorResponse{
				Error: model.ErrorDetail{
					Code:    "INVALID_TOKEN",
					Message: "Token is invalid or expired",
				},
			})
		}

		c.Locals(UserIDKey, userID)
		return c.Next()
	}
}

func GetUserID(c *fiber.Ctx) string {
	if id, ok := c.Locals(UserIDKey).(string); ok {
		return id
	}
	return ""
}
