import { useQuery } from "@tanstack/react-query";
import { RefreshCw, HardDrive, Cpu, Clock } from "lucide-react";
import api from "../lib/api";
import { formatDuration, formatRelative } from "../lib/time";
import type {
  DiskSpaceEntry,
  SchedulerItem,
  SystemConfig,
} from "../types/medusa";

const SYSTEM_KEY = ["config", "system"] as const;

export default function System() {
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
          <Cpu size={14} /> Server
        </h2>
        <div className="card bg-primary/10 border border-base-300 p-4">
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

// ============================================================================
// Reference: scheduler trigger endpoints (for when we add "Run now" buttons)
// ----------------------------------------------------------------------------
// Scheduler keys come from medusa/schedulers/utils.py:all_schedulers. Trigger
// endpoints come from the legacy Vue page at themes-default/slim/src/
// components/manage-searches.vue.
//
//   key                | display name        | trigger
//   -------------------|---------------------|--------------------------------------
//   dailySearch        | Daily Search        | PUT  /api/v2/search/daily
//   backlog            | Backlog             | PUT  /api/v2/search/backlog
//                      |                     |   (also accepts { options: { paused: bool } })
//   properFinder       | Proper Finder       | PUT  /api/v2/search/proper
//   subtitlesFinder    | Subtitles Finder    | PUT  /api/v2/search/subtitles
//   downloadHandler    | Download Handler    | POST /api/v2/system/operation
//                      |                     |   body { type: 'FORCEADH' }
//
// Not in `all_schedulers`, but adjacent actions from the same legacy page:
//   - Scene exceptions cache rebuild: POST /api/v2/alias-source/all/operation
//                                     body { type: 'REFRESH' }
//   - Recommended shows refresh:      POST /api/v2/recommended/{source}
//                                     source in { trakt, imdb, anidb, anilist }
//
// Internal queues (no documented trigger; surface read-only):
//   showUpdate, versionCheck, showQueue, searchQueue, forcedSearchQueue,
//   postProcess, postProcessQueue, traktChecker, snatchQueue, episodeUpdater
//
// Bonus — POST /api/v2/system/operation also handles these admin types
// (see medusa/server/api/v2/system.py):
//   RESTART (needs pid)        SHUTDOWN (needs pid)
//   CHECKOUT_BRANCH (needs branch)   NEED_UPDATE        UPDATE
//   CHECKFORUPDATE             BACKUP                  BACKUPTOZIP
//   RESTOREFROMZIP             FORCEADH (above)
// ============================================================================

function SchedulerRow({ item }: { item: SchedulerItem }) {
  const notInitialized = item.isAlive === undefined;

  const stateLabel = notInitialized
    ? "Not initialized"
    : !item.isEnabled
      ? "Disabled"
      : item.isActive
        ? "Running"
        : item.isAlive
          ? "Idle"
          : "Stopped";
  const stateClass = notInitialized
    ? "badge-ghost"
    : !item.isEnabled
      ? "badge-ghost"
      : item.isActive
        ? "badge-warning"
        : item.isAlive
          ? "badge-success"
          : "badge-error";

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
    </tr>
  );
}
