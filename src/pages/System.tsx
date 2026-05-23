import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  RefreshCw,
  HardDrive,
  Cpu,
  Clock,
  Play,
  Pause,
  Wrench,
  Trash2,
  Info,
} from "lucide-react";
import api from "../lib/api";
import { formatDuration, formatRelative } from "../lib/time";
import {
  SCHEDULER_HAS_TRIGGER,
  useCleanSceneExceptionCache,
  useRefreshSceneExceptions,
  useRunScheduler,
  useToggleBacklogPaused,
} from "../lib/system-actions";
import ConfirmDialog from "../components/ConfirmDialog";
import type {
  DiskSpaceEntry,
  SchedulerItem,
  SystemConfig,
} from "../types/medusa";
import type { ConfigSearch } from "../types/config";

// /api/v2/alias-source — one row per scene-exception source. `lastRefresh` is
// a unix timestamp in seconds (alias_source.py:20); 0 means never refreshed.
interface AliasSourceRow {
  id: string;
  lastRefresh: number;
}
const ALIAS_SOURCE_META: Record<
  string,
  { label: string; url?: string }
> = {
  local: {
    label: "Medusa's built-in exceptions",
    url: "https://github.com/pymedusa/Medusa/wiki/Scene-exceptions-and-numbering",
  },
  xem: { label: "XEM", url: "http://thexem.info" },
  anidb: { label: "AniDB" },
};

const SYSTEM_KEY = ["config", "system"] as const;

// Client-side rename of the scheduler labels coming from the server. The
// upstream names ("Post Process" / "Post Process Queue") are easy to confuse;
// these break out the *role* each scheduler plays in the PP pipeline.
const SCHEDULER_LABELS: Record<string, string> = {
  postProcess: "Post-process · Scheduled scanner",
  postProcessQueue: "Post-process · Queue worker",
  downloadHandler: "Download handler",
};

const SCHEDULER_DESCRIPTIONS: Record<string, string> = {
  postProcess:
    "Walks the configured download directory on a timer. Active only when 'Scheduled scan' is the trigger; queues anything it finds onto the Queue worker.",
  postProcessQueue:
    "Always-on worker that turns queued paths into processed files (move/rename/DB/history). Consumes work from the Scheduled scanner, the Download handler, and POST /api/v2/postprocess.",
  downloadHandler:
    "Polls the torrent/NZB client for completed downloads. Active only when 'Download handler' is the trigger; queues finished items onto the Queue worker.",
};

export default function System() {
  const refreshScenes = useRefreshSceneExceptions();
  const cleanScenes = useCleanSceneExceptionCache();
  const [confirmCleanOpen, setConfirmCleanOpen] = useState(false);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: SYSTEM_KEY,
    queryFn: ({ signal }) =>
      api.get<SystemConfig>("/config/system", { signal }).then((r) => r.data),
    // Schedulers tick forward; keep this fresh-ish without polling constantly.
    staleTime: 10_000,
  });

  // Shared cache key with Search settings; surfaces backlogDays under the
  // backlog scheduler row.
  const searchCfgQ = useQuery({
    queryKey: ["config", "search"],
    queryFn: ({ signal }) =>
      api.get<ConfigSearch>("/config/search", { signal }).then((r) => r.data),
    staleTime: 60_000,
  });
  const backlogDays = searchCfgQ.data?.general?.backlogDays;

  // Per-source scene-exception last-refresh timestamps. Same endpoint
  // refreshScenes/cleanScenes mutate against — invalidating the system page
  // would be too coarse, so we use the dedicated key here.
  const aliasSourcesQ = useQuery({
    queryKey: ["alias-source"],
    queryFn: ({ signal }) =>
      api
        .get<AliasSourceRow[]>("/alias-source", { signal })
        .then((r) => r.data),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  if (!data) return null;

  const schedulers = data.schedulers ?? [];
  const diskDirs: DiskSpaceEntry[] = [
    ...(data.diskSpace?.tvDownloadDir ? [data.diskSpace.tvDownloadDir] : []),
    ...(data.diskSpace?.rootDir ?? []),
  ];

  return (
    <div className="space-y-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">System</h1>
        <button
          className="btn btn-ghost btn-sm gap-2"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      <section>
        <h2 className="mb-3 font-semibold text-sm flex items-center gap-2 text-base-content/70">
          <Clock size={14} /> Schedulers
          <span className="badge badge-sm badge-ghost">
            {schedulers.length}
          </span>
        </h2>
        <div className="overflow-x-auto">
          <table className="table table-zebra table-sm bg-base-100 border-2 border-base-300 rounded-box">
            <thead>
              <tr>
                <th>Name</th>
                <th>State</th>
                <th>Last run</th>
                <th>Next run</th>
                <th>Cycle</th>
                <th>Queue</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {schedulers.map((s) => (
                <SchedulerRow
                  key={s.key}
                  item={s}
                  backlogDays={backlogDays}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-semibold text-sm flex items-center gap-2 text-base-content/70">
          <HardDrive size={14} /> Disk space
          <span className="badge badge-sm badge-ghost">{diskDirs.length}</span>
        </h2>
        <div className="overflow-x-auto">
          <table className="table table-zebra table-sm bg-base-100 border-2 border-base-300 rounded-box">
            <thead>
              <tr>
                <th>Type</th>
                <th>Location</th>
                <th className="text-right">Free</th>
              </tr>
            </thead>
            <tbody>
              {diskDirs.map((d) => (
                <tr key={d.location}>
                  <td>{d.type}</td>
                  <td className="font-mono text-xs">{d.location}</td>
                  <td className="text-right whitespace-nowrap">
                    {d.freeSpace}
                  </td>
                </tr>
              ))}
              {diskDirs.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-center text-base-content/50">
                    No directories configured.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-semibold text-sm flex items-center gap-2 text-base-content/70">
          <Wrench size={14} /> Maintenance
        </h2>
        <div className="bg-base-100 border-2 border-base-300 rounded-box divide-y divide-base-300">
          <MaintenanceRow
            title="Scene exceptions"
            description="Refresh aliases from XEM, AniDB and AniList. Helps PyMedusa match releases that use alternate show names."
            action={
              <button
                className="btn btn-ghost btn-sm gap-1"
                onClick={() => refreshScenes.mutate()}
                disabled={refreshScenes.isPending}
              >
                {refreshScenes.isPending ? (
                  <span className="loading loading-spinner loading-xs" />
                ) : (
                  <RefreshCw size={14} />
                )}
                Refresh
              </button>
            }
            note={
              <div className="not-italic space-y-1">
                {refreshScenes.isSuccess && (
                  <p className="italic">
                    Queued. See{" "}
                    <Link
                      to="/logs?tab=activity"
                      className="link link-hover font-medium"
                    >
                      activity logs
                    </Link>{" "}
                    for live progress.
                  </p>
                )}
                {refreshScenes.isError && (
                  <p className="italic text-error">
                    Failed to queue refresh.
                  </p>
                )}
                {aliasSourcesQ.data && aliasSourcesQ.data.length > 0 && (
                  <ul className="space-y-0.5">
                    {aliasSourcesQ.data.map((s) => {
                      const meta = ALIAS_SOURCE_META[s.id] ?? {
                        label: s.id,
                      };
                      const stamp =
                        s.lastRefresh > 0
                          ? formatRelative(
                              new Date(s.lastRefresh * 1000).toISOString(),
                            )
                          : "never";
                      return (
                        <li key={s.id} className="flex items-center gap-1.5">
                          <span className="text-base-content/70">
                            {meta.label}
                          </span>
                          <span className="text-base-content/40">·</span>
                          <span>last refreshed {stamp}</span>
                          {meta.url && (
                            <a
                              href={meta.url}
                              target="_blank"
                              rel="noreferrer"
                              className="link link-hover text-base-content/50"
                            >
                              (source)
                            </a>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            }
          />
          <MaintenanceRow
            title="Scene exception cache"
            description="Drop the cached scene exceptions database. Matching falls back to defaults until the next refresh repopulates it."
            action={
              <button
                className="btn btn-ghost btn-sm gap-1 text-error"
                onClick={() => setConfirmCleanOpen(true)}
                disabled={cleanScenes.isPending}
              >
                {cleanScenes.isPending ? (
                  <span className="loading loading-spinner loading-xs" />
                ) : (
                  <Trash2 size={14} />
                )}
                Clean cache
              </button>
            }
            note={
              cleanScenes.isSuccess
                ? "Cache cleared."
                : cleanScenes.isError
                  ? "Failed to clean cache."
                  : null
            }
          />
        </div>
      </section>

      <ConfirmDialog
        open={confirmCleanOpen}
        title="Clean scene exception cache?"
        body={
          <>
            <p>
              This drops the cached scene exceptions from PyMedusa's database.
              Until the next Refresh runs, scene-name matching will be limited
              to indexer defaults.
            </p>
            <p>The cache is rebuilt automatically on the next refresh cycle.</p>
          </>
        }
        confirmLabel="Clean cache"
        variant="danger"
        onConfirm={() => cleanScenes.mutate()}
        onClose={() => setConfirmCleanOpen(false)}
      />

      <section>
        <h2 className="mb-3 font-semibold text-sm flex items-center gap-2 text-base-content/70">
          <Cpu size={14} /> Server
        </h2>
        <div className="bg-base-100 border-2 border-base-300 rounded-box p-4">
          <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
            {data.memoryUsage && (
              <>
                <dt className="text-base-content/60">Memory usage</dt>
                <dd className="font-mono">{data.memoryUsage}</dd>
              </>
            )}
            {data.branch && (
              <>
                <dt className="text-base-content/60">Branch</dt>
                <dd className="font-mono">{data.branch}</dd>
              </>
            )}
            {data.commitHash && (
              <>
                <dt className="text-base-content/60">Commit</dt>
                <dd
                  className="font-mono text-xs truncate"
                  title={data.commitHash}
                >
                  {data.commitHash}
                </dd>
              </>
            )}
          </dl>
        </div>
      </section>
    </div>
  );
}

function SchedulerRow({
  item,
  backlogDays,
}: {
  item: SchedulerItem;
  backlogDays: number | undefined;
}) {
  const run = useRunScheduler();
  const togglePaused = useToggleBacklogPaused();

  const notInitialized = item.isAlive === undefined;
  const isPaused = item.isEnabled === "Paused";
  const hasTrigger = SCHEDULER_HAS_TRIGGER[item.key] === true;
  const isBacklog = item.key === "backlog";

  // Paused is a separate state from disabled/running/idle/stopped.
  const stateLabel = notInitialized
    ? "Not initialized"
    : isPaused
      ? "Paused"
      : !item.isEnabled
        ? "Disabled"
        : item.isActive
          ? "Running"
          : item.isAlive
            ? "Idle"
            : "Stopped";
  const stateClass = notInitialized
    ? "badge-ghost"
    : isPaused
      ? "badge-warning"
      : !item.isEnabled
        ? "badge-ghost"
        : item.isActive
          ? "badge-warning"
          : item.isAlive
            ? "badge-success"
            : "badge-error";

  // Pending state is keyed per row: useMutation.variables tells us whose run
  // is in flight, so other rows stay enabled.
  const runPending = run.isPending && run.variables === item.key;

  const lastRun = item.lastRun ? formatRelative(item.lastRun) : "—";
  const nextRun =
    item.nextRun !== null && item.nextRun !== undefined
      ? `in ${formatDuration(item.nextRun)}`
      : "—";
  const cycle =
    item.cycleTime !== null && item.cycleTime !== undefined
      ? formatDuration(item.cycleTime)
      : "—";

  return (
    <tr>
      <td className="font-medium whitespace-nowrap">
        <span className="inline-flex items-center gap-1">
          {SCHEDULER_LABELS[item.key] ?? item.name}
          {SCHEDULER_DESCRIPTIONS[item.key] && (
            <span
              className="tooltip tooltip-right tooltip-info"
              data-tip={SCHEDULER_DESCRIPTIONS[item.key]}
            >
              <Info size={12} className="text-base-content/40" />
            </span>
          )}
        </span>
        {isBacklog && backlogDays != null && (
          <div className="text-xs font-normal text-base-content/50 mt-0.5">
            Scans the last {backlogDays} day{backlogDays === 1 ? "" : "s"} of
            episodes
          </div>
        )}
      </td>
      <td>
        <span className={`badge badge-sm ${stateClass}`}>{stateLabel}</span>
      </td>
      <td className="text-xs whitespace-nowrap">{lastRun}</td>
      <td className="text-xs whitespace-nowrap">{nextRun}</td>
      <td className="text-xs whitespace-nowrap">{cycle}</td>
      <td>
        {item.queueLength && item.queueLength > 0 ? (
          <span className="badge badge-sm badge-neutral">
            {item.queueLength}
          </span>
        ) : (
          <span className="text-base-content/30">—</span>
        )}
      </td>
      <td className="text-right whitespace-nowrap">
        <div className="inline-flex items-center gap-1">
          {isBacklog && (
            <button
              className="btn btn-ghost btn-xs gap-1"
              title={isPaused ? "Resume backlog" : "Pause backlog"}
              onClick={() => togglePaused.mutate(!isPaused)}
              disabled={togglePaused.isPending}
            >
              {togglePaused.isPending ? (
                <span className="loading loading-spinner loading-xs" />
              ) : isPaused ? (
                <Play size={14} />
              ) : (
                <Pause size={14} />
              )}
              {isPaused ? "Resume" : "Pause"}
            </button>
          )}
          {hasTrigger && (
            <button
              className="btn btn-ghost btn-xs gap-1"
              title="Run now"
              onClick={() => run.mutate(item.key)}
              disabled={runPending || (isBacklog && isPaused)}
            >
              {runPending ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                <Play size={14} />
              )}
              Run
            </button>
          )}
          {!hasTrigger && !isBacklog && (
            <span className="text-base-content/30">—</span>
          )}
        </div>
      </td>
    </tr>
  );
}

function MaintenanceRow({
  title,
  description,
  action,
  note,
}: {
  title: string;
  description: string;
  action: React.ReactNode;
  note: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-4 p-4">
      <div className="min-w-0 flex-1">
        <div className="font-medium text-sm">{title}</div>
        <div className="text-xs text-base-content/60 mt-0.5">{description}</div>
        {note && (
          <div className="text-xs text-base-content/50 mt-1 italic">{note}</div>
        )}
      </div>
      {action}
    </div>
  );
}
