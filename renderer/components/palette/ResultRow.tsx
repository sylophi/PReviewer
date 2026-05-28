import { Command } from "cmdk";
import { Check, FolderGit2, Square } from "lucide-react";
import { tildify } from "@/lib/projectPaths";

function relativeFromRoot(absolute: string, root: string): string {
  const trimmedRoot = root.endsWith("/") ? root : `${root}/`;
  return absolute.startsWith(trimmedRoot) ? absolute.slice(trimmedRoot.length) : absolute;
}

interface ResultRowProps {
  path: string;
  scanRoot: string;
  isSelected: boolean;
  onToggle: () => void;
}

export function ResultRow({ path, scanRoot, isSelected, onToggle }: ResultRowProps) {
  const relative = relativeFromRoot(path, scanRoot);
  // Result == scanRoot leaves `relative` equal to the absolute path; show the
  // tildified absolute. Nested results are already short, so show the relative.
  const showAbsolute = relative === path;
  return (
    <Command.Item
      value={`result:${path}`}
      keywords={[relative]}
      onSelect={onToggle}
      className="flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm aria-selected:bg-accent aria-selected:text-accent-foreground"
    >
      {isSelected ? (
        <Check className="size-4 text-foreground" />
      ) : (
        <Square className="size-4 text-muted-foreground/60" />
      )}
      <FolderGit2 className="size-4 text-muted-foreground/80" />
      <span className="min-w-0 flex-1 truncate font-mono" title={path}>
        {showAbsolute ? tildify(path) : relative}
      </span>
    </Command.Item>
  );
}
