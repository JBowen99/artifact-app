import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Button } from "~/components/ui/button";
import type { BranchResponse } from "~/lib/api-types";
import { ChevronDown, GitBranch } from "lucide-react";

interface BranchSelectorProps {
  branches: BranchResponse[];
  selectedBranch: string;
  onSelectBranch: (name: string) => void;
}

export function BranchSelector({ branches, selectedBranch, onSelectBranch }: BranchSelectorProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs">
          <GitBranch className="size-3.5" />
          {selectedBranch || "Select branch"}
          <ChevronDown className="size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {branches.map((branch) => (
          <DropdownMenuItem
            key={branch.id}
            onClick={() => onSelectBranch(branch.name)}
            className={branch.name === selectedBranch ? "font-semibold" : ""}
          >
            {branch.name}
            {branch.is_default && (
              <span className="ml-1 text-xs text-muted-foreground">(default)</span>
            )}
          </DropdownMenuItem>
        ))}
        {branches.length === 0 && (
          <DropdownMenuItem disabled>No branches</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
