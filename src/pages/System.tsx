import { useState } from "react";
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

const SYSTEM_KEY = ["config", "system"] as const;

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
          <table className="table table-zebra table-sm">
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
                <SchedulerRow key={s.key} item={s} />
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
          <table className="table table-zebra table-sm">
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
        <div className="bg-base-100 border border-base-300 rounded-box divide-y divide-base-300">
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
              refreshScenes.isSuccess
                ? "Queued."
                : refreshScenes.isError
                  ? "Failed to queue refresh."
                  : null
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
        <div className="bg-base-100 border border-base-300 rounded-box p-4">
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

function SchedulerRow({ item }: { item: SchedulerItem }) {
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
      <td className="font-medium whitespace-nowrap">{item.name}</td>
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
  note: string | null;
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
