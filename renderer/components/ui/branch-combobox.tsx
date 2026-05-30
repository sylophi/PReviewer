import { useState } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronsUpDown, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { scoreMatch } from "@/lib/fuzzyMatch";
import { useRepoBranches } from "@/hooks/repos/useRepoBranches";
import type { RepoBranches } from "@shared/schemas";

interface BranchEntry {
  name: string;
  kind: "local" | "remote";
}

interface BranchComboboxProps {
  repoId: string | null;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

function toEntries(branches: RepoBranches | undefined): BranchEntry[] {
  const out: BranchEntry[] = [];
  for (const name of branches?.local ?? []) out.push({ name, kind: "local" });
  for (const name of branches?.remote ?? []) out.push({ name, kind: "remote" });
  return out;
}

export function BranchCombobox({
  repoId,
  value,
  onChange,
  placeholder,
  disabled,
  className,
}: BranchComboboxProps) {
  const { data: branches, isFetching } = useRepoBranches(repoId);
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");

  const all = toEntries(branches);
  let sorted: BranchEntry[] = all;
  if (query) {
    const scored: { b: BranchEntry; score: number }[] = [];
    for (const b of all) {
      const score = scoreMatch(query, b.name);
      if (score > 0) scored.push({ b, score });
    }
    scored.sort((a, b) => b.score - a.score);
    sorted = scored.map((x) => x.b);
  }

  const trimmedQuery = query.trim();
  const showCustom =
    trimmedQuery.length > 0 && !all.some((b) => b.name === trimmedQuery);

  return (
    <Combobox.Root
      value={value}
      onValueChange={(v) => onChange((v as string) ?? "")}
      inputValue={query}
      onInputValueChange={setQuery}
      onOpenChange={(open) => {
        if (open) {
          setQuery("");
          if (repoId) {
            void queryClient.invalidateQueries({
              queryKey: ["repoBranches", repoId],
            });
          }
        }
      }}
      disabled={disabled}
      autoHighlight
    >
      <Combobox.Trigger
        className={cn(
          "group flex w-full cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 py-2 font-mono text-sm transition-colors outline-none",
          "hover:bg-muted/40",
          "data-[popup-open]:border-ring/40 data-[popup-open]:ring-2 data-[popup-open]:ring-ring/30",
          "focus-visible:border-ring/40 focus-visible:ring-2 focus-visible:ring-ring/30",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
      >
        <span
          className={cn("flex-1 truncate text-left", !value && "text-muted-foreground/70")}
        >
          <Combobox.Value placeholder={placeholder ?? "Pick a branch…"} />
        </span>
        <ChevronsUpDown
          aria-hidden
          className="size-3.5 shrink-0 text-muted-foreground/60"
        />
      </Combobox.Trigger>
      <Combobox.Portal>
        <Combobox.Positioner
          sideOffset={4}
          side="bottom"
          align="start"
          className="z-50"
        >
          <Combobox.Popup className="flex max-h-72 w-(--anchor-width) flex-col overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md">
            <div className="flex items-center gap-2 border-b border-border px-3">
              <Search
                aria-hidden
                className="size-3.5 shrink-0 text-muted-foreground/60"
              />
              <Combobox.Input
                placeholder="Search branches…"
                className="flex-1 bg-transparent py-2 font-mono text-sm outline-none placeholder:font-sans placeholder:text-muted-foreground"
              />
              {isFetching ? (
                <Loader2
                  aria-label="Syncing branches"
                  className="size-3.5 shrink-0 animate-spin text-muted-foreground/60"
                />
              ) : null}
            </div>
            <Combobox.List className="flex-1 overflow-y-auto p-1">
              {sorted.length === 0 && !showCustom ? (
                <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                  No matching branches.
                </div>
              ) : null}
              {sorted.map((entry) => (
                <Combobox.Item
                  key={`${entry.kind}:${entry.name}`}
                  value={entry.name}
                  className="flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
                >
                  <span className="flex-1 truncate font-mono">{entry.name}</span>
                  {entry.kind === "remote" ? (
                    <span className="text-[10px] text-muted-foreground">remote</span>
                  ) : null}
                </Combobox.Item>
              ))}
              {showCustom ? (
                <Combobox.Item
                  value={trimmedQuery}
                  className="flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
                >
                  <span className="text-muted-foreground">Use as ref:</span>
                  <span className="flex-1 truncate font-mono">{trimmedQuery}</span>
                </Combobox.Item>
              ) : null}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
