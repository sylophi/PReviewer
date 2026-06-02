import type { FileChange } from "@shared/schemas";

type Kind = FileChange["kind"];
type Tone = "added" | "removed" | "modified" | "renamed" | "neutral";

// Single-char badge label per change kind.
const SHORT: Record<Kind, string> = {
  added: "+",
  deleted: "−",
  modified: "M",
  renamed: "R",
  untracked: "?",
  binary: "B",
};

// Badge tone per change kind (untracked reads as added; binary is neutral).
const TONE: Record<Kind, Tone> = {
  added: "added",
  untracked: "added",
  deleted: "removed",
  renamed: "renamed",
  binary: "neutral",
  modified: "modified",
};

export function kindShort(kind: Kind): string {
  return SHORT[kind];
}

export function kindTone(kind: Kind): Tone {
  return TONE[kind];
}
