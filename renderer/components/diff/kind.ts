import type { FileChange } from "@shared/schemas";

export function kindShort(kind: FileChange["kind"]): string {
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

export function kindTone(
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
