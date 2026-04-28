import { ScrollArea, ScrollBar } from "~/components/ui/scroll-area";
import { CHECKIN_TAB_ID, type FileTab } from "~/hooks/use-workspace";
import { getFileIcon } from "~/lib/file-tree-utils";
import { X, GitCommit } from "lucide-react";
import { cn } from "~/lib/utils";

interface WorkspaceTabsProps {
  tabs: FileTab[];
  activeFileId: string | null;
  onSelectTab: (fileId: string) => void;
  onCloseTab: (fileId: string) => void;
}

export function WorkspaceTabs({ tabs, activeFileId, onSelectTab, onCloseTab }: WorkspaceTabsProps) {
  if (tabs.length === 0) return null;

  return (
    <div className="border-b bg-muted/30">
      <ScrollArea className="w-full">
        <div className="flex">
          {tabs.map((tab) => {
            const isActive = tab.id === activeFileId;
            const isCheckIn = tab.id === CHECKIN_TAB_ID;
            const Icon = isCheckIn ? GitCommit : getFileIcon(tab.name);

            return (
              <button
                key={tab.id}
                onClick={() => onSelectTab(tab.id)}
                className={cn(
                  "group flex items-center gap-1.5 border-r px-3 py-1.5 text-xs whitespace-nowrap transition-colors hover:bg-muted/60",
                  isActive
                    ? "border-b-2 border-b-primary bg-background text-foreground"
                    : "text-muted-foreground",
                  isCheckIn && "bg-amber-50 dark:bg-amber-950/30",
                  isActive && isCheckIn && "bg-amber-50 dark:bg-amber-950/40 border-b-amber-600",
                )}
              >
                <Icon className={cn("size-3.5 shrink-0", isCheckIn && "text-amber-600")} />
                <span className={cn(isCheckIn && "font-medium text-amber-700 dark:text-amber-400")}>
                  {tab.name}
                </span>
                {!isCheckIn && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseTab(tab.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.stopPropagation();
                        onCloseTab(tab.id);
                      }
                    }}
                    className="ml-1 flex items-center justify-center rounded p-0.5 opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
                  >
                    <X className="size-3" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
