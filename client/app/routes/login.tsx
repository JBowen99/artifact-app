import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "~/lib/auth-context";
import { ConnectionForm } from "~/components/connection-form";
import { LoginForm } from "~/components/login-form";
import { getMirrorPath } from "~/lib/mirror-config";
import { getServerUrl } from "~/lib/server-config";
import { Hexagon } from "lucide-react";

export default function Login() {
  const { isAuthenticated, isLoading, login } = useAuth();
  const navigate = useNavigate();
  const [connectedServer, setConnectedServer] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    const serverUrl = connectedServer ?? getServerUrl();
    const mirrorPath = serverUrl ? getMirrorPath(serverUrl) : null;
    navigate(mirrorPath ? "/projects" : "/setup", { replace: true });
  }, [isAuthenticated, isLoading, connectedServer, navigate]);

  async function handleLogin(email: string, password: string, serverUrl: string) {
    await login(email, password, serverUrl);
  }

  function handleConnected(serverUrl: string) {
    setConnectedServer(serverUrl);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <Hexagon className="size-8 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Artifact</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Version control for teams
          </p>
        </div>

        <div className="rounded-xl border bg-card p-6 shadow-sm space-y-6">
          <ConnectionForm onConnected={handleConnected} />

          {connectedServer && (
            <LoginForm
              serverUrl={connectedServer}
              onLogin={handleLogin}
            />
          )}
        </div>
      </div>
    </div>
  );
}
