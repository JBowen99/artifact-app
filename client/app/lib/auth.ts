const ACCESS_TOKEN_KEY = "artifact_access_token";
const REFRESH_TOKEN_KEY = "artifact_refresh_token";
const EMAIL_KEY = "artifact_user_email";

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try { return localStorage; } catch { return null; }
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface LoginResponse extends TokenPair {}

export function getAccessToken(): string | null {
  return getStorage()?.getItem(ACCESS_TOKEN_KEY) ?? null;
}

export function getRefreshToken(): string | null {
  return getStorage()?.getItem(REFRESH_TOKEN_KEY) ?? null;
}

export function setTokens(tokens: TokenPair): void {
  getStorage()?.setItem(ACCESS_TOKEN_KEY, tokens.access_token);
  getStorage()?.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token);
}

export function clearTokens(): void {
  getStorage()?.removeItem(ACCESS_TOKEN_KEY);
  getStorage()?.removeItem(REFRESH_TOKEN_KEY);
}

export function hasTokens(): boolean {
  return !!getAccessToken() && !!getRefreshToken();
}

export function getEmail(): string | null {
  return getStorage()?.getItem(EMAIL_KEY) ?? null;
}

export function setEmail(email: string): void {
  getStorage()?.setItem(EMAIL_KEY, email);
}

export function clearEmail(): void {
  getStorage()?.removeItem(EMAIL_KEY);
}
