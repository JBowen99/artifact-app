import { useState } from "react";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { Server } from "lucide-react";
import { testConnection, getServerUrl, setServerUrl } from "~/lib/server-config";

type ConnectionStatus = "idle" | "connecting" | "connected" | "error";

interface ConnectionFormProps {
  onConnected: (serverUrl: string) => void;
}

export function ConnectionForm({ onConnected }: ConnectionFormProps) {
  const [url, setUrl] = useState(() => getServerUrl() ?? "");
  const [status, setStatus] = useState<ConnectionStatus>("idle");

  const statusColor = {
    idle: "bg-muted-foreground/30",
    connecting: "bg-yellow-500",
    connected: "bg-green-500",
    error: "bg-red-500",
  }[status];

  async function handleConnect() {
    if (!url.trim()) return;

    setStatus("connecting");
    const ok = await testConnection(url.trim());

    if (ok) {
      const normalized = url.trim().replace(/\/+$/, "");
      setServerUrl(normalized);
      setUrl(normalized);
      setStatus("connected");
      onConnected(normalized);
    } else {
      setStatus("error");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Server className="size-4" />
        <span>Server</span>
      </div>

      <div className="space-y-2">
        <Label htmlFor="server-url">Server URL</Label>
        <div className="relative">
          <Input
            id="server-url"
            type="url"
            placeholder="http://your-server:8080"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              if (status === "connected" || status === "error") {
                setStatus("idle");
              }
            }}
            disabled={status === "connecting"}
            className="pr-4"
          />
          <span
            className={`absolute right-3 top-1/2 -translate-y-1/2 size-3 rounded-full ${statusColor}`}
          />
        </div>
      </div>

      <Button
        onClick={handleConnect}
        disabled={!url.trim() || status === "connecting"}
        className="w-full"
      >
        {status === "connecting" ? (
          <>
            <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            Connecting...
          </>
        ) : (
          "Connect"
        )}
      </Button>
    </div>
  );
}
