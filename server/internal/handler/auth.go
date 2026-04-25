package handler

import (
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/jobo/artifact/server/internal/middleware"
	"github.com/jobo/artifact/server/internal/model"
	"github.com/jobo/artifact/server/internal/service"
)

type AuthHandler struct {
	authService *service.AuthService
}

func NewAuthHandler(authService *service.AuthService) *AuthHandler {
	return &AuthHandler{authService: authService}
}

func (h *AuthHandler) Register(c *fiber.Ctx) error {
	var req model.RegisterRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{
				Code:    "INVALID_REQUEST",
				Message: "Invalid JSON body",
			},
		})
	}

	if err := validateRegister(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{
				Code:    "VALIDATION_ERROR",
				Message: err.Error(),
			},
		})
	}

	user, err := h.authService.Register(c.Context(), req.Email, req.Password, req.DisplayName)
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
				Message: "Failed to create user",
			},
		})
	}

	return c.Status(fiber.StatusCreated).JSON(userToResponse(user))
}

func (h *AuthHandler) Login(c *fiber.Ctx) error {
	var req model.LoginRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{
				Code:    "INVALID_REQUEST",
				Message: "Invalid JSON body",
			},
		})
	}

	if req.Email == "" || req.Password == "" {
		return c.Status(fiber.StatusBadRequest).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{
				Code:    "VALIDATION_ERROR",
				Message: "Email and password are required",
			},
		})
	}

	pair, _, err := h.authService.Login(c.Context(), req.Email, req.Password)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{
				Code:    "INVALID_CREDENTIALS",
				Message: "Invalid email or password",
			},
		})
	}

	return c.JSON(model.LoginResponse{
		AccessToken:  pair.AccessToken,
		RefreshToken: pair.RefreshToken,
		ExpiresIn:    pair.ExpiresIn,
	})
}

func (h *AuthHandler) Logout(c *fiber.Ctx) error {
	var req model.RefreshRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{
				Code:    "INVALID_REQUEST",
				Message: "Invalid JSON body",
			},
		})
	}

	if req.RefreshToken == "" {
		return c.Status(fiber.StatusBadRequest).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{
				Code:    "VALIDATION_ERROR",
				Message: "Refresh token is required",
			},
		})
	}

	_ = h.authService.Logout(c.Context(), req.RefreshToken)

	return c.JSON(fiber.Map{"message": "logged out"})
}

func (h *AuthHandler) Refresh(c *fiber.Ctx) error {
	var req model.RefreshRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{
				Code:    "INVALID_REQUEST",
				Message: "Invalid JSON body",
			},
		})
	}

	if req.RefreshToken == "" {
		return c.Status(fiber.StatusBadRequest).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{
				Code:    "VALIDATION_ERROR",
				Message: "Refresh token is required",
			},
		})
	}

	pair, _, err := h.authService.Refresh(c.Context(), req.RefreshToken)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{
				Code:    "INVALID_TOKEN",
				Message: err.Error(),
			},
		})
	}

	return c.JSON(model.LoginResponse{
		AccessToken:  pair.AccessToken,
		RefreshToken: pair.RefreshToken,
		ExpiresIn:    pair.ExpiresIn,
	})
}

func (h *AuthHandler) Me(c *fiber.Ctx) error {
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

func validateRegister(req *model.RegisterRequest) error {
	req.Email = strings.TrimSpace(req.Email)
	req.DisplayName = strings.TrimSpace(req.DisplayName)

	if req.Email == "" || !strings.Contains(req.Email, "@") {
		return fiber.NewError(fiber.StatusBadRequest, "Valid email is required")
	}
	if len(req.Password) < 8 {
		return fiber.NewError(fiber.StatusBadRequest, "Password must be at least 8 characters")
	}
	if req.DisplayName == "" {
		return fiber.NewError(fiber.StatusBadRequest, "Display name is required")
	}
	return nil
}

func userToResponse(u *service.User) model.UserResponse {
	return model.UserResponse{
		ID:          u.ID.String(),
		Email:       u.Email,
		DisplayName: u.DisplayName,
		Role:        u.Role,
		CreatedAt:   u.CreatedAt,
		UpdatedAt:   u.UpdatedAt,
	}
}
