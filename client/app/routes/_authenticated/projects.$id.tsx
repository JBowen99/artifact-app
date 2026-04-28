import { useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router";
import { useAuth } from "~/lib/auth-context";
import { useWorkspace, CHECKIN_TAB_ID } from "~/hooks/use-workspace";
import type { FileMetadata } from "~/lib/api-types";
import { FileTree } from "~/components/file-tree";
import { WorkspaceTabs } from "~/components/workspace-tabs";
import { PreviewPane } from "~/components/preview-pane";
import { BranchSelector } from "~/components/branch-selector";
import { Button } from "~/components/ui/button";
import { Separator } from "~/components/ui/separator";
import { TooltipProvider } from "~/components/ui/tooltip";
import { Hexagon, ArrowLeft, LogOut, Loader2 } from "lucide-react";

export default function ProjectWorkspace() {
  const { id } = useParams();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const workspace = useWorkspace(id);
  const { project, isLoadingProject, openTabs, activeFileId, locks, pendingUploads } = workspace;

  const activeTab = useMemo(
    () => openTabs.find((t) => t.id === activeFileId),
    [openTabs, activeFileId],
  );

  const activeMetadata = useMemo((): FileMetadata | undefined => {
    if (!activeTab) return undefined;
    for (const nodes of workspace.treeCache.values()) {
      const found = nodes.find((n) => n.id === activeTab.id);
      if (found?.metadata) return found.metadata;
    }
    return undefined;
  }, [activeTab, workspace.treeCache]);

  const handleCancelCheckIn = useCallback(() => {
    const fileTabs = openTabs.filter((t) => t.id !== CHECKIN_TAB_ID);
    if (fileTabs.length > 0) {
      workspace.setActiveTab(fileTabs[fileTabs.length - 1].id);
    } else {
      workspace.closeTab(CHECKIN_TAB_ID);
    }
  }, [openTabs, workspace]);

  const handleCheckInSuccess = useCallback(() => {
    workspace.clearPendingUploads();
    workspace.closeTab(CHECKIN_TAB_ID);
    workspace.refreshFolder("/");
  }, [workspace]);

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  if (isLoadingProject) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const activeLockInfo = activeTab ? locks.get(activeTab.id) : undefined;
  const activeHasPendingUpload = activeTab ? pendingUploads.has(activeTab.id) : false;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-screen flex-col bg-background">
        <header className="flex items-center justify-between border-b px-4 py-2">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => navigate("/projects")}
            >
              <ArrowLeft className="size-4" />
            </Button>
            <Separator orientation="vertical" className="h-5" />
            <div className="flex items-center gap-2">
              <Hexagon className="size-4 text-primary" />
              {project && (
                <span className="font-semibold text-sm">{project.name}</span>
              )}
            </div>
            <BranchSelector
              branches={workspace.branches}
              selectedBranch={workspace.selectedBranch}
              onSelectBranch={workspace.selectBranch}
            />
          </div>

          <div className="flex items-center gap-2">
            {user?.email && (
              <span className="text-xs text-muted-foreground">{user.email}</span>
            )}
            <Button variant="ghost" size="icon-sm" onClick={handleLogout}>
              <LogOut className="size-4" />
            </Button>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
          <aside className="w-[280px] shrink-0 border-r overflow-hidden">
            <FileTree workspace={workspace} currentUserId={user?.id} />
          </aside>

          <main className="flex flex-1 flex-col overflow-hidden">
            <WorkspaceTabs
              tabs={openTabs}
              activeFileId={activeFileId}
              onSelectTab={workspace.setActiveTab}
              onCloseTab={workspace.closeTab}
            />

            <PreviewPane
              activeTab={activeTab}
              metadata={activeMetadata}
              lockInfo={activeLockInfo}
              currentUserId={user?.id}
              projectId={id ?? ""}
              branch={workspace.selectedBranch}
              checkInItems={workspace.checkInItems}
              hasPendingUpload={activeHasPendingUpload}
              onLock={workspace.lockFile}
              onUnlock={workspace.unlockFile}
              onUploadRevision={workspace.uploadRevision}
              onCheckInSuccess={handleCheckInSuccess}
              onCancelCheckIn={handleCancelCheckIn}
            />
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
