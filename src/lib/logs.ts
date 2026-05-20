import { useQuery } from "@tanstack/react-query";
import api from "./api";

// No WS event for new log entries — poll. 30s balances chatter vs latency.
const POLL_MS = 30_000;

// `/log/reporter` returns a list of strings — each LogLine serialises via its
// `__str__` (raw line + traceback joined by '\n'), not `to_json()`.
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

// Sidebar badge counts; cache is shared with the Logs page.
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

// Mirrors medusa/logger/__init__.py:LogLine.log_re. Non-matches fall through
// to the raw-string fallback in parseReporterLine.
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
