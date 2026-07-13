// Editor font resolution, VS Code style: the app bundles no code font.
// The user types any installed family (or a comma-separated stack) into
// settings; empty means the platform's default monospace.
import type { GlobalConfig } from "@shared/schemas";

// ui-monospace resolves to SF Mono on macOS; the rest is the classic
// cross-platform fallback chain.
export const DEFAULT_MONO_STACK =
  'ui-monospace, "SF Mono", Menlo, Monaco, Consolas, "Courier New", monospace';

export const DEFAULT_EDITOR_FONT_SIZE = 12;
export const DEFAULT_EDITOR_FONT_WEIGHT = "400";
export const DEFAULT_EDITOR_LINE_HEIGHT = 1.5;

// The concrete font-family string for a config. A single family with
// spaces gets quoted; a comma-separated value is treated as a stack the
// user authored and passed through. The default stack is always
// appended so a typo'd family degrades to readable monospace.
export function resolveFontStack(config: GlobalConfig | undefined): string {
  const family = config?.editorFontFamily?.trim();
  if (!family) return DEFAULT_MONO_STACK;
  if (family.includes(",")) return `${family}, ${DEFAULT_MONO_STACK}`;
  const quoted = /["']/.test(family) || !family.includes(" ") ? family : `"${family}"`;
  return `${quoted}, ${DEFAULT_MONO_STACK}`;
}

// Line height is stored as a multiplier; Monaco wants pixels.
export function editorLineHeightPx(fontSize: number, multiplier: number): number {
  return Math.round(fontSize * multiplier);
}
