import { useQuery } from "@tanstack/react-query";
import api from "./api";

// PyMedusa's `WarningViewer` / `ErrorViewer` are in-memory dedup'd lists that
// only grow until the user clears them. There's no WS event for new entries,
// so we poll. 30s feels right for a sidebar badge: rare enough not to be
// chatty, frequent enough to catch a failure soon after it happens.
const POLL_MS = 30_000;

// `/api/v2/log/reporter?level=...` returns a list of *strings* — the
// LogLine objects are serialised via their `__str__` (raw log line +
// traceback joined with newlines), not their `to_json()`. We parse
// in-process for display; see parseReporterLine below.
const LOGS_KEY = (level: "WARNING" | "ERROR") =>
  ["logs", "reporter", level] as const;

export function useReporterLogs(level: "WARNING" | "ERROR", enabled = true) {
  return useQuery({
    queryKey: LOGS_KEY(level),
    queryFn: ({ signal }) =>
      api
        .get<string[]>("/log/reporter", { signal, params: { level } })
        .then((r) => r.data),
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    staleTime: POLL_MS / 2,
    enabled,
  });
}

// Combined counts for the sidebar badge. Both queries share their cache with
// the Logs page so opening that page is instant.
export function useLogCounts() {
  const warnings = useReporterLogs("WARNING");
  const errors = useReporterLogs("ERROR");
  return {
    warnings: warnings.data?.length ?? 0,
    errors: errors.data?.length ?? 0,
    isLoading: warnings.isLoading || errors.isLoading,
  };
}

export interface ParsedLog {
  timestamp: string; // 'YYYY-MM-DD HH:MM:SS[,fff]' as-emitted (naive UTC)
  level: string; // 'WARNING' | 'ERROR' | …
  thread: string; // 'FORCEDSEARCHQUEUE-MANUAL-196950', 'MAIN', …
  extra: string | null; // Optional `[provider name]` segment, if present
  commit: string | null; // 7-char commit hash, if present
  message: string;
  traceback: string[]; // Subsequent newline-joined lines, if any
  raw: string; // Original string for fallback display
}

// Mirrors medusa/logger/__init__.py:LogLine.log_re. Lenient: any leg
// that doesn't match drops us into the fallback below.
//   2026-05-19 18:14:10[,123] LEVEL THREAD[-id] [:: [extra] ] :: [hash] message
const LOG_RE =
  /^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:,\d{3})?)\s+([A-Z]+)\s+(.+?)(?:\s+::\s+\[(.+?)\])?\s+::\s+\[([a-f0-9]{0,7})\]\s+(.*)$/;

export function parseReporterLine(raw: string): ParsedLog {
  const [first, ...rest] = raw.split("\n");
  const m = first.match(LOG_RE);
  if (!m) {
    return {
      timestamp: "",
      level: "",
      thread: "",
      extra: null,
      commit: null,
      message: first,
      traceback: rest,
      raw,
    };
  }
  const [, timestamp, level, thread, extra, commit, message] = m;
  return {
    timestamp,
    level,
    thread,
    extra: extra ?? null,
    commit: commit || null,
    message,
    traceback: rest,
    raw,
  };
}
