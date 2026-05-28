// Root directory for PReview on-disk state. Split between packaged and dev
// builds so a `pnpm run dev` session can't trample a real ~/preview/.
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { app } from "electron";

export function previewRoot(): string {
  const name = app.isPackaged ? "preview" : "preview-dev";
  return join(homedir(), name);
}

export function expandHome(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  return path;
}

export function toAbsolute(path: string): string {
  const expanded = expandHome(path);
  return isAbsolute(expanded) ? expanded : resolve(expanded);
}

export function isENOENT(error: unknown): boolean {
  return (
    error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
