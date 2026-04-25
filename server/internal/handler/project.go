package handler

import (
	"strconv"

	"github.com/gofiber/fiber/v2"
	"github.com/jobo/artifact/server/internal/middleware"
	"github.com/jobo/artifact/server/internal/model"
	"github.com/jobo/artifact/server/internal/service"
)

type ProjectHandler struct {
	projectService *service.ProjectService
}

func NewProjectHandler(projectService *service.ProjectService) *ProjectHandler {
	return &ProjectHandler{projectService: projectService}
}

func (h *ProjectHandler) CreateProject(c *fiber.Ctx) error {
	var req model.CreateProjectRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{
				Code:    "INVALID_REQUEST",
				Message: "Invalid JSON body",
			},
		})
	}

	if req.Name == "" {
		return c.Status(fiber.StatusBadRequest).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{
				Code:    "VALIDATION_ERROR",
				Message: "Project name is required",
			},
		})
	}

	if len(req.Name) > 255 {
		return c.Status(fiber.StatusBadRequest).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{
				Code:    "VALIDATION_ERROR",
				Message: "Project name must be at most 255 characters",
			},
		})
	}

	userID := middleware.GetUserID(c)

	project, _, err := h.projectService.CreateProject(c.Context(), userID, req.Name, req.Description, req.TeamID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{
				Code:    "INTERNAL_ERROR",
				Message: "Failed to create project",
			},
		})
	}

	return c.Status(fiber.StatusCreated).JSON(projectToResponse(project))
}

func (h *ProjectHandler) ListProjects(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	pagination := model.PaginationParams{
		Page:  c.QueryInt("page", 1),
		Limit: c.QueryInt("limit", 20),
	}.Defaults()

	projects, total, err := h.projectService.ListProjects(c.Context(), userID, pagination.Page, pagination.Limit)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{
				Code:    "INTERNAL_ERROR",
				Message: "Failed to list projects",
			},
		})
	}

	totalPages := int(total) / pagination.Limit
	if int(total)%pagination.Limit > 0 {
		totalPages++
	}

	responses := make([]model.ProjectResponse, 0, len(projects))
	for _, p := range projects {
		responses = append(responses, projectToResponse(&p))
	}

	return c.JSON(model.PaginatedResponse{
		Data:       responses,
		Total:      total,
		Page:       pagination.Page,
		Limit:      pagination.Limit,
		TotalPages: totalPages,
	})
}

func (h *ProjectHandler) GetProject(c *fiber.Ctx) error {
	projectID := c.Params("projectId")

	project, err := h.projectService.GetProject(c.Context(), projectID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{
				Code:    "PROJECT_NOT_FOUND",
				Message: err.Error(),
			},
		})
	}

	return c.JSON(projectToResponse(project))
}

func (h *ProjectHandler) UpdateProject(c *fiber.Ctx) error {
	projectID := c.Params("projectId")

	var req model.UpdateProjectRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{
				Code:    "INVALID_REQUEST",
				Message: "Invalid JSON body",
			},
		})
	}

	if req.Name == nil && req.Description == nil {
		return c.Status(fiber.StatusBadRequest).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{
				Code:    "VALIDATION_ERROR",
				Message: "At least one of name or description must be provided",
			},
		})
	}

	project, err := h.projectService.UpdateProject(c.Context(), projectID, req.Name, req.Description)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{
				Code:    "PROJECT_NOT_FOUND",
				Message: err.Error(),
			},
		})
	}

	return c.JSON(projectToResponse(project))
}

func (h *ProjectHandler) DeleteProject(c *fiber.Ctx) error {
	projectID := c.Params("projectId")

	if err := h.projectService.DeleteProject(c.Context(), projectID); err != nil {
		return c.Status(fiber.StatusNotFound).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{
				Code:    "PROJECT_NOT_FOUND",
				Message: err.Error(),
			},
		})
	}

	return c.SendStatus(fiber.StatusNoContent)
}

func (h *ProjectHandler) CreateBranch(c *fiber.Ctx) error {
	projectID := c.Params("projectId")

	var req model.CreateBranchRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{
				Code:    "INVALID_REQUEST",
				Message: "Invalid JSON body",
			},
		})
	}

	if req.Name == "" {
		return c.Status(fiber.StatusBadRequest).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{
				Code:    "VALIDATION_ERROR",
				Message: "Branch name is required",
			},
		})
	}

	if req.SourceBranch == "" {
		return c.Status(fiber.StatusBadRequest).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{
				Code:    "VALIDATION_ERROR",
				Message: "Source branch is required",
			},
		})
	}

	branch, err := h.projectService.CreateBranch(c.Context(), projectID, req.Name, req.SourceBranch)
	if err != nil {
		status := fiber.StatusInternalServerError
		code := "INTERNAL_ERROR"
		if err.Error() == "branch \""+req.Name+"\" already exists" ||
			service.IsUniqueViolation(nil) {
			status = fiber.StatusConflict
			code = "BRANCH_EXISTS"
		}
		return c.Status(status).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{
				Code:    code,
				Message: err.Error(),
			},
		})
	}

	return c.Status(fiber.StatusCreated).JSON(branchToResponse(branch))
}

func (h *ProjectHandler) ListBranches(c *fiber.Ctx) error {
	projectID := c.Params("projectId")

	branches, err := h.projectService.ListBranches(c.Context(), projectID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{
				Code:    "INTERNAL_ERROR",
				Message: "Failed to list branches",
			},
		})
	}

	responses := make([]model.BranchResponse, 0, len(branches))
	for _, b := range branches {
		responses = append(responses, branchToResponse(&b))
	}

	return c.JSON(responses)
}

func (h *ProjectHandler) GetBranch(c *fiber.Ctx) error {
	projectID := c.Params("projectId")
	branchID := c.Params("branchId")

	branch, err := h.projectService.GetBranch(c.Context(), projectID, branchID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{
				Code:    "BRANCH_NOT_FOUND",
				Message: err.Error(),
			},
		})
	}

	return c.JSON(branchToResponse(branch))
}

func (h *ProjectHandler) DeleteBranch(c *fiber.Ctx) error {
	projectID := c.Params("projectId")
	branchID := c.Params("branchId")

	err := h.projectService.DeleteBranch(c.Context(), projectID, branchID)
	if err != nil {
		status := fiber.StatusNotFound
		code := "BRANCH_NOT_FOUND"
		msg := err.Error()
		if msg == "cannot delete the default branch" {
			status = fiber.StatusBadRequest
			code = "CANNOT_DELETE_DEFAULT"
		}
		return c.Status(status).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{
				Code:    code,
				Message: msg,
			},
		})
	}

	return c.SendStatus(fiber.StatusNoContent)
}

func projectToResponse(p *service.Project) model.ProjectResponse {
	var teamID *string
	if p.TeamID != nil {
		s := p.TeamID.String()
		teamID = &s
	}
	return model.ProjectResponse{
		ID:          p.ID.String(),
		Name:        p.Name,
		Description: p.Description,
		RepoPath:    p.RepoPath,
		OwnerID:     p.OwnerID.String(),
		TeamID:      teamID,
		CreatedAt:   p.CreatedAt,
		UpdatedAt:   p.UpdatedAt,
	}
}

func branchToResponse(b *service.Branch) model.BranchResponse {
	headCommit := ""
	if b.HeadCommit != nil {
		headCommit = *b.HeadCommit
	}
	return model.BranchResponse{
		ID:         b.ID.String(),
		ProjectID:  b.ProjectID.String(),
		Name:       b.Name,
		IsDefault:  b.IsDefault,
		HeadCommit: headCommit,
		CreatedAt:  b.CreatedAt,
	}
}

func parseIntOrDefault(s string, def int) int {
	n, err := strconv.Atoi(s)
	if err != nil {
		return def
	}
	return n
}
