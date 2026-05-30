// A 1px column separator with an 8px hit area, sitting between the
// file-tree aside and the editor section. The hit area extends to
// both sides via the inset overlay so the column is comfortable to
// grab without making the visible line any thicker.
export function ResizeHandle({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <div
      onMouseDown={onMouseDown}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize file tree"
      tabIndex={-1}
      className="relative w-px shrink-0 cursor-col-resize bg-border"
    >
      <div className="absolute inset-y-0 -left-1 w-2" />
    </div>
  );
}
