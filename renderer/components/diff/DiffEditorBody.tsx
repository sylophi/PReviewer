import { useCallback, useEffect, useRef, useState } from "react";
import { DiffEditor, type DiffOnMount } from "@monaco-editor/react";
import type { Worktree } from "@shared/schemas";
import { useReadFile } from "@/hooks/diffs/useReadFile";
import { useWriteFile } from "@/hooks/diffs/useWriteFile";
import { useTheme } from "@/hooks/ui/useTheme";
import { languageForPath } from "@/lib/language";
import { cn } from "@/lib/utils";
import {
  PIERRE_FONT_FAMILY,
  PIERRE_FONT_SIZE,
  PIERRE_LINE_HEIGHT,
} from "@/monaco-setup";
import { ErrorState } from "./ErrorState";
import { lastSegment } from "./paths";
import type { DiffStyle } from "./TabStrip";

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

export function DiffEditorBody({
  repoId,
  diffId,
  path,
  diffStyle,
  boundWorktree,
}: {
  repoId: string;
  diffId: string;
  path: string;
  diffStyle: DiffStyle;
  boundWorktree: Worktree | null;
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

  // `editable` is sourced from the IPC read result and may flip after
  // mount. The change-content listener registered in onMount captures
  // its closure values once, so we read editability through a ref to
  // always see the latest value without re-running onMount.
  const editableRef = useRef(false);

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
  if (error) {
    return <ErrorState message={(error as Error).message} />;
  }

  const left = leftQ.data?.content ?? "";
  const right = localRight ?? rightQ.data?.content ?? "";
  const editable = rightQ.data?.editable ?? false;
  useEffect(() => {
    editableRef.current = editable;
  }, [editable]);
  const language = languageForPath(path);

  const liveWorktreeName = boundWorktree ? lastSegment(boundWorktree.path) : null;
  return (
    <div className="relative h-full w-full">
      <SaveBadge state={saveState} editable={editable} worktreeName={liveWorktreeName} />
      {loading ? (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
          Loading…
        </div>
      ) : null}
      <DiffEditor
        original={left}
        modified={right}
        language={language}
        theme={resolved === "dark" ? "pierre-dark" : "pierre-light"}
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
          fontSize: PIERRE_FONT_SIZE,
          lineHeight: PIERRE_LINE_HEIGHT,
          fontFamily: PIERRE_FONT_FAMILY,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          wordWrap: "off",
          renderWhitespace: "none",
          guides: { indentation: false },
          diffWordWrap: "off",
          // Tighten the gutter. Default reserves space for 5-digit line
          // numbers + a glyph margin + a folding column, ~70px total.
          // Folding is redundant in a diff view (Monaco already
          // collapses unchanged hunks); the glyph margin (breakpoints,
          // error markers) is unused here.
          glyphMargin: false,
          folding: false,
          lineNumbersMinChars: 3,
          lineDecorationsWidth: 4,
        }}
      />
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
        className="absolute right-3 top-2 z-10 inline-flex items-center gap-1.5 rounded bg-card/80 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground/70 shadow-sm ring-1 ring-border backdrop-blur-sm"
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
        "absolute right-3 top-2 z-10 rounded bg-card/80 px-2 py-0.5 text-[10px] uppercase tracking-wide shadow-sm ring-1 ring-border backdrop-blur-sm",
        cls,
      )}
    >
      {label}
    </div>
  );
}
