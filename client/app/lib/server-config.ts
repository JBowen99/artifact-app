const STORAGE_KEY = "artifact_server_url";

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try { return localStorage; } catch { return null; }
}

export function getServerUrl(): string | null {
  return getStorage()?.getItem(STORAGE_KEY) ?? null;
}

export function setServerUrl(url: string): void {
  const normalized = url.replace(/\/+$/, "");
  getStorage()?.setItem(STORAGE_KEY, normalized);
}

export function clearServerUrl(): void {
  getStorage()?.removeItem(STORAGE_KEY);
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
