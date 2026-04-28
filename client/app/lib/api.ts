import { getServerUrl } from "./server-config";
import { getAccessToken, getRefreshToken, setTokens, clearTokens } from "./auth";
import {
  type ZodType,
} from "zod";
import { z } from "zod";
import type {
  Project,
  ProjectListResponse,
  CreateProjectRequest,
  UpdateProjectRequest,
} from "./api-types";
export type { Project } from "./api-types";
import {
  ProjectSchema,
  ProjectListResponseSchema,
  BranchResponseSchema,
  FileMetadataSchema,
  FileListResponseSchema,
  LockResponseSchema,
  WorkspaceResponseSchema,
  WorkspaceStatusSchema,
  SyncResponseSchema,
  SubmitResponseSchema,
  CommitResponseSchema,
  TeamResponseSchema,
  TeamMemberResponseSchema,
  SearchResponseSchema,
  InitUploadResponseSchema,
  CompleteUploadResponseSchema,
} from "./api-types";

export interface SubmitFileInput {
  file_id: string;
  path: string;
  action: string;
  upload_session_id?: string;
  message?: string;
}

export interface SubmitRequest {
  workspace_id?: string;
  branch: string;
  message: string;
  files: SubmitFileInput[];
  release_locks: boolean;
}

class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function refreshAccessToken(): Promise<boolean> {
  const serverUrl = getServerUrl();
  const refreshToken = getRefreshToken();
  if (!serverUrl || !refreshToken) return false;

  try {
    const res = await fetch(`${serverUrl}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    setTokens(data);
    return true;
  } catch {
    return false;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  schema?: ZodType<T>,
  retry = true,
): Promise<T> {
  const serverUrl = getServerUrl();
  if (!serverUrl) throw new ApiError("No server URL configured", 0);

  const token = getAccessToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${serverUrl}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401 && retry) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return request(path, options, schema, false);
    }
    clearTokens();
    window.location.href = "/login";
    throw new ApiError("Session expired", 401);
  }

  if (!res.ok) {
    let message = "Request failed";
    let code: string | undefined;
    try {
      const body = await res.json();
      message = body?.error?.message ?? message;
      code = body?.error?.code;
    } catch {}
    throw new ApiError(message, res.status, code);
  }

  if (res.status === 204) return undefined as T;

  const raw = await res.json();

  if (schema) {
    return schema.parse(raw);
  }

  return raw as T;
}

export const api = {
  projects: {
    async list(): Promise<Project[]> {
      const res = await request("/api/v1/projects", {}, ProjectListResponseSchema);
      return res.data;
    },
    async get(id: string): Promise<Project> {
      return request(`/api/v1/projects/${id}`, {}, ProjectSchema);
    },
    async create(data: CreateProjectRequest): Promise<Project> {
      return request("/api/v1/projects", {
        method: "POST",
        body: JSON.stringify(data),
      }, ProjectSchema);
    },
    async update(id: string, data: UpdateProjectRequest): Promise<Project> {
      return request(`/api/v1/projects/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }, ProjectSchema);
    },
    async delete(id: string): Promise<void> {
      return request(`/api/v1/projects/${id}`, { method: "DELETE" });
    },
  },

  branches: {
    async list(projectId: string) {
      const res = await request(
        `/api/v1/projects/${projectId}/branches`,
        {},
        z.array(BranchResponseSchema),
      );
      return res;
    },
    async get(projectId: string, branchId: string) {
      return request(
        `/api/v1/projects/${projectId}/branches/${branchId}`,
        {},
        BranchResponseSchema,
      );
    },
  },

  files: {
    async list(projectId: string, params?: { branch?: string; path?: string }) {
      const qs = new URLSearchParams();
      if (params?.branch) qs.set("branch", params.branch);
      if (params?.path) qs.set("path", params.path);
      const query = qs.toString();
      const res = await request(
        `/api/v1/projects/${projectId}/files${query ? `?${query}` : ""}`,
        {},
        FileListResponseSchema,
      );
      return res.data;
    },
    async get(fileId: string) {
      return request(`/api/v1/files/${fileId}`, {}, FileMetadataSchema);
    },
    downloadUrl(fileId: string): string {
      const serverUrl = getServerUrl();
      return `${serverUrl}/api/v1/files/${fileId}/download`;
    },
    async initUpload(projectId: string, branch: string, path: string, fileName: string, fileSize: number, contentHash: string) {
      return request("/api/v1/files/upload", {
        method: "POST",
        body: JSON.stringify({
          project_id: projectId,
          branch,
          path,
          file_name: fileName,
          file_size: fileSize,
          content_hash: contentHash,
        }),
      }, InitUploadResponseSchema);
    },
    async uploadChunk(sessionId: string, chunkIndex: number, data: Blob): Promise<void> {
      const serverUrl = getServerUrl();
      const token = getAccessToken();
      const formData = new FormData();
      formData.append("chunk_index", String(chunkIndex));
      formData.append("data", data);

      const res = await fetch(`${serverUrl}/api/v1/files/upload/${sessionId}`, {
        method: "PUT",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      if (!res.ok) {
        let message = "Chunk upload failed";
        try {
          const body = await res.json();
          message = body?.error?.message ?? message;
        } catch {}
        throw new ApiError(message, res.status);
      }
    },
    async completeUpload(sessionId: string) {
      return request(
        `/api/v1/files/upload/${sessionId}/complete`,
        { method: "POST" },
        CompleteUploadResponseSchema,
      );
    },
    async createFolder(projectId: string, branch: string, path: string) {
      return request(`/api/v1/projects/${projectId}/folders`, {
        method: "POST",
        body: JSON.stringify({ project_id: projectId, branch, path }),
      });
    },
  },

  locks: {
    async lock(fileId: string) {
      return request(`/api/v1/files/${fileId}/lock`, {
        method: "POST",
      }, LockResponseSchema);
    },
    async unlock(fileId: string) {
      return request(`/api/v1/files/${fileId}/lock`, {
        method: "DELETE",
      });
    },
    async list(projectId: string) {
      return request(
        `/api/v1/projects/${projectId}/locks`,
        {},
        z.array(LockResponseSchema),
      );
    },
  },

  workspaces: {
    async list(projectId: string) {
      return request(
        `/api/v1/projects/${projectId}/workspaces`,
        {},
        z.array(WorkspaceResponseSchema),
      );
    },
    async get(workspaceId: string) {
      return request(`/api/v1/workspaces/${workspaceId}`, {}, WorkspaceResponseSchema);
    },
    async status(workspaceId: string) {
      return request(
        `/api/v1/workspaces/${workspaceId}/status`,
        {},
        WorkspaceStatusSchema,
      );
    },
  },

  sync: {
    async sync(workspaceId: string, localVersions: Record<string, string>) {
      return request(
        `/api/v1/workspaces/${workspaceId}/sync`,
        {
          method: "POST",
          body: JSON.stringify({ local_versions: localVersions }),
        },
        SyncResponseSchema,
      );
    },
  },

  commits: {
    async list(projectId: string) {
      return request(
        `/api/v1/projects/${projectId}/commits`,
        {},
        z.array(CommitResponseSchema),
      );
    },
    async get(commitId: string) {
      return request(`/api/v1/commits/${commitId}`, {}, CommitResponseSchema);
    },
    async submit(projectId: string, data: SubmitRequest) {
      return request(
        `/api/v1/projects/${projectId}/submit`,
        {
          method: "POST",
          body: JSON.stringify(data),
        },
        SubmitResponseSchema,
      );
    },
  },

  teams: {
    async list() {
      return request("/api/v1/teams", {}, z.array(TeamResponseSchema));
    },
    async get(teamId: string) {
      return request(`/api/v1/teams/${teamId}`, {}, TeamResponseSchema);
    },
    async members(teamId: string) {
      return request(
        `/api/v1/teams/${teamId}/members`,
        {},
        z.array(TeamMemberResponseSchema),
      );
    },
  },

  search: {
    async query(params: Record<string, string>) {
      const qs = new URLSearchParams(params).toString();
      return request(`/api/v1/search?${qs}`, {}, SearchResponseSchema);
    },
  },
};
