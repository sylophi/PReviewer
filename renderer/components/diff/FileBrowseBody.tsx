import { useCallback, useEffect, useRef } from "react";
import { Editor, type OnMount } from "@monaco-editor/react";
import { FileQuestion } from "lucide-react";
import { useEditorSettings } from "@/hooks/config/useEditorSettings";
import { useReadFile } from "@/hooks/diffs/useReadFile";
import { useTheme } from "@/hooks/ui/useTheme";
import { languageForPath } from "@/lib/language";
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
  const editorOpts = useEditorSettings();
  const rightQ = useReadFile(repoId, diffId, path, "right");
  const leftQ = useReadFile(repoId, diffId, path, "left");

  // Tab display width is a model option; apply it through a ref.
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  useEffect(() => {
    editorRef.current?.getModel()?.updateOptions({ tabSize: editorOpts.tabSize });
  }, [editorOpts.tabSize]);

  const onMount: OnMount = useCallback(
    (editor) => {
      editorRef.current = editor;
      editor.getModel()?.updateOptions({ tabSize: editorOpts.tabSize });
      const layout = () => editor.layout();
      layout();
      window.addEventListener("resize", layout);
    },
    [editorOpts.tabSize],
  );

  const loading = rightQ.isLoading || leftQ.isLoading;
  const error = rightQ.error || leftQ.error;
  if (error) return <ErrorState message={(error as Error).message} />;

  // Prefer right; fall back to left if right is missing (e.g., file was
  // deleted between left and right).
  const content = rightQ.data?.content ?? leftQ.data?.content ?? "";

  // Neither side has the file. Usually a restored tab whose file left
  // the diff (the branch moved under a saved session), so say that
  // rather than render an empty editor labelled "unchanged".
  const settled = !loading && rightQ.data !== undefined && leftQ.data !== undefined;
  if (settled && rightQ.data.content === null && leftQ.data.content === null) {
    return <MissingFileBody path={path} />;
  }

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
          fontSize: editorOpts.fontSize,
          lineHeight: editorOpts.lineHeight,
          fontFamily: editorOpts.fontFamily,
          fontWeight: editorOpts.fontWeight,
          fontLigatures: editorOpts.fontLigatures,
          minimap: { enabled: editorOpts.minimap },
          overviewRulerLanes: 0,
          overviewRulerBorder: false,
          scrollBeyondLastLine: false,
          wordWrap: editorOpts.wordWrap,
          lineNumbers: editorOpts.lineNumbers,
          renderWhitespace: editorOpts.whitespace,
          guides: { indentation: editorOpts.indentGuides },
          stickyScroll: { enabled: editorOpts.stickyScroll },
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

// The path exists on neither side of the diff. The common way to get
// here is a session-restored tab whose file left the diff while the
// user was away (a force-push, a rebase, a reverted edit).
function MissingFileBody({ path }: { path: string }) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-md text-center">
        <FileQuestion className="mx-auto size-6 text-muted-foreground/60" aria-hidden />
        <h2 className="mt-3 text-sm font-medium text-foreground">File not in this diff</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          <span className="font-mono">{path}</span> doesn't exist on either side. It may have been
          removed since this tab was opened. Close the tab, or pick another file from the tree.
        </p>
      </div>
    </div>
  );
}
