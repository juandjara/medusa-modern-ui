import { useMemo, useState } from "react";
import { RefreshCw, TriangleAlert, Info, Trash2 } from "lucide-react";
import {
  useReporterLogs,
  parseReporterLine,
  useClearReporter,
  useActivityLogs,
  LOG_THREAD_OPTIONS,
  type ParsedLog,
  type LogPeriod,
  type ActivityLog,
} from "../lib/logs";
import { parseMedusaIso } from "../lib/time";

type Tab = "activity" | "errors" | "warnings";

type Row = ParsedLog & { _kind: "ERROR" | "WARNING" };

export default function Logs() {
  const [tab, setTab] = useState<Tab>("activity");
  const errors = useReporterLogs("ERROR");
  const warnings = useReporterLogs("WARNING");
  const clear = useClearReporter();

  const combined = useMemo<Row[]>(() => {
    const items: Row[] = [];
    for (const s of errors.data ?? [])
      items.push({ ...parseReporterLine(s), _kind: "ERROR" });
    for (const s of warnings.data ?? [])
      items.push({ ...parseReporterLine(s), _kind: "WARNING" });
    return items.sort((a, b) => {
      const ta = a.timestamp ? parseMedusaIso(a.timestamp) : 0;
      const tb = b.timestamp ? parseMedusaIso(b.timestamp) : 0;
      return tb - ta;
    });
  }, [errors.data, warnings.data]);

  const errorCount = errors.data?.length ?? 0;
  const warningCount = warnings.data?.length ?? 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Logs</h1>

      <div role="tablist" className="tabs tabs-box">
        <button
          role="tab"
          className={`tab ${tab === "activity" ? "tab-active" : ""}`}
          onClick={() => setTab("activity")}
        >
          Activity
        </button>
        <button
          role="tab"
          className={`tab ${tab === "errors" ? "tab-active" : ""}`}
          onClick={() => setTab("errors")}
        >
          Errors
          <span className="badge badge-xs badge-error ml-1.5">
            {errorCount}
          </span>
        </button>
        <button
          role="tab"
          className={`tab ${tab === "warnings" ? "tab-active" : ""}`}
          onClick={() => setTab("warnings")}
        >
          Warnings
          <span className="badge badge-xs badge-warning ml-1.5">
            {warningCount}
          </span>
        </button>
      </div>

      {tab === "activity" ? (
        <ActivityView />
      ) : (
        <IssuesView
          tab={tab}
          errors={errors}
          warnings={warnings}
          clear={clear}
          combined={combined}
        />
      )}
    </div>
  );
}

function IssuesView({
  tab,
  errors,
  warnings,
  clear,
  combined,
}: {
  tab: "errors" | "warnings";
  errors: ReturnType<typeof useReporterLogs>;
  warnings: ReturnType<typeof useReporterLogs>;
  clear: ReturnType<typeof useClearReporter>;
  combined: Row[];
}) {
  const visible = combined.filter((row) => row._kind === tab.toUpperCase());

  const isFetching = errors.isFetching || warnings.isFetching;
  const errorCount = errors.data?.length ?? 0;
  const warningCount = warnings.data?.length ?? 0;
  const pendingLevel = clear.isPending ? clear.variables : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-sm text-base-content/60">
          Issues reported during this Medusa session. Cleared on server restart.
          Polls every 30 seconds.
        </div>
        <div className="grow"></div>
        <button
          type="button"
          className="btn btn-ghost btn-sm gap-2"
          onClick={() => clear.mutate("ERROR")}
          disabled={errorCount === 0 || clear.isPending}
          title="Clear errors"
        >
          <Trash2
            size={14}
            className={pendingLevel === "ERROR" ? "animate-pulse" : ""}
          />
          Clear errors
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm gap-2"
          onClick={() => clear.mutate("WARNING")}
          disabled={warningCount === 0 || clear.isPending}
          title="Clear warnings"
        >
          <Trash2
            size={14}
            className={pendingLevel === "WARNING" ? "animate-pulse" : ""}
          />
          Clear warnings
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm gap-2"
          onClick={() => {
            errors.refetch();
            warnings.refetch();
          }}
          disabled={isFetching}
        >
          <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {clear.isError && (
        <div className="alert alert-error text-sm">
          Failed to clear logs. Check that your session is still authenticated.
        </div>
      )}

      {errors.isLoading || warnings.isLoading ? (
        <div className="flex justify-center py-20">
          <span className="loading loading-spinner loading-lg" />
        </div>
      ) : visible.length === 0 ? (
        <div className="text-center py-16 text-base-content/50 space-y-2">
          <Info size={28} className="mx-auto" />
          <div>No {tab} reported.</div>
        </div>
      ) : (
        <ul className="space-y-2">
          {visible.map((row, i) => (
            <LogRow key={`${row.timestamp}-${i}-${row.raw.length}`} row={row} />
          ))}
        </ul>
      )}
    </div>
  );
}

const ACTIVITY_LEVELS = ["INFO", "WARNING", "ERROR", "DEBUG"] as const;
const ACTIVITY_PERIODS: { value: LogPeriod; label: string }[] = [
  { value: "one_day", label: "Last 24h" },
  { value: "three_days", label: "Last 3 days" },
  { value: "one_week", label: "Last 7 days" },
  { value: "all", label: "All" },
];

function ActivityView() {
  const [level, setLevel] = useState<string>("INFO");
  const [thread, setThread] = useState("");
  const [period, setPeriod] = useState<LogPeriod>("one_day");
  // Commit search to query state only on Enter/blur so each keystroke doesn't
  // hit the backend.
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const logs = useActivityLogs({ level, thread, period, query: search });

  return (
    <div className="space-y-4">
      <div className="text-sm text-base-content/60">
        Live activity from the Medusa server log. Filters apply server-side.
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-base-content/60">Level</span>
          <select
            className="select select-sm"
            value={level}
            onChange={(e) => setLevel(e.target.value)}
          >
            {ACTIVITY_LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-base-content/60">Thread</span>
          <select
            className="select select-sm min-w-44"
            value={thread}
            onChange={(e) => setThread(e.target.value)}
          >
            {LOG_THREAD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-base-content/60">Period</span>
          <select
            className="select select-sm"
            value={period}
            onChange={(e) => setPeriod(e.target.value as LogPeriod)}
          >
            {ACTIVITY_PERIODS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm flex-1 min-w-48">
          <span className="text-xs text-base-content/60">Search</span>
          <input
            className="input input-sm"
            placeholder="Filter messages…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onBlur={() => setSearch(searchInput)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setSearch(searchInput);
            }}
          />
        </label>

        <button
          type="button"
          className="btn btn-ghost btn-sm gap-2"
          onClick={() => logs.refetch()}
          disabled={logs.isFetching}
        >
          <RefreshCw
            size={14}
            className={logs.isFetching ? "animate-spin" : ""}
          />
          Refresh
        </button>
      </div>

      {logs.isLoading ? (
        <div className="flex justify-center py-20">
          <span className="loading loading-spinner loading-lg" />
        </div>
      ) : logs.isError ? (
        <div className="alert alert-error text-sm">
          Failed to load activity log.
        </div>
      ) : (logs.data ?? []).length === 0 ? (
        <div className="text-center py-16 text-base-content/50">
          <Info size={28} className="mx-auto mb-2" />
          No matching log lines.
        </div>
      ) : (
        <pre className="bg-base-300/40 rounded-box p-3 text-xs overflow-x-auto leading-relaxed">
          {(logs.data ?? []).map((line, i) => (
            <ActivityLine key={i} line={line} />
          ))}
        </pre>
      )}
    </div>
  );
}

function ActivityLine({ line }: { line: ActivityLog }) {
  const ts = line.timestamp.replace("T", " ").replace("Z", "");
  const thread = line.threadId
    ? `${line.thread}-${line.threadId}`
    : line.thread;
  const levelClass =
    line.level === "ERROR"
      ? "text-error"
      : line.level === "WARNING"
        ? "text-warning"
        : line.level === "DEBUG"
          ? "text-base-content/40"
          : "text-base-content/70";
  return (
    <div className="whitespace-pre-wrap wrap-break-word">
      <span className="text-base-content/50">{ts} </span>
      <span className={`font-semibold ${levelClass}`}>{line.level} </span>
      <span className="text-base-content/60">{thread}</span>
      {line.extra && (
        <span className="text-base-content/60"> :: [{line.extra}]</span>
      )}
      {line.commit && (
        <span className="text-base-content/40"> :: [{line.commit}]</span>
      )}
      <span> {line.message}</span>
      {line.traceback?.length ? (
        <>
          {"\n"}
          {line.traceback.join("\n")}
        </>
      ) : null}
    </div>
  );
}

function LogRow({ row }: { row: Row }) {
  const isError = row._kind === "ERROR";
  return (
    <li
      className={`p-3 rounded-box border ${
        isError
          ? "border-error/40 bg-error/5"
          : "border-warning/40 bg-warning/5"
      }`}
    >
      <div className="flex items-center gap-2 mb-1 text-xs flex-wrap">
        <span
          className={`badge badge-xs ${
            isError ? "badge-error" : "badge-warning"
          }`}
        >
          <TriangleAlert size={10} className="mr-0.5" />
          {row._kind}
        </span>
        {row.timestamp && (
          <span className="font-mono text-base-content/50">
            {row.timestamp}
          </span>
        )}
        {row.thread && (
          <>
            <span className="text-base-content/50">·</span>
            <span className="font-mono text-base-content/60 truncate">
              {row.thread}
            </span>
          </>
        )}
        {row.extra && (
          <>
            <span className="text-base-content/50">·</span>
            <span className="text-base-content/60 truncate">{row.extra}</span>
          </>
        )}
        {row.commit && (
          <>
            <span className="text-base-content/50">·</span>
            <span className="font-mono text-base-content/40">{row.commit}</span>
          </>
        )}
      </div>
      <div className="text-sm wrap-break-word">{row.message}</div>
      {row.traceback.length > 0 && (
        <details className="mt-2">
          <summary className="text-xs cursor-pointer text-base-content/60">
            Traceback ({row.traceback.length} lines)
          </summary>
          <pre className="mt-1 text-xs bg-base-300/40 rounded p-2 overflow-x-auto">
            {row.traceback.join("\n")}
          </pre>
        </details>
      )}
    </li>
  );
}
