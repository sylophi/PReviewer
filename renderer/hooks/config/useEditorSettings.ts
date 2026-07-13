import type { EditorWhitespace } from "@shared/schemas";
import {
  DEFAULT_EDITOR_FONT_SIZE,
  DEFAULT_EDITOR_FONT_WEIGHT,
  DEFAULT_EDITOR_LINE_HEIGHT,
  editorLineHeightPx,
  resolveFontStack,
} from "@/lib/editorFonts";
import { useGlobalConfig } from "./useGlobalConfig";

export interface EditorSettings {
  // Font
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  lineHeight: number;
  fontLigatures: boolean;
  // Rendering
  wordWrap: "on" | "off";
  lineNumbers: "on" | "off";
  minimap: boolean;
  indentGuides: boolean;
  whitespace: EditorWhitespace;
  stickyScroll: boolean;
  tabSize: number;
  // Diff behavior
  diffIgnoreTrimWhitespace: boolean;
  diffCollapseUnchanged: boolean;
  diffShowMoves: boolean;
}

// Resolves the persisted editor prefs (or their defaults) into the
// exact option values Monaco wants. Defaults reproduce the app's
// pre-settings behavior, so an empty config renders identically to
// older builds. Used by both editor surfaces (diff + browse) and the
// settings preview so they stay in lockstep.
export function useEditorSettings(): EditorSettings {
  const { data } = useGlobalConfig();
  const fontSize = data?.editorFontSize ?? DEFAULT_EDITOR_FONT_SIZE;
  const lineHeightMultiplier = data?.editorLineHeight ?? DEFAULT_EDITOR_LINE_HEIGHT;
  return {
    fontFamily: resolveFontStack(data),
    fontSize,
    fontWeight: data?.editorFontWeight ?? DEFAULT_EDITOR_FONT_WEIGHT,
    lineHeight: editorLineHeightPx(fontSize, lineHeightMultiplier),
    fontLigatures: data?.editorLigatures ?? false,
    wordWrap: (data?.editorWordWrap ?? false) ? "on" : "off",
    lineNumbers: (data?.editorLineNumbers ?? true) ? "on" : "off",
    minimap: data?.editorMinimap ?? false,
    indentGuides: data?.editorIndentGuides ?? false,
    whitespace: data?.editorWhitespace ?? "none",
    stickyScroll: data?.editorStickyScroll ?? false,
    tabSize: data?.editorTabSize ?? 4,
    diffIgnoreTrimWhitespace: data?.diffIgnoreTrimWhitespace ?? true,
    diffCollapseUnchanged: data?.diffCollapseUnchanged ?? false,
    diffShowMoves: data?.diffShowMoves ?? false,
  };
}
