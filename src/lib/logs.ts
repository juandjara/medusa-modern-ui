import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
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

// Python's logging levels — required by the legacy clearerrors endpoint.
const PY_LOG_LEVEL = { WARNING: 30, ERROR: 40 } as const;

// No v2 DELETE endpoint exists for the reporter; the legacy /errorlogs route
// is still the only way to clear in-memory Warning/Error viewers.
export function useClearReporter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (level: "WARNING" | "ERROR") => {
      await axios.get("/errorlogs/clearerrors/", {
        params: { level: PY_LOG_LEVEL[level] },
        // Endpoint responds 302 to /errorlogs/viewlog/; treat any 2xx/3xx as ok.
        maxRedirects: 0,
        validateStatus: (s) => s < 400,
      });
      return level;
    },
    onSuccess: (level) => {
      qc.setQueryData(LOGS_KEY(level), []);
      qc.invalidateQueries({ queryKey: LOGS_KEY(level) });
    },
  });
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

// Shape of LogLine.to_json() from /api/v2/log (regular activity feed).
export interface ActivityLog {
  timestamp: string;
  level: string;
  commit: string | null;
  thread: string;
  threadId?: number;
  extra?: string;
  message: string;
  traceback?: string[];
}

export type LogPeriod = "all" | "one_day" | "three_days" | "one_week";

// Mirrors valid_thread_names in medusa/server/api/v2/log.py — backend rejects
// any other value with 400.
export const LOG_THREAD_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All threads" },
  { value: "MAIN", label: "Main" },
  { value: "BACKLOG", label: "Backlog" },
  { value: "DAILYSEARCHER", label: "Daily Searcher" },
  { value: "SEARCHQUEUE", label: "Search Queue (all)" },
  { value: "SEARCHQUEUE-BACKLOG", label: "Search Queue: Backlog" },
  { value: "SEARCHQUEUE-DAILY-SEARCH", label: "Search Queue: Daily" },
  { value: "SEARCHQUEUE-FORCED", label: "Search Queue: Forced" },
  { value: "SEARCHQUEUE-MANUAL", label: "Search Queue: Manual" },
  { value: "SEARCHQUEUE-RETRY", label: "Search Queue: Retry/Failed" },
  { value: "SEARCHQUEUE-RSS", label: "Search Queue: RSS" },
  { value: "SHOWQUEUE", label: "Show Queue (all)" },
  { value: "SHOWQUEUE-REFRESH", label: "Show Queue: Refresh" },
  { value: "SHOWQUEUE-SEASON-UPDATE", label: "Show Queue: Season Update" },
  { value: "SHOWQUEUE-UPDATE", label: "Show Queue: Update" },
  { value: "POSTPROCESSOR", label: "Post-Processor" },
  { value: "FINDPROPERS", label: "Find Propers" },
  { value: "FINDSUBTITLES", label: "Find Subtitles" },
  { value: "SHOWUPDATER", label: "Show Updater" },
  { value: "EPISODEUPDATER", label: "Episode Updater" },
  { value: "DOWNLOADHANDLER", label: "Download Handler" },
  { value: "CHECKVERSION", label: "Check Version" },
  { value: "TRAKTCHECKER", label: "Trakt Checker" },
  { value: "TORNADO", label: "Tornado" },
  { value: "THREAD", label: "Thread" },
  { value: "EVENT", label: "Event" },
  { value: "ERROR", label: "Error" },
];

export interface ActivityLogParams {
  level?: string;
  thread?: string;
  period?: LogPeriod;
  query?: string;
  limit?: number;
}

// One page is enough for an interactive view; the user filters/searches.
export function useActivityLogs(params: ActivityLogParams, enabled = true) {
  const {
    level = "INFO",
    thread = "",
    period = "one_day",
    query = "",
    limit = 500,
  } = params;
  return useQuery({
    queryKey: [
      "logs",
      "activity",
      level,
      thread,
      period,
      query,
      limit,
    ] as const,
    queryFn: ({ signal }) =>
      api
        .get<ActivityLog[]>("/log", {
          signal,
          params: { level, thread, period, query, limit },
        })
        .then((r) => r.data),
    enabled,
    staleTime: 10_000,
  });
}
