import { FileText, X } from "lucide-react";
import { Segmented } from "../ui/segmented";
import { cn, focusRing } from "@/lib/utils";
import { basename } from "./paths";

export type DiffStyle = "split" | "inline";

export interface Tab {
  path: string;
  // Preview tabs get replaced when another file is opened as preview.
  preview: boolean;
  // Each tab carries its own diff layout, so toggling Split/Unified on
  // one file doesn't change every other open tab.
  diffStyle: DiffStyle;
}

export function TabStrip({
  tabs,
  activePath,
  onActivate,
  onClose,
  onPromote,
  onSetDiffStyle,
}: {
  tabs: Tab[];
  activePath: string | null;
  onActivate: (path: string) => void;
  onClose: (path: string) => void;
  onPromote: (path: string) => void;
  onSetDiffStyle: (path: string, next: DiffStyle) => void;
}) {
  // Nothing open: render a 32px empty strip so the layout doesn't jump.
  // (Land-on-first-unreviewed means the user almost never sees this on
  // the happy path; the strip exists to hold the border below.)
  if (tabs.length === 0) {
    return <div className="h-8 shrink-0 border-b border-border bg-card/40" />;
  }
  const activeTab = tabs.find((t) => t.path === activePath) ?? null;
  return (
    <div className="flex h-8 shrink-0 items-stretch border-b border-border bg-card/40">
      <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto">
        {tabs.map((tab) => {
          const active = tab.path === activePath;
          return (
            <div
              key={tab.path}
              className={cn(
                "group flex max-w-[260px] shrink-0 items-center gap-1.5 border-r border-border px-2.5 text-xs",
                active
                  ? "bg-background text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <button
                type="button"
                onClick={() => onActivate(tab.path)}
                onDoubleClick={() => onPromote(tab.path)}
                className={cn(
                  "flex min-w-0 items-center gap-1.5 outline-none",
                  focusRing,
                  tab.preview && "italic",
                )}
                title={tab.path}
              >
                <FileText className="size-3 shrink-0 opacity-60" />
                <span className="min-w-0 truncate font-mono">{basename(tab.path)}</span>
              </button>
              <button
                type="button"
                onClick={() => onClose(tab.path)}
                className="rounded p-0.5 opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
                title="Close tab"
                aria-label="Close tab"
              >
                <X className="size-3" />
              </button>
            </div>
          );
        })}
      </div>
      {activeTab ? (
        <div className="flex shrink-0 items-center px-2">
          <Segmented
            label="Diff layout"
            value={activeTab.diffStyle}
            onChange={(next) => onSetDiffStyle(activeTab.path, next)}
            options={[
              { value: "split", label: "Split" },
              { value: "inline", label: "Unified" },
            ]}
          />
        </div>
      ) : null}
    </div>
  );
}
