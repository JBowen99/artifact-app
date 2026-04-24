# Artifact — Project Overview

**Artifact** is a centralized version control and asset management system designed for multidisciplinary teams working with both code and large binary files (CAD, PDFs, drawings, media). It combines the reliability of Git with a custom binary storage and workflow layer to deliver Perforce-like capabilities without proprietary dependencies.

---

# 1. Core Objectives

Artifact is built to solve the following problems:

* Efficient versioning of large binary assets
* Safe collaboration via file locking
* Simplified workflows for non-developer users
* Scalable storage and partial synchronization
* Unified handling of:

  * Code
  * CAD files
  * Documents
  * Media assets

---

# 2. Key Features

## 2.1 Hybrid Version Control Model

* Git manages:

  * Commit history
  * Branching/merging (text files)
* Artifact manages:

  * Binary assets
  * File metadata
  * Access control

Binary files are stored outside Git and referenced via pointer files.

---

## 2.2 Binary Asset Management

* Content-addressable storage (SHA-256)
* Object storage backend (S3-compatible or self-hosted)
* Deduplication across versions
* Efficient upload/download with resumable transfers

---

## 2.3 File Locking (Critical Feature)

* Exclusive locks for non-mergeable files (e.g., CAD)
* Lock states enforced server-side
* Prevents conflicting edits

Capabilities:

* Lock / unlock files manually
* Auto-lock on edit (configurable)
* Lock visibility across team
* Lock validation during commit

---

## 2.4 Workspace-Based Model

* Users work in server-tracked workspaces
* No full repository clone required
* Workspace tracks:

  * Synced files
  * File versions
  * Lock ownership

---

## 2.5 Partial Sync (Selective Checkout)

* Users fetch only required files/directories
* On-demand file retrieval
* Reduces disk usage and sync time

---

## 2.6 Commit & Submission Pipeline

When changes are submitted:

1. Binary files uploaded to object storage
2. Pointer files generated
3. Git commit created via backend
4. Changes pushed to central repository

---

## 2.7 Access Control & Permissions

* User and team-based access control
* File- and project-level permissions
* Role-based policies:

  * Admin
  * Contributor
  * Viewer

---

## 2.8 Metadata Indexing & Search

* Central database (e.g., PostgreSQL)
* Indexed attributes:

  * File type
  * Version
  * Owner
  * Tags
* Enables fast filtering and search

---

## 2.9 Large File Optimization

* Chunked uploads/downloads
* Resume support
* Streaming for large assets
* No full-history downloads

---

# 3. System Architecture

## 3.1 High-Level Components

### A. Version Control Layer

* Powered by Git
* Stores:

  * Commits
  * Branches
  * Pointer files

---

### B. Binary Storage Layer

* Object storage system
* Stores immutable binary blobs
* Addressed by content hash

---

### C. Artifact Server (Go Backend)

Central control plane responsible for:

* API endpoints
* Authentication & authorization
* File locking enforcement
* Workspace management
* Sync orchestration
* Commit coordination
* Metadata indexing

Suggested stack:

* Go (Gin/Fiber)
* PostgreSQL (metadata)
* Redis (caching/locks)
* go-git for Git operations

---

### D. Client Application

#### Primary Client: Web App

* Built with a React Router–based framework
* Provides:

  * File explorer UI
  * Lock/unlock controls
  * Version history browsing
  * Upload/download interface
  * Project/workspace management

---

## Local Mirror Workspace (Key Feature)

The client allows users to define a local mirror location on their machine:

* Users select a directory (e.g., `/Users/alice/Artifact/projectA`)
* Artifact maintains a synchronized mirror of selected repository content in that location

### Behavior

* The mirror reflects:

  * Selected files/directories (partial sync)
  * Specific versions tied to the user’s workspace
* Files behave as normal local files and are compatible with external tools
* Changes in the mirror are detected and staged for submission

---

## Sync Model

* Pull (Sync): updates local mirror with latest versions from server
* Push (Submit): uploads modified files from mirror to server

---

## Workspace Awareness

Each mirror is tied to a server-side workspace, which tracks:

* Files synced locally
* File versions
* Lock ownership
* Pending changes

---

## Lock Integration

* Locked files are clearly indicated in the UI
* Files may be set to read-only if not locked by the current user
* Lock validation occurs during submission

---

## Optional CLI Client

For automation and advanced users:

```
artifact sync
artifact lock file.step
artifact submit
artifact workspace set ~/Artifact/projectA
```

---

# 4. File Modification, Check-In / Check-Out Model

Artifact uses a **controlled check-out / check-in workflow** layered on top of Git commits, designed to behave more like centralized systems (e.g., Perforce) while still leveraging Git internally.

## 4.1 Check-Out (Edit Preparation)

Before modifying a file:

1. User selects a file in the client
2. Client requests a **lock** from the server
3. If granted:

   * File is marked as locked by the user
   * Local mirror file becomes writable
4. If denied:

   * File remains read-only
   * User can still view but not modify

This ensures **exclusive access for binary files** and avoids merge conflicts.

---

## 4.2 Local Modification

* Users edit files directly in their **local mirror directory**
* Changes are detected via:

  * File watchers or
  * Explicit client actions
* Modified files are tracked as **pending changes** in the workspace

No Git interaction occurs at this stage.

---

## 4.3 Check-In (Submit)

When a user submits changes:

1. Client validates:

   * File is locked by the user
   * File has been modified
2. Binary files are uploaded to object storage
3. New pointer files are generated
4. Server creates a **Git commit** representing the change
5. Commit is added to the central repository
6. Lock may be released (configurable)

---

## 4.4 Commit Strategy (Important Design Decision)

By default:

* **A submit operation creates one Git commit**
* A commit can include:

  * One file OR
  * Multiple files (recommended)

### Recommended behavior

* Treat commits as **logical change sets**, not individual file updates
* Example:

  * "Updated engine assembly" → one commit with multiple CAD files

### Why not per-file commits?

* Leads to noisy history
* Breaks logical grouping of changes
* Makes rollback and auditing harder

---

## 4.5 Hybrid Model (Text vs Binary)

* **Binary files**:

  * Require locking
  * No merge
  * One active editor

* **Text files (code)**:

  * No locking required
  * Standard Git merge behavior applies

Artifact supports both models simultaneously.

---

## 4.6 Workspace State Tracking

The server tracks for each workspace:

* Checked-out (locked) files
* Modified files (pending changes)
* Synced file versions

This allows:

* Accurate diff computation
* Safe submission validation
* Conflict prevention

---

## 4.7 Optional Advanced Behaviors (Future)

* Auto-checkout on edit
* Changelists (grouped pending changes before submit)
* Partial submits
* Pre-submit validation hooks

---

# 5. Data Flow Overview

## Upload Flow

1. Client uploads binary → server
2. Server stores in object storage
3. Hash generated
4. Pointer file created
5. Metadata indexed

---

## Sync Flow

1. Client requests sync
2. Server computes delta
3. Required files streamed from storage
4. Workspace updated

---

## Commit Flow

1. Validate locks
2. Upload new binaries
3. Generate pointer files
4. Create Git commit
5. Push to central repo

---

# 5. Core Design Principles

* Centralized control, distributed storage
* Binary-first architecture
* Strict server-side enforcement (locks, permissions)
* Minimal Git exposure to end users
* Scalable to large datasets (TB+)

---

# 6. Competitive Positioning

Artifact sits between:

* Developer tools like Git
* Enterprise systems like Perforce

Differentiation:

* Simpler UX for non-developers
* Open, extensible architecture
* No proprietary lock-in
* Focus on small-to-mid engineering teams

---

# 7. Future Extensions (Planned)

* CAD preview and diffing
* File version visualization
* Workflow automation (approvals, reviews)
* Cloud-hosted Artifact service
* Plugin system for industry-specific tools

---

# Bottom Line

Artifact is a unified asset and workflow platform built on proven foundations, designed to handle large files, non-mergeable assets, and collaborative engineering workflows.
