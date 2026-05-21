import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Play,
  Check,
  TriangleAlert,
  RefreshCw,
  Clock,
} from "lucide-react";
import api from "../lib/api";
import Field from "../components/forms/Field";
import Toggle from "../components/forms/Toggle";
import FolderPicker from "../components/forms/FolderPicker";
import { useWebSocket } from "../lib/websocket";
import { formatRelative, parseMedusaIso } from "../lib/time";
import type { PostProcessQueueItem } from "../types/medusa";
import type { ConfigPostProcessing } from "../types/config";

const METHODS_BASE = [
  { value: "", label: "Use configured method" },
  { value: "copy", label: "Copy" },
  { value: "move", label: "Move" },
  { value: "hardlink", label: "Hard link" },
  { value: "symlink", label: "Symbolic link" },
  { value: "keeplink", label: "Keep link" },
];

const PP_QUEUE_KEY = ["postprocess", "history"] as const;

export default function PostProcess() {
  const queryClient = useQueryClient();

  // Pull the configured download directory to prefill the path field.
  const cfgQ = useQuery({
    queryKey: ["config", "postprocessing"],
    queryFn: ({ signal }) =>
      api
        .get<ConfigPostProcessing>("/config/postprocessing", { signal })
        .then((r) => r.data),
    staleTime: 60_000,
  });

  const historyQ = useQuery({
    queryKey: PP_QUEUE_KEY,
    queryFn: ({ signal }) =>
      api.get<PostProcessQueueItem[]>("/postprocess", { signal }).then((r) => r.data),
  });

  // The PP queue emits QueueItemUpdate WS events with name === 'Post Process'.
  // Layout's live-queue subscriber filters these out, so we listen here too
  // and invalidate the history on every PP-related event.
  useWebSocket({
    QueueItemUpdate: (raw) => {
      const item = raw as { name?: string };
      if (item.name === "Post Process") {
        queryClient.invalidateQueries({ queryKey: PP_QUEUE_KEY });
      }
    },
  });

  const [procDir, setProcDir] = useState<string | null>(null);
  const [resource, setResource] = useState("");
  const [method, setMethod] = useState("");
  const [force, setForce] = useState(false);
  const [isPriority, setIsPriority] = useState(false);
  const [deleteOn, setDeleteOn] = useState(false);
  const [failed, setFailed] = useState(false);

  // Nullable-initial: null = fall back to configured download dir, string =
  // explicit override by the user.
  const effectiveDir = procDir ?? cfgQ.data?.showDownloadDir ?? "";

  const run = useMutation({
    mutationFn: () =>
      api
        .post<{ status: string; message: string; queueItem: PostProcessQueueItem }>(
          "/postprocess",
          {
            proc_dir: effectiveDir,
            resource,
            process_method: method || undefined,
            force,
            is_priority: isPriority,
            delete_on: deleteOn,
            failed,
            proc_type: "manual",
            // Backend currently aliases ignore_subs to is_priority (see
            // postprocess.py); leave it off unless you opt in via priority.
          },
        )
        .then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PP_QUEUE_KEY });
      setResource("");
    },
  });

  const canRun = effectiveDir.trim().length > 0 && !run.isPending;

  const reflinkAvailable = cfgQ.data?.reflinkAvailable;
  const methodOptions = reflinkAvailable
    ? [...METHODS_BASE, { value: "reflink", label: "Reflink (copy-on-write)" }]
    : METHODS_BASE;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-2">
        <Link to="/queue" className="btn btn-ghost btn-sm gap-1">
          <ChevronLeft size={16} /> Queue
        </Link>
      </div>

      <header>
        <h1 className="text-2xl font-bold">Manual post-process</h1>
        <p className="text-sm text-base-content/60 mt-1">
          Queue a folder for post-processing right now. Same code path the
          scheduled scanner and download handler use — just triggered by you.
          Hits <code>POST /api/v2/postprocess</code>; the worker thread
          ("Post-process · Queue worker" on the{" "}
          <Link to="/system" className="link link-hover text-primary">
            System page
          </Link>
          ) consumes it on its next tick.
        </p>
      </header>

      <section className="card bg-base-100 border border-base-300 rounded-box">
        <div className="card-body p-4 space-y-3">
          <Field
            label="Folder to process"
            hint="Required. Defaults to your configured download directory; override to point at any folder under a path Medusa can read."
          >
            <FolderPicker
              value={effectiveDir}
              onChange={(v) => setProcDir(v)}
            />
          </Field>

          <Field
            label="Specific file (optional)"
            hint="Filename inside the folder. Leave blank to process every media file the scanner finds."
          >
            <input
              className="input input-sm w-full"
              value={resource}
              onChange={(e) => setResource(e.target.value)}
              spellCheck={false}
              placeholder="e.g. Show.S01E01.mkv"
            />
          </Field>

          <Field
            label="Process method"
            hint="Overrides the configured default just for this run."
          >
            <select
              className="select select-sm"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              {methodOptions.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-base-300/60">
            <Toggle
              label="Force"
              hint="Re-process even if the release/quality matches what's already on disk. Use to overwrite an existing file with a new one."
              checked={force}
              onChange={setForce}
            />
            <Toggle
              label="Priority"
              hint="Skip standard quality/priority checks — process this regardless of preferences."
              checked={isPriority}
              onChange={setIsPriority}
            />
            <Toggle
              label="Delete source folder on success"
              hint="If post-processing succeeds, remove the source folder. Useful for one-shot manual runs on temporary download dirs."
              checked={deleteOn}
              onChange={setDeleteOn}
            />
            <Toggle
              label="Mark as failed"
              hint="Tell the backend to treat this as a failed download — logs to failed.db and may trigger a retry search if 'Use failed downloads' is on."
              checked={failed}
              onChange={setFailed}
            />
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              className="btn btn-sm btn-primary gap-1"
              onClick={() => run.mutate()}
              disabled={!canRun}
            >
              {run.isPending ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                <Play size={14} />
              )}
              Run post-process
            </button>
            {run.isSuccess && (
              <span className="text-xs text-success inline-flex items-center gap-1">
                <Check size={12} /> Queued
              </span>
            )}
            {run.isError && (
              <span className="text-xs text-error inline-flex items-center gap-1">
                <TriangleAlert size={12} /> {extractMessage(run.error)}
              </span>
            )}
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between gap-2 mb-2">
          <h2 className="font-semibold flex items-center gap-2">
            <Clock size={16} /> Recent runs
            <span className="text-xs font-normal text-base-content/50">
              {historyQ.data?.length ?? 0}
            </span>
          </h2>
          <button
            type="button"
            className="btn btn-ghost btn-sm gap-1"
            onClick={() => historyQ.refetch()}
            disabled={historyQ.isFetching}
          >
            <RefreshCw
              size={14}
              className={historyQ.isFetching ? "animate-spin" : ""}
            />
            Refresh
          </button>
        </div>

        {historyQ.isLoading ? (
          <div className="flex justify-center py-8">
            <span className="loading loading-spinner" />
          </div>
        ) : !historyQ.data || historyQ.data.length === 0 ? (
          <div className="text-sm text-base-content/50 text-center py-6 border border-dashed border-base-300 rounded-box">
            Nothing in the post-process queue history yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-box border-2 border-base-300">
            <table className="table table-sm table-fixed w-full min-w-4xl">
              <thead>
                <tr>
                  <th className="w-8 p-0" aria-label="Output toggle" />
                  <th className="w-24">Status</th>
                  <th className="w-44">Queued</th>
                  <th className="w-auto">Target</th>
                  <th className="w-20">Method</th>
                  <th className="w-28">Flags</th>
                </tr>
              </thead>
              <tbody>
                {[...historyQ.data]
                  .sort((a, b) => {
                    const ta = a.queueTime ? parseMedusaIso(a.queueTime) : 0;
                    const tb = b.queueTime ? parseMedusaIso(b.queueTime) : 0;
                    return tb - ta;
                  })
                  .map((item) => (
                    <PPHistoryRow key={item.identifier} item={item} />
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function PPHistoryRow({ item }: { item: PostProcessQueueItem }) {
  const [showOutput, setShowOutput] = useState(false);
  const cfg = item.config ?? {};
  const status = item.inProgress
    ? { label: "Running", cls: "badge-warning" }
    : item.success === true
      ? { label: "Success", cls: "badge-success" }
      : item.success === false
        ? { label: "Failed", cls: "badge-error" }
        : { label: "Queued", cls: "badge-ghost" };

  // queueTime is "YYYY-MM-DD HH:MM:SS.micro" naive UTC. parseMedusaIso adds
  // the Z so Date.parse reads it as UTC; otherwise JS treats it as local.
  const queuedAt = item.queueTime
    ? new Date(parseMedusaIso(item.queueTime))
    : null;
  const absolute = queuedAt
    ? queuedAt.toLocaleString(navigator.language, {
        hour: "numeric",
        minute: "2-digit",
        year: "numeric",
        month: "short",
        day: "2-digit",
      })
    : "—";
  const relative = item.queueTime ? formatRelative(item.queueTime) : "";

  const target =
    cfg.resource_name && cfg.path
      ? `${cfg.path}/${cfg.resource_name}`
      : cfg.resource_name || cfg.path || "—";

  const hasOutput = !!item.output?.length;

  return (
    <>
      <tr
        onClick={hasOutput ? () => setShowOutput((v) => !v) : undefined}
        className={hasOutput ? "cursor-pointer hover:bg-base-200/40" : ""}
        aria-expanded={hasOutput ? showOutput : undefined}
      >
        <td className="p-0 text-center align-middle">
          {hasOutput ? (
            showOutput ? (
              <ChevronDown size={14} className="inline text-base-content/60" />
            ) : (
              <ChevronRight size={14} className="inline text-base-content/60" />
            )
          ) : null}
        </td>
        <td>
          <span className={`badge badge-sm ${status.cls}`}>{status.label}</span>
        </td>
        <td className="text-xs whitespace-nowrap" title={item.queueTime}>
          <p>{relative}</p>
          {absolute && (
            <p className="mt-0.5 text-base-content/50">{absolute}</p>
          )}
        </td>
        <td>
          <code className="font-mono text-xs break-all">{target}</code>
        </td>
        <td>
          {cfg.process_method && (
            <span className="badge badge-xs">{cfg.process_method}</span>
          )}
        </td>
        <td>
          <div className="flex gap-1 flex-wrap">
            {cfg.force && (
              <span className="badge badge-xs badge-warning" title="Manual">
                force
              </span>
            )}
            {cfg.is_priority && (
              <span className="badge badge-xs badge-info" title="Priority flag">
                priority
              </span>
            )}
            {cfg.failed && (
              <span className="badge badge-xs badge-error" title="Failed flag">
                failed
              </span>
            )}
            {cfg.delete_on && (
              <span
                className="badge badge-xs badge-ghost"
                title="Delete source on success"
              >
                delete src
              </span>
            )}
          </div>
        </td>
      </tr>
      {showOutput && item.output && (
        <tr>
          <td colSpan={6} className="bg-base-300/40 p-0">
            <div className="overflow-auto p-1">
              <pre className="text-xs font-mono p-2 whitespace-pre">
                {item.output.join("\n")}
              </pre>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function extractMessage(err: unknown): string {
  if (typeof err === "object" && err && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}
