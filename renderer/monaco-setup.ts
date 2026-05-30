// Bootstraps Monaco: wires its worker URLs, then replaces its built-in
// monarch tokenizer with Shiki's TextMate grammar engine so files are
// colored using @pierre/theme directly (the same grammars + theme json
// that diffs.com uses). Monaco's stock monarch tokenizer is much coarser
// than TextMate, so mapping its tokens by hand never matches Pierre's
// look; the Shiki bridge is the only way to get parity.
//
// Side-effect imported once at module-evaluation time before the React
// app mounts (see index.tsx). Uses top-level await so the highlighter
// finishes loading before any DiffEditor mounts.
import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
import { shikiToMonaco } from "@shikijs/monaco";
import { createHighlighter, type ThemeInput } from "shiki";
import pierreLightJson from "@pierre/theme/themes/pierre-light.json";
import { monokaiProTheme } from "./lib/monokaiProTheme";

self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    switch (label) {
      case "json":
        return new jsonWorker();
      case "css":
      case "scss":
      case "less":
        return new cssWorker();
      case "html":
      case "handlebars":
      case "razor":
        return new htmlWorker();
      case "typescript":
      case "javascript":
        return new tsWorker();
      default:
        return new editorWorker();
    }
  },
};

// Shiki language ids we want Pierre to color. Loaded eagerly so the
// highlighter is ready before any editor mounts (the alternative is
// lazy-loading per file which produces a brief flash of unstyled text
// every time the user opens a different language).
const SHIKI_LANGS = [
  "typescript",
  "tsx",
  "javascript",
  "jsx",
  "json",
  "markdown",
  "html",
  "css",
  "scss",
  "less",
  "yaml",
  "toml",
  "ini",
  "python",
  "rust",
  "go",
  "java",
  "kotlin",
  "swift",
  "shellscript",
  "sql",
  "graphql",
  "ruby",
  "php",
  "csharp",
  "cpp",
  "c",
  "lua",
  "docker",
] as const;

// shikiToMonaco only installs token providers for languages Monaco
// already knows. The TS/JS/JSON/CSS/HTML languages come in via the
// worker bundles above, but the rest we register here so Shiki has a
// monaco language to attach to.
for (const lang of SHIKI_LANGS) {
  monaco.languages.register({ id: lang });
}

// Dark theme is Monokai Pro (hand-rolled in ./lib/monokaiProTheme).
// Light theme stays Pierre Light. Cast through `unknown` because the
// Pierre JSON uses VS Code's `tokenColors` field while shiki's strict
// types want a `settings` array (shiki's runtime accepts both forms
// but the type doesn't reflect that).
const pierreLight = {
  ...(pierreLightJson as unknown as ThemeInput),
  name: "pierre-light",
} as ThemeInput;

const highlighter = await createHighlighter({
  themes: [monokaiProTheme, pierreLight],
  langs: [...SHIKI_LANGS],
});

shikiToMonaco(highlighter, monaco);

// Tell @monaco-editor/react to use our bundled Monaco instead of the
// default CDN load. This keeps the app fully offline.
loader.config({ monaco });

// Font + size from @pierre/diffs' published stylesheet (:host fallbacks
// for --diffs-font, --diffs-font-size, --diffs-line-height). Exported
// from here so consumers don't import a separate file purely for these.
export const PIERRE_FONT_FAMILY =
  '"SF Mono", Monaco, Consolas, "Ubuntu Mono", "Liberation Mono", "Courier New", monospace';
export const PIERRE_FONT_SIZE = 12;
export const PIERRE_LINE_HEIGHT = 18;
