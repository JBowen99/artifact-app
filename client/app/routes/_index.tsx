import { useEffect } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "~/lib/auth-context";

export default function Index() {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated) {
      navigate("/projects", { replace: true });
    } else {
      navigate("/login", { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
    </div>
  );
}
