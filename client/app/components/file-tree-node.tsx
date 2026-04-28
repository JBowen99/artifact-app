import { useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "~/components/ui/collapsible";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "~/components/ui/context-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { getFileIcon, type TreeNode } from "~/lib/file-tree-utils";
import type { LockInfo } from "~/hooks/use-workspace";
import { cn } from "~/lib/utils";
import {
  ChevronRight,
  Folder,
  FolderOpen,
  Lock,
  Download,
  Loader2,
} from "lucide-react";

interface FileTreeNodeProps {
  node: TreeNode;
  depth: number;
  activeFileId: string | null;
  isExpanded: boolean;
  isLoading: boolean;
  lockInfo: LockInfo | undefined;
  currentUserId: string | undefined;
  onToggleExpand: (path: string) => void;
  onSelectFile: (node: TreeNode) => void;
  onLock: (fileId: string) => void;
  onUnlock: (fileId: string) => void;
  onUploadFile: (parentPath: string, file: File) => void;
  onCreateFolder: (parentPath: string, name: string) => void;
  getChildren: (path: string) => TreeNode[];
  getExpanded: (path: string) => boolean;
  getLockInfo: (fileId: string) => LockInfo | undefined;
}

export function FileTreeNode({
  node,
  depth,
  activeFileId,
  isExpanded,
  isLoading,
  lockInfo,
  currentUserId,
  onToggleExpand,
  onSelectFile,
  onLock,
  onUnlock,
  onUploadFile,
  onCreateFolder,
  getChildren,
  getExpanded,
  getLockInfo,
}: FileTreeNodeProps) {
  const [newItemType, setNewItemType] = useState<"file" | "folder" | null>(null);
  const [newItemName, setNewItemName] = useState("");

  const isActive = node.type === "file" && node.id === activeFileId;
  const isFolder = node.type === "folder";
  const isLockedByMe = lockInfo && currentUserId && lockInfo.userId === currentUserId;
  const isLockedByOther = lockInfo && currentUserId && lockInfo.userId !== currentUserId;

  const Icon = isFolder
    ? (isExpanded ? FolderOpen : Folder)
    : getFileIcon(node.name);

  function handleAddItem(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter" || !newItemName.trim()) return;
    if (newItemType === "folder") {
      onCreateFolder(node.path, newItemName.trim());
    }
    setNewItemName("");
    setNewItemType(null);
  }

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      onUploadFile(node.path, file);
    }
    e.target.value = "";
  }

  const children = isFolder && isExpanded ? getChildren(node.path) : [];

  return (
    <>
      <div
        className={cn(
          "group flex items-center gap-1 rounded-sm px-2 py-1 text-sm hover:bg-muted/50 cursor-pointer",
          isActive && "bg-primary/10 text-primary",
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => {
          if (isFolder) {
            onToggleExpand(node.path);
          } else {
            onSelectFile(node);
          }
        }}
      >
        {isFolder && (
          <CollapsibleTrigger asChild>
            <button className="flex items-center justify-center size-4 shrink-0">
              {isLoading ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <ChevronRight
                  className={cn(
                    "size-3.5 transition-transform",
                    isExpanded && "rotate-90",
                  )}
                />
              )}
            </button>
          </CollapsibleTrigger>
        )}

        {!isFolder && <span className="w-4 shrink-0" />}

        <span className="relative shrink-0">
          <Icon className="size-4" />
          {lockInfo && !isFolder && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Lock
                  className={cn(
                    "absolute -bottom-1 -right-1 size-2.5",
                    isLockedByMe && "text-green-600",
                    isLockedByOther && "text-red-500",
                  )}
                />
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">
                {isLockedByMe ? "Locked by you" : isLockedByOther ? `Locked by ${lockInfo.userId}` : "Locked"}
              </TooltipContent>
            </Tooltip>
          )}
        </span>

        <span className="truncate min-w-0">{node.name}</span>
      </div>

      {isFolder && newItemType === "file" && (
        <div
          className="flex items-center gap-1 px-2 py-1"
          style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
        >
          <span className="w-4 shrink-0" />
          <label className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
            Pick file...
            <input type="file" className="hidden" onChange={handleFilePick} />
          </label>
        </div>
      )}

      {isFolder && newItemType === "folder" && (
        <div
          className="flex items-center gap-1 px-2 py-1"
          style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
        >
          <span className="w-4 shrink-0" />
          <Folder className="size-4 text-muted-foreground" />
          <input
            autoFocus
            className="h-6 flex-1 rounded border border-primary/50 bg-transparent px-1 text-sm outline-none"
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            onKeyDown={handleAddItem}
            onBlur={() => { setNewItemType(null); setNewItemName(""); }}
            placeholder="folder name"
          />
        </div>
      )}

      {isFolder && (
        <CollapsibleContent>
          {children.map((child) => (
            <FileTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              activeFileId={activeFileId}
              isExpanded={getExpanded(child.path)}
              isLoading={false}
              lockInfo={child.type === "file" ? getLockInfo(child.id) : undefined}
              currentUserId={currentUserId}
              onToggleExpand={onToggleExpand}
              onSelectFile={onSelectFile}
              onLock={onLock}
              onUnlock={onUnlock}
              onUploadFile={onUploadFile}
              onCreateFolder={onCreateFolder}
              getChildren={getChildren}
              getExpanded={getExpanded}
              getLockInfo={getLockInfo}
            />
          ))}
          {children.length === 0 && !newItemType && isExpanded && (
            <div
              className="px-2 py-1 text-xs text-muted-foreground italic"
              style={{ paddingLeft: `${(depth + 1) * 16 + 28}px` }}
            >
              Empty folder
            </div>
          )}
        </CollapsibleContent>
      )}
    </>
  );
}

interface FileTreeContextMenuWrapperProps {
  node: TreeNode;
  children: React.ReactNode;
  lockInfo: LockInfo | undefined;
  currentUserId: string | undefined;
  onLock: (fileId: string) => void;
  onUnlock: (fileId: string) => void;
  onStartCreate: (parentPath: string, type: "file" | "folder") => void;
}

export function FileTreeContextMenuWrapper({
  node,
  children,
  lockInfo,
  currentUserId,
  onLock,
  onUnlock,
  onStartCreate,
}: FileTreeContextMenuWrapperProps) {
  const isFolder = node.type === "folder";
  const isFile = node.type === "file";
  const isLockedByMe = lockInfo && currentUserId && lockInfo.userId === currentUserId;
  const isLockedByOther = lockInfo && currentUserId && lockInfo.userId !== currentUserId;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        {isFile && !lockInfo && (
          <ContextMenuItem onClick={() => onLock(node.id)}>
            <Lock className="mr-2 size-4" />
            Check Out (Lock)
          </ContextMenuItem>
        )}
        {isFile && isLockedByMe && (
          <ContextMenuItem onClick={() => onUnlock(node.id)}>
            <Lock className="mr-2 size-4 text-green-600" />
            Check In (Unlock)
          </ContextMenuItem>
        )}
        {isFile && isLockedByOther && (
          <ContextMenuItem disabled>
            <Lock className="mr-2 size-4 text-red-500" />
            Locked by another user
          </ContextMenuItem>
        )}

        {isFile && <ContextMenuSeparator />}

        {isFolder && (
          <>
            <ContextMenuItem onClick={() => onStartCreate(node.path, "file")}>
              Upload File Here
            </ContextMenuItem>
            <ContextMenuItem onClick={() => onStartCreate(node.path, "folder")}>
              New Folder
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}

        {isFile && (
          <ContextMenuItem>
            <Download className="mr-2 size-4" />
            Download
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
