import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { api } from "~/lib/api";
import type { Project, FileMetadata, BranchResponse } from "~/lib/api-types";
import { buildChildNodes, type TreeNode } from "~/lib/file-tree-utils";
import { uploadFile } from "~/lib/file-upload";
import { toast } from "sonner";

export interface FileTab {
  id: string;
  name: string;
  path: string;
}

export interface CheckInItem {
  id: string;
  fileId: string;
  name: string;
  path: string;
  version: number;
  hasPendingUpload: boolean;
}

export const CHECKIN_TAB_ID = "__checkin__";

export interface LockInfo {
  lockId: string;
  fileId: string;
  userId: string;
}

export interface WorkspaceState {
  project: Project | null;
  branches: BranchResponse[];
  selectedBranch: string;
  treeCache: Map<string, TreeNode[]>;
  loadedPaths: Set<string>;
  expandedPaths: Set<string>;
  openTabs: FileTab[];
  activeFileId: string | null;
  locks: Map<string, LockInfo>;
  pendingUploads: Map<string, string>;
  isUploading: boolean;
  uploadProgress: { uploadedBytes: number; totalBytes: number } | null;
  isLoadingTree: boolean;
  isLoadingProject: boolean;
  checkInItems: CheckInItem[];
}

export interface WorkspaceActions {
  expandFolder: (path: string) => Promise<void>;
  collapseFolder: (path: string) => void;
  selectFile: (node: TreeNode) => void;
  openTab: (tab: FileTab) => void;
  closeTab: (fileId: string) => void;
  setActiveTab: (fileId: string) => void;
  selectBranch: (branchName: string) => void;
  lockFile: (fileId: string) => Promise<void>;
  unlockFile: (fileId: string) => Promise<void>;
  uploadAndCreateFile: (parentPath: string, file: File) => Promise<void>;
  createFolder: (parentPath: string, name: string) => Promise<void>;
  uploadRevision: (fileId: string, file: File) => Promise<void>;
  refreshFolder: (path: string) => Promise<void>;
  getChildren: (path: string) => TreeNode[];
  openCheckInTab: () => void;
  clearPendingUploads: () => void;
}

export type UseWorkspaceReturn = WorkspaceState & WorkspaceActions;

export function useWorkspace(projectId: string | undefined): UseWorkspaceReturn {
  const [project, setProject] = useState<Project | null>(null);
  const [branches, setBranches] = useState<BranchResponse[]>([]);
  const [selectedBranch, setSelectedBranch] = useState("");
  const [treeCache, setTreeCache] = useState<Map<string, TreeNode[]>>(new Map());
  const [loadedPaths, setLoadedPaths] = useState<Set<string>>(new Set());
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [openTabs, setOpenTabs] = useState<FileTab[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [locks, setLocks] = useState<Map<string, LockInfo>>(new Map());
  const [pendingUploads, setPendingUploads] = useState<Map<string, string>>(new Map());
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ uploadedBytes: number; totalBytes: number } | null>(null);
  const [isLoadingTree, setIsLoadingTree] = useState(false);
  const [isLoadingProject, setIsLoadingProject] = useState(true);

  const fetchLocksRef = useRef<(projectId: string) => Promise<void>>(undefined);

  const fetchLocks = useCallback(async (pid: string) => {
    try {
      const lockList = await api.locks.list(pid);
      const map = new Map<string, LockInfo>();
      for (const lock of lockList) {
        map.set(lock.file_id, {
          lockId: lock.lock_id,
          fileId: lock.file_id,
          userId: lock.user_id,
        });
      }
      setLocks(map);
    } catch {}
  }, []);
  fetchLocksRef.current = fetchLocks;

  useEffect(() => {
    if (!projectId) return;

    let cancelled = false;
    setIsLoadingProject(true);

    async function load() {
      try {
        const [proj, branchList] = await Promise.all([
          api.projects.get(projectId!),
          api.branches.list(projectId!),
        ]);
        if (cancelled) return;

        setProject(proj);
        setBranches(branchList);

        const defaultBranch = branchList.find((b) => b.is_default)?.name ?? branchList[0]?.name ?? "";
        setSelectedBranch(defaultBranch);
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : "Failed to load project");
        }
      } finally {
        if (!cancelled) setIsLoadingProject(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [projectId]);

  useEffect(() => {
    if (!projectId || !selectedBranch) return;

    let cancelled = false;
    setIsLoadingTree(true);
    setTreeCache(new Map());
    setLoadedPaths(new Set());
    setExpandedPaths(new Set());

    async function loadRoot() {
      try {
        const files = await api.files.list(projectId!, { branch: selectedBranch });
        if (cancelled) return;

        const nodes = buildChildNodes(files, "/");
        setTreeCache(new Map([["/", nodes]]));
        setLoadedPaths(new Set(["/"]));
        setExpandedPaths(new Set(["/"]));
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : "Failed to load files");
        }
      } finally {
        if (!cancelled) setIsLoadingTree(false);
      }
    }

    loadRoot();
    fetchLocksRef.current?.(projectId);
    return () => { cancelled = true; };
  }, [projectId, selectedBranch]);

  const expandFolder = useCallback(async (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      next.add(path);
      return next;
    });

    if (loadedPaths.has(path)) return;

    if (!projectId || !selectedBranch) return;

    try {
      const files = await api.files.list(projectId, { branch: selectedBranch, path });
      const nodes = buildChildNodes(files, path);
      setTreeCache((prev) => {
        const next = new Map(prev);
        next.set(path, nodes);
        return next;
      });
      setLoadedPaths((prev) => {
        const next = new Set(prev);
        next.add(path);
        return next;
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load folder");
    }
  }, [projectId, selectedBranch, loadedPaths]);

  const collapseFolder = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      next.delete(path);
      return next;
    });
  }, []);

  const openTab = useCallback((tab: FileTab) => {
    setOpenTabs((prev) => {
      if (prev.some((t) => t.id === tab.id)) return prev;
      return [...prev, tab];
    });
    setActiveFileId(tab.id);
  }, []);

  const closeTab = useCallback((fileId: string) => {
    setOpenTabs((prev) => {
      const next = prev.filter((t) => t.id !== fileId);
      return next;
    });
    setActiveFileId((prev) => {
      if (prev !== fileId) return prev;
      const currentTabs = openTabs;
      const idx = currentTabs.findIndex((t) => t.id === fileId);
      if (currentTabs.length <= 1) return null;
      const nextIdx = idx < currentTabs.length - 1 ? idx + 1 : idx - 1;
      return currentTabs[nextIdx]?.id ?? null;
    });
  }, [openTabs]);

  const selectFile = useCallback((node: TreeNode) => {
    openTab({
      id: node.id,
      name: node.name,
      path: node.path,
    });
  }, [openTab]);

  const setActiveTabAction = useCallback((fileId: string) => {
    setActiveFileId(fileId);
  }, []);

  const selectBranch = useCallback((branchName: string) => {
    setSelectedBranch(branchName);
    setOpenTabs([]);
    setActiveFileId(null);
    setPendingUploads(new Map());
  }, []);

  const lockFile = useCallback(async (fileId: string) => {
    try {
      const lock = await api.locks.lock(fileId);
      setLocks((prev) => {
        const next = new Map(prev);
        next.set(fileId, { lockId: lock.lock_id, fileId, userId: lock.user_id });
        return next;
      });
      toast.success("File locked");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to lock file");
    }
  }, []);

  const unlockFile = useCallback(async (fileId: string) => {
    try {
      await api.locks.unlock(fileId);
      setLocks((prev) => {
        const next = new Map(prev);
        next.delete(fileId);
        return next;
      });
      toast.success("File unlocked");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to unlock file");
    }
  }, []);

  const uploadAndCreateFile = useCallback(async (parentPath: string, file: File) => {
    if (!projectId || !selectedBranch) return;

    setIsUploading(true);
    setUploadProgress(null);

    try {
      const result = await uploadFile(
        projectId,
        selectedBranch,
        parentPath,
        file,
        (uploadedBytes, totalBytes) => setUploadProgress({ uploadedBytes, totalBytes }),
      );

      await lockFile(result.fileId);
      await refreshFolder(parentPath);

      const fullPath = parentPath === "/" ? "/" + file.name : parentPath + "/" + file.name;
      openTab({
        id: result.fileId,
        name: file.name,
        path: fullPath,
      });

      toast.success(`Uploaded ${file.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to upload file");
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  }, [projectId, selectedBranch, lockFile, openTab]);

  const createFolder = useCallback(async (parentPath: string, name: string) => {
    if (!projectId || !selectedBranch) return;

    const fullPath = parentPath === "/" ? "/" + name : parentPath + "/" + name;

    try {
      await api.files.createFolder(projectId, selectedBranch, fullPath);
      await refreshFolder(parentPath);
      toast.success(`Created folder ${name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create folder");
    }
  }, [projectId, selectedBranch]);

  const uploadRevision = useCallback(async (fileId: string, file: File) => {
    if (!projectId || !selectedBranch) return;

    setIsUploading(true);
    setUploadProgress(null);

    try {
      let filePath = "";
      for (const nodes of treeCache.values()) {
        const node = nodes.find((n) => n.id === fileId);
        if (node) {
          filePath = node.path;
          break;
        }
      }

      const parentPath = filePath.substring(0, filePath.lastIndexOf("/")) || "/";

      const result = await uploadFile(
        projectId,
        selectedBranch,
        parentPath,
        file,
        (uploadedBytes, totalBytes) => setUploadProgress({ uploadedBytes, totalBytes }),
      );

      setPendingUploads((prev) => {
        const next = new Map(prev);
        next.set(fileId, result.sessionId);
        return next;
      });

      toast.success(`Revision staged for ${file.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to upload revision");
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  }, [projectId, selectedBranch, treeCache]);

  const refreshFolder = useCallback(async (path: string) => {
    if (!projectId || !selectedBranch) return;
    try {
      const files = await api.files.list(projectId, { branch: selectedBranch, path });
      const nodes = buildChildNodes(files, path);
      setTreeCache((prev) => {
        const next = new Map(prev);
        next.set(path, nodes);
        return next;
      });
      setLoadedPaths((prev) => {
        const next = new Set(prev);
        next.add(path);
        return next;
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to refresh folder");
    }
  }, [projectId, selectedBranch]);

  const getChildren = useCallback((path: string): TreeNode[] => {
    return treeCache.get(path) ?? [];
  }, [treeCache]);

  const checkInItems = useMemo((): CheckInItem[] => {
    const items: CheckInItem[] = [];

    for (const [fileId, lock] of locks) {
      let name = fileId;
      let path = fileId;
      let version = 0;

      for (const nodes of treeCache.values()) {
        const node = nodes.find((n) => n.id === fileId);
        if (node) {
          name = node.name;
          path = node.path;
          if (node.metadata) version = node.metadata.version;
          break;
        }
      }

      items.push({
        id: `lock-${fileId}`,
        fileId,
        name,
        path,
        version,
        hasPendingUpload: pendingUploads.has(fileId),
      });
    }

    return items;
  }, [locks, treeCache, pendingUploads]);

  const openCheckInTab = useCallback(() => {
    const tab: FileTab = {
      id: CHECKIN_TAB_ID,
      name: "Check In",
      path: "",
    };
    setOpenTabs((prev) => {
      const filtered = prev.filter((t) => t.id !== CHECKIN_TAB_ID);
      return [...filtered, tab];
    });
    setActiveFileId(CHECKIN_TAB_ID);
  }, []);

  const clearPendingUploads = useCallback(() => {
    setPendingUploads(new Map());
  }, []);

  return {
    project,
    branches,
    selectedBranch,
    treeCache,
    loadedPaths,
    expandedPaths,
    openTabs,
    activeFileId,
    locks,
    pendingUploads,
    isUploading,
    uploadProgress,
    isLoadingTree,
    isLoadingProject,
    checkInItems,
    expandFolder,
    collapseFolder,
    selectFile,
    openTab,
    closeTab,
    setActiveTab: setActiveTabAction,
    selectBranch,
    lockFile,
    unlockFile,
    uploadAndCreateFile,
    createFolder,
    uploadRevision,
    refreshFolder,
    getChildren,
    openCheckInTab,
    clearPendingUploads,
  };
}
