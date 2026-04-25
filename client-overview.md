# Artifact — Client Overview

## 1. Tech Stack

| Component        | Technology              | Purpose                                  |
|------------------|-------------------------|------------------------------------------|
| Framework        | React Router v7         | Routing, SSR/SPA, data loading           |
| Styling          | Tailwind CSS v4         | Utility-first styling                    |
| Component Library| shadcn/ui               | Pre-built accessible UI components       |
| Icons            | Iconoir                 | Consistent open-source icon set          |
| Language         | TypeScript              | Type safety                              |
| State Management | React Context + hooks   | Auth state, server config, UI state      |
| HTTP Client      | fetch (native)          | API communication with server            |

---

## 2. Project Structure

```
client/
├── app/
│   ├── root.tsx                    # Root layout (html, body, providers)
│   ├── routes/
│   │   ├── _index.tsx              # Redirect to /login or /projects
│   │   ├── login.tsx               # Login page (server connect + auth)
│   │   ├── setup.tsx               # Mirror location setup (first connection)
│   │   ├── _authenticated.tsx      # Authenticated layout (requires login)
│   │   └── _authenticated/
│   │       ├── projects.tsx        # Project list / selection
│   │       └── projects.$id.tsx    # Main workspace view (file tree + preview)
│   ├── components/
│   │   ├── ui/                     # shadcn components
│   │   ├── file-tree.tsx           # Recursive file tree component
│   │   ├── file-tree-node.tsx      # Individual tree node (folder/file)
│   │   ├── preview-pane.tsx        # File preview area
│   │   ├── connection-form.tsx     # Server URL + connect controls
│   │   ├── login-form.tsx          # Email + password form
│   │   ├── mirror-setup.tsx        # Local mirror directory picker
│   │   ├── header.tsx              # Top navigation bar
│   │   └── sidebar.tsx             # Left sidebar wrapper
│   ├── lib/
│   │   ├── api.ts                  # Typed API client
│   │   ├── auth.ts                 # Auth token storage & refresh logic
│   │   ├── server-config.ts        # Server URL persistence & management
│   │   ├── mirror-config.ts        # Mirror path persistence & management
│   │   └── utils.ts                # Shared utilities (cn, formatters)
│   ├── hooks/
│   │   ├── use-auth.ts             # Auth state hook
│   │   ├── use-server.ts           # Server connection hook
│   │   ├── use-mirror.ts           # Mirror config hook
│   │   └── use-file-tree.ts        # File tree data fetching hook
│   └── styles/
│       └── app.css                 # Tailwind v4 imports & custom styles
├── public/
│   └── favicon.svg
├── package.json
├── tsconfig.json
├── vite.config.ts
├── react-router.config.ts
└── components.json                 # shadcn configuration
```

---

## 3. Screen Descriptions

### 3.1 Login Screen — `/login`

The entry screen. Handles server connection, authentication, and routing to setup if needed.

#### UI Layout

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│                  ┌──────────────────────┐               │
│                  │     🔷 Artifact      │               │
│                  │                      │               │
│                  │  ── Server ───────── │               │
│                  │                      │               │
│                  │  Server URL          │               │
│                  │  ┌────────────────┐  │               │
│                  │  │ http://...     ●│  │  ● = status  │
│                  │  └────────────────┘  │    indicator  │
│                  │  [  Connect  ]       │    (green/red)│
│                  │                      │               │
│                  │  ── Sign In ─────── │  (visible only│
│                  │                      │   after server│
│                  │  Email               │   connected)  │
│                  │  ┌────────────────┐  │               │
│                  │  │ user@email.com │  │               │
│                  │  └────────────────┘  │               │
│                  │  Password            │               │
│                  │  ┌────────────────┐  │               │
│                  │  │ ••••••••       │  │               │
│                  │  └────────────────┘  │               │
│                  │  [    Login    ]     │               │
│                  │                      │               │
│                  └──────────────────────┘               │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

#### UI Elements

| Element            | Type          | Behavior                                                             |
|--------------------|---------------|----------------------------------------------------------------------|
| Server URL input   | Text input    | Prefilled from `localStorage` if previously connected. Placeholder: `http://your-server:8080` |
| Status indicator   | Dot (12px)    | Gray = not tested, green = connected, red = unreachable. Positioned at right edge of input |
| Connect button     | Button        | Disabled while loading. Shows spinner during health check. Enabled once URL field has content |
| Email input        | Text input    | Prefilled from `localStorage` if previously logged in. Only visible after successful connect |
| Password input     | Password      | Only visible after successful connect                                |
| Login button       | Button        | Disabled while loading. Shows spinner during auth. Only visible after successful connect |

#### Behavior — Step 1: Connect to Server

1. User enters or edits the server URL
2. Clicks **Connect**
3. Button shows spinner, input is disabled
4. Client calls `GET <server-url>/health`
5. **On success**:
   - Status indicator turns green
   - Server URL persisted to `localStorage`
   - Login form slides in below
6. **On failure**:
   - Status indicator turns red
   - Toast: "Unable to reach server at <url>"
   - Login form remains hidden

#### Behavior — Step 2: Authenticate

1. User enters email + password
2. Clicks **Login**
3. Client calls `POST <server-url>/api/v1/auth/login`
4. **On success**:
   - Tokens persisted to `localStorage`
   - Email persisted to `localStorage` for future prefill
   - Check if mirror path is configured:
     - **No mirror path** → redirect to `/setup`
     - **Mirror path exists** → redirect to `/projects`
5. **On failure**:
   - Toast with error message (e.g., "Invalid email or password")

---

### 3.2 Mirror Setup Screen — `/setup`

Shown only when a user has authenticated but has not yet configured a local mirror directory for the current server. This is a one-time setup per server.

#### UI Layout

```
┌─────────────────────────────────────────────────────────┐
│  Header: Artifact                        [user@email]   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│              ┌──────────────────────────┐               │
│              │                          │               │
│              │  📁 Local Mirror Setup   │               │
│              │                          │               │
│              │  Choose a folder on your │               │
│              │  machine where Artifact  │               │
│              │  will store synced files.│               │
│              │                          │               │
│              │  Mirror Location         │               │
│              │  ┌────────────────────┐  │               │
│              │  │ /Users/alice/Artif │📂│               │
│              │  └────────────────────┘  │               │
│              │                          │               │
│              │  e.g. /home/user/Artifact│               │
│              │                          │               │
│              │  ℹ️ Files from the server│               │
│              │  will be synced to this  │               │
│              │  directory. You can      │               │
│              │  change this later in    │               │
│              │  Settings.               │               │
│              │                          │               │
│              │  [     Continue     ]    │               │
│              │                          │               │
│              └──────────────────────────┘               │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

#### UI Elements

| Element            | Type          | Behavior                                                             |
|--------------------|---------------|----------------------------------------------------------------------|
| Mirror path input  | Text input    | Manual path entry or OS folder picker via browse button (📂). Prefilled with platform default: `$HOME/Artifact` |
| Browse button (📂) | Button (icon) | Opens native OS folder picker dialog. On selection, populates the path input |
| Continue button    | Button        | Disabled if path is empty. Persists mirror path, redirects to `/projects` |

#### Behavior

1. Screen is shown after first successful login if no mirror path is stored for this server
2. Default path is pre-filled based on OS:
   - macOS: `~/Artifact`
   - Linux: `~/Artifact`
   - Windows: `C:\Users\<user>\Artifact`
3. User can type a custom path or use the browse button to pick a directory
4. Client validates the path:
   - Directory must be writable (attempt to create if it doesn't exist)
   - If directory exists and is not empty, warn: "This directory is not empty. Artifact will create subdirectories for each project."
5. On **Continue**:
   - Persist mirror path to `localStorage` (keyed by server URL)
   - Redirect to `/projects`
6. User can return to this screen later via Settings to change the mirror location

---

### 3.3 Project List Screen — `/projects`

The landing screen after login and setup. Displays all projects the user has access to.

#### UI Layout

```
┌─────────────────────────────────────────────────────────┐
│  🔷 Artifact            [⚙️ Settings]  [user@email] [⏏]│
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Projects                                    [+ New]    │
│                                                         │
│  ┌─────────────────┐  ┌─────────────────┐              │
│  │ 📦 Engine       │  │ 📦 Chassis      │              │
│  │ Assembly v2     │  │ Design          │              │
│  │                 │  │                 │              │
│  │ CAD project for │  │ Frame redesign  │              │
│  │ engine redesign │  │ for 2026 model  │              │
│  │                 │  │                 │              │
│  │ main • 42 files │  │ main • 18 files │              │
│  │ Updated 2h ago  │  │ Updated 1d ago  │              │
│  └─────────────────┘  └─────────────────┘              │
│                                                         │
│  ┌─────────────────┐                                   │
│  │ 📦 Electrical   │                                   │
│  │ Harness         │                                   │
│  │                 │                                   │
│  │ Wiring layout   │                                   │
│  │ and schematics  │                                   │
│  │                 │                                   │
│  │ main • 7 files  │                                   │
│  │ Updated 5d ago  │                                   │
│  └─────────────────┘                                   │
│                                                         │
│  Mirror: ~/Artifact                                    │
│  Server: http://localhost:8080                          │
└─────────────────────────────────────────────────────────┘
```

#### UI Elements

| Element            | Type          | Behavior                                                             |
|--------------------|---------------|----------------------------------------------------------------------|
| Project cards      | Card grid     | Responsive grid (3 cols desktop, 2 tablet, 1 mobile). Each card links to `/projects/:id` |
| Project name       | Card title    | Bold, single line, truncated if long                                 |
| Project description| Card text     | Two-line max, muted color                                            |
| Branch + file count| Card meta     | Default branch name and total file count, small muted text           |
| Updated time       | Card meta     | Relative timestamp (e.g., "2h ago", "5d ago")                        |
| New Project button | Button        | Opens dialog to create a new project                                 |
| Settings button    | Icon button   | Opens settings (mirror path, server URL, account)                    |
| Footer status      | Text (muted)  | Shows current mirror path and server URL for quick reference          |

#### Behavior

- Fetch projects via `GET /api/v1/projects`
- Sort by last updated (most recent first)
- Click a project card → navigate to `/projects/:id`
- "New Project" opens a dialog with name + description fields, calls `POST /api/v1/projects`
- Settings button opens a dialog/sheet where user can:
  - View/change mirror location
  - View/change server URL (triggers reconnect)
  - View account info
  - Logout

---

### 3.4 Main Workspace Screen — `/projects/:id`

The primary working view. Split layout: file tree sidebar on the left, preview area filling the remaining space.

#### UI Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│  🔷 Artifact │ Engine Assembly v2 │ branch: main ▾ │ user@email │ ⏏ │
├──────────────┬───────────────────────────────────────────────────────┤
│              │                                                     │
│ 🔍 Search    │  📄 housing.step  │  v4  │  50 MB  │ 🔒 You │ ⬇ 🔓 │
│──────────────│─────────────────────────────────────────────────────│
│              │                                                     │
│  Files       │                                                     │
│              │       (file preview content rendered here)          │
│  ▼ /         │                                                     │
│    ▼ asm/    │       For images: inline <img>                     │
│      📄 h…step│ 🔒                                               │
│      📄 b…step│ ●                                                │
│    ▼ docs/   │       For PDFs: embedded viewer                    │
│      📄 r…pdf │                                                   │
│    📄 README │       For text: syntax-highlighted code             │
│              │                                                     │
│              │       For binary: "Preview not available"           │
│              │       with download button                          │
│  ──────────  │                                                     │
│  🔒 2 locked │                                                     │
│  ● 1 modified│                                                     │
│  ──────────  │                                                     │
│  Mirror:     │                                                     │
│  ~/Artifact/ │                                                     │
│  Engine…v2/  │                                                     │
│──────────────│                                                     │
│  [🔄 Sync]   │                                                     │
└──────────────┴─────────────────────────────────────────────────────┘
```

#### Top Bar

| Element          | Type            | Behavior                                                        |
|------------------|-----------------|-----------------------------------------------------------------|
| Back link        | Icon button     | Navigate back to `/projects`                                    |
| Project name     | Text (bold)     | Current project display name                                    |
| Branch selector  | Select dropdown | Switch between branches. Fetches via `GET /projects/:id/branches`. Changing branch reloads the file tree |
| User email       | Text            | Current user's email                                            |
| Logout           | Icon button     | Calls `POST /api/v1/auth/logout`, clears tokens, redirects to `/login` |

#### Left Panel — File Tree

- Fetch file tree via `GET /api/v1/projects/:projectId/files?branch=<branch>`
- Rendered as a recursive collapsible tree using `ScrollArea` for overflow
- **Folder nodes**:
  - Icon: `Folder` (collapsed) / `FolderOpen` (expanded) from Iconoir
  - Clicking toggles expand/collapse
  - Default state: only root-level expanded
- **File nodes**:
  - Icon varies by file type (see table below)
  - Clicking selects the file and updates the preview pane
  - Selected file is highlighted with primary background color

**File type icons:**

| File Type              | Iconoir Icon  | Examples                            |
|------------------------|---------------|--------------------------------------|
| Generic / unknown      | `File`        | .dat, .bin                           |
| Text / code            | `FileText`    | .txt, .md, .json, .yaml, .py, .go   |
| Image                  | `FileImage`   | .png, .jpg, .svg, .gif               |
| 3D / CAD               | `Box`         | .step, .stl, .obj, .iges             |
| PDF                    | `FilePdf`     | .pdf                                 |
| Compressed / archive   | `FileZip`     | .zip, .tar, .gz                      |

**Lock indicators** (overlaid on file icon, bottom-right corner):

| State                    | Indicator                                     |
|--------------------------|------------------------------------------------|
| Not locked               | None                                           |
| Locked by current user   | Green `Lock` icon (small, 14px)                |
| Locked by another user   | Red `Lock` icon + tooltip: "Locked by <name>"  |

**Pending change indicator**: Small colored dot (amber) next to file name when the file has local modifications not yet submitted.

**File tree footer** (bottom of sidebar):
- Summary counts: locked files, modified files
- Current mirror path for this project (truncated)
- **Sync** button to pull latest changes from server

**Right-click / context menu on files:**

| Action         | Icon         | Condition                  | Description                          |
|----------------|--------------|----------------------------|--------------------------------------|
| Lock           | `Lock`       | File not locked            | Lock the file for editing            |
| Unlock         | `LockOpen`   | File locked by you         | Release the lock                     |
| Download       | `Download`   | Always                     | Download file to local machine       |
| Open in Mirror | `Folder`     | Always                     | Open the file's location in OS file browser (if synced) |
| View History   | `History`    | Always                     | Show version history (future)        |
| Delete         | `Trash`      | User has permission        | Delete file (with confirmation)      |

**Right-click / context menu on folders:**

| Action           | Icon       | Description                              |
|------------------|------------|------------------------------------------|
| Expand All       | `Expand`   | Recursively expand all children          |
| Collapse All     | `Collapse` | Recursively collapse all children        |
| Sync Folder      | `Refresh`  | Sync only this folder's contents (future)|

#### Right Panel — Preview Area

The preview pane has two states: **empty** (no file selected) and **file selected**.

**Empty state:**

```
┌─────────────────────────────────────┐
│                                     │
│                                     │
│          📂                         │
│                                     │
│     Select a file to preview        │
│                                     │
│   Browse the file tree on the left  │
│                                     │
│                                     │
└─────────────────────────────────────┘
```

**File selected state — header bar:**

```
┌──────────────────────────────────────────────────────────────┐
│  📄 housing.step  │  v4  │  50 MB  │  🔒 Locked by you  │ ⬇ 🔓 │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│                     (preview content)                        │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

| Element        | Type           | Behavior                                                     |
|----------------|----------------|--------------------------------------------------------------|
| File icon+name | Text (bold)    | File name with type icon                                     |
| Version        | Badge          | Current file version (e.g., "v4")                            |
| Size           | Text (muted)   | Human-readable file size (e.g., "50 MB")                     |
| Lock status    | Badge          | "Not locked" / "Locked by you" (green) / "Locked by <name>" (red) |
| Download       | Icon button    | Downloads the file via `GET /files/:fileId/download`         |
| Lock/Unlock    | Icon button    | Toggle lock state. Changes between `Lock` and `LockOpen` icon |

**Preview content by file type:**

| File Type          | Preview Behavior                                        |
|--------------------|----------------------------------------------------------|
| Image (png, jpg, svg, gif) | Render image inline, centered, scaled to fit    |
| PDF                | Embedded PDF viewer (`<iframe>` or `<object>`)          |
| Text / Code        | Syntax-highlighted monospace display (read-only)         |
| Binary / CAD       | Placeholder card: "Preview not available for this file type" with a download button |

---

## 4. Screen Flows

### 4.1 Full Application Flow

```
App Loads
  │
  ├─ No stored server URL?
  │    └─ → Login Screen (show server URL field only)
  │
  ├─ Server URL + tokens stored?
  │    ├─ Validate tokens: GET /auth/me
  │    │    ├─ Success
  │    │    │    ├─ Mirror path configured for this server?
  │    │    │    │    ├─ Yes → Project List Screen
  │    │    │    │    └─ No  → Mirror Setup Screen
  │    │    │    └─
  │    │    └─ Failure → clear tokens → Login Screen (prefilled server URL)
  │    └─
  └─
```

### 4.2 First-Time User Flow (Complete)

```
User opens app for the first time
  │
  ▼
Login Screen
  │  Server URL field is empty
  │  Login form is hidden
  │
  ▼  User enters server URL → clicks Connect
  │
  ├─ Health check fails
  │    └─ Show error toast, stay on Login Screen
  │
  ├─ Health check succeeds
  │    │  Server URL persisted
  │    │  Login form appears
  │    ▼
  │  User enters email + password → clicks Login
  │    │
  │    ├─ Login fails
  │    │    └─ Show error toast, stay on Login Screen
  │    │
  │    ├─ Login succeeds
  │    │    │  Tokens + email persisted
  │    │    ▼
  │    │  No mirror path stored for this server
  │    │    │
  │    │    ▼
  │    │  Mirror Setup Screen
  │    │    │  Default path pre-filled (~/Artifact)
  │    │    │
  │    │    ▼  User confirms or changes path → clicks Continue
  │    │    │
  │    │    ├─ Path invalid / not writable
  │    │    │    └─ Show error, stay on Mirror Setup
  │    │    │
  │    │    ├─ Path valid
  │    │    │    │  Mirror path persisted (keyed by server URL)
  │    │    │    ▼
  │    │    │  Project List Screen
  │    │    │    │
  │    │    │    ▼  User clicks a project card
  │    │    │  Main Workspace Screen
  │    │    │
  │    │    └─
  │    └─
  └─
```

### 4.3 Returning User Flow

```
User opens app
  │  Server URL + tokens + mirror path all stored
  │
  ▼  Validate tokens: GET /auth/me
  │
  ├─ Valid
  │    └─ → Skip login → Skip setup → Project List Screen
  │
  ├─ Expired (401)
  │    │  Attempt refresh: POST /auth/refresh
  │    ├─ Refresh succeeds
  │    │    └─ → New tokens stored → Project List Screen
  │    └─ Refresh fails
  │         └─ → Clear tokens → Login Screen
  │              (Server URL pre-filled, email pre-filled, connect auto-triggered)
  └─
```

### 4.4 Connect to Different Server Flow

```
User is on Project List or any authenticated screen
  │
  ▼  Opens Settings → changes server URL
  │
  ▼  Clears existing tokens
  │
  ▼  Calls GET <new-url>/health
  │
  ├─ Fails → show error, keep old config
  │
  ├─ Succeeds
  │    │  New server URL persisted
  │    ▼
  │  Login Screen (new server, empty email)
  │    │
  │    ▼  User logs in successfully
  │    │
  │    ├─ Mirror path already stored for this server?
  │    │    ├─ Yes → Project List Screen
  │    │    └─ No  → Mirror Setup Screen
  │    └─
  └─
```

### 4.5 Lock a File Flow

```
User right-clicks file in file tree → Lock
  │
  ▼  POST /api/v1/files/:fileId/lock
  │
  ├─ 200 Success
  │    └─ File tree node updates: green lock icon appears
  │       Preview pane header updates: "Locked by you" badge (green)
  │       Toast: "File locked"
  │
  ├─ 409 Conflict (already locked)
  │    └─ Toast error: "File is locked by <name>"
  │
  ├─ 403 Forbidden
  │    └─ Toast error: "You don't have permission to lock this file"
  │
  └─ 401 Unauthorized
       └─ Attempt token refresh → retry or redirect to login
```

### 4.6 Unlock a File Flow

```
User right-clicks locked file → Unlock
  │
  ▼  DELETE /api/v1/files/:fileId/lock
  │
  ├─ 200 Success
  │    └─ File tree node updates: lock icon removed
  │       Preview pane header updates: "Not locked" badge
  │       Toast: "File unlocked"
  │
  ├─ 403 Forbidden (not your lock)
  │    └─ Toast error: "This file is locked by <name>. You cannot unlock it."
  │
  └─ 404 Not Found (lock expired)
       └─ Refresh file tree state, toast: "Lock already expired"
```

### 4.7 Browse File Tree Flow

```
User navigates to /projects/:id
  │
  ▼  Fetch branches: GET /projects/:id/branches
  │  Fetch file tree: GET /projects/:id/files?branch=main
  │
  ▼  Render file tree (root expanded, children collapsed)
  │
  ▼  User clicks folder → toggle expand/collapse
  │  (no server call — tree data fetched in one request)
  │
  ▼  User clicks file
  │    │
  │    ▼  Fetch file metadata: GET /files/:fileId
  │    │
  │    ▼  Update preview pane header (name, version, size, lock status)
  │    │
  │    ▼  Load preview content based on file type
  │       (image: fetch blob, text: fetch content, PDF: set iframe src)
  │
  ▼  User switches branch via dropdown
  │    │
  │    ▼  Re-fetch file tree: GET /projects/:id/files?branch=<new>
  │    │  Clear preview pane (back to empty state)
  │    │  Re-render tree
  └─
```

### 4.8 Change Mirror Location Flow

```
User is on any authenticated screen
  │
  ▼  Opens Settings
  │
  ▼  Current mirror path shown: /Users/alice/Artifact
  │
  ▼  User clicks "Change" → folder picker opens
  │
  ▼  User selects new directory
  │
  ▼  Warning dialog: "Changing the mirror location will not move existing files.
  │                    The new location will be used for future syncs."
  │
  ▼  User confirms
  │    │  New path persisted to localStorage
  │    └─ Toast: "Mirror location updated"
```

---

## 5. Shared Components

### 5.1 Header

- App logo + name (left, links to `/projects`)
- Current project name + branch selector (center, only on workspace screen)
- Settings icon button (opens settings dialog/sheet)
- User email (right)
- Logout icon button (right)
- Logout calls `POST /api/v1/auth/logout`, clears tokens, redirects to `/login`

### 5.2 Server Configuration (`lib/server-config.ts`)

```
getServerUrl(): string | null
setServerUrl(url: string): void
clearServerUrl(): void
testConnection(url: string): Promise<boolean>     // calls GET /health
```

### 5.3 Mirror Configuration (`lib/mirror-config.ts`)

Mirror paths are stored per-server so a user can connect to multiple Artifact servers:

```
getMirrorPath(serverUrl: string): string | null
setMirrorPath(serverUrl: string, path: string): void
clearMirrorPath(serverUrl: string): void
getDefaultMirrorPath(): string                     // returns ~/Artifact based on OS
```

### 5.4 Auth Provider

React Context wrapping authenticated routes:

```
Provides: { user, isAuthenticated, login(), logout(), refreshAuth() }
On mount: check for stored tokens, validate via GET /auth/me
Token refresh: automatic on 401, with queue for concurrent requests
```

### 5.5 API Client (`lib/api.ts`)

Typed wrapper around fetch:

- Base URL derived from stored server config
- Auto-attaches `Authorization: Bearer <token>` header
- Handles token refresh on 401
- Returns typed responses matching server API schemas
- Exposes methods per endpoint group:
  - `auth.login()`, `auth.register()`, `auth.me()`, `auth.refresh()`, `auth.logout()`
  - `projects.list()`, `projects.get()`, `projects.create()`, `projects.update()`, `projects.delete()`
  - `branches.list()`, `branches.create()`, `branches.get()`, `branches.delete()`
  - `files.browse()`, `files.get()`, `files.download()`, `files.upload()`, `files.delete()`
  - `locks.lock()`, `locks.unlock()`, `locks.list()`
  - `workspaces.list()`, `workspaces.get()`, `workspaces.create()`, `workspaces.status()`, `workspaces.files()`
  - `commits.list()`, `commits.get()`, `commits.submit()`
  - `teams.list()`, `teams.create()`, `teams.get()`, `teams.members()`
  - `search.query()`, `search.addTag()`, `search.removeTag()`

---

## 6. State Storage

All client state is persisted in `localStorage`, keyed to support multiple server connections:

| Key                              | Location       | Purpose                                           |
|----------------------------------|----------------|---------------------------------------------------|
| `artifact_server_url`            | localStorage   | Last connected server URL                         |
| `artifact_user_email`            | localStorage   | Last login email (for prefill)                    |
| `artifact_access_token`          | localStorage   | JWT access token                                  |
| `artifact_refresh_token`         | localStorage   | JWT refresh token                                 |
| `artifact_mirror_<server_hash>`  | localStorage   | Mirror directory path, keyed per server URL       |

The `<server_hash>` is a simple hash (e.g., `btoa(url)`) of the server URL to avoid special characters in the key.

---

## 7. Styling Guidelines

### Tailwind v4 Setup

- Use Tailwind v4 CSS-first configuration (`@theme` in `app.css`)
- Define custom colors matching the Artifact brand
- Dark mode support via `@media (prefers-color-scheme: dark)` or class toggle

### Color Palette (Initial)

| Token              | Light Mode  | Dark Mode   | Usage                      |
|--------------------|-------------|-------------|----------------------------|
| `background`       | `#ffffff`   | `#0a0a0a`   | Page background            |
| `foreground`       | `#171717`   | `#fafafa`   | Primary text               |
| `muted`            | `#f5f5f5`   | `#262626`   | Subtle backgrounds         |
| `muted-foreground` | `#737373`   | `#a3a3a3`   | Secondary text             |
| `primary`          | `#2563eb`   | `#3b82f6`   | Buttons, links, accents    |
| `border`           | `#e5e5e5`   | `#262626`   | Borders                    |
| `destructive`      | `#dc2626`   | `#ef4444`   | Errors, delete actions     |
| `success`          | `#16a34a`   | `#22c55e`   | Locked-by-you status       |
| `warning`          | `#d97706`   | `#f59e0b`   | Warnings, pending changes  |

### shadcn Components to Install

Button, Input, Card, Dialog, Dropdown Menu, Toast / Sonner, Tooltip, Skeleton, Separator, Scroll Area, Context Menu, Avatar, Badge, Collapsible, Breadcrumb, Select, Sheet, Tabs

### Icon Usage (Iconoir)

Import from `iconoir-react`:

```
File, FileText, FileImage, FilePdf, FileZip, Box,
Folder, FolderOpen, Lock, LockOpen, Download, Upload,
Trash, History, Server, Settings, Search, LogOut,
ChevronRight, ChevronDown, Plus, Refresh, Eye,
XCircle, CheckCircle, WarningCircle, User, Users,
GitBranch, NavArrowLeft, Expand, Collapse, FolderSettings
```

---

## 8. Error Handling

### API Errors

| Status | Behavior                                                        |
|--------|-----------------------------------------------------------------|
| 401    | Attempt token refresh. If refresh fails → clear tokens, redirect to `/login` |
| 403    | Toast: "You don't have permission to perform this action"       |
| 409    | Show specific conflict message (e.g., "File locked by <user>")  |
| 422    | Show validation error details from response body                |
| 500    | Toast: "An unexpected error occurred"                           |
| Network error | Toast: "Unable to connect to server"                     |

### Loading States

- File tree: skeleton placeholders while loading
- Preview pane: skeleton or spinner while fetching file info
- Buttons: spinner + disabled while request is in-flight
- Page transitions: optional top progress bar

---

## 9. Responsive Behavior

| Breakpoint | Layout                                               |
|------------|-------------------------------------------------------|
| Desktop    | File tree sidebar (280px fixed) + preview (flex-1)   |
| Tablet     | File tree sidebar (240px, collapsible) + preview     |
| Mobile     | File tree as Sheet overlay, preview takes full width  |

---

## 10. Future Considerations

These are not part of the initial build but should be kept in mind:

- **Workspace management**: Create/switch workspaces within a project
- **Sync UI**: Visual diff of local vs server state, sync progress indicators
- **Upload flow**: Drag-and-drop file upload with progress bars
- **Submit flow**: Stage files into a changeset, add commit message, submit
- **Version history**: Timeline view for file or project history
- **Search**: Full-text and metadata search interface
- **Team management**: Team and member administration views
- **File diff viewer**: Side-by-side comparison for text files
- **CAD preview**: Embedded 3D viewer for STEP/STL files
- **Notifications**: Real-time lock changes and file updates via WebSocket
- **Keyboard shortcuts**: Common actions accessible via keyboard
- **Multi-server**: Switch between multiple Artifact servers without re-login
