package handler

import (
	"fmt"
	"io"

	"github.com/gofiber/fiber/v2"
	"github.com/jobo/artifact/server/internal/middleware"
	"github.com/jobo/artifact/server/internal/model"
	"github.com/jobo/artifact/server/internal/service"
)

type FileHandler struct {
	fileService *service.FileService
}

func NewFileHandler(fileService *service.FileService) *FileHandler {
	return &FileHandler{fileService: fileService}
}

func (h *FileHandler) InitUpload(c *fiber.Ctx) error {
	var req model.InitUploadRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{
				Code:    "INVALID_REQUEST",
				Message: "Invalid JSON body",
			},
		})
	}

	if req.ProjectID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{Code: "VALIDATION_ERROR", Message: "project_id is required"},
		})
	}
	if req.Branch == "" {
		return c.Status(fiber.StatusBadRequest).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{Code: "VALIDATION_ERROR", Message: "branch is required"},
		})
	}
	if req.Path == "" {
		return c.Status(fiber.StatusBadRequest).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{Code: "VALIDATION_ERROR", Message: "path is required"},
		})
	}
	if req.FileName == "" {
		return c.Status(fiber.StatusBadRequest).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{Code: "VALIDATION_ERROR", Message: "file_name is required"},
		})
	}
	if req.FileSize <= 0 {
		return c.Status(fiber.StatusBadRequest).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{Code: "VALIDATION_ERROR", Message: "file_size must be positive"},
		})
	}

	userID := middleware.GetUserID(c)

	sessionID, chunkSize, totalChunks, err := h.fileService.InitUpload(
		c.Context(), userID,
		req.ProjectID, req.Branch, req.Path, req.FileName,
		req.FileSize, req.ContentHash,
	)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{Code: "UPLOAD_INIT_FAILED", Message: err.Error()},
		})
	}

	return c.Status(fiber.StatusCreated).JSON(model.InitUploadResponse{
		SessionID:   sessionID,
		ChunkSize:   chunkSize,
		TotalChunks: totalChunks,
	})
}

func (h *FileHandler) UploadChunk(c *fiber.Ctx) error {
	sessionID := c.Params("sessionId")
	if sessionID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{Code: "VALIDATION_ERROR", Message: "session_id is required"},
		})
	}

	chunkIndex := -1
	formValue := c.FormValue("chunk_index")
	if formValue != "" {
		_, serr := fmt.Sscanf(formValue, "%d", &chunkIndex)
		if serr != nil {
			chunkIndex = -1
		}
	} else {
		chunkIndex = c.QueryInt("chunk_index", -1)
	}
	if chunkIndex < 0 {
		return c.Status(fiber.StatusBadRequest).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{Code: "VALIDATION_ERROR", Message: "chunk_index is required and must be a non-negative integer"},
		})
	}

	fileHeader, err := c.FormFile("data")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{Code: "VALIDATION_ERROR", Message: "data file is required"},
		})
	}

	file, err := fileHeader.Open()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{Code: "INTERNAL_ERROR", Message: "Failed to read upload data"},
		})
	}
	defer file.Close()

	data, err := io.ReadAll(file)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{Code: "INTERNAL_ERROR", Message: "Failed to read chunk data"},
		})
	}

	if err := h.fileService.UploadChunk(c.Context(), sessionID, chunkIndex, data); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{Code: "CHUNK_UPLOAD_FAILED", Message: err.Error()},
		})
	}

	return c.JSON(fiber.Map{"received": true, "chunk_index": chunkIndex})
}

func (h *FileHandler) CompleteUpload(c *fiber.Ctx) error {
	sessionID := c.Params("sessionId")
	if sessionID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{Code: "VALIDATION_ERROR", Message: "session_id is required"},
		})
	}

	file, err := h.fileService.CompleteUpload(c.Context(), sessionID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{Code: "UPLOAD_COMPLETE_FAILED", Message: err.Error()},
		})
	}

	return c.JSON(model.CompleteUploadResponse{
		FileID:      file.ID.String(),
		ContentHash: file.ContentHash,
		SizeBytes:   file.SizeBytes,
		PointerFile: file.PointerFilePath,
	})
}

func (h *FileHandler) BrowseFiles(c *fiber.Ctx) error {
	projectID := c.Params("projectId")
	branch := c.Query("branch")
	pathPrefix := c.Query("path")

	pagination := model.PaginationParams{
		Page:  c.QueryInt("page", 1),
		Limit: c.QueryInt("limit", 50),
	}.Defaults()

	files, total, err := h.fileService.BrowseFiles(c.Context(), projectID, branch, pathPrefix, pagination.Page, pagination.Limit)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{Code: "BROWSE_FAILED", Message: err.Error()},
		})
	}

	totalPages := int(total) / pagination.Limit
	if int(total)%pagination.Limit > 0 {
		totalPages++
	}

	responses := make([]model.FileMetadata, 0, len(files))
	for _, f := range files {
		responses = append(responses, fileToResponse(&f))
	}

	return c.JSON(model.PaginatedResponse{
		Data:       responses,
		Total:      total,
		Page:       pagination.Page,
		Limit:      pagination.Limit,
		TotalPages: totalPages,
	})
}

func (h *FileHandler) GetFile(c *fiber.Ctx) error {
	fileID := c.Params("fileId")

	file, err := h.fileService.GetFile(c.Context(), fileID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{Code: "FILE_NOT_FOUND", Message: err.Error()},
		})
	}

	return c.JSON(fileToResponse(file))
}

func (h *FileHandler) DownloadFile(c *fiber.Ctx) error {
	fileID := c.Params("fileId")

	stream, file, err := h.fileService.DownloadFile(c.Context(), fileID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{Code: "FILE_NOT_FOUND", Message: err.Error()},
		})
	}
	defer stream.Close()

	c.Set("Content-Type", "application/octet-stream")
	c.Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, file.FileName))
	c.Set("Content-Length", fmt.Sprintf("%d", file.SizeBytes))

	return c.SendStream(stream, int(file.SizeBytes))
}

func (h *FileHandler) DeleteFile(c *fiber.Ctx) error {
	fileID := c.Params("fileId")

	if err := h.fileService.DeleteFile(c.Context(), fileID); err != nil {
		return c.Status(fiber.StatusNotFound).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{Code: "FILE_NOT_FOUND", Message: err.Error()},
		})
	}

	return c.SendStatus(fiber.StatusNoContent)
}

func fileToResponse(f *service.File) model.FileMetadata {
	var ownerID string
	if f.OwnerID != nil {
		ownerID = f.OwnerID.String()
	}
	return model.FileMetadata{
		ID:              f.ID.String(),
		ProjectID:       f.ProjectID.String(),
		BranchID:        f.BranchID.String(),
		Path:            f.Path,
		FileName:        f.FileName,
		FileType:        f.FileType,
		IsBinary:        f.IsBinary,
		ContentHash:     f.ContentHash,
		SizeBytes:       f.SizeBytes,
		PointerFilePath: f.PointerFilePath,
		Version:         f.Version,
		OwnerID:         ownerID,
		CreatedAt:       f.CreatedAt,
		UpdatedAt:       f.UpdatedAt,
	}
}
