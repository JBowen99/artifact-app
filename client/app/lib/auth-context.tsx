import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  getAccessToken,
  getRefreshToken,
  setTokens,
  clearTokens,
  getEmail,
  setEmail,
  clearEmail,
} from "./auth";
import { getServerUrl } from "./server-config";
import {
  LoginResponseSchema,
  UserResponseSchema,
  type UserResponse,
} from "./api-types";

interface User {
  email: string;
  id?: string;
  display_name?: string;
  role?: string;
}

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string, serverUrl: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function toUser(data: UserResponse): User {
  return {
    email: data.email,
    id: data.id,
    display_name: data.display_name,
    role: data.role,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function validateSession() {
      const serverUrl = getServerUrl();
      const token = getAccessToken();
      const email = getEmail();

      if (!serverUrl || !token || !email) {
        setIsLoading(false);
        return;
      }

      try {
        const res = await fetch(`${serverUrl}/api/v1/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const raw = await res.json();
          const data = UserResponseSchema.parse(raw);
          setUser(toUser(data));
        } else if (res.status === 401) {
          const refreshed = await tryRefresh(serverUrl);
          if (!refreshed) {
            clearTokens();
            setUser(null);
          }
        } else {
          setUser({ email });
        }
      } catch {
        setUser({ email });
      } finally {
        setIsLoading(false);
      }
    }

    validateSession();
  }, []);

  const tryRefresh = useCallback(async (serverUrl: string): Promise<boolean> => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return false;

    try {
      const res = await fetch(`${serverUrl}/api/v1/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (res.ok) {
        const raw = await res.json();
        const data = LoginResponseSchema.parse(raw);
        setTokens(data);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  const login = useCallback(
    async (email: string, password: string, serverUrl: string) => {
      const res = await fetch(`${serverUrl}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const message =
          data?.error?.message ?? "Invalid email or password";
        throw new Error(message);
      }

      const raw = await res.json();
      const data = LoginResponseSchema.parse(raw);
      setTokens(data);
      setEmail(email);
      setUser({ email });
    },
    []
  );

  const logout = useCallback(async () => {
    const serverUrl = getServerUrl();
    const token = getAccessToken();

    if (serverUrl && token) {
      try {
        await fetch(`${serverUrl}/api/v1/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {}
    }

    clearTokens();
    clearEmail();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
