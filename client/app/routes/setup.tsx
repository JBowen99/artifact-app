import { useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "~/lib/auth-context";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { getServerUrl } from "~/lib/server-config";
import { setMirrorPath, getDefaultMirrorPath } from "~/lib/mirror-config";
import { Hexagon } from "lucide-react";

export default function Setup() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const navigate = useNavigate();
  const [path, setPath] = useState(() => getDefaultMirrorPath());

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) {
    navigate("/login", { replace: true });
    return null;
  }

  function handleContinue() {
    const serverUrl = getServerUrl();
    if (!serverUrl || !path.trim()) return;

    setMirrorPath(serverUrl, path.trim());
    navigate("/projects", { replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-2">
          <Hexagon className="size-5 text-primary" />
          <span className="font-semibold">Artifact</span>
        </div>
        {user?.email && (
          <span className="text-sm text-muted-foreground">{user.email}</span>
        )}
      </header>

      <div className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-sm space-y-6">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Local Mirror Setup</h2>
            <p className="text-sm text-muted-foreground">
              Choose a folder on your machine where Artifact will store synced
              files.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="mirror-path">Mirror Location</Label>
            <Input
              id="mirror-path"
              type="text"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="~/Artifact"
            />
            <p className="text-xs text-muted-foreground">
              e.g. /home/user/Artifact
            </p>
          </div>

          <div className="rounded-lg bg-muted p-3">
            <p className="text-xs text-muted-foreground">
              Files from the server will be synced to this directory. You can
              change this later in Settings.
            </p>
          </div>

          <Button
            onClick={handleContinue}
            disabled={!path.trim()}
            className="w-full"
          >
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
