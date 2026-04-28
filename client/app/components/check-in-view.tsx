import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Separator } from "~/components/ui/separator";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Checkbox } from "~/components/ui/checkbox";
import type { CheckInItem } from "~/hooks/use-workspace";
import { getFileIcon, formatFileSize } from "~/lib/file-tree-utils";
import { api } from "~/lib/api";
import {
  GitCommitVertical,
  Lock,
  FilePenLine,
  Upload,
  Loader2,
  MessageSquare,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "~/lib/utils";

interface CheckInViewProps {
  projectId: string;
  branch: string;
  items: CheckInItem[];
  onCancel: () => void;
  onSuccess: () => void;
}

interface FileState {
  checked: boolean;
  message: string;
  messageOpen: boolean;
}

export function CheckInView({ projectId, branch, items, onCancel, onSuccess }: CheckInViewProps) {
  const [mainMessage, setMainMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fileStates, setFileStates] = useState<Record<string, FileState>>(() => {
    const states: Record<string, FileState> = {};
    for (const item of items) {
      states[item.id] = { checked: true, message: "", messageOpen: false };
    }
    return states;
  });

  function toggleFile(id: string) {
    setFileStates((prev) => ({
      ...prev,
      [id]: { ...prev[id], checked: !prev[id].checked },
    }));
  }

  function setFileMessage(id: string, message: string) {
    setFileStates((prev) => ({
      ...prev,
      [id]: { ...prev[id], message },
    }));
  }

  function toggleFileMessageOpen(id: string) {
    setFileStates((prev) => ({
      ...prev,
      [id]: { ...prev[id], messageOpen: !prev[id].messageOpen },
    }));
  }

  const checkedItems = items.filter((item) => fileStates[item.id]?.checked);
  const canSubmit = mainMessage.trim() && checkedItems.length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    try {
      const files = checkedItems.map((item) => ({
        file_id: item.fileId,
        path: item.path,
        action: "modify" as const,
        message: fileStates[item.id]?.message ?? "",
      }));

      await api.commits.submit(projectId, {
        branch,
        message: mainMessage.trim(),
        files,
        release_locks: true,
      });

      toast.success("Changes submitted successfully");
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit changes");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-3 border-b px-4 py-2">
        <GitCommitVertical className="size-4 shrink-0" />
        <span className="font-medium text-sm">Check In Changes</span>
        <Badge variant="secondary" className="text-xs shrink-0">
          {items.length} {items.length === 1 ? "item" : "items"}
        </Badge>
        {checkedItems.length < items.length && (
          <Badge variant="outline" className="text-xs shrink-0">
            {checkedItems.length} selected
          </Badge>
        )}
      </div>

      <Separator />

      <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
        <ScrollArea className="flex-1">
          <div className="space-y-4 p-6 max-w-2xl">
            {items.length === 0 && (
              <div className="text-center py-8 text-sm text-muted-foreground">
                No locked files to commit. Check out files first to make changes.
              </div>
            )}

            {items.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Changes ({items.length})
                  </h4>
                  <Button
                    variant="ghost"
                    size="xs"
                    type="button"
                    onClick={() => {
                      const allChecked = checkedItems.length === items.length;
                      setFileStates((prev) => {
                        const next = { ...prev };
                        for (const item of items) {
                          next[item.id] = { ...next[item.id], checked: !allChecked };
                        }
                        return next;
                      });
                    }}
                    className="text-xs"
                  >
                    {checkedItems.length === items.length ? "Deselect all" : "Select all"}
                  </Button>
                </div>
                <div className="rounded-lg border divide-y">
                  {items.map((item) => {
                    const state = fileStates[item.id] ?? { checked: true, message: "", messageOpen: false };
                    const Icon = getFileIcon(item.name);
                    return (
                      <div key={item.id}>
                        <div className="flex items-center gap-3 px-3 py-2">
                          <Checkbox
                            checked={state.checked}
                            onCheckedChange={() => toggleFile(item.id)}
                          />
                          <Icon className="size-4 text-muted-foreground shrink-0" />
                          <span className="text-sm truncate">{item.name}</span>
                          <span className="text-xs text-muted-foreground font-mono truncate hidden sm:inline">{item.path}</span>
                          <div className="ml-auto flex items-center gap-2 shrink-0">
                            {item.hasPendingUpload && (
                              <Badge variant="outline" className="text-[10px] border-blue-500 text-blue-600">
                                <Upload className="mr-0.5 size-2.5" />
                                New version
                              </Badge>
                            )}
                            <Badge variant="outline" className="text-[10px]">
                              v{item.version}
                            </Badge>
                            <Badge variant="secondary" className="text-[10px]">
                              <Lock className="mr-0.5 size-2.5" />
                              Locked
                            </Badge>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              type="button"
                              onClick={() => toggleFileMessageOpen(item.id)}
                              title="Add note"
                            >
                              <MessageSquare className={cn("size-3", state.message && "text-primary")} />
                            </Button>
                          </div>
                        </div>
                        {state.messageOpen && (
                          <div className="px-3 pb-2 pl-12">
                            <input
                              autoFocus
                              className="w-full rounded border bg-transparent px-2 py-1 text-xs outline-none focus:border-primary"
                              placeholder="Describe changes to this file..."
                              value={state.message}
                              onChange={(e) => setFileMessage(item.id, e.target.value)}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <Separator />

        <div className="p-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Commit message
            </label>
            <textarea
              className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:border-primary resize-none min-h-[80px]"
              placeholder="Describe your changes..."
              value={mainMessage}
              onChange={(e) => setMainMessage(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onCancel}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!canSubmit || isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <GitCommitVertical className="size-3.5" />
                  Submit ({checkedItems.length})
                </>
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
