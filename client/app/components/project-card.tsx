import { useNavigate } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import type { Project } from "~/lib/api";
import { Package } from "lucide-react";

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

interface ProjectCardProps {
  project: Project;
}

export function ProjectCard({ project }: ProjectCardProps) {
  const navigate = useNavigate();

  return (
    <Card
      className="cursor-pointer transition-colors hover:bg-muted/50"
      onClick={() => navigate(`/projects/${project.id}`)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start gap-3">
          <Package className="mt-0.5 size-5 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-base">
              {project.name}
            </CardTitle>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {project.description && (
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {project.description}
          </p>
        )}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>main</span>
          <span>&middot;</span>
          <span>Updated {formatRelativeTime(project.updated_at)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
