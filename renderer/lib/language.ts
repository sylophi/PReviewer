// Maps file extension to a Shiki language id (which is also the Monaco
// language id, since monaco-setup.ts registers them under the same
// name). Unknown extensions render as plaintext. The id `tsx` is
// distinct from `typescript` so Pierre's JSX-aware grammar fires on
// .tsx files; same for `jsx` vs `javascript`.
const MAP: Record<string, string> = {
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "tsx",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "jsx",
  json: "json",
  jsonc: "json",
  md: "markdown",
  mdx: "markdown",
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  less: "less",
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
  ini: "ini",
  py: "python",
  rs: "rust",
  go: "go",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  sh: "shellscript",
  bash: "shellscript",
  zsh: "shellscript",
  sql: "sql",
  graphql: "graphql",
  gql: "graphql",
  rb: "ruby",
  php: "php",
  cs: "csharp",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  h: "cpp",
  c: "c",
  lua: "lua",
  dockerfile: "docker",
};

export function languageForPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith("/dockerfile") || lower === "dockerfile") return "docker";
  const dot = lower.lastIndexOf(".");
  if (dot < 0) return "plaintext";
  const ext = lower.slice(dot + 1);
  return MAP[ext] ?? "plaintext";
}
