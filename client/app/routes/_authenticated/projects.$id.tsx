import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import { useAuth } from "~/lib/auth-context";
import { api, type Project } from "~/lib/api";
import { Button } from "~/components/ui/button";
import { Hexagon, ArrowLeft, LogOut, Loader2 } from "lucide-react";

export default function ProjectWorkspace() {
  const { id } = useParams();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setIsLoading(true);
    api.projects
      .get(id)
      .then(setProject)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load project"))
      .finally(() => setIsLoading(false));
  }, [id]);

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => navigate("/projects")}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div className="flex items-center gap-2">
            <Hexagon className="size-5 text-primary" />
            {isLoading && <span className="font-semibold">Loading...</span>}
            {project && <span className="font-semibold">{project.name}</span>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {user?.email && (
            <span className="text-sm text-muted-foreground">{user.email}</span>
          )}
          <Button variant="ghost" size="icon-sm" onClick={handleLogout}>
            <LogOut className="size-4" />
          </Button>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-6">
        {isLoading && <Loader2 className="size-6 animate-spin text-muted-foreground" />}
        {error && (
          <div className="text-center space-y-2">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={() => navigate("/projects")}>
              Back to Projects
            </Button>
          </div>
        )}
        {!isLoading && !error && project && (
          <div className="text-center space-y-3">
            <h2 className="text-xl font-semibold">{project.name}</h2>
            {project.description && (
              <p className="text-sm text-muted-foreground max-w-md">
                {project.description}
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              Workspace view coming soon.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
