const STORAGE_KEY = "artifact_server_url";

export function getServerUrl(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function setServerUrl(url: string): void {
  const normalized = url.replace(/\/+$/, "");
  localStorage.setItem(STORAGE_KEY, normalized);
}

export function clearServerUrl(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export async function testConnection(url: string): Promise<boolean> {
  try {
    const normalized = url.replace(/\/+$/, "");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(`${normalized}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}
