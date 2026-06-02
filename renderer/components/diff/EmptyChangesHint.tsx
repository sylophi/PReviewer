import { cn, focusRing } from "@/lib/utils";
import type { TreeMode } from "./FileTreePanel";

export function EmptyChangesHint({
  treeMode,
  onSwitchToFull,
}: {
  treeMode: TreeMode;
  onSwitchToFull: () => void;
}) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-md text-center">
        <h2 className="text-sm font-medium text-foreground">No changes between these refs.</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          The left and right resolve to the same tree, so there's nothing to review.
          {treeMode === "changed"
            ? " You can still switch to Full tree to browse the project."
            : " Pick a file from the tree on the left to browse it."}
        </p>
        {treeMode === "changed" ? (
          <button
            type="button"
            onClick={onSwitchToFull}
            className={cn(
              "mt-4 inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent outline-none",
              focusRing,
            )}
          >
            Switch to Full tree
          </button>
        ) : null}
      </div>
    </div>
  );
}
