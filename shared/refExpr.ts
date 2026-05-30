import type { RefExpr } from "./schemas";

export function labelForRef(ref: RefExpr): string {
  switch (ref.kind) {
    case "branch":
      return ref.name;
    case "commit":
      return ref.hash.slice(0, 7);
    case "head":
      return "HEAD";
    case "workingTree":
      return "working tree";
    case "mergeBase":
      return `merge-base(${labelForRef(ref.a)}, ${labelForRef(ref.b)})`;
  }
}

export function diffTitle(left: RefExpr, right: RefExpr): string {
  return `${labelForRef(left)} ↔ ${labelForRef(right)}`;
}
