export function basename(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? path : path.slice(i + 1);
}

export function lastSegment(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? path;
}
