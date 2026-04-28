import { useState, useCallback, useRef } from "react";
import { Collapsible, CollapsibleContent } from "~/components/ui/collapsible";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Separator } from "~/components/ui/separator";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { FileTreeNode, FileTreeContextMenuWrapper } from "~/components/file-tree-node";
import { matchesSearch, type TreeNode } from "~/lib/file-tree-utils";
import type { LockInfo, UseWorkspaceReturn } from "~/hooks/use-workspace";
import { Search, FilePlus, FolderPlus, RefreshCw, Lock, GitCommit, Loader2 } from "lucide-react";
import { cn } from "~/lib/utils";

interface FileTreeProps {
  workspace: UseWorkspaceReturn;
  currentUserId?: string;
}

export function FileTree({ workspace, currentUserId }: FileTreeProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [newItemType, setNewItemType] = useState<"file" | "folder" | null>(null);
  const [newItemName, setNewItemName] = useState("");
  const rootFileInputRef = useRef<HTMLInputElement>(null);

  const rootNodes = workspace.getChildren("/");

  const filteredNodes = searchQuery
    ? rootNodes.filter((node) => matchesSearch(node, searchQuery))
    : rootNodes;

  const lockCount = workspace.locks.size;

  const handleToggleExpand = useCallback((path: string) => {
    if (workspace.expandedPaths.has(path)) {
      workspace.collapseFolder(path);
    } else {
      workspace.expandFolder(path);
    }
  }, [workspace]);

  const handleStartCreate = useCallback((_parentPath: string, type: "file" | "folder") => {
    if (type === "file") {
      rootFileInputRef.current?.click();
    } else {
      setNewItemType("folder");
      setNewItemName("");
    }
  }, []);

  function handleRootFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      workspace.uploadAndCreateFile("/", file);
    }
    e.target.value = "";
  }

  function handleAddRootFolder(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter" || !newItemName.trim()) return;
    workspace.createFolder("/", newItemName.trim());
    setNewItemName("");
    setNewItemType(null);
  }

  function renderNode(node: TreeNode) {
    const lockInfo = node.type === "file" ? workspace.locks.get(node.id) : undefined;
    const isExpanded = workspace.expandedPaths.has(node.path);

    const nodeElement = (
      <FileTreeNode
        key={node.id}
        node={node}
        depth={0}
        activeFileId={workspace.activeFileId}
        isExpanded={isExpanded}
        isLoading={false}
        lockInfo={lockInfo}
        currentUserId={currentUserId}
        onToggleExpand={handleToggleExpand}
        onSelectFile={workspace.selectFile}
        onLock={workspace.lockFile}
        onUnlock={workspace.unlockFile}
        onUploadFile={workspace.uploadAndCreateFile}
        onCreateFolder={workspace.createFolder}
        getChildren={workspace.getChildren}
        getExpanded={(path) => workspace.expandedPaths.has(path)}
        getLockInfo={(fileId) => workspace.locks.get(fileId)}
      />
    );

    return (
      <FileTreeContextMenuWrapper
        key={node.id}
        node={node}
        lockInfo={lockInfo}
        currentUserId={currentUserId}
        onLock={workspace.lockFile}
        onUnlock={workspace.unlockFile}
        onStartCreate={handleStartCreate}
      >
        {nodeElement}
      </FileTreeContextMenuWrapper>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <input
        ref={rootFileInputRef}
        type="file"
        className="hidden"
        onChange={handleRootFilePick}
      />

      <div className="flex items-center gap-1.5 p-3">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-7 pl-7 text-xs"
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => rootFileInputRef.current?.click()}
          title="Upload file"
        >
          <FilePlus className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => {
            setNewItemType("folder");
            setNewItemName("");
          }}
          title="New folder"
        >
          <FolderPlus className="size-3.5" />
        </Button>
      </div>

      <Separator />

      <ScrollArea className="flex-1">
        <Collapsible open className="py-1">
          {filteredNodes.map(renderNode)}

          {newItemType === "folder" && (
            <div className="flex items-center gap-1 px-2 py-1" style={{ paddingLeft: "24px" }}>
              <span className="w-4 shrink-0" />
              <input
                autoFocus
                className="h-6 flex-1 rounded border border-primary/50 bg-transparent px-1 text-sm outline-none"
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                onKeyDown={handleAddRootFolder}
                onBlur={() => { setNewItemType(null); setNewItemName(""); }}
                placeholder="folder name"
              />
            </div>
          )}

          {filteredNodes.length === 0 && !newItemType && (
            <div className="px-4 py-8 text-center text-xs text-muted-foreground">
              {workspace.isLoadingTree ? "Loading..." : searchQuery ? "No files match" : "No files"}
            </div>
          )}
        </Collapsible>
      </ScrollArea>

      <Separator />

      <div className="space-y-2 p-3 text-xs text-muted-foreground">
        {workspace.isUploading && workspace.uploadProgress && (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Loader2 className="size-3 animate-spin" />
              <span>
                {Math.round((workspace.uploadProgress.uploadedBytes / workspace.uploadProgress.totalBytes) * 100)}% uploading...
              </span>
            </div>
            <div className="h-1 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${(workspace.uploadProgress.uploadedBytes / workspace.uploadProgress.totalBytes) * 100}%` }}
              />
            </div>
          </div>
        )}

        {lockCount > 0 && (
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Lock className="size-3" />
              {lockCount} locked
            </span>
          </div>
        )}
        <Button
          variant="outline"
          size="xs"
          className="w-full"
          disabled={workspace.checkInItems.length === 0}
          onClick={() => workspace.openCheckInTab()}
        >
          <GitCommit className="size-3" />
          Check In
        </Button>
        <Button
          variant="outline"
          size="xs"
          className="w-full"
          onClick={() => workspace.refreshFolder("/")}
        >
          <RefreshCw className="size-3" />
          Refresh
        </Button>
      </div>
    </div>
  );
}
