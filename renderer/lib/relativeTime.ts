export function formatRelativeTime(epochMs: number): string {
  const ago = Math.max(0, Math.round((Date.now() - epochMs) / 1000));
  if (ago < 5) return "just now";
  if (ago < 60) return `${ago}s ago`;
  const min = Math.round(ago / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}
