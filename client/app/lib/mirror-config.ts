import { getServerUrl } from "./server-config";

function getStorageKey(serverUrl: string): string {
  const hash = btoa(serverUrl);
  return `artifact_mirror_${hash}`;
}

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try { return localStorage; } catch { return null; }
}

export function getMirrorPath(serverUrl?: string): string | null {
  const url = serverUrl ?? getServerUrl();
  if (!url) return null;
  return getStorage()?.getItem(getStorageKey(url)) ?? null;
}

export function setMirrorPath(serverUrl: string, path: string): void {
  getStorage()?.setItem(getStorageKey(serverUrl), path);
}

export function clearMirrorPath(serverUrl: string): void {
  getStorage()?.removeItem(getStorageKey(serverUrl));
}

export function getDefaultMirrorPath(): string {
  const home = (() => {
    if (typeof navigator !== "undefined" && navigator.platform) {
      if (navigator.platform.startsWith("Win")) {
        return "C:\\Users\\User\\Artifact";
      }
    }
    return "~/Artifact";
  })();
  return home;
}
