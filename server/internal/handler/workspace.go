package handler

import (
	"github.com/gofiber/fiber/v2"
	"github.com/jobo/artifact/server/internal/middleware"
	"github.com/jobo/artifact/server/internal/model"
	"github.com/jobo/artifact/server/internal/service"
)

type WorkspaceHandler struct {
	workspaceService *service.WorkspaceService
}

func NewWorkspaceHandler(workspaceService *service.WorkspaceService) *WorkspaceHandler {
	return &WorkspaceHandler{workspaceService: workspaceService}
}

func (h *WorkspaceHandler) CreateWorkspace(c *fiber.Ctx) error {
	projectID := c.Params("projectId")
	userID := middleware.GetUserID(c)

	var req model.CreateWorkspaceRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{Code: "INVALID_REQUEST", Message: "Invalid JSON body"},
		})
	}

	if req.Name == "" {
		return c.Status(fiber.StatusBadRequest).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{Code: "VALIDATION_ERROR", Message: "Workspace name is required"},
		})
	}

	ws, err := h.workspaceService.CreateWorkspace(c.Context(), projectID, userID, req.Name, req.Branch, req.RootPath)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{Code: "CREATE_FAILED", Message: err.Error()},
		})
	}

	return c.Status(fiber.StatusCreated).JSON(workspaceToResponse(ws))
}

func (h *WorkspaceHandler) ListWorkspaces(c *fiber.Ctx) error {
	projectID := c.Params("projectId")

	workspaces, err := h.workspaceService.ListWorkspacesByProject(c.Context(), projectID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{Code: "INTERNAL_ERROR", Message: "Failed to list workspaces"},
		})
	}

	responses := make([]model.WorkspaceResponse, 0, len(workspaces))
	for _, ws := range workspaces {
		responses = append(responses, workspaceToResponse(&ws))
	}

	return c.JSON(responses)
}

func (h *WorkspaceHandler) GetWorkspace(c *fiber.Ctx) error {
	workspaceID := c.Params("workspaceId")

	ws, err := h.workspaceService.GetWorkspace(c.Context(), workspaceID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{Code: "WORKSPACE_NOT_FOUND", Message: err.Error()},
		})
	}

	return c.JSON(workspaceToResponse(ws))
}

func (h *WorkspaceHandler) UpdateWorkspace(c *fiber.Ctx) error {
	workspaceID := c.Params("workspaceId")

	var req struct {
		Name     *string `json:"name"`
		RootPath *string `json:"root_path"`
		Branch   *string `json:"branch"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{Code: "INVALID_REQUEST", Message: "Invalid JSON body"},
		})
	}

	ws, err := h.workspaceService.UpdateWorkspace(c.Context(), workspaceID, req.Name, req.RootPath, req.Branch)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{Code: "WORKSPACE_NOT_FOUND", Message: err.Error()},
		})
	}

	return c.JSON(workspaceToResponse(ws))
}

func (h *WorkspaceHandler) DeleteWorkspace(c *fiber.Ctx) error {
	workspaceID := c.Params("workspaceId")

	if err := h.workspaceService.DeleteWorkspace(c.Context(), workspaceID); err != nil {
		return c.Status(fiber.StatusNotFound).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{Code: "WORKSPACE_NOT_FOUND", Message: err.Error()},
		})
	}

	return c.SendStatus(fiber.StatusNoContent)
}

func (h *WorkspaceHandler) GetWorkspaceStatus(c *fiber.Ctx) error {
	workspaceID := c.Params("workspaceId")

	ws, branchName, syncedCount, pending, locks, err := h.workspaceService.GetWorkspaceStatus(c.Context(), workspaceID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{Code: "WORKSPACE_NOT_FOUND", Message: err.Error()},
		})
	}

	pendingChanges := make([]model.PendingChange, 0, len(pending))
	for _, p := range pending {
		pendingChanges = append(pendingChanges, model.PendingChange{
			FileID:     p.FileID.String(),
			Path:       p.Path,
			ChangeType: p.ChangeType,
			DetectedAt: p.DetectedAt,
		})
	}

	workspaceLocks := make([]model.WorkspaceLock, 0, len(locks))
	for _, l := range locks {
		workspaceLocks = append(workspaceLocks, model.WorkspaceLock{
			FileID:   l.FileID.String(),
			Path:     l.Path,
			LockedBy: l.LockedBy,
		})
	}

	return c.JSON(model.WorkspaceStatus{
		WorkspaceID:     ws.ID.String(),
		Branch:          branchName,
		LastSyncedAt:    ws.LastSyncedAt,
		SyncedFileCount: syncedCount,
		PendingChanges:  pendingChanges,
		Locks:           workspaceLocks,
	})
}

func (h *WorkspaceHandler) GetWorkspaceFiles(c *fiber.Ctx) error {
	workspaceID := c.Params("workspaceId")

	files, err := h.workspaceService.GetWorkspaceFiles(c.Context(), workspaceID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{Code: "INTERNAL_ERROR", Message: "Failed to list workspace files"},
		})
	}

	type syncedFileResponse struct {
		FileID        string `json:"file_id"`
		Path          string `json:"path"`
		FileName      string `json:"file_name"`
		SyncedVersion int    `json:"synced_version"`
		LatestVersion int    `json:"latest_version"`
		LocalPath     string `json:"local_path"`
		SyncedAt      string `json:"synced_at"`
	}

	responses := make([]syncedFileResponse, 0, len(files))
	for _, f := range files {
		responses = append(responses, syncedFileResponse{
			FileID:        f.FileID.String(),
			Path:          f.Path,
			FileName:      f.FileName,
			SyncedVersion: f.SyncedVersion,
			LatestVersion: f.LatestVersion,
			LocalPath:     f.LocalPath,
			SyncedAt:      f.SyncedAt.Format("2006-01-02T15:04:05Z"),
		})
	}

	return c.JSON(responses)
}

func (h *WorkspaceHandler) SyncWorkspace(c *fiber.Ctx) error {
	workspaceID := c.Params("workspaceId")
	userID := middleware.GetUserID(c)

	var req model.SyncRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{Code: "INVALID_REQUEST", Message: "Invalid JSON body"},
		})
	}

	if req.LocalVersions == nil {
		req.LocalVersions = make(map[string]string)
	}

	actions, err := h.workspaceService.SyncWorkspace(c.Context(), workspaceID, userID, req.LocalVersions)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{Code: "SYNC_FAILED", Message: err.Error()},
		})
	}

	responseActions := make([]model.SyncAction, 0, len(actions))
	for _, a := range actions {
		responseActions = append(responseActions, model.SyncAction{
			Type:        a.Type,
			Path:        a.Path,
			Version:     a.Version,
			SizeBytes:   a.SizeBytes,
			ContentHash: a.ContentHash,
			DownloadURL: a.DownloadURL,
		})
	}

	return c.JSON(model.SyncResponse{Actions: responseActions})
}

func workspaceToResponse(ws *service.Workspace) model.WorkspaceResponse {
	return model.WorkspaceResponse{
		ID:           ws.ID.String(),
		ProjectID:    ws.ProjectID.String(),
		UserID:       ws.UserID.String(),
		BranchID:     ws.BranchID.String(),
		Name:         ws.Name,
		RootPath:     ws.RootPath,
		LastSyncedAt: ws.LastSyncedAt,
		CreatedAt:    ws.CreatedAt,
		UpdatedAt:    ws.UpdatedAt,
	}
}
