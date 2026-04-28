package router

import (
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/rs/zerolog"

	"github.com/jobo/artifact/server/internal/handler"
	"github.com/jobo/artifact/server/internal/middleware"
	"github.com/jobo/artifact/server/internal/model"
	"github.com/jobo/artifact/server/internal/service"
)

type Router struct {
	app              fiber.Router
	log              zerolog.Logger
	authService      *service.AuthService
	projectService   *service.ProjectService
	fileService      *service.FileService
	lockService      *service.LockService
	workspaceService *service.WorkspaceService
	commitService    *service.CommitService
	teamService      *service.TeamService
	searchService    *service.SearchService
}

func New(
	app *fiber.App,
	log zerolog.Logger,
	authService *service.AuthService,
	projectService *service.ProjectService,
	fileService *service.FileService,
	lockService *service.LockService,
	workspaceService *service.WorkspaceService,
	commitService *service.CommitService,
	teamService *service.TeamService,
	searchService *service.SearchService,
) *Router {
	app.Use(middleware.Recover(log))
	app.Use(middleware.Logger(log))
	app.Use(cors.New(cors.Config{
		AllowOrigins: "*",
		AllowMethods: "GET,POST,PUT,DELETE,PATCH,OPTIONS",
		AllowHeaders: "Origin,Content-Type,Accept,Authorization",
	}))

	return &Router{
		app:              app,
		log:              log,
		authService:      authService,
		projectService:   projectService,
		fileService:      fileService,
		lockService:      lockService,
		workspaceService: workspaceService,
		commitService:    commitService,
		teamService:      teamService,
		searchService:    searchService,
	}
}

func (r *Router) Register() {
	r.app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok"})
	})

	api := r.app.Group("/api/v1")

	api.Get("/", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"version": "v1", "service": "artifact"})
	})

	authMw := middleware.Auth(r.authService)

	authHandler := handler.NewAuthHandler(r.authService)
	userHandler := handler.NewUserHandler(r.authService)
	projectHandler := handler.NewProjectHandler(r.projectService)
	fileHandler := handler.NewFileHandler(r.fileService)
	lockHandler := handler.NewLockHandler(r.lockService, r.fileService)
	workspaceHandler := handler.NewWorkspaceHandler(r.workspaceService)
	teamHandler := handler.NewTeamHandler(r.teamService)
	searchHandler := handler.NewSearchHandler(r.searchService)

	auth := api.Group("/auth")
	auth.Post("/register", authHandler.Register)
	auth.Post("/login", authHandler.Login)
	auth.Post("/refresh", authHandler.Refresh)

	authProtected := auth.Group("/", authMw)
	authProtected.Post("/logout", authHandler.Logout)
	authProtected.Get("/me", authHandler.Me)

	users := api.Group("/users", authMw)
	users.Get("/me", userHandler.GetMe)
	users.Put("/me", userHandler.UpdateMe)

	projects := api.Group("/projects", authMw)
	projects.Post("/", projectHandler.CreateProject)
	projects.Get("/", projectHandler.ListProjects)
	projects.Get("/:projectId", projectHandler.GetProject)
	projects.Put("/:projectId", projectHandler.UpdateProject)
	projects.Delete("/:projectId", projectHandler.DeleteProject)
	projects.Post("/:projectId/branches", projectHandler.CreateBranch)
	projects.Get("/:projectId/branches", projectHandler.ListBranches)
	projects.Get("/:projectId/branches/:branchId", projectHandler.GetBranch)
	projects.Delete("/:projectId/branches/:branchId", projectHandler.DeleteBranch)
	projects.Get("/:projectId/files", fileHandler.BrowseFiles)
	projects.Post("/:projectId/folders", fileHandler.CreateFolder)
	projects.Get("/:projectId/locks", lockHandler.ListLocks)
	projects.Post("/:projectId/workspaces", workspaceHandler.CreateWorkspace)
	projects.Get("/:projectId/workspaces", workspaceHandler.ListWorkspaces)
	projects.Get("/:projectId/commits", r.listCommits)
	projects.Post("/:projectId/submit", r.submit)

	files := api.Group("/files", authMw)
	files.Post("/upload", fileHandler.InitUpload)
	files.Put("/upload/:sessionId", fileHandler.UploadChunk)
	files.Post("/upload/:sessionId/complete", fileHandler.CompleteUpload)
	files.Get("/:fileId", fileHandler.GetFile)
	files.Get("/:fileId/download", fileHandler.DownloadFile)
	files.Delete("/:fileId", fileHandler.DeleteFile)
	files.Post("/:fileId/lock", lockHandler.LockFile)
	files.Delete("/:fileId/lock", lockHandler.UnlockFile)

	workspaces := api.Group("/workspaces", authMw)
	workspaces.Get("/:workspaceId", workspaceHandler.GetWorkspace)
	workspaces.Put("/:workspaceId", workspaceHandler.UpdateWorkspace)
	workspaces.Delete("/:workspaceId", workspaceHandler.DeleteWorkspace)
	workspaces.Get("/:workspaceId/status", workspaceHandler.GetWorkspaceStatus)
	workspaces.Get("/:workspaceId/files", workspaceHandler.GetWorkspaceFiles)
	workspaces.Post("/:workspaceId/sync", workspaceHandler.SyncWorkspace)

	commits := api.Group("/commits", authMw)
	commits.Get("/:commitId", r.getCommit)

	teams := api.Group("/teams", authMw)
	teams.Post("/", teamHandler.CreateTeam)
	teams.Get("/", teamHandler.ListTeams)
	teams.Get("/:teamId", teamHandler.GetTeam)
	teams.Put("/:teamId", teamHandler.UpdateTeam)
	teams.Delete("/:teamId", teamHandler.DeleteTeam)
	teams.Post("/:teamId/members", teamHandler.AddMember)
	teams.Delete("/:teamId/members/:userId", teamHandler.RemoveMember)
	teams.Put("/:teamId/members/:userId", teamHandler.UpdateMemberRole)

	search := api.Group("/search", authMw)
	search.Get("/", searchHandler.Search)

	files.Post("/:fileId/tags", searchHandler.AddFileTag)
	files.Delete("/:fileId/tags/:tagId", searchHandler.RemoveFileTag)

	r.log.Info().Msg("routes registered")
}

func (r *Router) listCommits(c *fiber.Ctx) error {
	projectID := c.Params("projectId")
	branch := c.Query("branch", "main")
	page := c.QueryInt("page", 1)
	limit := c.QueryInt("limit", 20)

	commits, total, err := r.commitService.ListCommits(c.Context(), projectID, branch, page, limit)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": fiber.Map{"code": "INTERNAL_ERROR", "message": err.Error()},
		})
	}

	type commitResponse struct {
		ID            string `json:"id"`
		ProjectID     string `json:"project_id"`
		BranchID      string `json:"branch_id"`
		GitCommitHash string `json:"git_commit_hash"`
		Message       string `json:"message"`
		AuthorID      string `json:"author_id"`
		AuthorName    string `json:"author_name"`
		CreatedAt     string `json:"created_at"`
	}

	response := make([]commitResponse, 0, len(commits))
	for _, c := range commits {
		response = append(response, commitResponse{
			ID:            c.ID.String(),
			ProjectID:     c.ProjectID.String(),
			BranchID:      c.BranchID.String(),
			GitCommitHash: c.GitCommitHash,
			Message:       c.Message,
			AuthorID:      c.AuthorID.String(),
			AuthorName:    c.AuthorName,
			CreatedAt:     c.CreatedAt.Format("2006-01-02T15:04:05Z"),
		})
	}

	return c.JSON(fiber.Map{
		"data": response, "total": total, "page": page, "limit": limit,
	})
}

func (r *Router) getCommit(c *fiber.Ctx) error {
	commitID := c.Params("commitId")

	commit, files, err := r.commitService.GetCommit(c.Context(), commitID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": fiber.Map{"code": "COMMIT_NOT_FOUND", "message": err.Error()},
		})
	}

	type commitFileResponse struct {
		FileID   string `json:"file_id"`
		Path     string `json:"path"`
		FileName string `json:"file_name"`
		Action   string `json:"action"`
	}

	fileResponses := make([]commitFileResponse, 0, len(files))
	for _, f := range files {
		fileResponses = append(fileResponses, commitFileResponse{
			FileID:   f.FileID.String(),
			Path:     f.Path,
			FileName: f.FileName,
			Action:   f.Action,
		})
	}

	return c.JSON(fiber.Map{
		"id":              commit.ID.String(),
		"project_id":      commit.ProjectID.String(),
		"branch_id":       commit.BranchID.String(),
		"git_commit_hash": commit.GitCommitHash,
		"message":         commit.Message,
		"author_id":       commit.AuthorID.String(),
		"author_name":     commit.AuthorName,
		"created_at":      commit.CreatedAt.Format("2006-01-02T15:04:05Z"),
		"files":           fileResponses,
	})
}

func (r *Router) submit(c *fiber.Ctx) error {
	projectID := c.Params("projectId")
	userID := middleware.GetUserID(c)

	var req model.SubmitRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": fiber.Map{"code": "INVALID_REQUEST", "message": "Invalid JSON body"},
		})
	}

	if req.Message == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": fiber.Map{"code": "VALIDATION_ERROR", "message": "Commit message is required"},
		})
	}

	if len(req.Files) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": fiber.Map{"code": "VALIDATION_ERROR", "message": "At least one file is required"},
		})
	}

	var files []service.SubmitFileInput
	for _, f := range req.Files {
		files = append(files, service.SubmitFileInput{
			FileID:          f.FileID,
			Path:            f.Path,
			Action:          f.Action,
			UploadSessionID: f.UploadSessionID,
			Message:         f.Message,
		})
	}

	commit, err := r.commitService.Submit(c.Context(), projectID, userID, &req.WorkspaceID, req.Branch, req.Message, files, req.ReleaseLocks)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": fiber.Map{"code": "SUBMIT_FAILED", "message": err.Error()},
		})
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"commit_id":       commit.ID.String(),
		"git_commit_hash": commit.GitCommitHash,
		"branch":          req.Branch,
		"message":         commit.Message,
		"files_affected":  len(files),
		"created_at":      commit.CreatedAt.Format("2006-01-02T15:04:05Z"),
	})
}
