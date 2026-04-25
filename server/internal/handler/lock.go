package handler

import (
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jobo/artifact/server/internal/middleware"
	"github.com/jobo/artifact/server/internal/model"
	"github.com/jobo/artifact/server/internal/service"
)

type LockHandler struct {
	lockService *service.LockService
	fileService *service.FileService
}

func NewLockHandler(lockService *service.LockService, fileService *service.FileService) *LockHandler {
	return &LockHandler{
		lockService: lockService,
		fileService: fileService,
	}
}

type lockRequestBody struct {
	WorkspaceID *string `json:"workspace_id"`
	ExpiresAt   *string `json:"expires_at"`
}

func (h *LockHandler) LockFile(c *fiber.Ctx) error {
	fileID := c.Params("fileId")
	userID := middleware.GetUserID(c)

	_, err := h.fileService.GetFile(c.Context(), fileID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{Code: "FILE_NOT_FOUND", Message: err.Error()},
		})
	}

	var body lockRequestBody
	_ = c.BodyParser(&body)

	var workspaceID *string
	var expiresAt *time.Time

	if body.WorkspaceID != nil && *body.WorkspaceID != "" {
		workspaceID = body.WorkspaceID
	}

	if body.ExpiresAt != nil && *body.ExpiresAt != "" {
		parsed, err := time.Parse(time.RFC3339, *body.ExpiresAt)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(model.ErrorResponse{
				Error: model.ErrorDetail{Code: "VALIDATION_ERROR", Message: "expires_at must be a valid ISO 8601 timestamp"},
			})
		}
		if parsed.Before(time.Now()) {
			return c.Status(fiber.StatusBadRequest).JSON(model.ErrorResponse{
				Error: model.ErrorDetail{Code: "VALIDATION_ERROR", Message: "expires_at must be in the future"},
			})
		}
		expiresAt = &parsed
	}

	lock, err := h.lockService.LockFile(c.Context(), fileID, userID, workspaceID, expiresAt)
	if err != nil {
		if err.Error() == "file is locked by another user" || err.Error() == "file is already locked" {
			return c.Status(fiber.StatusConflict).JSON(model.ErrorResponse{
				Error: model.ErrorDetail{
					Code:    "FILE_LOCKED",
					Message: "File is already locked by another user",
				},
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{Code: "INTERNAL_ERROR", Message: "Failed to lock file"},
		})
	}

	return c.JSON(lockToResponse(lock))
}

func (h *LockHandler) UnlockFile(c *fiber.Ctx) error {
	fileID := c.Params("fileId")
	userID := middleware.GetUserID(c)

	err := h.lockService.UnlockFile(c.Context(), fileID, userID)
	if err != nil {
		msg := err.Error()
		if msg == "file is not locked" {
			return c.Status(fiber.StatusNotFound).JSON(model.ErrorResponse{
				Error: model.ErrorDetail{Code: "NO_LOCK", Message: msg},
			})
		}
		if msg == "lock is owned by another user" {
			return c.Status(fiber.StatusConflict).JSON(model.ErrorResponse{
				Error: model.ErrorDetail{Code: "LOCK_NOT_OWNED", Message: msg},
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{Code: "INTERNAL_ERROR", Message: "Failed to unlock file"},
		})
	}

	return c.JSON(fiber.Map{"message": "unlocked"})
}

func (h *LockHandler) ListLocks(c *fiber.Ctx) error {
	projectID := c.Params("projectId")

	locks, err := h.lockService.ListLocksByProject(c.Context(), projectID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{Code: "INTERNAL_ERROR", Message: "Failed to list locks"},
		})
	}

	type lockListResponse struct {
		LockID    string     `json:"lock_id"`
		FileID    string     `json:"file_id"`
		UserID    string     `json:"user_id"`
		UserName  string     `json:"user_name"`
		FilePath  string     `json:"file_path"`
		LockedAt  time.Time  `json:"locked_at"`
		ExpiresAt *time.Time `json:"expires_at"`
	}

	response := make([]lockListResponse, 0, len(locks))
	for _, l := range locks {
		response = append(response, lockListResponse{
			LockID:    l.ID.String(),
			FileID:    l.FileID.String(),
			UserID:    l.UserID.String(),
			UserName:  l.UserName,
			FilePath:  l.FilePath,
			LockedAt:  l.LockedAt,
			ExpiresAt: l.ExpiresAt,
		})
	}

	return c.JSON(response)
}

func lockToResponse(l *service.Lock) model.LockResponse {
	return model.LockResponse{
		LockID:    l.ID.String(),
		FileID:    l.FileID.String(),
		UserID:    l.UserID.String(),
		LockedAt:  l.LockedAt,
		ExpiresAt: l.ExpiresAt,
	}
}
