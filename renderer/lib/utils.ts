import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export const focusRing =
  "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40";

// Marks a region as the macOS title-bar drag handle. With
// `titleBarStyle: "hiddenInset"` the whole window is otherwise grabbable
// only by the OS chrome, so we paint a thin invisible strip at the top
// of any view that wants to be draggable.
export function dragRegion(value: "drag" | "no-drag" = "drag") {
  return { WebkitAppRegion: value } as React.CSSProperties;
}
