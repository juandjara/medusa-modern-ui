// Small time-formatting helpers shared across pages. Kept tiny — if these
// grow significantly, consider date-fns / dayjs instead.

const RTF = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

/**
 * Format an ISO timestamp as a relative phrase ("5 minutes ago", "in 2 days").
 * Returns the input verbatim if it can't be parsed.
 */
export function formatRelative(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const diff = (t - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return RTF.format(Math.round(diff), "second");
  if (abs < 3600) return RTF.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return RTF.format(Math.round(diff / 3600), "hour");
  return RTF.format(Math.round(diff / 86400), "day");
}

/**
 * Parse PyMedusa's history `actionDate` format — a `YYYYMMDDHHMMSS` integer
 * baked by sbdatetime.encode — into a JS Date. Returns null on bad input.
 */
export function parseActionDate(n: number): Date | null {
  const s = String(n).padStart(14, "0");
  if (s.length !== 14) return null;
  const date = new Date(
    +s.slice(0, 4),
    +s.slice(4, 6) - 1,
    +s.slice(6, 8),
    +s.slice(8, 10),
    +s.slice(10, 12),
    +s.slice(12, 14),
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Format a byte count as a compact human-readable string ("12.4 GB",
 * "850 MB"). Uses binary units (1024). Returns "0 B" for nullish input.
 */
export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value < 10 && i > 0 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

/**
 * Format a duration in seconds as a compact human string: "30s", "15m",
 * "2h 30m", "1d 4h".
 */
export function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds}s`;
  if (totalSeconds < 3600) return `${Math.round(totalSeconds / 60)}m`;
  if (totalSeconds < 86400) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.round((totalSeconds % 3600) / 60);
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(totalSeconds / 86400);
  const h = Math.round((totalSeconds % 86400) / 3600);
  return h ? `${d}d ${h}h` : `${d}d`;
}
