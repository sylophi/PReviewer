import { useCallback, useEffect, useRef, useState } from "react";
import { DiffEditor, type DiffOnMount } from "@monaco-editor/react";
import { FileWarning, RefreshCcw } from "lucide-react";
import type { FileChange, Worktree } from "@shared/schemas";
import { useEditorSettings } from "@/hooks/config/useEditorSettings";
import { useReadFile } from "@/hooks/diffs/useReadFile";
import { useReviewedSnapshot } from "@/hooks/diffs/useReviewedSnapshot";
import { useSetReviewed } from "@/hooks/diffs/useDiffs";
import { useWriteFile } from "@/hooks/diffs/useWriteFile";
import { useTheme } from "@/hooks/ui/useTheme";
import { languageForPath } from "@/lib/language";
import { cn } from "@/lib/utils";
import { ErrorState } from "./ErrorState";
import { lastSegment } from "./paths";
import type { DiffStyle } from "./TabStrip";

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

export function DiffEditorBody({
  repoId,
  diffId,
  file,
  diffStyle,
  boundWorktree,
}: {
  repoId: string;
  diffId: string;
  file: FileChange;
  diffStyle: DiffStyle;
  boundWorktree: Worktree | null;
}) {
  const { resolved } = useTheme();
  const editor = useEditorSettings();
  const path = file.path;
  // Renamed files keep their pre-rename content on the left side; the
  // new path doesn't exist at the left ref, so reading it there would
  // render the rename as a wholesale addition.
  const leftPath = file.kind === "renamed" ? file.fromPath : path;
  const leftQ = useReadFile(repoId, diffId, leftPath, "left");
  const rightQ = useReadFile(repoId, diffId, path, "right");
  const write = useWriteFile();
  const setReviewed = useSetReviewed();

  // "Since review" flips the diff's left side from the diff's base to
  // the snapshot taken when the user marked the file reviewed, so the
  // tab shows only what changed underneath them.
  const [sinceReview, setSinceReview] = useState(false);
  const snapshot = useReviewedSnapshot(repoId, diffId, path, sinceReview && file.needsReReview);
  useEffect(() => {
    // Re-marking reviewed clears needsReReview; drop back to the full
    // diff instead of comparing the file against itself.
    if (!file.needsReReview && sinceReview) setSinceReview(false);
  }, [file.needsReReview, sinceReview]);

  // Treat the modified side as locally-owned while the user has edits
  // in flight: refetches won't reset their cursor or pending changes.
  // When the buffer is clean, though, refetched content is adopted, so
  // external writers (an agent editing the working tree, a terminal
  // `git checkout`) show up instead of pinning the first cached read.
  const [localRight, setLocalRight] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const saveStateRef = useRef<SaveState>("idle");
  saveStateRef.current = saveState;
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // `editable` is sourced from the IPC read result and may flip after
  // mount. The change-content listener registered in onMount captures
  // its closure values once, so we read editability through a ref to
  // always see the latest value without re-running onMount.
  const editableRef = useRef(false);

  useEffect(() => {
    if (rightQ.data === undefined) return;
    const fetched = rightQ.data.content ?? "";
    if (localRight === null) {
      setLocalRight(fetched);
      return;
    }
    // Clean buffer + different on-disk content = an external change;
    // adopt it. Dirty/saving buffers keep local ownership so a refetch
    // racing a keystroke can't eat the user's edit.
    const clean = saveStateRef.current === "idle" || saveStateRef.current === "saved";
    if (clean && fetched !== localRight) {
      setLocalRight(fetched);
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

  // Tab display width is a text-model option, not an editor option, so
  // it's applied to both models through a ref whenever the setting (or
  // the mounted editor) changes.
  const diffEditorRef = useRef<Parameters<DiffOnMount>[0] | null>(null);
  useEffect(() => {
    const model = diffEditorRef.current?.getModel();
    model?.original.updateOptions({ tabSize: editor.tabSize });
    model?.modified.updateOptions({ tabSize: editor.tabSize });
  }, [editor.tabSize, localRight]);

  const onMount: DiffOnMount = useCallback(
    (editor) => {
      diffEditorRef.current = editor;
      const layout = () => editor.layout();
      layout();
      window.addEventListener("resize", layout);
      const modifiedEditor = editor.getModifiedEditor();
      modifiedEditor.onDidChangeModelContent((e) => {
        // Programmatic content sets (mount, prop-driven model rebuilds,
        // external refetch) arrive with `isFlush: true` and aren't user
        // edits. Read-only diffs (PR heads, frozen pins) also never
        // produce real edits; if we tried to save them the main
        // process would reject the IPC call anyway.
        if (e.isFlush) return;
        if (!editableRef.current) return;
        const next = modifiedEditor.getValue();
        scheduleSave(next);
      });
    },
    [scheduleSave],
  );

  const loading = leftQ.isLoading || rightQ.isLoading;
  const error = leftQ.error || rightQ.error;
  const editable = rightQ.data?.editable ?? false;
  // Keep the editability ref current. Must run on every render path, so
  // it sits above the error early-return below (no conditional hooks).
  useEffect(() => {
    editableRef.current = editable;
  }, [editable]);

  if (error) {
    return <ErrorState message={(error as Error).message} />;
  }

  const left = leftQ.data?.content ?? "";
  const right = localRight ?? rightQ.data?.content ?? "";

  // Binary content has no meaningful text diff. numstat flags most
  // cases (kind === "binary"); the NUL sniff catches untracked
  // binaries, which never pass through numstat.
  if (file.kind === "binary" || left.includes("\0") || right.includes("\0")) {
    return <BinaryBody file={file} />;
  }

  const snapshotMissing =
    sinceReview && snapshot.data !== undefined && snapshot.data.content === null;
  const original = sinceReview && snapshot.data?.content != null ? snapshot.data.content : left;
  const language = languageForPath(path);

  const liveWorktreeName = boundWorktree ? lastSegment(boundWorktree.path) : null;
  return (
    <div className="flex h-full w-full flex-col">
      {file.needsReReview ? (
        <ReviewDeltaBanner
          sinceReview={sinceReview}
          snapshotMissing={snapshotMissing}
          onToggle={() => setSinceReview((v) => !v)}
          onMarkReviewed={() => setReviewed.mutate({ repoId, diffId, path, reviewed: true })}
          markPending={setReviewed.isPending}
        />
      ) : null}
      <div className="relative min-h-0 w-full flex-1">
        <div className="absolute right-3 top-2 z-10">
          <SaveBadge state={saveState} editable={editable} worktreeName={liveWorktreeName} />
        </div>
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
            Loading…
          </div>
        ) : null}
        <DiffEditor
          original={original}
          modified={right}
          language={language}
          theme={resolved === "dark" ? "monokai-pro" : "pierre-light"}
          onMount={onMount}
          options={{
            readOnly: !editable,
            renderSideBySide: diffStyle === "split",
            // Without this, Monaco silently collapses split to inline when
            // the editor width drops below an internal threshold, which
            // made the Split/Unified toggle feel broken at narrow widths.
            useInlineViewWhenSpaceIsLimited: false,
            originalEditable: false,
            automaticLayout: true,
            fontSize: editor.fontSize,
            lineHeight: editor.lineHeight,
            fontFamily: editor.fontFamily,
            fontWeight: editor.fontWeight,
            fontLigatures: editor.fontLigatures,
            wordWrap: editor.wordWrap,
            diffWordWrap: editor.wordWrap,
            lineNumbers: editor.lineNumbers,
            minimap: { enabled: editor.minimap },
            renderWhitespace: editor.whitespace,
            guides: { indentation: editor.indentGuides },
            stickyScroll: { enabled: editor.stickyScroll },
            // Diff behavior
            ignoreTrimWhitespace: editor.diffIgnoreTrimWhitespace,
            hideUnchangedRegions: { enabled: editor.diffCollapseUnchanged },
            experimental: { showMoves: editor.diffShowMoves },
            // Keep the diff editor's hunk overview ruler on (the strip
            // that shows where changes live in the file and lets you
            // click to jump to them — actually useful for review). Drop
            // the per-pane decoration rulers (selection highlights,
            // search match positions), which were the redundant ones
            // next to the scrollbar.
            overviewRulerLanes: 0,
            overviewRulerBorder: false,
            scrollBeyondLastLine: false,
            // Tighten the gutter. Default reserves space for 5-digit line
            // numbers + a glyph margin + a folding column, ~70px total.
            // Folding is redundant in a diff view (Monaco already
            // collapses unchanged hunks); the glyph margin (breakpoints,
            // error markers) is unused here.
            glyphMargin: false,
            folding: false,
            lineNumbersMinChars: 3,
            lineDecorationsWidth: 4,
            // The revert-arrows gutter between the panes is authoring UI
            // (copy hunks right-to-left); in a read-mostly review surface
            // it's a dead ~40px column.
            renderGutterMenu: false,
          }}
        />
      </div>
    </div>
  );
}

// The amber "this moved underneath you" strip above the editor: a
// toggle between the full diff and `reviewed-snapshot ↔ current`, plus
// a one-click re-mark that refreshes the snapshot and clears the flag.
// A banner (not a floating overlay) so it never covers code.
function ReviewDeltaBanner({
  sinceReview,
  snapshotMissing,
  onToggle,
  onMarkReviewed,
  markPending,
}: {
  sinceReview: boolean;
  snapshotMissing: boolean;
  onToggle: () => void;
  onMarkReviewed: () => void;
  markPending: boolean;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px]">
      <RefreshCcw className="size-3 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
      <span className="font-medium text-amber-700 dark:text-amber-300">
        Changed since your review
      </span>
      {snapshotMissing ? (
        <span
          className="text-muted-foreground"
          title="The reviewed snapshot can't be recovered (it predates snapshot support or was pruned by git gc); showing the full diff."
        >
          — snapshot unavailable, showing the full diff
        </span>
      ) : null}
      <div className="flex-1" />
      <button
        type="button"
        onClick={onToggle}
        className="rounded border border-amber-500/30 px-2 py-0.5 font-medium text-foreground/80 transition-colors hover:bg-amber-500/15 hover:text-foreground"
        title={
          sinceReview
            ? "Show the full diff against the base again"
            : "Compare against the version you marked reviewed, showing only what's new"
        }
      >
        {sinceReview ? "Show full diff" : "Show what's new"}
      </button>
      <button
        type="button"
        onClick={onMarkReviewed}
        disabled={markPending}
        className="rounded border border-emerald-500/30 px-2 py-0.5 font-medium text-emerald-700 transition-colors hover:bg-emerald-500/15 dark:text-emerald-300"
        title="Mark reviewed at the current content"
      >
        Mark reviewed
      </button>
    </div>
  );
}

function BinaryBody({ file }: { file: FileChange }) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-md text-center">
        <FileWarning className="mx-auto size-6 text-muted-foreground/60" aria-hidden />
        <h2 className="mt-3 text-sm font-medium text-foreground">Binary file</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          <span className="font-mono">{file.path}</span> changed, but binary content has no text
          diff to show. You can still mark it reviewed from the file tree.
        </p>
      </div>
    </div>
  );
}

function SaveBadge({
  state,
  editable,
  worktreeName,
}: {
  state: SaveState;
  editable: boolean;
  worktreeName: string | null;
}) {
  // Read-only diffs (PR head SHAs, frozen pins) are the boring case. The
  // editable case is the one worth signaling, so the chip says "live"
  // when nothing is happening, and the user gets save-state transitions
  // when they're typing.
  if (!editable) return null;
  if (state === "idle") {
    return (
      <div
        className="inline-flex items-center gap-1.5 rounded bg-card/80 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground/70 shadow-sm ring-1 ring-border backdrop-blur-sm"
        title={
          worktreeName
            ? `Edits write to the ${worktreeName} worktree's working tree.`
            : "Edits write to the working tree."
        }
      >
        <span>live</span>
        {worktreeName ? (
          <span className="font-medium normal-case tracking-normal text-muted-foreground">
            {worktreeName}
          </span>
        ) : null}
      </div>
    );
  }
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
        "rounded bg-card/80 px-2 py-0.5 text-[10px] uppercase tracking-wide shadow-sm ring-1 ring-border backdrop-blur-sm",
        cls,
      )}
    >
      {label}
    </div>
  );
}
