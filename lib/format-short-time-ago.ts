/** Compact English relative time for “last seen” / connection labels. */
export function formatShortTimeAgo(iso: string, nowMs = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const diffSec = Math.floor((nowMs - t) / 1000);
  if (diffSec < 0) return "just now";
  if (diffSec < 10) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const m = Math.floor(diffSec / 60);
  if (m < 60) return `${m}min ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`;
  const mo = Math.floor(d / 30);
  return `${mo}mo ago`;
}
