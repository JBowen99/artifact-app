package service

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Tag struct {
	ID        uuid.UUID
	Name      string
	Color     string
	CreatedAt time.Time
}

type SearchResult struct {
	FileID    string
	Path      string
	FileName  string
	Project   string
	Version   int
	SizeBytes int64
	Owner     string
	Tags      []string
	UpdatedAt time.Time
}

type SearchParams struct {
	Query    string
	FileType string
	Project  string
	Branch   string
	Owner    string
	Tags     []string
	Sort     string
	Order    string
	Page     int
	Limit    int
}

type SearchService struct {
	pool *pgxpool.Pool
}

func NewSearchService(pool *pgxpool.Pool) *SearchService {
	return &SearchService{pool: pool}
}

func (s *SearchService) AddFileTag(ctx context.Context, fileID, tagName string) (*Tag, error) {
	var tag Tag
	err := s.pool.QueryRow(ctx,
		`INSERT INTO tags (name) VALUES ($1)
		 ON CONFLICT (name) DO UPDATE SET name = $1
		 RETURNING id, name, color`,
		tagName,
	).Scan(&tag.ID, &tag.Name, &tag.Color)
	if err != nil {
		return nil, fmt.Errorf("upsert tag: %w", err)
	}

	_, err = s.pool.Exec(ctx,
		`INSERT INTO file_tags (file_id, tag_id) VALUES ($1, $2)
		 ON CONFLICT DO NOTHING`,
		fileID, tag.ID,
	)
	if err != nil {
		return nil, fmt.Errorf("add file tag: %w", err)
	}

	return &tag, nil
}

func (s *SearchService) RemoveFileTag(ctx context.Context, fileID, tagID string) error {
	tag, err := s.pool.Exec(ctx,
		`DELETE FROM file_tags WHERE file_id = $1 AND tag_id = $2`,
		fileID, tagID,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("tag not found on file")
	}
	return nil
}

func (s *SearchService) ListFileTags(ctx context.Context, fileID string) ([]Tag, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT t.id, t.name, t.color
		 FROM tags t
		 JOIN file_tags ft ON t.id = ft.tag_id
		 WHERE ft.file_id = $1
		 ORDER BY t.name`,
		fileID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tags []Tag
	for rows.Next() {
		var t Tag
		if err := rows.Scan(&t.ID, &t.Name, &t.Color); err != nil {
			return nil, err
		}
		tags = append(tags, t)
	}
	return tags, nil
}

func (s *SearchService) Search(ctx context.Context, userID string, params SearchParams) ([]SearchResult, int64, error) {
	if params.Page <= 0 {
		params.Page = 1
	}
	if params.Limit <= 0 {
		params.Limit = 20
	}
	if params.Limit > 100 {
		params.Limit = 100
	}
	offset := (params.Page - 1) * params.Limit

	var where []string
	var args []any
	argIdx := 1

	where = append(where, fmt.Sprintf(
		"(f.project_id IN (SELECT project_id FROM project_permissions WHERE user_id = $%d) OR p.owner_id = $%d)",
		argIdx, argIdx,
	))
	args = append(args, userID)
	argIdx++

	if params.Query != "" {
		where = append(where, fmt.Sprintf("(f.path ILIKE $%d OR f.file_name ILIKE $%d)", argIdx, argIdx))
		args = append(args, "%"+params.Query+"%")
		argIdx++
	}

	if params.FileType != "" {
		where = append(where, fmt.Sprintf("f.file_type = $%d", argIdx))
		args = append(args, params.FileType)
		argIdx++
	}

	if params.Project != "" {
		where = append(where, fmt.Sprintf("f.project_id = $%d", argIdx))
		args = append(args, params.Project)
		argIdx++
	}

	if params.Branch != "" {
		where = append(where, fmt.Sprintf("b.name = $%d", argIdx))
		args = append(args, params.Branch)
		argIdx++
	}

	if params.Owner != "" {
		where = append(where, fmt.Sprintf("f.owner_id = $%d", argIdx))
		args = append(args, params.Owner)
		argIdx++
	}

	if len(params.Tags) > 0 {
		placeholders := make([]string, len(params.Tags))
		for i, t := range params.Tags {
			placeholders[i] = fmt.Sprintf("$%d", argIdx)
			args = append(args, t)
			argIdx++
		}
		tagList := strings.Join(placeholders, ", ")
		where = append(where, fmt.Sprintf(
			"f.id IN (SELECT ft.file_id FROM file_tags ft JOIN tags t ON ft.tag_id = t.id WHERE t.name IN (%s) GROUP BY ft.file_id HAVING COUNT(DISTinct t.name) = %d)",
			tagList, len(params.Tags),
		))
	}

	whereClause := strings.Join(where, " AND ")

	sortCol := "f.updated_at"
	switch params.Sort {
	case "size", "size_bytes":
		sortCol = "f.size_bytes"
	case "path":
		sortCol = "f.path"
	case "name", "file_name":
		sortCol = "f.file_name"
	case "version":
		sortCol = "f.version"
	}

	orderDir := "DESC"
	if strings.EqualFold(params.Order, "asc") {
		orderDir = "ASC"
	}

	countSQL := fmt.Sprintf(
		`SELECT COUNT(*) FROM files f
		 JOIN projects p ON f.project_id = p.id
		 JOIN branches b ON f.branch_id = b.id
		 WHERE %s`,
		whereClause,
	)

	var total int64
	if err := s.pool.QueryRow(ctx, countSQL, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	dataSQL := fmt.Sprintf(
		`SELECT f.id, f.path, f.file_name, p.name as project, f.version,
		        f.size_bytes, u.display_name as owner, f.updated_at
		 FROM files f
		 JOIN projects p ON f.project_id = p.id
		 JOIN users u ON f.owner_id = u.id
		 JOIN branches b ON f.branch_id = b.id
		 WHERE %s
		 ORDER BY %s %s
		 LIMIT $%d OFFSET $%d`,
		whereClause, sortCol, orderDir, argIdx, argIdx+1,
	)
	args = append(args, params.Limit, offset)

	rows, err := s.pool.Query(ctx, dataSQL, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var results []SearchResult
	var fileIDs []string
	for rows.Next() {
		var r SearchResult
		if err := rows.Scan(&r.FileID, &r.Path, &r.FileName, &r.Project, &r.Version,
			&r.SizeBytes, &r.Owner, &r.UpdatedAt); err != nil {
			return nil, 0, err
		}
		results = append(results, r)
		fileIDs = append(fileIDs, r.FileID)
	}

	if len(fileIDs) > 0 {
		tagMap, err := s.fetchTagsForFiles(ctx, fileIDs)
		if err == nil {
			for i := range results {
				results[i].Tags = tagMap[results[i].FileID]
				if results[i].Tags == nil {
					results[i].Tags = []string{}
				}
			}
		}
	}

	return results, total, nil
}

func (s *SearchService) fetchTagsForFiles(ctx context.Context, fileIDs []string) (map[string][]string, error) {
	placeholders := make([]string, len(fileIDs))
	args := make([]any, len(fileIDs))
	for i, id := range fileIDs {
		placeholders[i] = fmt.Sprintf("$%d", i+1)
		args[i] = id
	}

	query := fmt.Sprintf(
		`SELECT ft.file_id, t.name
		 FROM file_tags ft
		 JOIN tags t ON ft.tag_id = t.id
		 WHERE ft.file_id IN (%s)
		 ORDER BY t.name`,
		strings.Join(placeholders, ", "),
	)

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[string][]string)
	for rows.Next() {
		var fileID, tagName string
		if err := rows.Scan(&fileID, &tagName); err != nil {
			return nil, err
		}
		result[fileID] = append(result[fileID], tagName)
	}

	return result, nil
}
