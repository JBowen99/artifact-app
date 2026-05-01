import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  bigint,
  timestamp,
  primaryKey,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull().default(""),
  role: text("role", {
    enum: ["admin", "contributor", "viewer"],
  })
    .notNull()
    .default("contributor"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const teams = pgTable("teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const teamMembers = pgTable(
  "team_members",
  {
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", {
      enum: ["admin", "contributor", "viewer"],
    })
      .notNull()
      .default("contributor"),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.userId] })],
);

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  repoPath: text("repo_path").notNull(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  teamId: uuid("team_id").references(() => teams.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const branches = pgTable(
  "branches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    headCommit: text("head_commit"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("branches_project_id_name_unique").on(t.projectId, t.name)],
);

export const files = pgTable(
  "files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    fileName: text("file_name").notNull(),
    fileType: text("file_type").notNull().default(""),
    isBinary: boolean("is_binary").notNull().default(false),
    contentHash: text("content_hash").notNull().default(""),
    sizeBytes: bigint("size_bytes", { mode: "number" })
      .notNull()
      .default(0),
    pointerFilePath: text("pointer_file_path").notNull().default(""),
    version: integer("version").notNull().default(1),
    ownerId: uuid("owner_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_files_project_branch").on(t.projectId, t.branchId),
    index("idx_files_path").on(t.projectId, t.branchId, t.path),
    index("idx_files_content_hash").on(t.contentHash),
  ],
);

export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    rootPath: text("root_path").notNull().default("/"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_workspaces_project_user").on(t.projectId, t.userId)],
);

export const locks = pgTable(
  "locks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, {
      onDelete: "set null",
    }),
    lockedAt: timestamp("locked_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_locks_file").on(t.fileId),
    index("idx_locks_user").on(t.userId),
  ],
);

export const workspaceFiles = pgTable(
  "workspace_files",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    syncedVersion: integer("synced_version").notNull().default(0),
    localPath: text("local_path").notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.fileId] })],
);

export const pendingChanges = pgTable(
  "pending_changes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    changeType: text("change_type", {
      enum: ["add", "modify", "delete"],
    }).notNull(),
    detectedAt: timestamp("detected_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_pending_changes_workspace").on(t.workspaceId)],
);

export const commits = pgTable(
  "commits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    gitCommitHash: text("git_commit_hash").notNull(),
    message: text("message").notNull().default(""),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_commits_project_branch").on(t.projectId, t.branchId),
    index("idx_commits_author").on(t.authorId),
  ],
);

export const commitFiles = pgTable(
  "commit_files",
  {
    commitId: uuid("commit_id")
      .notNull()
      .references(() => commits.id, { onDelete: "cascade" }),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    action: text("action", {
      enum: ["add", "modify", "delete"],
    }).notNull(),
    message: text("message").notNull().default(""),
  },
  (t) => [primaryKey({ columns: [t.commitId, t.fileId] })],
);

export const tags = pgTable("tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  color: text("color").notNull().default("#000000"),
});

export const fileTags = pgTable(
  "file_tags",
  {
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.fileId, t.tagId] })],
);

export const projectPermissions = pgTable(
  "project_permissions",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", {
      enum: ["admin", "contributor", "viewer"],
    })
      .notNull()
      .default("contributor"),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.userId] })],
);

export const usersRelations = relations(users, ({ many }) => ({
  teamMemberships: many(teamMembers),
  projects: many(projects),
  ownedFiles: many(files),
  workspaces: many(workspaces),
  locks: many(locks),
  commits: many(commits),
  projectPermissions: many(projectPermissions),
}));

export const teamsRelations = relations(teams, ({ many }) => ({
  members: many(teamMembers),
  projects: many(projects),
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  team: one(teams, {
    fields: [teamMembers.teamId],
    references: [teams.id],
  }),
  user: one(users, {
    fields: [teamMembers.userId],
    references: [users.id],
  }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  owner: one(users, {
    fields: [projects.ownerId],
    references: [users.id],
  }),
  team: one(teams, {
    fields: [projects.teamId],
    references: [teams.id],
  }),
  branches: many(branches),
  files: many(files),
  workspaces: many(workspaces),
  commits: many(commits),
  permissions: many(projectPermissions),
}));

export const branchesRelations = relations(branches, ({ one, many }) => ({
  project: one(projects, {
    fields: [branches.projectId],
    references: [projects.id],
  }),
  files: many(files),
}));

export const filesRelations = relations(files, ({ one, many }) => ({
  project: one(projects, {
    fields: [files.projectId],
    references: [projects.id],
  }),
  branch: one(branches, {
    fields: [files.branchId],
    references: [branches.id],
  }),
  owner: one(users, {
    fields: [files.ownerId],
    references: [users.id],
  }),
  locks: many(locks),
  workspaceFiles: many(workspaceFiles),
  pendingChanges: many(pendingChanges),
  commitFiles: many(commitFiles),
  fileTags: many(fileTags),
}));

export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
  project: one(projects, {
    fields: [workspaces.projectId],
    references: [projects.id],
  }),
  user: one(users, {
    fields: [workspaces.userId],
    references: [users.id],
  }),
  branch: one(branches, {
    fields: [workspaces.branchId],
    references: [branches.id],
  }),
  workspaceFiles: many(workspaceFiles),
  pendingChanges: many(pendingChanges),
  locks: many(locks),
}));

export const locksRelations = relations(locks, ({ one }) => ({
  file: one(files, {
    fields: [locks.fileId],
    references: [files.id],
  }),
  user: one(users, {
    fields: [locks.userId],
    references: [users.id],
  }),
  workspace: one(workspaces, {
    fields: [locks.workspaceId],
    references: [workspaces.id],
  }),
}));

export const workspaceFilesRelations = relations(
  workspaceFiles,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [workspaceFiles.workspaceId],
      references: [workspaces.id],
    }),
    file: one(files, {
      fields: [workspaceFiles.fileId],
      references: [files.id],
    }),
  }),
);

export const pendingChangesRelations = relations(
  pendingChanges,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [pendingChanges.workspaceId],
      references: [workspaces.id],
    }),
    file: one(files, {
      fields: [pendingChanges.fileId],
      references: [files.id],
    }),
  }),
);

export const commitsRelations = relations(commits, ({ one, many }) => ({
  project: one(projects, {
    fields: [commits.projectId],
    references: [projects.id],
  }),
  branch: one(branches, {
    fields: [commits.branchId],
    references: [branches.id],
  }),
  author: one(users, {
    fields: [commits.authorId],
    references: [users.id],
  }),
  commitFiles: many(commitFiles),
}));

export const commitFilesRelations = relations(commitFiles, ({ one }) => ({
  commit: one(commits, {
    fields: [commitFiles.commitId],
    references: [commits.id],
  }),
  file: one(files, {
    fields: [commitFiles.fileId],
    references: [files.id],
  }),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  fileTags: many(fileTags),
}));

export const fileTagsRelations = relations(fileTags, ({ one }) => ({
  file: one(files, {
    fields: [fileTags.fileId],
    references: [files.id],
  }),
  tag: one(tags, {
    fields: [fileTags.tagId],
    references: [tags.id],
  }),
}));

export const projectPermissionsRelations = relations(
  projectPermissions,
  ({ one }) => ({
    project: one(projects, {
      fields: [projectPermissions.projectId],
      references: [projects.id],
    }),
    user: one(users, {
      fields: [projectPermissions.userId],
      references: [users.id],
    }),
  }),
);
