import type { FileChange, Worktree } from "@shared/schemas";
import { DiffEditorBody } from "./DiffEditorBody";
import { FileBrowseBody } from "./FileBrowseBody";
import type { DiffStyle } from "./TabStrip";

export function DiffTabBody({
  repoId,
  diffId,
  path,
  diffStyle,
  file,
  boundWorktree,
}: {
  repoId: string;
  diffId: string;
  path: string;
  diffStyle: DiffStyle;
  // The FileChange when this path is part of the diff; null for files
  // opened from the full tree (they render as a plain read-only editor).
  file: FileChange | null;
  boundWorktree: Worktree | null;
}) {
  if (!file) {
    return <FileBrowseBody repoId={repoId} diffId={diffId} path={path} />;
  }
  return (
    <DiffEditorBody
      repoId={repoId}
      diffId={diffId}
      file={file}
      diffStyle={diffStyle}
      boundWorktree={boundWorktree}
    />
  );
}
