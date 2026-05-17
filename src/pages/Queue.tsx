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

// ============================================================================
// MOCK DATA — design-review only. Remove this whole block (and the conditional
// uses of MOCK_SYSTEM in the component below) when you're done. Toggle the
// flag to false to fall back to live data without deleting anything yet.
// ============================================================================
const MOCK_QUEUE = true;

const ago = (seconds: number) =>
  new Date(Date.now() - seconds * 1000).toISOString();

const MOCK_SYSTEM: SystemConfig = {
  showQueue: [
    {
      showSlug: "tmdb120089",
      showTitle: "SPY x FAMILY",
      showDir: null,
      inProgress: true,
      priority: "high",
      added: ago(15),
      actionId: 6,
      queueType: "SUBTITLES_DOWNLOAD",
    },
    {
      showSlug: "tmdb125935",
      showTitle: "Abbott Elementary",
      showDir: null,
      inProgress: true,
      priority: "normal",
      added: ago(45),
      actionId: 4,
      queueType: "UPDATE",
    },
    {
      showSlug: "tmdb72750",
      showTitle: "Killing Eve",
      showDir: null,
      inProgress: false,
      priority: "normal",
      added: ago(120),
      actionId: 5,
      queueType: "RENAME",
    },
    {
      showSlug: "tmdb1429",
      showTitle: "Attack on Titan",
      showDir: null,
      inProgress: false,
      priority: "low",
      added: ago(310),
      actionId: 2,
      queueType: "REFRESH",
    },
    {
      // Mid-ADD: no slug yet, only the on-disk folder we're scanning.
      showSlug: null,
      showTitle: null,
      showDir: "/hdd/media/tv/Severance",
      inProgress: true,
      priority: "normal",
      added: ago(60),
      actionId: 1,
      queueType: "ADD",
    },
    {
      showSlug: "tmdb92749",
      showTitle: "Moon Knight",
      showDir: null,
      inProgress: false,
      priority: "normal",
      added: ago(200),
      actionId: 7,
      queueType: "REMOVE",
    },
  ],
  postProcessQueue: [
    {
      identifier: "pp-running",
      name: "Post Process",
      priority: "normal",
      actionId: 1,
      queueTime: ago(20),
      success: null,
      inProgress: true,
      startTime: ago(10),
      updateTime: ago(2),
      config: {
        path: "/downloads/complete/Abbott.Elementary.S04E12",
        info_hash: "9c8b3a2f1d6e4a5b7c0d8f2e9a1b3c4d5e6f7a8b",
        resource_name:
          "Abbott.Elementary.S04E12.1080p.WEB-DL.DDP5.1.x264-NTb.mkv",
        force: false,
        is_priority: false,
        process_method: "hardlink",
        delete_on: false,
        failed: false,
        proc_type: "auto",
        ignore_subs: false,
      },
    },
    {
      identifier: "pp-queued",
      name: "Post Process",
      priority: "high",
      actionId: 1,
      queueTime: ago(8),
      success: null,
      inProgress: false,
      startTime: null,
      updateTime: null,
      config: {
        path: "/downloads/manual",
        info_hash: null,
        resource_name: "SPY.x.FAMILY.S03E08.MULTi.1080p.WEB.H264-FW.mkv",
        force: true,
        is_priority: true,
        process_method: "move",
        delete_on: true,
        failed: false,
        proc_type: "manual",
        ignore_subs: false,
      },
    },
    {
      identifier: "pp-done",
      name: "Post Process",
      priority: "normal",
      actionId: 1,
      queueTime: ago(240),
      success: true,
      inProgress: false,
      startTime: ago(220),
      updateTime: ago(180),
      config: {
        path: "/downloads/complete/Killing.Eve.S04E08",
        info_hash: "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b",
        resource_name: "Killing.Eve.S04E08.1080p.BluRay.x264-iON.mkv",
        force: false,
        is_priority: false,
        process_method: "hardlink",
        delete_on: false,
        failed: false,
        proc_type: "auto",
        ignore_subs: false,
      },
    },
    {
      identifier: "pp-failed",
      name: "Post Process",
      priority: "normal",
      actionId: 1,
      queueTime: ago(360),
      success: false,
      inProgress: false,
      startTime: ago(330),
      updateTime: ago(300),
      config: {
        path: "/downloads/complete/unknown_release",
        info_hash: null,
        resource_name: "unknown_release.mkv",
        force: false,
        is_priority: false,
        process_method: "copy",
        delete_on: false,
        failed: true,
        proc_type: "auto",
        ignore_subs: false,
      },
    },
  ],
};
const MOCK_LIVE_QUEUE: LiveQueueItem[] = [
  {
    // Download handler heartbeat — drives the top banner.
    identifier: "dh-1",
    name: "DOWNLOADHANDLER",
    queueTime: ago(5),
    isActive: true,
    force: false,
  },
  {
    identifier: "search-daily",
    name: "Daily Search",
    priority: "normal",
    actionId: 10,
    queueTime: ago(40),
    startTime: ago(35),
    updateTime: ago(2),
    inProgress: true,
    success: null,
    force: false,
  },
  {
    identifier: "search-manual-spy",
    name: "MANUAL-120089",
    priority: "high",
    actionId: 11,
    queueTime: ago(25),
    startTime: ago(20),
    updateTime: ago(1),
    inProgress: true,
    success: null,
    show: {
      id: { slug: "tmdb120089" },
      title: "SPY x FAMILY",
    },
    segment: [
      { identifier: "s03e08", season: 3, episode: 8, title: "Operation X" },
      { identifier: "s03e09", season: 3, episode: 9, title: "Pretty Penny" },
    ],
    manualSearchType: "episode",
  },
  {
    identifier: "search-backlog-aot",
    name: "BACKLOG-1429",
    priority: "low",
    actionId: 12,
    queueTime: ago(95),
    startTime: null,
    updateTime: null,
    inProgress: false,
    success: null,
    show: {
      id: { slug: "tmdb1429" },
      title: "Attack on Titan",
    },
    segment: Array.from({ length: 12 }, (_, i) => ({
      identifier: `s04e${String(i + 17).padStart(2, "0")}`,
      season: 4,
      episode: i + 17,
    })),
  },
  {
    identifier: "search-snatch-killing",
    name: "SNATCH-72750",
    priority: "normal",
    actionId: 13,
    queueTime: ago(60),
    startTime: ago(50),
    updateTime: ago(10),
    inProgress: false,
    success: true,
    show: {
      id: { slug: "tmdb72750" },
      title: "Killing Eve",
    },
    segment: [{ identifier: "s04e08", season: 4, episode: 8 }],
  },
  {
    identifier: "search-retry-flcl",
    name: "RETRY-5895",
    priority: "normal",
    actionId: 14,
    queueTime: ago(140),
    startTime: ago(130),
    updateTime: ago(100),
    inProgress: false,
    success: false,
    show: {
      id: { slug: "tmdb5895" },
      title: "FLCL",
    },
    segment: [{ identifier: "s02e01", season: 2, episode: 1 }],
  },
  {
    identifier: "search-proper",
    name: "Proper Search",
    priority: "normal",
    actionId: 15,
    queueTime: ago(420),
    startTime: ago(415),
    updateTime: ago(380),
    inProgress: false,
    success: true,
    force: true,
  },
];
// ============================================================================
// /MOCK DATA
// ============================================================================

export default function Queue() {
  const queryClient = useQueryClient();

  const live = useQuery({
    queryKey: SYSTEM_KEY,
    queryFn: ({ signal }) =>
      api.get<SystemConfig>("/config/system", { signal }).then((r) => r.data),
    enabled: !MOCK_QUEUE,
  });

  // Live-queue cache is WS-populated from Layout. We use a useQuery purely to
  // get a reactive subscription to it — queryFn returns the existing value
  // (or empty) and we never refetch.
  const { data: liveRaw = [] } = useQuery<LiveQueueItem[]>({
    queryKey: LIVE_QUEUE_KEY,
    queryFn: () =>
      queryClient.getQueryData<LiveQueueItem[]>(LIVE_QUEUE_KEY) ?? [],
    staleTime: Infinity,
  });
  const liveItems: LiveQueueItem[] = MOCK_QUEUE ? MOCK_LIVE_QUEUE : liveRaw;

  const data = MOCK_QUEUE ? MOCK_SYSTEM : live.data;
  const isLoading = MOCK_QUEUE ? false : live.isLoading;
  const isFetching = MOCK_QUEUE ? false : live.isFetching;
  const refetch = MOCK_QUEUE ? () => {} : live.refetch;

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
    <div className="space-y-12">
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
          {showTitle ? (
            showSlug ? (
              <Link
                to={`/show/${showSlug}`}
                className="mb-1 text-sm font-medium hover:underline truncate block"
              >
                {showTitle}
              </Link>
            ) : (
              <span className="mb-1 text-sm font-medium truncate block">
                {showTitle}
              </span>
            )
          ) : null}
          <div className="text-xs text-base-content/50">
            {segCount > 0 && (
              <>
                {segCount} episode{segCount === 1 ? "" : "s"} ·{" "}
              </>
            )}
            queued {formatRelative(item.queueTime)}
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
            Added {formatRelative(item.added)}
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
      <div className="mb-3 flex items-center gap-2 flex-wrap">
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

// Lightweight relative time formatter using Intl.RelativeTimeFormat. Avoids
// pulling in date-fns / dayjs for one helper.
const RTF = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
function formatRelative(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const diff = (t - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return RTF.format(Math.round(diff), "second");
  if (abs < 3600) return RTF.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return RTF.format(Math.round(diff / 3600), "hour");
  return RTF.format(Math.round(diff / 86400), "day");
}
