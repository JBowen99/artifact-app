package handler

import (
	"github.com/gofiber/fiber/v2"
	"github.com/jobo/artifact/server/internal/middleware"
	"github.com/jobo/artifact/server/internal/model"
	"github.com/jobo/artifact/server/internal/service"
)

type UserHandler struct {
	authService *service.AuthService
}

func NewUserHandler(authService *service.AuthService) *UserHandler {
	return &UserHandler{authService: authService}
}

func (h *UserHandler) GetMe(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{
				Code:    "UNAUTHORIZED",
				Message: "Not authenticated",
			},
		})
	}

	user, err := h.authService.GetUserByID(c.Context(), userID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{
				Code:    "USER_NOT_FOUND",
				Message: "User not found",
			},
		})
	}

	return c.JSON(userToResponse(user))
}

func (h *UserHandler) UpdateMe(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{
				Code:    "UNAUTHORIZED",
				Message: "Not authenticated",
			},
		})
	}

	var req model.UpdateUserRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{
				Code:    "INVALID_REQUEST",
				Message: "Invalid JSON body",
			},
		})
	}

	user, err := h.authService.UpdateUser(c.Context(), userID, req.DisplayName, req.Email)
	if err != nil {
		if service.IsUniqueViolation(err) {
			return c.Status(fiber.StatusConflict).JSON(model.ErrorResponse{
				Error: model.ErrorDetail{
					Code:    "EMAIL_EXISTS",
					Message: "A user with this email already exists",
				},
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{
				Code:    "INTERNAL_ERROR",
				Message: "Failed to update user",
			},
		})
	}

	return c.JSON(userToResponse(user))
}
