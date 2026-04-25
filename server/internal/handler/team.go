package handler

import (
	"github.com/gofiber/fiber/v2"
	"github.com/jobo/artifact/server/internal/middleware"
	"github.com/jobo/artifact/server/internal/model"
	"github.com/jobo/artifact/server/internal/service"
)

type TeamHandler struct {
	teamService *service.TeamService
}

func NewTeamHandler(teamService *service.TeamService) *TeamHandler {
	return &TeamHandler{teamService: teamService}
}

func (h *TeamHandler) CreateTeam(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	var req model.CreateTeamRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{Code: "INVALID_REQUEST", Message: "Invalid JSON body"},
		})
	}

	if req.Name == "" {
		return c.Status(fiber.StatusBadRequest).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{Code: "VALIDATION_ERROR", Message: "Team name is required"},
		})
	}

	team, err := h.teamService.CreateTeam(c.Context(), req.Name, req.Description, userID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{Code: "CREATE_FAILED", Message: err.Error()},
		})
	}

	return c.Status(fiber.StatusCreated).JSON(teamToResponse(team))
}

func (h *TeamHandler) ListTeams(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	teams, err := h.teamService.ListTeams(c.Context(), userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{Code: "INTERNAL_ERROR", Message: "Failed to list teams"},
		})
	}

	responses := make([]model.TeamResponse, 0, len(teams))
	for _, t := range teams {
		responses = append(responses, teamToResponse(&t))
	}

	return c.JSON(responses)
}

func (h *TeamHandler) GetTeam(c *fiber.Ctx) error {
	teamID := c.Params("teamId")

	team, err := h.teamService.GetTeam(c.Context(), teamID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{Code: "TEAM_NOT_FOUND", Message: err.Error()},
		})
	}

	return c.JSON(teamToResponse(team))
}

func (h *TeamHandler) UpdateTeam(c *fiber.Ctx) error {
	teamID := c.Params("teamId")

	var req model.UpdateTeamRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{Code: "INVALID_REQUEST", Message: "Invalid JSON body"},
		})
	}

	team, err := h.teamService.UpdateTeam(c.Context(), teamID, req.Name, req.Description)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{Code: "TEAM_NOT_FOUND", Message: err.Error()},
		})
	}

	return c.JSON(teamToResponse(team))
}

func (h *TeamHandler) DeleteTeam(c *fiber.Ctx) error {
	teamID := c.Params("teamId")

	if err := h.teamService.DeleteTeam(c.Context(), teamID); err != nil {
		return c.Status(fiber.StatusNotFound).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{Code: "TEAM_NOT_FOUND", Message: err.Error()},
		})
	}

	return c.SendStatus(fiber.StatusNoContent)
}

func (h *TeamHandler) AddMember(c *fiber.Ctx) error {
	teamID := c.Params("teamId")

	var req model.AddTeamMemberRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{Code: "INVALID_REQUEST", Message: "Invalid JSON body"},
		})
	}

	if req.UserID == "" {
		return c.Status(fiber.StatusBadRequest).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{Code: "VALIDATION_ERROR", Message: "user_id is required"},
		})
	}

	member, err := h.teamService.AddMember(c.Context(), teamID, req.UserID, req.Role)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{Code: "ADD_MEMBER_FAILED", Message: err.Error()},
		})
	}

	return c.Status(fiber.StatusCreated).JSON(memberToResponse(member))
}

func (h *TeamHandler) RemoveMember(c *fiber.Ctx) error {
	teamID := c.Params("teamId")
	userID := c.Params("userId")

	if err := h.teamService.RemoveMember(c.Context(), teamID, userID); err != nil {
		return c.Status(fiber.StatusNotFound).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{Code: "MEMBER_NOT_FOUND", Message: err.Error()},
		})
	}

	return c.SendStatus(fiber.StatusNoContent)
}

func (h *TeamHandler) UpdateMemberRole(c *fiber.Ctx) error {
	teamID := c.Params("teamId")
	userID := c.Params("userId")

	var req struct {
		Role string `json:"role"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{Code: "INVALID_REQUEST", Message: "Invalid JSON body"},
		})
	}

	member, err := h.teamService.UpdateMemberRole(c.Context(), teamID, userID, req.Role)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{Code: "UPDATE_ROLE_FAILED", Message: err.Error()},
		})
	}

	return c.JSON(memberToResponse(member))
}

func teamToResponse(t *service.Team) model.TeamResponse {
	return model.TeamResponse{
		ID:          t.ID.String(),
		Name:        t.Name,
		Description: t.Description,
		CreatedAt:   t.CreatedAt,
		UpdatedAt:   t.UpdatedAt,
	}
}

func memberToResponse(m *service.TeamMember) model.TeamMemberResponse {
	return model.TeamMemberResponse{
		UserID:      m.UserID.String(),
		Role:        m.Role,
		DisplayName: m.DisplayName,
		Email:       m.Email,
		JoinedAt:    m.JoinedAt,
	}
}
