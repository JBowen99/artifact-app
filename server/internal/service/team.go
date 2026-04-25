package service

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Team struct {
	ID          uuid.UUID
	Name        string
	Description string
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

type TeamMember struct {
	UserID      uuid.UUID
	TeamID      uuid.UUID
	Role        string
	DisplayName string
	Email       string
	JoinedAt    time.Time
}

type TeamService struct {
	pool *pgxpool.Pool
}

func NewTeamService(pool *pgxpool.Pool) *TeamService {
	return &TeamService{pool: pool}
}

func (s *TeamService) CreateTeam(ctx context.Context, name, description, creatorID string) (*Team, error) {
	if name == "" {
		return nil, fmt.Errorf("team name is required")
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	var team Team
	err = tx.QueryRow(ctx,
		`INSERT INTO teams (name, description)
		 VALUES ($1, $2)
		 RETURNING id, name, description, created_at, updated_at`,
		name, description,
	).Scan(&team.ID, &team.Name, &team.Description, &team.CreatedAt, &team.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("insert team: %w", err)
	}

	_, err = tx.Exec(ctx,
		`INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'admin')`,
		team.ID, creatorID,
	)
	if err != nil {
		return nil, fmt.Errorf("add creator as admin: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit tx: %w", err)
	}

	return &team, nil
}

func (s *TeamService) GetTeam(ctx context.Context, teamID string) (*Team, error) {
	var team Team
	err := s.pool.QueryRow(ctx,
		`SELECT id, name, description, created_at, updated_at FROM teams WHERE id = $1`,
		teamID,
	).Scan(&team.ID, &team.Name, &team.Description, &team.CreatedAt, &team.UpdatedAt)
	if err != nil {
		if IsNotFound(err) {
			return nil, fmt.Errorf("team not found")
		}
		return nil, err
	}
	return &team, nil
}

func (s *TeamService) ListTeams(ctx context.Context, userID string) ([]Team, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT t.id, t.name, t.description, t.created_at, t.updated_at
		 FROM teams t
		 JOIN team_members tm ON t.id = tm.team_id
		 WHERE tm.user_id = $1
		 ORDER BY t.updated_at DESC`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var teams []Team
	for rows.Next() {
		var t Team
		if err := rows.Scan(&t.ID, &t.Name, &t.Description, &t.CreatedAt, &t.UpdatedAt); err != nil {
			return nil, err
		}
		teams = append(teams, t)
	}
	return teams, nil
}

func (s *TeamService) UpdateTeam(ctx context.Context, teamID string, name, description *string) (*Team, error) {
	var team Team
	err := s.pool.QueryRow(ctx,
		`UPDATE teams
		 SET name = COALESCE($2, name),
		     description = COALESCE($3, description),
		     updated_at = now()
		 WHERE id = $1
		 RETURNING id, name, description, created_at, updated_at`,
		teamID, name, description,
	).Scan(&team.ID, &team.Name, &team.Description, &team.CreatedAt, &team.UpdatedAt)
	if err != nil {
		if IsNotFound(err) {
			return nil, fmt.Errorf("team not found")
		}
		return nil, err
	}
	return &team, nil
}

func (s *TeamService) DeleteTeam(ctx context.Context, teamID string) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM teams WHERE id = $1`, teamID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("team not found")
	}
	return nil
}

func (s *TeamService) AddMember(ctx context.Context, teamID, userID, role string) (*TeamMember, error) {
	if role == "" {
		role = "contributor"
	}

	var member TeamMember
	err := s.pool.QueryRow(ctx,
		`INSERT INTO team_members (team_id, user_id, role)
		 VALUES ($1, $2, $3)
		 RETURNING team_id, user_id, role, joined_at`,
		teamID, userID, role,
	).Scan(&member.TeamID, &member.UserID, &member.Role, &member.JoinedAt)
	if err != nil {
		if IsUniqueViolation(err) {
			return nil, fmt.Errorf("user is already a team member")
		}
		return nil, fmt.Errorf("add member: %w", err)
	}

	err = s.pool.QueryRow(ctx,
		`SELECT display_name, email FROM users WHERE id = $1`, userID,
	).Scan(&member.DisplayName, &member.Email)
	if err != nil {
		member.DisplayName = ""
		member.Email = ""
	}

	return &member, nil
}

func (s *TeamService) RemoveMember(ctx context.Context, teamID, userID string) error {
	tag, err := s.pool.Exec(ctx,
		`DELETE FROM team_members WHERE team_id = $1 AND user_id = $2`,
		teamID, userID,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("member not found")
	}
	return nil
}

func (s *TeamService) UpdateMemberRole(ctx context.Context, teamID, userID, role string) (*TeamMember, error) {
	if role == "" {
		return nil, fmt.Errorf("role is required")
	}

	var member TeamMember
	err := s.pool.QueryRow(ctx,
		`UPDATE team_members SET role = $3
		 WHERE team_id = $1 AND user_id = $2
		 RETURNING team_id, user_id, role, joined_at`,
		teamID, userID, role,
	).Scan(&member.TeamID, &member.UserID, &member.Role, &member.JoinedAt)
	if err != nil {
		if IsNotFound(err) {
			return nil, fmt.Errorf("member not found")
		}
		return nil, err
	}

	err = s.pool.QueryRow(ctx,
		`SELECT display_name, email FROM users WHERE id = $1`, userID,
	).Scan(&member.DisplayName, &member.Email)
	if err != nil {
		member.DisplayName = ""
		member.Email = ""
	}

	return &member, nil
}

func (s *TeamService) ListMembers(ctx context.Context, teamID string) ([]TeamMember, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT tm.team_id, tm.user_id, tm.role, u.display_name, u.email, tm.joined_at
		 FROM team_members tm
		 JOIN users u ON tm.user_id = u.id
		 WHERE tm.team_id = $1
		 ORDER BY tm.joined_at`,
		teamID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var members []TeamMember
	for rows.Next() {
		var m TeamMember
		if err := rows.Scan(&m.TeamID, &m.UserID, &m.Role, &m.DisplayName, &m.Email, &m.JoinedAt); err != nil {
			return nil, err
		}
		members = append(members, m)
	}
	return members, nil
}

func (s *TeamService) IsTeamAdmin(ctx context.Context, teamID, userID string) (bool, error) {
	var role string
	err := s.pool.QueryRow(ctx,
		`SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2`,
		teamID, userID,
	).Scan(&role)
	if err != nil {
		if IsNotFound(err) {
			return false, nil
		}
		return false, err
	}
	return role == "admin", nil
}

func (s *TeamService) IsTeamMember(ctx context.Context, teamID, userID string) (bool, error) {
	var exists bool
	err := s.pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2)`,
		teamID, userID,
	).Scan(&exists)
	if err != nil {
		return false, err
	}
	return exists, nil
}
