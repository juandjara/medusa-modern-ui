const RTF = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

// Medusa uses `str(datetime.utcnow())` — a naive UTC string. JS's
// Date.parse reads that as *local* time per ES2017, so without this
// normalisation a "just now" event displays N hours off by the viewer's
// UTC offset.
export function parseMedusaIso(s: string): number {
  let v = s.replace(" ", "T");
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(v)) v += "Z";
  return Date.parse(v);
}

export function formatRelative(iso: string): string {
  const t = parseMedusaIso(iso);
  if (Number.isNaN(t)) return iso;
  const diff = (t - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return RTF.format(Math.round(diff), "second");
  if (abs < 3600) return RTF.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return RTF.format(Math.round(diff / 3600), "hour");
  return RTF.format(Math.round(diff / 86400), "day");
}

// Medusa history's `actionDate` is a YYYYMMDDHHMMSS integer
// (sbdatetime.encode). Returns null on bad input.
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

// Binary units (1024).
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
