import { useState } from "react";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { LogIn } from "lucide-react";
import { getEmail } from "~/lib/auth";

interface LoginFormProps {
  serverUrl: string;
  onLogin: (email: string, password: string, serverUrl: string) => Promise<void>;
}

export function LoginForm({ serverUrl, onLogin }: LoginFormProps) {
  const [email, setEmail] = useState(() => getEmail() ?? "");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) return;

    setIsLoading(true);
    try {
      await onLogin(email.trim(), password, serverUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <LogIn className="size-4" />
        <span>Sign In</span>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="user@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isLoading}
          autoComplete="email"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isLoading}
          autoComplete="current-password"
        />
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <Button
        type="submit"
        disabled={!email.trim() || !password || isLoading}
        className="w-full"
      >
        {isLoading ? (
          <>
            <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            Logging in...
          </>
        ) : (
          "Login"
        )}
      </Button>
    </form>
  );
}
