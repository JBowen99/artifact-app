import { useState, useEffect, useCallback } from "react";
import { useAuth } from "~/lib/auth-context";
import { useNavigate } from "react-router";
import { Button } from "~/components/ui/button";
import { getServerUrl } from "~/lib/server-config";
import { getMirrorPath } from "~/lib/mirror-config";
import { api, type Project } from "~/lib/api";
import { ProjectCard } from "~/components/project-card";
import { CreateProjectDialog } from "~/components/create-project-dialog";
import { toast } from "sonner";
import {
  Hexagon,
  Settings,
  LogOut,
  FolderSync,
  Loader2,
} from "lucide-react";

export default function Projects() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.projects.list();
      setProjects(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load projects";
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  function handleProjectCreated(project: Project) {
    setProjects((prev) => [project, ...prev]);
    toast.success(`Project "${project.name}" created`);
  }

  const serverUrl = getServerUrl();
  const mirrorPath = serverUrl ? getMirrorPath(serverUrl) : null;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <div
          className="flex items-center gap-2 cursor-pointer"
          onClick={() => navigate("/projects")}
        >
          <Hexagon className="size-5 text-primary" />
          <span className="font-semibold">Artifact</span>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm">
            <Settings className="size-4" />
          </Button>
          {user?.email && (
            <span className="text-sm text-muted-foreground">{user.email}</span>
          )}
          <Button variant="ghost" size="icon-sm" onClick={handleLogout}>
            <LogOut className="size-4" />
          </Button>
        </div>
      </header>

      <main className="flex-1 px-6 py-8">
        <div className="mx-auto max-w-5xl space-y-8">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
            <CreateProjectDialog onCreated={handleProjectCreated} />
          </div>

          {isLoading && (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLoading && error && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-24 text-center">
              <p className="text-sm text-destructive">{error}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={fetchProjects}
              >
                Retry
              </Button>
            </div>
          )}

          {!isLoading && !error && projects.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-24 text-center">
              <FolderSync className="size-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium text-muted-foreground">
                No projects yet
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Create your first project to get started.
              </p>
            </div>
          )}

          {!isLoading && !error && projects.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          )}
        </div>
      </main>

      {(serverUrl || mirrorPath) && (
        <footer className="border-t px-6 py-3">
          <div className="mx-auto max-w-5xl flex items-center gap-6 text-xs text-muted-foreground">
            {mirrorPath && <span>Mirror: {mirrorPath}</span>}
            {serverUrl && <span>Server: {serverUrl}</span>}
          </div>
        </footer>
      )}
    </div>
  );
}
