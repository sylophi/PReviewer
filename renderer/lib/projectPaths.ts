// Unix-only path helpers for the folder-browse modal.

const TRAILING_SLASHES = /\/+$/;

export function hasTrailingSlash(value: string): boolean {
  return value.endsWith("/");
}

export function getBrowseDirectoryPath(value: string): string {
  if (hasTrailingSlash(value)) return value;
  const idx = value.lastIndexOf("/");
  if (idx < 0) return value;
  return value.slice(0, idx + 1);
}

export function getBrowseLeafSegment(value: string): string {
  const idx = value.lastIndexOf("/");
  return value.slice(idx + 1);
}

export function appendBrowsePathSegment(currentPath: string, segment: string): string {
  return `${getBrowseDirectoryPath(currentPath)}${segment}/`;
}

export function getBrowseParentPath(currentPath: string): string | null {
  const trimmed = currentPath.replace(TRAILING_SLASHES, "");
  if (trimmed === "" || trimmed === "~") return null;
  const idx = trimmed.lastIndexOf("/");
  if (idx < 0) return null;
  if (idx === 0) return "/";
  return `${trimmed.slice(0, idx)}/`;
}

export function canNavigateUp(currentPath: string): boolean {
  return hasTrailingSlash(currentPath) && getBrowseParentPath(currentPath) !== null;
}

export function normalizeForSubmit(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 1) return trimmed;
  return trimmed.replace(TRAILING_SLASHES, "");
}

// Collapse the home prefix to "~/". Falls back to the original path when
// the user's home isn't yet loaded (runtime info hasn't resolved).
let cachedHome: string | null = null;
void window.api.runtime.info().then((info) => {
  cachedHome = info.homedir;
});

export function tildify(path: string): string {
  const home = cachedHome;
  if (!home) return path;
  if (path === home) return "~";
  if (path.startsWith(`${home}/`)) return `~${path.slice(home.length)}`;
  return path;
}
