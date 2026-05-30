import { useState } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { ChevronsUpDown, FolderGit2, Search } from "lucide-react";
import type { Worktree } from "@shared/schemas";
import { cn } from "@/lib/utils";
import { scoreMatch } from "@/lib/fuzzyMatch";
import { tildify } from "@/lib/projectPaths";

interface WorktreeComboboxProps {
  worktrees: Worktree[];
  selectedPath: string;
  onChange: (path: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

// The trigger shows the worktree as a folder name (bold) followed by its
// current branch in a smaller mono font. Items in the dropdown have a
// second line with the tildified path so the user can disambiguate
// worktrees that share a directory name.
export function WorktreeCombobox({
  worktrees,
  selectedPath,
  onChange,
  placeholder,
  disabled,
  className,
}: WorktreeComboboxProps) {
  const [query, setQuery] = useState("");

  const selected = worktrees.find((w) => w.path === selectedPath) ?? null;

  const sorted = (() => {
    if (!query) {
      // Main first by default; subsequent worktrees keep upstream order.
      const main = worktrees.find((w) => w.isMain);
      const rest = worktrees.filter((w) => !w.isMain);
      return main ? [main, ...rest] : worktrees;
    }
    const scored: { w: Worktree; score: number }[] = [];
    for (const w of worktrees) {
      const haystack = `${shortName(w)} ${w.branch ?? ""} ${tildify(w.path)}`;
      const score = scoreMatch(query, haystack);
      if (score > 0) scored.push({ w, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.map((x) => x.w);
  })();

  return (
    <Combobox.Root
      value={selectedPath}
      onValueChange={(v) => onChange((v as string) ?? "")}
      inputValue={query}
      onInputValueChange={setQuery}
      onOpenChange={(open) => {
        if (open) setQuery("");
      }}
      disabled={disabled}
      autoHighlight
    >
      <Combobox.Trigger
        className={cn(
          "group flex w-full cursor-pointer items-center gap-2.5 rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors outline-none",
          "hover:bg-muted/40",
          "data-[popup-open]:border-ring/40 data-[popup-open]:ring-2 data-[popup-open]:ring-ring/30",
          "focus-visible:border-ring/40 focus-visible:ring-2 focus-visible:ring-ring/30",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
      >
        <FolderGit2 className="size-4 shrink-0 text-muted-foreground/70" aria-hidden />
        <span className="flex min-w-0 flex-1 items-center gap-2 text-left">
          {selected ? (
            <>
              <span className="truncate font-medium">{shortName(selected)}</span>
              <span className="truncate font-mono text-xs text-muted-foreground">
                {branchLabel(selected)}
              </span>
              {selected.isMain ? (
                <span className="ml-1 shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  main
                </span>
              ) : null}
            </>
          ) : (
            <span className="text-muted-foreground/70">{placeholder ?? "Pick a worktree…"}</span>
          )}
        </span>
        <ChevronsUpDown aria-hidden className="size-3.5 shrink-0 text-muted-foreground/60" />
      </Combobox.Trigger>
      <Combobox.Portal>
        <Combobox.Positioner sideOffset={4} side="bottom" align="start" className="z-50">
          <Combobox.Popup className="flex max-h-80 w-(--anchor-width) flex-col overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md">
            <div className="flex items-center gap-2 border-b border-border px-3">
              <Search aria-hidden className="size-3.5 shrink-0 text-muted-foreground/60" />
              <Combobox.Input
                placeholder="Search worktrees…"
                className="flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <Combobox.List className="flex-1 overflow-y-auto p-1">
              {sorted.length === 0 ? (
                <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                  No matching worktrees.
                </div>
              ) : null}
              {sorted.map((w) => (
                <Combobox.Item
                  key={w.path}
                  value={w.path}
                  className="flex cursor-default items-start gap-2.5 rounded-sm px-2 py-2 text-sm data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
                >
                  <FolderGit2
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground/70"
                    aria-hidden
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-medium">{shortName(w)}</span>
                      <span className="truncate font-mono text-xs text-muted-foreground">
                        {branchLabel(w)}
                      </span>
                      {w.isMain ? (
                        <span className="ml-auto shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                          main
                        </span>
                      ) : null}
                    </div>
                    <span className="truncate font-mono text-[11px] text-muted-foreground/70">
                      {tildify(w.path)}
                    </span>
                  </div>
                </Combobox.Item>
              ))}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}

function shortName(w: Worktree): string {
  const last = w.path.split("/").filter(Boolean).pop();
  return last ?? w.path;
}

function branchLabel(w: Worktree): string {
  if (w.detached) return `detached @ ${w.head.slice(0, 7)}`;
  return w.branch ?? "detached";
}
