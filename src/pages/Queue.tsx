import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  RefreshCw,
  Activity,
  FileCog2,
  Search as SearchIcon,
  HardDrive,
} from "lucide-react";
import api from "../lib/api";
import { useWebSocket } from "../lib/websocket";
import { formatRelative } from "../lib/time";
import {
  categorizeLiveItem,
  searchTypeLabel,
  type LiveQueueItem,
  type PostProcessQueueItem,
  type ShowQueueItem,
  type SystemConfig,
} from "../types/medusa";

const SYSTEM_KEY = ["config", "system"] as const;
const LIVE_QUEUE_KEY = ["live-queue"] as const;


export default function Queue() {
  const queryClient = useQueryClient();

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: SYSTEM_KEY,
    queryFn: ({ signal }) =>
      api.get<SystemConfig>("/config/system", { signal }).then((r) => r.data),
  });

  // Live-queue cache is WS-populated from Layout. We use a useQuery purely to
  // get a reactive subscription to it — queryFn returns the existing value
  // (or empty) and we never refetch.
  const { data: liveItems = [] } = useQuery<LiveQueueItem[]>({
    queryKey: LIVE_QUEUE_KEY,
    queryFn: () =>
      queryClient.getQueryData<LiveQueueItem[]>(LIVE_QUEUE_KEY) ?? [],
    staleTime: Infinity,
  });

  // QueueItemShow + QueueItemUpdate are also handled by Layout (for series
  // invalidation and live-queue cache writes); here we only need to keep the
  // /config/system query fresh.
  useWebSocket({
    QueueItemShow: () => {
      queryClient.invalidateQueries({ queryKey: SYSTEM_KEY });
    },
    QueueItemUpdate: () => {
      queryClient.invalidateQueries({ queryKey: SYSTEM_KEY });
    },
  });

  // Most recent first — sort by when each item entered its queue.
  const showQueue = useMemo(
    () =>
      [...(data?.showQueue ?? [])].sort(
        (a, b) => Date.parse(b.added) - Date.parse(a.added),
      ),
    [data?.showQueue],
  );
  const postProcessQueue = useMemo(
    () =>
      [...(data?.postProcessQueue ?? [])].sort(
        (a, b) => Date.parse(b.queueTime) - Date.parse(a.queueTime),
      ),
    [data?.postProcessQueue],
  );

  // Split the WS-driven live queue into the sections we render. Search items
  // get their own list; the download handler is a single heartbeat we show
  // separately at the top.
  const searchQueue = useMemo(
    () =>
      liveItems
        .filter(
          (i) =>
            categorizeLiveItem(i.name) === "search" ||
            categorizeLiveItem(i.name) === "snatch",
        )
        .sort((a, b) => Date.parse(b.queueTime) - Date.parse(a.queueTime)),
    [liveItems],
  );
  const downloadHandler = useMemo(
    () =>
      liveItems.find(
        (i) => categorizeLiveItem(i.name) === "downloadHandler" && i.isActive,
      ),
    [liveItems],
  );

  const totalItems =
    showQueue.length + postProcessQueue.length + searchQueue.length;

  return (
    <div className="space-y-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Queue</h1>
        <button
          className="btn btn-ghost btn-sm gap-2"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {isLoading && (
        <div className="flex justify-center py-20">
          <span className="loading loading-spinner loading-lg" />
        </div>
      )}

      {downloadHandler && (
        <div className="alert alert-soft alert-info text-sm">
          <HardDrive size={16} className="animate-pulse" />
          <div className="flex-1">
            Download handler is checking active downloads…
          </div>
          <span className="text-xs text-base-content/50">
            started {formatRelative(downloadHandler.queueTime)}
          </span>
        </div>
      )}

      {!isLoading && totalItems === 0 && !downloadHandler && (
        <div className="text-center py-16 text-base-content/50 space-y-2">
          <Activity className="mx-auto" size={32} />
          <div>Queue is empty.</div>
          <div className="text-xs">
            Show updates, searches, and post-processing tasks will appear here
            as they run.
          </div>
        </div>
      )}

      {!isLoading && showQueue.length > 0 && (
        <section>
          <h2 className="mb-3 font-semibold text-sm flex items-center gap-2 text-base-content/70">
            <Activity size={14} /> Show operations
            <span className="badge badge-sm badge-neutral">
              {showQueue.length}
            </span>
          </h2>
          <ul>
            {showQueue.map((item, i) => (
              <ShowQueueRow
                key={`${item.showSlug ?? "unknown"}-${item.actionId}-${i}`}
                item={item}
              />
            ))}
          </ul>
        </section>
      )}

      {searchQueue.length > 0 && (
        <section>
          <h2 className="mb-3 font-semibold text-sm flex items-center gap-2 text-base-content/70">
            <SearchIcon size={14} /> Search queue
            <span className="badge badge-sm badge-ghost">
              {searchQueue.length}
            </span>
          </h2>
          <ul>
            {searchQueue.map((item) => (
              <SearchQueueRow key={item.identifier} item={item} />
            ))}
          </ul>
        </section>
      )}

      {!isLoading && postProcessQueue.length > 0 && (
        <section>
          <h2 className="mb-3 font-semibold text-sm flex items-center gap-2 text-base-content/70">
            <FileCog2 size={14} /> Post-processing
            <span className="badge badge-sm badge-ghost">
              {postProcessQueue.length}
            </span>
          </h2>
          <ul>
            {postProcessQueue.map((item) => (
              <PostProcessRow key={item.identifier} item={item} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function SearchQueueRow({ item }: { item: LiveQueueItem }) {
  const stateLabel = item.inProgress
    ? "In progress"
    : item.success === true
      ? "Done"
      : item.success === false
        ? "Failed"
        : "Queued";
  const stateClass = item.inProgress
    ? "badge-warning"
    : item.success === true
      ? "badge-success"
      : item.success === false
        ? "badge-error"
        : "badge-ghost";

  const segCount = item.segment?.length ?? 0;
  const showTitle = item.show?.title ?? item.show?.name;
  const showSlug = item.show?.id?.slug;

  return (
    <li className="mt-5">
      <div className="mb-1 flex items-center gap-2 flex-wrap">
        <span className="badge badge-neutral badge-sm">
          {searchTypeLabel(item.name)}
        </span>
        {item.manualSearchType && (
          <span className="badge badge-ghost badge-sm">
            {item.manualSearchType}
          </span>
        )}
        {item.force && (
          <span className="badge badge-warning badge-sm">force</span>
        )}
      </div>
      <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/10 mb-3">
        <div className="min-w-0 flex-1">
          <p className="mb-1">
            {showTitle ? (
              showSlug ? (
                <Link
                  to={`/show/${showSlug}`}
                  className="text-sm font-medium hover:underline truncate"
                >
                  {showTitle}
                </Link>
              ) : (
                <span className="text-sm font-medium truncate">
                  {showTitle}
                </span>
              )
            ) : null}
            {segCount > 0 && (
              <span className="text-xs text-base-content/50">
                {" · "}
                {segCount} episode{segCount === 1 ? "" : "s"}
              </span>
            )}
          </p>
          <div className="text-xs text-base-content/50">
            Queued {formatRelative(item.queueTime)}
            {item.startTime && <> · started {formatRelative(item.startTime)}</>}
          </div>
        </div>
        <span className={`badge badge-sm ${stateClass}`}>{stateLabel}</span>
      </div>
    </li>
  );
}

function ShowQueueRow({ item }: { item: ShowQueueItem }) {
  const stateLabel = item.inProgress ? "In progress" : "Queued";
  const stateClass = item.inProgress ? "badge-warning" : "badge-ghost";

  return (
    <li className="mt-5">
      <p className="mb-1 badge badge-neutral badge-sm">{item.queueType}</p>
      <div className="flex items-center gap-2 flex-wrap p-3 rounded-lg bg-primary/10">
        <div className="min-w-0 flex-1">
          {item.showSlug ? (
            <Link
              to={`/show/${item.showSlug}`}
              className="text-sm font-medium hover:underline truncate block"
            >
              {item.showTitle ?? item.showSlug}
            </Link>
          ) : (
            <span className="text-sm font-medium truncate block">
              {item.showTitle ?? item.showDir ?? "(no show)"}
            </span>
          )}
          <div className="mt-1 text-xs text-base-content/50">
            Queued {formatRelative(item.added)}
            {item.priority !== "normal" && <> · {item.priority} priority</>}
          </div>
        </div>
        <span className={`badge badge-sm ${stateClass}`}>{stateLabel}</span>
      </div>
    </li>
  );
}

function PostProcessRow({ item }: { item: PostProcessQueueItem }) {
  const stateLabel = item.inProgress
    ? "In progress"
    : item.success === true
      ? "Done"
      : item.success === false
        ? "Failed"
        : "Queued";
  const stateClass = item.inProgress
    ? "badge-warning"
    : item.success === true
      ? "badge-success"
      : item.success === false
        ? "badge-error"
        : "badge-ghost";

  const cfg = item.config;
  const procTypeLabel = cfg?.proc_type ? cfg.proc_type.toUpperCase() : "PP";

  return (
    <li className="mt-5">
      <div className="mb-1 flex items-center gap-2 flex-wrap">
        <span className="badge badge-neutral badge-sm">{procTypeLabel}</span>
        {cfg?.process_method && (
          <span className="badge badge-ghost badge-sm">
            {cfg.process_method}
          </span>
        )}
        {cfg?.delete_on && (
          <span className="badge badge-ghost badge-sm">delete after</span>
        )}
        {cfg?.force && (
          <span className="badge badge-warning badge-sm">force</span>
        )}
      </div>
      <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/10">
        <div className="min-w-0 flex-1">
          <div
            className="text-sm font-medium truncate"
            title={cfg?.resource_name}
          >
            {cfg?.resource_name ?? "(no resource specified)"}
          </div>
          {cfg?.path && (
            <div
              className="text-xs text-base-content/40 truncate font-mono mt-0.5"
              title={cfg.path}
            >
              {cfg.path}
            </div>
          )}
          <div className="text-xs text-base-content/50 mt-3">
            Queued {formatRelative(item.queueTime)}
            {item.startTime && <> · started {formatRelative(item.startTime)}</>}
            {item.priority !== "normal" && <> · {item.priority} priority</>}
          </div>
        </div>
        <span className={`badge badge-sm ${stateClass}`}>{stateLabel}</span>
      </div>
    </li>
  );
}
