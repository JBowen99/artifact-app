const ACCESS_TOKEN_KEY = "artifact_access_token";
const REFRESH_TOKEN_KEY = "artifact_refresh_token";
const EMAIL_KEY = "artifact_user_email";

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface LoginResponse extends TokenPair {}

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setTokens(tokens: TokenPair): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, tokens.access_token);
  localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token);
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function hasTokens(): boolean {
  return !!getAccessToken() && !!getRefreshToken();
}

export function getEmail(): string | null {
  return localStorage.getItem(EMAIL_KEY);
}

export function setEmail(email: string): void {
  localStorage.setItem(EMAIL_KEY, email);
}

export function clearEmail(): void {
  localStorage.removeItem(EMAIL_KEY);
}
