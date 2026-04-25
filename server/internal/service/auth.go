package service

import (
	"context"
	"crypto/rsa"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"golang.org/x/crypto/bcrypt"
)

type User struct {
	ID           uuid.UUID
	Email        string
	PasswordHash string
	DisplayName  string
	Role         string
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

type TokenPair struct {
	AccessToken  string
	RefreshToken string
	ExpiresIn    int64
}

type AuthService struct {
	pool       *pgxpool.Pool
	rdb        *redis.Client
	privateKey *rsa.PrivateKey
	publicKey  *rsa.PublicKey
	accessTTL  time.Duration
	refreshTTL time.Duration
}

func NewAuthService(
	pool *pgxpool.Pool,
	rdb *redis.Client,
	privateKey *rsa.PrivateKey,
	publicKey *rsa.PublicKey,
	accessTTL, refreshTTL time.Duration,
) *AuthService {
	return &AuthService{
		pool:       pool,
		rdb:        rdb,
		privateKey: privateKey,
		publicKey:  publicKey,
		accessTTL:  accessTTL,
		refreshTTL: refreshTTL,
	}
}

func (s *AuthService) Register(ctx context.Context, email, password, displayName string) (*User, error) {
	hash, err := hashPassword(password)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}

	var user User
	err = s.pool.QueryRow(ctx,
		`INSERT INTO users (email, password_hash, display_name, role)
		 VALUES ($1, $2, $3, 'contributor')
		 RETURNING id, email, password_hash, display_name, role, created_at, updated_at`,
		email, hash, displayName,
	).Scan(&user.ID, &user.Email, &user.PasswordHash, &user.DisplayName, &user.Role, &user.CreatedAt, &user.UpdatedAt)

	if err != nil {
		return nil, fmt.Errorf("insert user: %w", err)
	}

	return &user, nil
}

func (s *AuthService) Login(ctx context.Context, email, password string) (*TokenPair, *User, error) {
	user, err := s.getUserByEmail(ctx, email)
	if err != nil {
		return nil, nil, fmt.Errorf("invalid credentials")
	}

	if err := checkPassword(password, user.PasswordHash); err != nil {
		return nil, nil, fmt.Errorf("invalid credentials")
	}

	pair, err := s.generateTokenPair(user.ID.String(), user.Role)
	if err != nil {
		return nil, nil, fmt.Errorf("generate tokens: %w", err)
	}

	return pair, user, nil
}

func (s *AuthService) Refresh(ctx context.Context, refreshToken string) (*TokenPair, *User, error) {
	claims, err := s.parseToken(refreshToken)
	if err != nil {
		return nil, nil, fmt.Errorf("invalid refresh token: %w", err)
	}

	jti := claims["jti"].(string)
	if jti == "" {
		return nil, nil, fmt.Errorf("invalid refresh token: missing jti")
	}

	blocked, err := s.rdb.Exists(ctx, fmt.Sprintf("refresh_blocklist:%s", jti)).Result()
	if err != nil {
		return nil, nil, fmt.Errorf("check blocklist: %w", err)
	}
	if blocked > 0 {
		return nil, nil, fmt.Errorf("refresh token revoked")
	}

	userID, ok := claims["sub"].(string)
	if !ok {
		return nil, nil, fmt.Errorf("invalid token: missing sub")
	}

	user, err := s.getUserByID(ctx, userID)
	if err != nil {
		return nil, nil, fmt.Errorf("user not found: %w", err)
	}

	if err := s.revokeRefreshToken(ctx, jti, claims); err != nil {
		return nil, nil, fmt.Errorf("revoke old token: %w", err)
	}

	pair, err := s.generateTokenPair(user.ID.String(), user.Role)
	if err != nil {
		return nil, nil, fmt.Errorf("generate tokens: %w", err)
	}

	return pair, user, nil
}

func (s *AuthService) Logout(ctx context.Context, refreshToken string) error {
	claims, err := s.parseToken(refreshToken)
	if err != nil {
		return nil
	}

	jti, _ := claims["jti"].(string)
	if jti == "" {
		return nil
	}

	return s.revokeRefreshToken(ctx, jti, claims)
}

func (s *AuthService) ValidateAccessToken(tokenString string) (string, error) {
	claims, err := s.parseToken(tokenString)
	if err != nil {
		return "", err
	}

	sub, ok := claims["sub"].(string)
	if !ok {
		return "", fmt.Errorf("invalid token: missing sub")
	}

	return sub, nil
}

func (s *AuthService) GetUserByID(ctx context.Context, id string) (*User, error) {
	return s.getUserByID(ctx, id)
}

func (s *AuthService) UpdateUser(ctx context.Context, id string, displayName, email *string) (*User, error) {
	var user User
	err := s.pool.QueryRow(ctx,
		`UPDATE users
		 SET display_name = COALESCE($2, display_name),
		     email = COALESCE($3, email),
		     updated_at = now()
		 WHERE id = $1
		 RETURNING id, email, password_hash, display_name, role, created_at, updated_at`,
		id, displayName, email,
	).Scan(&user.ID, &user.Email, &user.PasswordHash, &user.DisplayName, &user.Role, &user.CreatedAt, &user.UpdatedAt)

	if err != nil {
		return nil, fmt.Errorf("update user: %w", err)
	}

	return &user, nil
}

func (s *AuthService) getUserByEmail(ctx context.Context, email string) (*User, error) {
	var user User
	err := s.pool.QueryRow(ctx,
		`SELECT id, email, password_hash, display_name, role, created_at, updated_at
		 FROM users WHERE email = $1`,
		email,
	).Scan(&user.ID, &user.Email, &user.PasswordHash, &user.DisplayName, &user.Role, &user.CreatedAt, &user.UpdatedAt)

	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (s *AuthService) getUserByID(ctx context.Context, id string) (*User, error) {
	var user User
	err := s.pool.QueryRow(ctx,
		`SELECT id, email, password_hash, display_name, role, created_at, updated_at
		 FROM users WHERE id = $1`,
		id,
	).Scan(&user.ID, &user.Email, &user.PasswordHash, &user.DisplayName, &user.Role, &user.CreatedAt, &user.UpdatedAt)

	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (s *AuthService) generateTokenPair(userID, role string) (*TokenPair, error) {
	now := time.Now()
	expiresAt := now.Add(s.accessTTL)

	accessClaims := jwt.MapClaims{
		"sub":  userID,
		"role": role,
		"iss":  "artifact",
		"iat":  now.Unix(),
		"exp":  expiresAt.Unix(),
	}

	accessToken := jwt.NewWithClaims(jwt.SigningMethodRS256, accessClaims)
	accessStr, err := accessToken.SignedString(s.privateKey)
	if err != nil {
		return nil, fmt.Errorf("sign access token: %w", err)
	}

	refreshJTI := uuid.New().String()
	refreshClaims := jwt.MapClaims{
		"sub": userID,
		"jti": refreshJTI,
		"iss": "artifact",
		"iat": now.Unix(),
		"exp": now.Add(s.refreshTTL).Unix(),
	}

	refreshToken := jwt.NewWithClaims(jwt.SigningMethodRS256, refreshClaims)
	refreshStr, err := refreshToken.SignedString(s.privateKey)
	if err != nil {
		return nil, fmt.Errorf("sign refresh token: %w", err)
	}

	return &TokenPair{
		AccessToken:  accessStr,
		RefreshToken: refreshStr,
		ExpiresIn:    int64(s.accessTTL.Seconds()),
	}, nil
}

func (s *AuthService) parseToken(tokenString string) (jwt.MapClaims, error) {
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (any, error) {
		if _, ok := token.Method.(*jwt.SigningMethodRSA); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return s.publicKey, nil
	})

	if err != nil {
		return nil, err
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok || !token.Valid {
		return nil, fmt.Errorf("invalid token claims")
	}

	return claims, nil
}

func (s *AuthService) revokeRefreshToken(ctx context.Context, jti string, claims jwt.MapClaims) error {
	exp, ok := claims["exp"].(float64)
	if !ok {
		return fmt.Errorf("invalid exp claim")
	}

	ttl := time.Until(time.Unix(int64(exp), 0))
	if ttl <= 0 {
		return nil
	}

	return s.rdb.Set(ctx, fmt.Sprintf("refresh_blocklist:%s", jti), "1", ttl).Err()
}

func (s *AuthService) GetPublicKey() *rsa.PublicKey {
	return s.publicKey
}

func hashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	if err != nil {
		return "", err
	}
	return string(bytes), nil
}

func checkPassword(password, hash string) error {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
}

func IsUniqueViolation(err error) bool {
	pgErr, ok := err.(interface{ SQLState() string })
	if !ok {
		return false
	}
	return pgErr.SQLState() == "23505"
}

func IsNotFound(err error) bool {
	return err == pgx.ErrNoRows
}
