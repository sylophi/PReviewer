// Maps the persisted editorFont id (see EditorFontSchema in
// @shared/schemas) to a concrete CSS font stack and a display label.
// Keyed by EditorFontId so the map is exhaustive at the type level: add
// a font to the schema enum and this won't compile until it's listed.
import type { EditorFontId } from "@shared/schemas";

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
    stack: `"JetBrains Mono Variable", "SF Mono", ${MONO_FALLBACK}`,
  },
  "sf-mono": {
    label: "SF Mono",
    stack: `"SF Mono", ${MONO_FALLBACK}`,
  },
  "system-mono": {
    label: "System",
    stack: `ui-monospace, SFMono-Regular, Menlo, ${MONO_FALLBACK}`,
  },
};

export const DEFAULT_EDITOR_FONT: EditorFontId = "jetbrains-mono";
export const DEFAULT_EDITOR_FONT_SIZE = 12;
