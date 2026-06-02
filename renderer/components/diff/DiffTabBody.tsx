import type { Worktree } from "@shared/schemas";
import { DiffEditorBody } from "./DiffEditorBody";
import { FileBrowseBody } from "./FileBrowseBody";
import type { DiffStyle } from "./TabStrip";

export function DiffTabBody({
  repoId,
  diffId,
  path,
  diffStyle,
  isChanged,
  boundWorktree,
}: {
  repoId: string;
  diffId: string;
  path: string;
  diffStyle: DiffStyle;
  isChanged: boolean;
  boundWorktree: Worktree | null;
}) {
  if (!isChanged) {
    return <FileBrowseBody repoId={repoId} diffId={diffId} path={path} />;
  }
  return (
    <DiffEditorBody
      repoId={repoId}
      diffId={diffId}
      path={path}
      diffStyle={diffStyle}
      boundWorktree={boundWorktree}
    />
  );
}
