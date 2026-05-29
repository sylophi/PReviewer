import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { DiffEditor, type DiffOnMount } from "@monaco-editor/react";
import { ArrowLeft, Check, FileText, Pin, PinOff, RefreshCcw, X } from "lucide-react";
import type { FileChange } from "@shared/schemas";
import { useResolvedDiff, useSetPin, useSetReviewed } from "@/hooks/diffs/useDiffs";
import { useReadFile } from "@/hooks/diffs/useReadFile";
import { useWriteFile } from "@/hooks/diffs/useWriteFile";
import { useRepos } from "@/hooks/repos/useRepos";
import { useTheme } from "@/hooks/ui/useTheme";
import { languageForPath } from "@/lib/language";
import { tildify } from "@/lib/projectPaths";
import { diffTitle, labelForRef } from "@/lib/refExpr";
import { cn, dragRegion, focusRing } from "@/lib/utils";
import { Badge } from "./ui/badge";
import { Button, buttonVariants } from "./ui/button";
import { Segmented } from "./ui/segmented";
import { Skeleton } from "./ui/skeleton";

type DiffStyle = "split" | "inline";

interface Tab {
  path: string;
  // Preview tabs get replaced when another file is opened as preview.
  preview: boolean;
}

export function DiffView() {
  const { repoId, diffId } = useParams({ from: "/repos/$repoId/diffs/$diffId" });
  const { data: repos = [] } = useRepos();
  const repo = repos.find((r) => r.id === repoId);
  const resolved = useResolvedDiff(repoId, diffId);

  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [diffStyle, setDiffStyle] = useState<DiffStyle>("split");

  // Single click opens as preview (replaces any existing preview);
  // double click or starting to edit promotes the active tab to permanent.
  const openFile = useCallback((path: string, mode: "preview" | "permanent") => {
    setTabs((prev) => {
      const existingIdx = prev.findIndex((t) => t.path === path);
      if (existingIdx >= 0) {
        if (mode === "permanent" && prev[existingIdx].preview) {
          const next = [...prev];
          next[existingIdx] = { ...next[existingIdx], preview: false };
          return next;
        }
        return prev;
      }
      if (mode === "preview") {
        const previewIdx = prev.findIndex((t) => t.preview);
        if (previewIdx >= 0) {
          const next = [...prev];
          next[previewIdx] = { path, preview: true };
          return next;
        }
      }
      return [...prev, { path, preview: mode === "preview" }];
    });
    setActivePath(path);
  }, []);

  const closeTab = useCallback(
    (path: string) => {
      setTabs((prev) => {
        const idx = prev.findIndex((t) => t.path === path);
        if (idx < 0) return prev;
        const next = prev.toSpliced(idx, 1);
        if (activePath === path) {
          const fallback = next[idx] ?? next[idx - 1] ?? null;
          setActivePath(fallback?.path ?? null);
        }
        return next;
      });
    },
    [activePath],
  );

  const diffName = resolved.data
    ? (resolved.data.diff.name ?? diffTitle(resolved.data.diff.left, resolved.data.diff.right))
    : null;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <div aria-hidden className="absolute inset-x-0 top-0 z-30 h-7" style={dragRegion("drag")} />
      <header className="flex shrink-0 flex-col gap-2 border-b border-border px-4 pt-10 pb-3">
        <div className="flex items-center gap-2">
          <Link to="/" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            <ArrowLeft />
            Diffs
          </Link>
          <span className="text-muted-foreground/60">/</span>
          <div className="min-w-0 truncate text-sm text-muted-foreground">
            {repo?.name ?? repoId}
          </div>
          <span className="text-muted-foreground/60">/</span>
          <div className="min-w-0 flex-1 truncate text-sm font-medium">{diffName ?? ""}</div>
          <div className="flex shrink-0 items-center gap-2">
            {resolved.data ? (
              <PinButton
                repoId={repoId}
                diffId={diffId}
                pinned={resolved.data.diff.pinned !== null}
              />
            ) : null}
            <Segmented
              label="Diff layout"
              value={diffStyle}
              onChange={setDiffStyle}
              options={[
                { value: "split", label: "Split" },
                { value: "inline", label: "Inline" },
              ]}
            />
          </div>
        </div>
        {resolved.data ? (
          <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground/80">
            <span className="truncate">{labelForRef(resolved.data.diff.left)}</span>
            <span className="text-muted-foreground/40">↔</span>
            <span className="truncate">{labelForRef(resolved.data.diff.right)}</span>
            {resolved.data.diff.rightWorktreePath ? (
              <span
                className="ml-auto truncate rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-300"
                title={resolved.data.diff.rightWorktreePath}
              >
                {tildify(resolved.data.diff.rightWorktreePath)}
              </span>
            ) : null}
          </div>
        ) : null}
      </header>
      <main className="flex min-h-0 flex-1">
        {resolved.isLoading ? (
          <LoadingSkeleton />
        ) : resolved.error ? (
          <ErrorState message={(resolved.error as Error).message} />
        ) : resolved.data ? (
          <>
            <FileTreePanel
              repoId={repoId}
              diffId={diffId}
              files={resolved.data.files}
              activePath={activePath}
              onClick={(p) => openFile(p, "preview")}
              onDoubleClick={(p) => openFile(p, "permanent")}
            />
            <section className="flex min-w-0 flex-1 flex-col">
              <TabStrip
                tabs={tabs}
                activePath={activePath}
                onActivate={setActivePath}
                onClose={closeTab}
                onPromote={(p) => openFile(p, "permanent")}
              />
              <div className="min-h-0 flex-1">
                {activePath ? (
                  <DiffTabBody
                    key={activePath}
                    repoId={repoId}
                    diffId={diffId}
                    path={activePath}
                    diffStyle={diffStyle}
                  />
                ) : (
                  <EmptyTabState />
                )}
              </div>
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}

function FileTreePanel({
  repoId,
  diffId,
  files,
  activePath,
  onClick,
  onDoubleClick,
}: {
  repoId: string;
  diffId: string;
  files: FileChange[];
  activePath: string | null;
  onClick: (path: string) => void;
  onDoubleClick: (path: string) => void;
}) {
  const reviewedCount = files.filter((f) => f.reviewed).length;
  const setReviewed = useSetReviewed();
  const onToggleReviewed = (path: string, next: boolean) => {
    setReviewed.mutate({ repoId, diffId, path, reviewed: next });
  };
  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-border bg-card/30">
      <div className="flex shrink-0 items-baseline justify-between gap-2 border-b border-border px-3 py-2.5">
        <div className="flex items-baseline gap-2">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground/60">
            Files
          </div>
          <div className="text-xs text-muted-foreground/60">
            {files.length} {files.length === 1 ? "file" : "files"}
          </div>
        </div>
        {files.length > 0 ? (
          <div className="tabular text-xs text-muted-foreground/70">
            {reviewedCount}/{files.length}
          </div>
        ) : null}
      </div>
      <ul className="flex-1 overflow-y-auto p-2 text-xs">
        {files.length === 0 ? (
          <li className="px-2 py-3 text-center text-muted-foreground">No changes.</li>
        ) : (
          files.map((f) => {
            const active = f.path === activePath;
            return (
              <li key={f.path} className="group">
                <div
                  className={cn(
                    "flex items-center gap-1.5 rounded-md pl-1.5 pr-2 py-1 transition-colors",
                    active
                      ? "bg-accent text-accent-foreground"
                      : "text-foreground hover:bg-muted",
                    f.reviewed && !active && "opacity-60",
                  )}
                >
                  <ReviewedCheckbox
                    checked={f.reviewed}
                    pending={setReviewed.isPending}
                    onChange={(next) => onToggleReviewed(f.path, next)}
                  />
                  <button
                    type="button"
                    onClick={() => onClick(f.path)}
                    onDoubleClick={() => onDoubleClick(f.path)}
                    className={cn(
                      "flex min-w-0 flex-1 items-center gap-2 text-left outline-none",
                      focusRing,
                    )}
                    title={f.path}
                  >
                    <Badge tone={kindTone(f.kind)} mono className="shrink-0">
                      {kindShort(f.kind)}
                    </Badge>
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate font-mono",
                        f.reviewed && "line-through decoration-muted-foreground/50",
                      )}
                    >
                      {basename(f.path)}
                    </span>
                    {f.needsReReview ? (
                      <RefreshCcw
                        className="size-3 shrink-0 text-amber-600 dark:text-amber-400"
                        aria-label="Needs re-review"
                      />
                    ) : f.additions > 0 || f.deletions > 0 ? (
                      <span className="tabular shrink-0 text-muted-foreground/70">
                        <span className="text-emerald-500">+{f.additions}</span>{" "}
                        <span className="text-rose-500">-{f.deletions}</span>
                      </span>
                    ) : null}
                  </button>
                </div>
              </li>
            );
          })
        )}
      </ul>
    </aside>
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

function TabStrip({
  tabs,
  activePath,
  onActivate,
  onClose,
  onPromote,
}: {
  tabs: Tab[];
  activePath: string | null;
  onActivate: (path: string) => void;
  onClose: (path: string) => void;
  onPromote: (path: string) => void;
}) {
  if (tabs.length === 0) {
    return (
      <div className="flex shrink-0 items-center border-b border-border bg-card/40 px-3 py-1.5 text-xs text-muted-foreground/60">
        No file open.
      </div>
    );
  }
  return (
    <div className="flex shrink-0 items-stretch overflow-x-auto border-b border-border bg-card/40">
      {tabs.map((tab) => {
        const active = tab.path === activePath;
        return (
          <div
            key={tab.path}
            className={cn(
              "group flex max-w-[260px] shrink-0 items-center gap-1.5 border-r border-border px-2.5 py-1.5 text-xs",
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
  );
}

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

function DiffTabBody({
  repoId,
  diffId,
  path,
  diffStyle,
}: {
  repoId: string;
  diffId: string;
  path: string;
  diffStyle: DiffStyle;
}) {
  const { resolved } = useTheme();
  const leftQ = useReadFile(repoId, diffId, path, "left");
  const rightQ = useReadFile(repoId, diffId, path, "right");
  const write = useWriteFile();

  // Treat the modified side as locally-owned once Monaco has it: external
  // refetches (after our own save) won't reset the user's cursor or
  // pending edits. Reset whenever the path changes (component remounts
  // via the key prop in DiffView, so this is a fresh useState on each).
  const [localRight, setLocalRight] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (localRight === null && rightQ.data !== undefined) {
      setLocalRight(rightQ.data.content ?? "");
    }
  }, [rightQ.data, localRight]);

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

  const scheduleSave = useCallback(
    (content: string) => {
      setLocalRight(content);
      setSaveState("dirty");
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        setSaveState("saving");
        write.mutate(
          { repoId, diffId, path, content },
          {
            onSuccess: () => setSaveState("saved"),
            onError: () => setSaveState("error"),
          },
        );
      }, 400);
    },
    [repoId, diffId, path, write],
  );

  const onMount: DiffOnMount = useCallback(
    (editor) => {
      const layout = () => editor.layout();
      layout();
      window.addEventListener("resize", layout);
      const modifiedEditor = editor.getModifiedEditor();
      modifiedEditor.onDidChangeModelContent(() => {
        const next = modifiedEditor.getValue();
        scheduleSave(next);
      });
    },
    [scheduleSave],
  );

  const loading = leftQ.isLoading || rightQ.isLoading;
  const error = leftQ.error || rightQ.error;
  if (error) {
    return <ErrorState message={(error as Error).message} />;
  }

  const left = leftQ.data?.content ?? "";
  const right = localRight ?? rightQ.data?.content ?? "";
  const editable = rightQ.data?.editable ?? false;
  const language = languageForPath(path);

  return (
    <div className="relative h-full w-full">
      <SaveBadge state={saveState} editable={editable} />
      {loading ? (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
          Loading…
        </div>
      ) : null}
      <DiffEditor
        original={left}
        modified={right}
        language={language}
        theme={resolved === "dark" ? "vs-dark" : "light"}
        onMount={onMount}
        options={{
          readOnly: !editable,
          renderSideBySide: diffStyle === "split",
          originalEditable: false,
          automaticLayout: true,
          fontSize: 12,
          lineHeight: 18,
          fontFamily:
            'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          wordWrap: "off",
          renderWhitespace: "none",
          guides: { indentation: false },
          diffWordWrap: "off",
        }}
      />
    </div>
  );
}

function SaveBadge({ state, editable }: { state: SaveState; editable: boolean }) {
  if (!editable) {
    return (
      <div className="absolute right-3 top-2 z-10 rounded bg-card/80 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground/70 shadow-sm ring-1 ring-border backdrop-blur-sm">
        read-only
      </div>
    );
  }
  if (state === "idle") return null;
  const label =
    state === "dirty"
      ? "unsaved"
      : state === "saving"
        ? "saving…"
        : state === "saved"
          ? "saved"
          : "save failed";
  const cls =
    state === "saved"
      ? "text-emerald-600 dark:text-emerald-400"
      : state === "error"
        ? "text-destructive"
        : "text-muted-foreground/80";
  return (
    <div
      className={cn(
        "absolute right-3 top-2 z-10 rounded bg-card/80 px-2 py-0.5 text-[10px] uppercase tracking-wide shadow-sm ring-1 ring-border backdrop-blur-sm",
        cls,
      )}
    >
      {label}
    </div>
  );
}

function EmptyTabState() {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-sm text-center">
        <h2 className="text-sm font-medium text-foreground">No file open.</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Click a file in the tree to preview it. Double-click to open as a permanent tab.
        </p>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <aside className="w-72 shrink-0 border-r border-border bg-card/30 p-3">
      <div className="flex flex-col gap-1.5">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className={cn("h-5", i % 2 ? "w-3/4" : "w-2/3")} />
        ))}
      </div>
    </aside>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="mx-auto mt-12 max-w-md rounded-2xl border border-destructive/30 bg-destructive/10 p-6">
      <div className="text-sm font-medium text-destructive">Couldn't load this diff.</div>
      <div className="mt-1.5 select-text text-xs text-destructive/80">{message}</div>
    </div>
  );
}

function PinButton({
  repoId,
  diffId,
  pinned,
}: {
  repoId: string;
  diffId: string;
  pinned: boolean;
}) {
  const setPin = useSetPin();
  return (
    <Button
      size="sm"
      variant={pinned ? "warn" : "secondary"}
      onClick={() => setPin.mutate({ repoId, diffId, pinned: !pinned })}
      disabled={setPin.isPending}
      aria-pressed={pinned}
      title={pinned ? "Pinned to these commits" : "Pin to current commits"}
    >
      {pinned ? <Pin /> : <PinOff />}
      {pinned ? "Pinned" : "Pin"}
    </Button>
  );
}

function basename(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? path : path.slice(i + 1);
}

function kindShort(kind: FileChange["kind"]): string {
  switch (kind) {
    case "added":
      return "+";
    case "deleted":
      return "−";
    case "modified":
      return "M";
    case "renamed":
      return "R";
    case "untracked":
      return "?";
    case "binary":
      return "B";
  }
}

function kindTone(
  kind: FileChange["kind"],
): "added" | "removed" | "modified" | "renamed" | "neutral" {
  switch (kind) {
    case "added":
    case "untracked":
      return "added";
    case "deleted":
      return "removed";
    case "renamed":
      return "renamed";
    case "binary":
      return "neutral";
    case "modified":
      return "modified";
  }
}
