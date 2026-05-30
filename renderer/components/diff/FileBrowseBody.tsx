import { useCallback } from "react";
import { Editor, type OnMount } from "@monaco-editor/react";
import { useReadFile } from "@/hooks/diffs/useReadFile";
import { useTheme } from "@/hooks/ui/useTheme";
import { languageForPath } from "@/lib/language";
import {
  PIERRE_FONT_FAMILY,
  PIERRE_FONT_SIZE,
  PIERRE_LINE_HEIGHT,
} from "@/monaco-setup";
import { ErrorState } from "./ErrorState";

// Single-pane editor used when the user opens a file from the Full tree
// that isn't part of the diff. Shows the right-side content (or the
// left side if the file no longer exists on the right). Read-only; this
// surface is for tracing symbols, not authoring.
export function FileBrowseBody({
  repoId,
  diffId,
  path,
}: {
  repoId: string;
  diffId: string;
  path: string;
}) {
  const { resolved } = useTheme();
  const rightQ = useReadFile(repoId, diffId, path, "right");
  const leftQ = useReadFile(repoId, diffId, path, "left");

  const onMount: OnMount = useCallback((editor) => {
    const layout = () => editor.layout();
    layout();
    window.addEventListener("resize", layout);
  }, []);

  const loading = rightQ.isLoading || leftQ.isLoading;
  const error = rightQ.error || leftQ.error;
  if (error) return <ErrorState message={(error as Error).message} />;

  // Prefer right; fall back to left if right is missing (e.g., file was
  // deleted between left and right).
  const content = rightQ.data?.content ?? leftQ.data?.content ?? "";

  return (
    <div className="relative h-full w-full">
      <div className="absolute right-3 top-2 z-10 rounded bg-card/80 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground/70 shadow-sm ring-1 ring-border backdrop-blur-sm">
        unchanged
      </div>
      {loading ? (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
          Loading…
        </div>
      ) : null}
      <Editor
        value={content}
        language={languageForPath(path)}
        theme={resolved === "dark" ? "monokai-pro" : "pierre-light"}
        onMount={onMount}
        options={{
          readOnly: true,
          automaticLayout: true,
          fontSize: PIERRE_FONT_SIZE,
          lineHeight: PIERRE_LINE_HEIGHT,
          fontFamily: PIERRE_FONT_FAMILY,
          minimap: { enabled: false },
          overviewRulerLanes: 0,
          overviewRulerBorder: false,
          scrollBeyondLastLine: false,
          wordWrap: "off",
          renderWhitespace: "none",
          guides: { indentation: false },
          // Match DiffEditorBody's trimmed gutter so the two editor
          // surfaces line up when the user switches between changed and
          // unchanged files in the same tab area.
          glyphMargin: false,
          folding: false,
          lineNumbersMinChars: 3,
          lineDecorationsWidth: 4,
        }}
      />
    </div>
  );
}
