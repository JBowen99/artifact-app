package handler

import (
	"fmt"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/jobo/artifact/server/internal/model"
	"github.com/jobo/artifact/server/internal/service"
)

type SearchHandler struct {
	searchService *service.SearchService
}

func NewSearchHandler(searchService *service.SearchService) *SearchHandler {
	return &SearchHandler{searchService: searchService}
}

func (h *SearchHandler) Search(c *fiber.Ctx) error {
	userID := c.Locals("userID").(string)

	params := service.SearchParams{
		Query:    c.Query("q"),
		FileType: c.Query("type"),
		Project:  c.Query("project"),
		Branch:   c.Query("branch"),
		Owner:    c.Query("owner"),
		Sort:     c.Query("sort", "updated_at"),
		Order:    c.Query("order", "desc"),
		Page:     c.QueryInt("page", 1),
		Limit:    c.QueryInt("limit", 20),
	}

	tagsParam := c.Query("tags")
	if tagsParam != "" {
		params.Tags = strings.Split(tagsParam, ",")
		for i := range params.Tags {
			params.Tags[i] = strings.TrimSpace(params.Tags[i])
		}
	}

	results, total, err := h.searchService.Search(c.Context(), userID, params)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{Code: "SEARCH_FAILED", Message: err.Error()},
		})
	}

	searchResults := make([]model.SearchResult, 0, len(results))
	for _, r := range results {
		tags := r.Tags
		if tags == nil {
			tags = []string{}
		}
		searchResults = append(searchResults, model.SearchResult{
			FileID:    r.FileID,
			Path:      r.Path,
			Project:   r.Project,
			Version:   fmt.Sprintf("v%d", r.Version),
			SizeBytes: r.SizeBytes,
			Owner:     r.Owner,
			Tags:      tags,
			UpdatedAt: r.UpdatedAt,
		})
	}

	totalPages := int(total) / params.Limit
	if int(total)%params.Limit > 0 {
		totalPages++
	}

	return c.JSON(model.SearchResponse{
		Results: searchResults,
		Total:   total,
		Page:    params.Page,
		Limit:   params.Limit,
	})
}

func (h *SearchHandler) AddFileTag(c *fiber.Ctx) error {
	fileID := c.Params("fileId")

	var req struct {
		Name string `json:"name"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{Code: "INVALID_REQUEST", Message: "Invalid JSON body"},
		})
	}

	if req.Name == "" {
		return c.Status(fiber.StatusBadRequest).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{Code: "VALIDATION_ERROR", Message: "Tag name is required"},
		})
	}

	tag, err := h.searchService.AddFileTag(c.Context(), fileID, req.Name)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{Code: "ADD_TAG_FAILED", Message: err.Error()},
		})
	}

	return c.JSON(fiber.Map{
		"id":   tag.ID.String(),
		"name": tag.Name,
	})
}

func (h *SearchHandler) RemoveFileTag(c *fiber.Ctx) error {
	fileID := c.Params("fileId")
	tagID := c.Params("tagId")

	if err := h.searchService.RemoveFileTag(c.Context(), fileID, tagID); err != nil {
		return c.Status(fiber.StatusNotFound).JSON(model.ErrorResponse{
			Error: model.ErrorDetail{Code: "TAG_NOT_FOUND", Message: err.Error()},
		})
	}

	return c.SendStatus(fiber.StatusNoContent)
}
