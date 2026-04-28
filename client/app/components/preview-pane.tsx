import { useRef } from "react";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Separator } from "~/components/ui/separator";
import { CHECKIN_TAB_ID, type FileTab, type LockInfo, type CheckInItem } from "~/hooks/use-workspace";
import { getFileIcon, formatFileSize } from "~/lib/file-tree-utils";
import type { FileMetadata } from "~/lib/api-types";
import { getServerUrl } from "~/lib/server-config";
import { getAccessToken } from "~/lib/auth";
import { CheckInView } from "~/components/check-in-view";
import { toast } from "sonner";
import {
  Download,
  Lock,
  LockOpen,
  Upload,
  FolderOpen,
  FileQuestion,
} from "lucide-react";

interface PreviewPaneProps {
  activeTab: FileTab | undefined;
  metadata: FileMetadata | undefined;
  lockInfo: LockInfo | undefined;
  currentUserId: string | undefined;
  projectId: string;
  branch: string;
  checkInItems: CheckInItem[];
  hasPendingUpload: boolean;
  onLock: (fileId: string) => void;
  onUnlock: (fileId: string) => void;
  onUploadRevision: (fileId: string, file: File) => void;
  onCheckInSuccess: () => void;
  onCancelCheckIn: () => void;
}

export function PreviewPane({
  activeTab,
  metadata,
  lockInfo,
  currentUserId,
  projectId,
  branch,
  checkInItems,
  hasPendingUpload,
  onLock,
  onUnlock,
  onUploadRevision,
  onCheckInSuccess,
  onCancelCheckIn,
}: PreviewPaneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleDownload() {
    if (!metadata) return;
    const serverUrl = getServerUrl();
    const token = getAccessToken();
    if (!serverUrl) return;

    try {
      const res = await fetch(`${serverUrl}/api/v1/files/${metadata.id}/download`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Download failed");

      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition");
      let fileName = metadata.file_name;
      if (disposition) {
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match) fileName = match[1];
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed");
    }
  }

  if (activeTab?.id === CHECKIN_TAB_ID) {
    return (
      <CheckInView
        projectId={projectId}
        branch={branch}
        items={checkInItems}
        onCancel={onCancelCheckIn}
        onSuccess={onCheckInSuccess}
      />
    );
  }

  if (!activeTab) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center space-y-3">
          <FolderOpen className="mx-auto size-12 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">Select a file to preview</p>
          <p className="text-xs text-muted-foreground/70">
            Browse the file tree on the left
          </p>
        </div>
      </div>
    );
  }

  const Icon = getFileIcon(activeTab.name);
  const isLockedByMe = lockInfo && currentUserId && lockInfo.userId === currentUserId;
  const isLockedByOther = lockInfo && currentUserId && lockInfo.userId !== currentUserId;

  function handleRevisionPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file && metadata) {
      onUploadRevision(metadata.id, file);
    }
    e.target.value = "";
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <input ref={fileInputRef} type="file" className="hidden" onChange={handleRevisionPick} />

      <div className="flex items-center gap-3 border-b px-4 py-2">
        <Icon className="size-4 shrink-0" />
        <span className="font-medium text-sm truncate">{activeTab.name}</span>

        {metadata && (
          <>
            <Badge variant="secondary" className="text-xs shrink-0">
              v{metadata.version}
            </Badge>
            <span className="text-xs text-muted-foreground shrink-0">
              {formatFileSize(metadata.size_bytes)}
            </span>
          </>
        )}

        {lockInfo && isLockedByMe && (
          <Badge variant="outline" className="text-xs border-green-600 text-green-600 shrink-0">
            <Lock className="mr-1 size-3" />
            Checked out by you
          </Badge>
        )}

        {lockInfo && isLockedByOther && (
          <Badge variant="outline" className="text-xs border-red-500 text-red-500 shrink-0">
            <Lock className="mr-1 size-3" />
            Locked by another user
          </Badge>
        )}

        {hasPendingUpload && (
          <Badge className="text-xs bg-blue-600 text-white shrink-0">
            Revision staged
          </Badge>
        )}

        <div className="ml-auto flex items-center gap-1 shrink-0">
          {metadata && (
            <Button variant="ghost" size="icon-xs" title="Download" onClick={handleDownload}>
              <Download className="size-3.5" />
            </Button>
          )}

          {metadata && !lockInfo && (
            <Button
              variant="ghost"
              size="icon-xs"
              title="Check Out (Lock)"
              onClick={() => onLock(metadata.id)}
            >
              <Lock className="size-3.5" />
            </Button>
          )}

          {lockInfo && isLockedByMe && metadata && (
            <>
              <Button
                variant="ghost"
                size="icon-xs"
                title="Upload new version"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                title="Unlock"
                onClick={() => onUnlock(metadata.id)}
              >
                <LockOpen className="size-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>

      <Separator />

      <div className="flex flex-1 items-center justify-center p-8">
        <div className="text-center space-y-4 max-w-md">
          <FileQuestion className="mx-auto size-16 text-muted-foreground/40" />
          <div className="space-y-1">
            <h3 className="text-sm font-medium">
              Preview for {metadata?.file_type ?? "this file type"}
            </h3>
            <p className="text-xs text-muted-foreground">
              File preview will be available in a future update.
            </p>
          </div>

          {metadata && (
            <div className="text-left text-xs space-y-1.5 bg-muted/50 rounded-lg p-4">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Path</span>
                <span className="font-mono">{metadata.path}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Type</span>
                <span>{metadata.file_type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Size</span>
                <span>{formatFileSize(metadata.size_bytes)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Version</span>
                <span>v{metadata.version}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Binary</span>
                <span>{metadata.is_binary ? "Yes" : "No"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Updated</span>
                <span>{new Date(metadata.updated_at).toLocaleString()}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
