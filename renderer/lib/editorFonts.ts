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
};

export const DEFAULT_EDITOR_FONT: EditorFontId = "jetbrains-mono";
export const DEFAULT_EDITOR_FONT_SIZE = 12;

// Line height tracks font size at ~1.5 so it isn't its own setting. The
// editor surfaces and the settings preview all derive it here so they
// can't drift.
export function editorLineHeight(fontSize: number): number {
  return Math.round(fontSize * 1.5);
}
