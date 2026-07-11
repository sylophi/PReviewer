// Maps the persisted editorFont id (see EditorFontSchema in
// @shared/schemas) to a concrete CSS font stack and a display label.
// Keyed by EditorFontId so the map is exhaustive at the type level: add
// a font to the schema enum and this won't compile until it's listed.
import type { EditorFontId, GlobalConfig } from "@shared/schemas";

interface EditorFont {
  label: string;
  // First entry is the intended face; the rest are fallbacks for the
  // moment the bundled @font-face is still resolving and for platforms
  // where the system face is absent.
  stack: string;
}

const MONO_FALLBACK = 'Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

export const EDITOR_FONTS: Record<EditorFontId, EditorFont> = {
  "jetbrains-mono": {
    label: "JetBrains Mono",
    // Prefer a locally-installed static JetBrains Mono over the bundled
    // variable face: the static Regular renders a touch heavier and is
    // what VS Code / Zed pick up, so users coming from those editors
    // get identical glyph weight. The bundled variable font remains the
    // guaranteed fallback.
    stack: `"JetBrains Mono", "JetBrains Mono Variable", "SF Mono", ${MONO_FALLBACK}`,
  },
  "sf-mono": {
    label: "SF Mono",
    stack: `"SF Mono", ${MONO_FALLBACK}`,
  },
  "system-mono": {
    label: "System",
    stack: `ui-monospace, SFMono-Regular, Menlo, ${MONO_FALLBACK}`,
  },
  custom: {
    label: "Custom",
    // Placeholder; resolveFontStack substitutes the user's family.
    stack: MONO_FALLBACK,
  },
};

export const DEFAULT_EDITOR_FONT: EditorFontId = "jetbrains-mono";
export const DEFAULT_EDITOR_FONT_SIZE = 12;
export const DEFAULT_EDITOR_FONT_WEIGHT = "400";
export const DEFAULT_EDITOR_LINE_HEIGHT = 1.5;

// The concrete font-family string for a config. A "custom" pick with a
// blank family falls back to the default preset rather than rendering
// in the bare fallback stack.
export function resolveFontStack(config: GlobalConfig | undefined): string {
  const id = config?.editorFont ?? DEFAULT_EDITOR_FONT;
  if (id === "custom") {
    const family = config?.editorCustomFontFamily?.trim();
    if (!family) return EDITOR_FONTS[DEFAULT_EDITOR_FONT].stack;
    // Quote the family name if it isn't already quoted and has spaces.
    const quoted = /[",']/.test(family) || !family.includes(" ") ? family : `"${family}"`;
    return `${quoted}, ${MONO_FALLBACK}`;
  }
  return EDITOR_FONTS[id].stack;
}

// Line height is stored as a multiplier; Monaco wants pixels.
export function editorLineHeightPx(fontSize: number, multiplier: number): number {
  return Math.round(fontSize * multiplier);
}
