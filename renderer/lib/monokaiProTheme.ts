// Monokai Pro-inspired TextMate theme. The palette values are part of
// the publicly-documented Monokai Pro look (drawn from screenshots and
// the editor's published color reference); the JSON below is our own
// composition mapping those colors onto TextMate scopes, so there's
// nothing license-restricted in the bundle.
//
// Loaded by monaco-setup.ts and bridged into Monaco via @shikijs/monaco.
import type { ThemeInput } from "shiki";

// Pro filter palette.
const bg = "#2D2A2E";
const fg = "#FCFCFA";
const subtle = "#403E41";
const dim = "#5B5A5D";
const muted = "#727072";
const punctuation = "#939293";

const yellow = "#FFD866"; // strings
const magenta = "#FF6188"; // keywords, tags, operators
const orange = "#FC9867"; // params, regex, escapes
const cyan = "#78DCE8"; // types
const green = "#A9DC76"; // functions, attribute names, additions
const purple = "#AB9DF2"; // numbers, constants

export const monokaiProTheme = {
  name: "monokai-pro",
  type: "dark",
  colors: {
    "editor.background": bg,
    "editor.foreground": fg,
    "editor.lineHighlightBackground": "#3E3B3F",
    "editor.lineHighlightBorder": "#00000000",
    "editor.selectionBackground": "#5B595C",
    "editor.selectionHighlightBackground": "#403E41",
    "editor.wordHighlightBackground": "#403E41",
    "editor.findMatchBackground": "#FFD86660",
    "editor.findMatchHighlightBackground": "#FFD86630",
    "editorLineNumber.foreground": dim,
    "editorLineNumber.activeForeground": fg,
    "editorCursor.foreground": yellow,
    "editorIndentGuide.background": subtle,
    "editorIndentGuide.activeBackground": dim,
    "editorBracketMatch.background": subtle,
    "editorBracketMatch.border": dim,
    "editorWhitespace.foreground": subtle,
    "editorWidget.background": "#221F22",
    "editorWidget.border": subtle,

    // Diff editor: green for inserted, magenta for removed, low alpha
    // for the line backgrounds so syntax tokens stay legible inside the
    // tinted band.
    "diffEditor.insertedTextBackground": "#A9DC7630",
    "diffEditor.removedTextBackground": "#FF618830",
    "diffEditor.insertedLineBackground": "#A9DC7615",
    "diffEditor.removedLineBackground": "#FF618815",
    "diffEditor.diagonalFill": subtle,
    "diffEditor.border": subtle,
    "diffEditorOverview.insertedForeground": green,
    "diffEditorOverview.removedForeground": magenta,

    // Overview ruler tints (the diff hunk ribbon we kept on).
    "editorOverviewRuler.border": "#00000000",
    "editorOverviewRuler.addedForeground": green,
    "editorOverviewRuler.deletedForeground": magenta,
    "editorOverviewRuler.modifiedForeground": cyan,

    "scrollbarSlider.background": "#5B595C40",
    "scrollbarSlider.hoverBackground": "#5B595C60",
    "scrollbarSlider.activeBackground": "#5B595C80",
  },
  tokenColors: [
    {
      scope: ["comment", "punctuation.definition.comment"],
      settings: { foreground: muted, fontStyle: "italic" },
    },
    {
      scope: ["string", "string.quoted", "punctuation.definition.string"],
      settings: { foreground: yellow },
    },
    {
      scope: ["constant.numeric", "constant.language", "constant.character"],
      settings: { foreground: purple },
    },
    {
      scope: [
        "keyword",
        "storage.type",
        "storage.modifier",
        "keyword.control",
        "keyword.operator.new",
        "keyword.operator.expression",
        "keyword.operator",
      ],
      settings: { foreground: magenta },
    },
    {
      scope: [
        "entity.name.function",
        "support.function",
        "meta.function-call.name",
        "meta.method-call.name",
        "entity.name.method",
      ],
      settings: { foreground: green },
    },
    {
      scope: [
        "entity.name.class",
        "entity.name.type",
        "entity.name.namespace",
        "support.class",
        "support.type",
        "support.type.primitive",
      ],
      settings: { foreground: cyan, fontStyle: "italic" },
    },
    {
      scope: [
        "variable.parameter",
        "variable.parameter.function-call",
        "meta.function.parameters variable",
      ],
      settings: { foreground: orange, fontStyle: "italic" },
    },
    {
      scope: ["variable", "meta.definition.variable", "variable.other"],
      settings: { foreground: fg },
    },
    {
      scope: ["entity.name.tag", "punctuation.definition.tag"],
      settings: { foreground: magenta },
    },
    {
      scope: ["entity.other.attribute-name"],
      settings: { foreground: green, fontStyle: "italic" },
    },
    {
      scope: ["constant.character.escape", "string.regexp"],
      settings: { foreground: orange },
    },
    {
      scope: ["punctuation"],
      settings: { foreground: punctuation },
    },
    // Markdown.
    {
      scope: "markup.heading",
      settings: { foreground: green, fontStyle: "bold" },
    },
    { scope: "markup.bold", settings: { fontStyle: "bold" } },
    { scope: "markup.italic", settings: { fontStyle: "italic" } },
    { scope: "markup.inline.raw", settings: { foreground: yellow } },
    {
      scope: "markup.underline.link",
      settings: { foreground: cyan, fontStyle: "underline" },
    },
    // JSON / YAML keys.
    {
      scope: ["support.type.property-name.json", "entity.name.tag.yaml"],
      settings: { foreground: cyan },
    },
    // Patch markup (for any .patch / .diff buffer Monaco might open).
    { scope: "markup.inserted", settings: { foreground: green } },
    { scope: "markup.deleted", settings: { foreground: magenta } },
    { scope: "markup.changed", settings: { foreground: orange } },
  ],
} as unknown as ThemeInput;
