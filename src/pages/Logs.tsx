import { useMemo, useState } from "react";
import { RefreshCw, TriangleAlert, Info } from "lucide-react";
import { useReporterLogs, parseReporterLine, type ParsedLog } from "../lib/logs";
import { parseMedusaIso } from "../lib/time";

type Filter = "all" | "errors" | "warnings";

type Row = ParsedLog & { _kind: "ERROR" | "WARNING" };

export default function Logs() {
  const errors = useReporterLogs("ERROR");
  const warnings = useReporterLogs("WARNING");
  const [filter, setFilter] = useState<Filter>("all");

  // Combine + sort by timestamp desc so the most recent issue is on top.
  // PyMedusa's `Viewer.errors` already sorts each list this way, but we have
  // to interleave the two endpoints here. Unparseable strings end up with
  // empty timestamps; treat those as oldest so they don't jump to the top.
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

  const visible = combined.filter((row) => {
    if (filter === "errors") return row._kind === "ERROR";
    if (filter === "warnings") return row._kind === "WARNING";
    return true;
  });

  const isLoading = errors.isLoading || warnings.isLoading;
  const isFetching = errors.isFetching || warnings.isFetching;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Logs</h1>
        <button
          type="button"
          className="btn btn-ghost btn-sm gap-2"
          onClick={() => {
            errors.refetch();
            warnings.refetch();
          }}
          disabled={isFetching}
        >
          <RefreshCw
            size={14}
            className={isFetching ? "animate-spin" : ""}
          />
          Refresh
        </button>
      </div>

      <div className="text-sm text-base-content/60">
        Issues reported during this PyMedusa session. Cleared on server
        restart. Polls every 30 seconds.
      </div>

      <div role="tablist" className="tabs tabs-box w-fit">
        <button
          role="tab"
          className={`tab ${filter === "all" ? "tab-active" : ""}`}
          onClick={() => setFilter("all")}
        >
          All
          <span className="badge badge-xs badge-ghost ml-1.5">
            {combined.length}
          </span>
        </button>
        <button
          role="tab"
          className={`tab ${filter === "errors" ? "tab-active" : ""}`}
          onClick={() => setFilter("errors")}
        >
          Errors
          <span className="badge badge-xs badge-error ml-1.5">
            {errors.data?.length ?? 0}
          </span>
        </button>
        <button
          role="tab"
          className={`tab ${filter === "warnings" ? "tab-active" : ""}`}
          onClick={() => setFilter("warnings")}
        >
          Warnings
          <span className="badge badge-xs badge-warning ml-1.5">
            {warnings.data?.length ?? 0}
          </span>
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <span className="loading loading-spinner loading-lg" />
        </div>
      ) : visible.length === 0 ? (
        <div className="text-center py-16 text-base-content/50 space-y-2">
          <Info size={28} className="mx-auto" />
          <div>No {filter === "all" ? "issues" : filter} reported.</div>
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
            <span className="font-mono text-base-content/40">
              {row.commit}
            </span>
          </>
        )}
      </div>
      <div className="text-sm break-words">{row.message}</div>
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
