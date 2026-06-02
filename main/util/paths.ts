// Root directory for PReview on-disk state (config.json + per-repo diff
// metadata). PReview stores no worktrees or user-navigable data, so this
// lives in the macOS app-data dir rather than a visible ~/preview folder.
// Split between packaged and dev builds so a `pnpm run dev` session can't
// trample real data.
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { app } from "electron";

export function previewRoot(): string {
  // appData on macOS is ~/Library/Application Support.
  return join(app.getPath("appData"), app.isPackaged ? "PReview" : "PReview-dev");
}

// Pre-Application-Support layout: ~/preview[-dev]. Used only by the
// one-time migration in bootstrap; remove once no installs remain on it.
export function legacyPreviewRoot(): string {
  return join(homedir(), app.isPackaged ? "preview" : "preview-dev");
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
