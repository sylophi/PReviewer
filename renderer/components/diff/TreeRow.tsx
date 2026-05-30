import { Check, ChevronRight, RefreshCcw } from "lucide-react";
import { Badge } from "../ui/badge";
import { MaterialIcon } from "../ui/material-icon";
import { cn, focusRing } from "@/lib/utils";
import type { TreeFile, TreeFolder } from "./fileTree";
import { kindShort, kindTone } from "./kind";

export function TreeFolderRow({
  node,
  depth,
  collapsed,
  onToggle,
}: {
  node: TreeFolder;
  depth: number;
  collapsed: boolean;
  onToggle: (path: string) => void;
}) {
  // Slightly tighter than file rows because the folder row carries less
  // information; sits at depth*12 + 4 from the left edge so the chevron
  // lines up cleanly under its parent's name when expanded. The icon
  // resolves by the last segment of the (possibly compacted) name, so
  // chains like "src/components/ui" pick up the deepest folder's icon.
  const indent = depth * 12 + 4;
  const iconName = node.name.split("/").pop() ?? node.name;
  return (
    <button
      type="button"
      onClick={() => onToggle(node.path)}
      className={cn(
        "flex h-6 w-full items-center gap-1 rounded-md pr-2 text-left outline-none transition-colors hover:bg-muted",
        focusRing,
      )}
      style={{ paddingLeft: indent }}
      title={node.path}
    >
      <ChevronRight
        className={cn(
          "size-3 shrink-0 text-muted-foreground transition-transform",
          !collapsed && "rotate-90",
        )}
      />
      <MaterialIcon kind="folder" name={iconName} expanded={!collapsed} className="size-3.5" />
      <span className="min-w-0 truncate font-mono text-muted-foreground/90">
        {node.name}
      </span>
    </button>
  );
}

export function TreeFileRow({
  node,
  depth,
  active,
  setReviewedPending,
  onToggleReviewed,
  onClick,
  onDoubleClick,
}: {
  node: TreeFile;
  depth: number;
  active: boolean;
  setReviewedPending: boolean;
  onToggleReviewed: (path: string, next: boolean) => void;
  onClick: (path: string) => void;
  onDoubleClick: (path: string) => void;
}) {
  const file = node.file;
  // Files indent one notch deeper than the matching chevron so the
  // basename column visually anchors under the folder name above.
  const indent = depth * 12 + 6;
  return (
    <div
      className={cn(
        "group flex h-6 items-center gap-1.5 rounded-md pr-2 transition-colors",
        active ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-muted",
        file?.reviewed && !active && "opacity-60",
      )}
      style={{ paddingLeft: indent }}
    >
      {file ? (
        <ReviewedCheckbox
          checked={file.reviewed}
          pending={setReviewedPending}
          onChange={(next) => onToggleReviewed(file.path, next)}
        />
      ) : (
        <span className="size-4 shrink-0" aria-hidden />
      )}
      <button
        type="button"
        onClick={() => onClick(node.path)}
        onDoubleClick={() => onDoubleClick(node.path)}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-1.5 text-left outline-none",
          focusRing,
        )}
        title={node.path}
      >
        <MaterialIcon kind="file" name={node.name} className="size-3.5" />
        {file ? (
          <Badge tone={kindTone(file.kind)} size="sm" mono className="shrink-0">
            {kindShort(file.kind)}
          </Badge>
        ) : null}
        <span
          className={cn(
            "min-w-0 flex-1 truncate font-mono",
            file?.reviewed && "line-through decoration-muted-foreground/50",
            !file && "text-muted-foreground/80",
          )}
        >
          {node.name}
        </span>
        {file?.needsReReview ? (
          <RefreshCcw
            className="size-3 shrink-0 text-amber-600 dark:text-amber-400"
            aria-label="Needs re-review"
          />
        ) : file && (file.additions > 0 || file.deletions > 0) ? (
          <span className="tabular shrink-0 text-muted-foreground/70">
            <span className="text-emerald-500">+{file.additions}</span>{" "}
            <span className="text-rose-500">-{file.deletions}</span>
          </span>
        ) : null}
      </button>
    </div>
  );
}

function ReviewedCheckbox({
  checked,
  pending,
  onChange,
}: {
  checked: boolean;
  pending: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      disabled={pending}
      title={checked ? "Mark unreviewed" : "Mark reviewed"}
      className={cn(
        "grid size-4 shrink-0 place-items-center rounded border outline-none transition-colors",
        focusRing,
        checked
          ? "border-emerald-500/60 bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
          : "border-border bg-background/60 text-transparent hover:border-foreground/40",
      )}
    >
      <Check className="size-3" strokeWidth={3} />
    </button>
  );
}
