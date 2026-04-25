import { z } from "zod";

export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.any()).optional(),
  }),
});

export const HealthResponseSchema = z.object({
  status: z.string(),
  services: z.record(z.string(), z.string()).optional(),
});

export const LoginResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number(),
});

export const UserResponseSchema = z.object({
  id: z.string(),
  email: z.string(),
  display_name: z.string(),
  role: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  repo_path: z.string(),
  owner_id: z.string(),
  team_id: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const ProjectListResponseSchema = z.object({
  data: z.array(ProjectSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
  total_pages: z.number(),
});

export const CreateProjectRequestSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional().default(""),
  team_id: z.string().optional(),
});

export const UpdateProjectRequestSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
});

export const BranchResponseSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  name: z.string(),
  is_default: z.boolean(),
  head_commit: z.string(),
  created_at: z.string(),
});

export const FileMetadataSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  branch_id: z.string(),
  path: z.string(),
  file_name: z.string(),
  file_type: z.string(),
  is_binary: z.boolean(),
  content_hash: z.string(),
  size_bytes: z.number(),
  pointer_file_path: z.string(),
  version: z.number(),
  owner_id: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const FileListResponseSchema = z.object({
  data: z.array(FileMetadataSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
  total_pages: z.number(),
});

export const InitUploadResponseSchema = z.object({
  session_id: z.string(),
  chunk_size: z.number(),
  total_chunks: z.number(),
});

export const CompleteUploadResponseSchema = z.object({
  file_id: z.string(),
  content_hash: z.string(),
  size_bytes: z.number(),
  pointer_file: z.string(),
});

export const LockResponseSchema = z.object({
  lock_id: z.string(),
  file_id: z.string(),
  user_id: z.string(),
  locked_at: z.string(),
  expires_at: z.string().nullable().optional(),
});

export const WorkspaceResponseSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  user_id: z.string(),
  branch_id: z.string(),
  name: z.string(),
  root_path: z.string(),
  last_synced_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const PendingChangeSchema = z.object({
  file_id: z.string(),
  path: z.string(),
  change_type: z.string(),
  detected_at: z.string(),
});

export const WorkspaceLockSchema = z.object({
  file_id: z.string(),
  path: z.string(),
  locked_by: z.string(),
});

export const WorkspaceStatusSchema = z.object({
  workspace_id: z.string(),
  branch: z.string(),
  last_synced_at: z.string().nullable(),
  synced_file_count: z.number(),
  pending_changes: z.array(PendingChangeSchema),
  locks: z.array(WorkspaceLockSchema),
});

export const SyncActionSchema = z.object({
  type: z.string(),
  path: z.string(),
  version: z.string().optional(),
  size_bytes: z.number().optional(),
  content_hash: z.string().optional(),
  download_url: z.string().optional(),
});

export const SyncResponseSchema = z.object({
  actions: z.array(SyncActionSchema),
});

export const SubmitResponseSchema = z.object({
  commit_id: z.string(),
  git_commit_hash: z.string(),
  branch: z.string(),
  message: z.string(),
  files_affected: z.number(),
  created_at: z.string(),
});

export const CommitResponseSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  branch_id: z.string(),
  git_commit_hash: z.string(),
  message: z.string(),
  author_id: z.string(),
  created_at: z.string(),
});

export const TeamResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const TeamMemberResponseSchema = z.object({
  user_id: z.string(),
  role: z.string(),
  display_name: z.string(),
  email: z.string(),
  joined_at: z.string(),
});

export const SearchResultSchema = z.object({
  file_id: z.string(),
  path: z.string(),
  project: z.string(),
  version: z.string(),
  size_bytes: z.number(),
  owner: z.string(),
  tags: z.array(z.string()),
  updated_at: z.string(),
});

export const SearchResponseSchema = z.object({
  results: z.array(SearchResultSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type LoginResponse = z.infer<typeof LoginResponseSchema>;
export type UserResponse = z.infer<typeof UserResponseSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type ProjectListResponse = z.infer<typeof ProjectListResponseSchema>;
export type CreateProjectRequest = z.infer<typeof CreateProjectRequestSchema>;
export type UpdateProjectRequest = z.infer<typeof UpdateProjectRequestSchema>;
export type BranchResponse = z.infer<typeof BranchResponseSchema>;
export type FileMetadata = z.infer<typeof FileMetadataSchema>;
export type FileListResponse = z.infer<typeof FileListResponseSchema>;
export type InitUploadResponse = z.infer<typeof InitUploadResponseSchema>;
export type CompleteUploadResponse = z.infer<typeof CompleteUploadResponseSchema>;
export type LockResponse = z.infer<typeof LockResponseSchema>;
export type WorkspaceResponse = z.infer<typeof WorkspaceResponseSchema>;
export type WorkspaceStatus = z.infer<typeof WorkspaceStatusSchema>;
export type SyncResponse = z.infer<typeof SyncResponseSchema>;
export type SubmitResponse = z.infer<typeof SubmitResponseSchema>;
export type CommitResponse = z.infer<typeof CommitResponseSchema>;
export type TeamResponse = z.infer<typeof TeamResponseSchema>;
export type TeamMemberResponse = z.infer<typeof TeamMemberResponseSchema>;
export type SearchResponse = z.infer<typeof SearchResponseSchema>;
