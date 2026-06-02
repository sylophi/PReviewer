import {
  DEFAULT_EDITOR_FONT,
  DEFAULT_EDITOR_FONT_SIZE,
  EDITOR_FONTS,
} from "@/lib/editorFonts";
import { useGlobalConfig } from "./useGlobalConfig";

export interface EditorSettings {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  fontLigatures: boolean;
}

// Resolves the persisted editor prefs (or their defaults) into the exact
// option values Monaco wants. Line height tracks font size at ~1.5 so
// it doesn't need its own setting. Used by both editor surfaces so they
// stay in lockstep with the settings page.
export function useEditorSettings(): EditorSettings {
  const { data } = useGlobalConfig();
  const fontId = data?.editorFont ?? DEFAULT_EDITOR_FONT;
  const fontSize = data?.editorFontSize ?? DEFAULT_EDITOR_FONT_SIZE;
  return {
    fontFamily: EDITOR_FONTS[fontId].stack,
    fontSize,
    lineHeight: Math.round(fontSize * 1.5),
    fontLigatures: data?.editorLigatures ?? false,
  };
}
