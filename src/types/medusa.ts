// ── Series ──
// Shape from PyMedusa /api/v2/series. Identifier is `id.slug` (stable, URL-safe).
export interface SeriesId {
  tmdb: number | null;
  tvdb: number | null;
  slug: string;
  trakt: number | null;
}

export interface SeriesExternals {
  imdb?: number | string;
  tvdb?: number;
  tvrage?: number;
  tvmaze?: number;
}

export interface SeriesConfig {
  location: string;
  rootDir: string;
  locationValid: boolean;
  qualities: {
    allowed: number[];
    preferred: number[];
  };
  paused: boolean;
  airByDate: boolean;
  subtitlesEnabled: boolean;
  dvdOrder: boolean;
  seasonFolders: boolean;
  anime: boolean;
  scene: boolean;
  sports: boolean;
  defaultEpisodeStatus: string;
  airdateOffset: number;
  showLists: string[];
}

export interface Series {
  id: SeriesId;
  externals: SeriesExternals;
  title: string;
  name: string;
  indexer: string;
  network: string | null;
  type: string;
  status: string;
  airs: string | null;
  language: string;
  showType: "series" | "anime";
  year: { start: number };
  prevAirDate: string | null;
  nextAirDate: string | null;
  lastUpdate: string | null;
  runtime: number;
  genres: string[];
  plot: string | null;
  cache: {
    poster: string | null;
    banner: string | null;
  };
  countries: string[];
  countryCodes: string[];
  config: SeriesConfig;
  // Present when fetched with ?detailed=true — what PyMedusa thinks the
  // season layout is, independent of which episodes it actually has stored.
  seasonCount?: { season: number; episodeCount: number }[];
}

// ── Episode (PyMedusa v2: GET /series/{slug}/episodes returns Episode[]) ──
export interface Episode {
  identifier: string; // "s03e07" — used as key in PATCH body
  id: {
    tvdb?: number;
    tvmaze?: number;
    imdb?: string;
  };
  season: number;
  episode: number;
  absoluteNumber?: number;
  airDate: string | null;
  title: string;
  description: string;
  subtitles: string[];
  status: EpisodeStatus;
  release?: {
    name: string;
    group: string;
    proper: boolean;
    version: number;
  };
  file?: {
    location: string;
    size: number;
  };
  watched?: boolean;
}

// Status values are returned as title-case strings.
export type EpisodeStatus =
  | "Unaired"
  | "Snatched"
  | "Wanted"
  | "Downloaded"
  | "Skipped"
  | "Archived"
  | "Ignored"
  | "Snatched (Proper)"
  | "Subtitled"
  | "Failed"
  | "Snatched (Best)";

// Integer codes for PATCH /series/{slug}/episodes — status is sent as a
// number. Values mirror medusa/common.py; note Subtitled=10 sits between
// Snatched (Proper)=9 and Failed=11.
// Valid values for config.defaultEpisodeStatus on the per-show settings form.
// Other EpisodeStatus values exist (Snatched, Downloaded, etc.) but aren't
// meaningful as defaults — they apply to the lifecycle of an episode, not the
// "what to do with newly-discovered episodes" policy.
export const DEFAULT_EPISODE_STATUSES = [
  "Wanted",
  "Skipped",
  "Ignored",
  "Archived",
] as const

export const EPISODE_STATUS_CODE: Record<EpisodeStatus, number> = {
  Unaired: 1,
  Snatched: 2,
  Wanted: 3,
  Downloaded: 4,
  Skipped: 5,
  Archived: 6,
  Ignored: 7,
  "Snatched (Proper)": 9,
  Subtitled: 10,
  Failed: 11,
  "Snatched (Best)": 12,
};

// ── API responses ──
export interface SeriesListResponse {
  data: Series[];
  total: number;
}

export interface SeriesDetailResponse {
  data: Series;
}

// Show-search response: PyMedusa returns positional tuples, one per match,
// from `/api/v2/internal/searchIndexersForShowName`. The handler in
// medusa/server/api/v2/internal.py:resource_search_indexers_for_show_name
// emits tuples as:
//   [indexerName, indexerInternalId, showUrl, showId, seriesName,
//    firstAired ("N/A" if unknown), network ("N/A" if missing),
//    sanitizedName, alreadyInLibrary (false | [name, id])]
// We map those to objects at the query-fn boundary so consumers see a
// normal shape. No posters / overview / plot here — those only appear
// after the show is added and the indexer fetch completes.
export interface SearchResult {
  indexer: string; // 'tvdb' | 'tmdb' | 'imdb' | 'tvmaze' | …
  showId: number; // id of the show in `indexer`'s namespace — used in POST /series
  title: string;
  firstAired: string | null; // 'YYYY-MM-DD' or null when unknown
  network: string | null;
  showUrl: string;
  // When the show already exists in PyMedusa's library, the backend returns
  // [indexerName, seriesId] at tuple position 8; we collapse it into the slug
  // ("tvdb12345") so the UI can link straight to /show/{slug}.
  alreadyAddedSlug: string | null;
}

// PyMedusa quality bitmask values from medusa/common.py:Quality. Note the
// class starts shifts at `1 << 1` (so SDTV = 2, NOT 1) — getting the indexing
// wrong silently sends the wrong qualities to the backend and reads the wrong
// labels back. The trailing comment is the human label from `qualityStrings`.
export const QUALITY = {
  UNKNOWN: 1,
  SDTV: 2, // 'SDTV'
  SDDVD: 4, // 'SD DVD'
  HDTV: 8, // '720p HDTV'
  RAWHDTV: 16, // 'RawHD'
  FULLHDTV: 32, // '1080p HDTV'
  HDWEBDL: 64, // '720p WEB-DL'
  FULLHDWEBDL: 128, // '1080p WEB-DL'
  HDBLURAY: 256, // '720p BluRay'
  FULLHDBLURAY: 512, // '1080p BluRay'
  UHD_4K_TV: 1024, // '4K UHD TV'
  UHD_4K_WEBDL: 2048, // '4K UHD WEB-DL'
  UHD_4K_BLURAY: 4096, // '4K UHD BluRay'
} as const;

// Default profile used when a user adds a show without picking qualities.
// Matches the [8, 32, 64, 128, 256, 512] seen on existing shows in the user's
// library — Any HD across TV / WEB / BluRay sources, no SD, no 4K.
export const DEFAULT_QUALITY_ALLOWED = [
  QUALITY.HDTV,
  QUALITY.FULLHDTV,
  QUALITY.HDWEBDL,
  QUALITY.FULLHDWEBDL,
  QUALITY.HDBLURAY,
  QUALITY.FULLHDBLURAY,
];

// Curated quality presets for the Add Show / Settings forms. Keys are stable
// identifiers for state; labels are user-facing; `allowed` is the bitmask
// array sent in the POST /series and PATCH /series bodies. `any_hd` matches
// what every existing show in the user's library has — kept as the default.
export const QUALITY_PRESETS: Record<
  string,
  { label: string; allowed: number[] }
> = {
  any_hd: {
    label: "Any HD (default)",
    allowed: DEFAULT_QUALITY_ALLOWED,
  },
  any_hd_4k: {
    label: "Any HD or 4K",
    allowed: [
      ...DEFAULT_QUALITY_ALLOWED,
      QUALITY.UHD_4K_WEBDL,
      QUALITY.UHD_4K_BLURAY,
    ],
  },
  fullhd_only: {
    label: "1080p only",
    allowed: [QUALITY.FULLHDWEBDL, QUALITY.FULLHDBLURAY],
  },
  uhd_only: {
    label: "4K only",
    allowed: [QUALITY.UHD_4K_WEBDL, QUALITY.UHD_4K_BLURAY],
  },
  sd: {
    label: "Any SD",
    allowed: [QUALITY.SDTV, QUALITY.SDDVD],
  },
};

export interface Release {
  provider: string;
  title: string;
  url: string;
  size: number;
  seeders: number;
  leechers: number;
  peers: number;
  pubdate: string;
  quality: string;
  releaseGroup: string | null;
}

export interface ScheduleEntry {
  season: number;
  episode: number;
  airDate: string | null;
  name: string;
  seriesTitle: string;
  seriesId: number;
}

// Shape per medusa/server/api/v2/history.py rows. `status` is the integer
// from medusa/common.py; `statusName` is the server-formatted label, so we
// don't need a client-side enum map.
export interface HistoryEntry {
  id: number;
  showSlug: string;
  showTitle: string;
  series: string; // duplicate of showSlug; kept because the backend sends both
  season: number;
  episode: number;
  episodeTitle: string;
  status: number;
  statusName: string; // e.g. 'Snatched', 'Downloaded', 'Failed', 'Subtitled'
  actionDate: number; // YYYYMMDDHHMMSS integer (sbdatetime.encode)
  quality: number; // bitmask — single bit set in practice; see QUALITY_NAMES
  resource: string;
  size: number;
  properTags: string;
  manuallySearched: boolean;
  infoHash: string | null;
  provider: { id: string; name: string; imageName: string };
  releaseName: string | null;
  releaseGroup: string | null;
  fileName: string | null;
  subtitleLanguage: string | null;
  providerType: string;
  clientStatus: { status: number[]; string: string } | null;
  partOfBatch: boolean;
}

// Friendly labels for the quality bitmask values declared in QUALITY above.
// Each history row's `quality` is a single bit; map to a short display string.
// Strings mirror medusa/common.py:Quality.qualityStrings.
export const QUALITY_NAMES: Record<number, string> = {
  [QUALITY.UNKNOWN]: "Unknown",
  [QUALITY.SDTV]: "SDTV",
  [QUALITY.SDDVD]: "SD DVD",
  [QUALITY.HDTV]: "720p HDTV",
  [QUALITY.RAWHDTV]: "RawHD",
  [QUALITY.FULLHDTV]: "1080p HDTV",
  [QUALITY.HDWEBDL]: "720p WEB-DL",
  [QUALITY.FULLHDWEBDL]: "1080p WEB-DL",
  [QUALITY.HDBLURAY]: "720p BluRay",
  [QUALITY.FULLHDBLURAY]: "1080p BluRay",
  [QUALITY.UHD_4K_TV]: "4K UHD TV",
  [QUALITY.UHD_4K_WEBDL]: "4K UHD WEB-DL",
  [QUALITY.UHD_4K_BLURAY]: "4K UHD BluRay",
};

export function qualityName(value: number): string {
  return QUALITY_NAMES[value] ?? `Q-${value}`;
}

// Returns the QUALITY_PRESETS key (e.g. 'any_hd') whose `allowed` matches the
// input exactly, or null when no preset fits. Sorted comparison so ordering
// differences don't trip us up.
export function detectQualityPreset(allowed: number[]): string | null {
  const a = [...allowed].sort((x, y) => x - y);
  for (const [key, preset] of Object.entries(QUALITY_PRESETS)) {
    const b = [...preset.allowed].sort((x, y) => x - y);
    if (a.length === b.length && a.every((v, i) => v === b[i])) return key;
  }
  return null;
}

// Short label for a show's quality config — preset name when one fits, or
// 'Custom' otherwise. Strips the trailing '(default)' for use in tight
// chrome like header badges.
export function qualitySummary(allowed: number[]): string {
  const key = detectQualityPreset(allowed);
  if (key) return QUALITY_PRESETS[key].label.replace(/\s*\([^)]+\)\s*$/, "");
  return "Custom";
}

// daisyUI badge classes for series status strings emitted by PyMedusa
// ("Continuing", "Ended", "Canceled", and the occasional "Unknown"). Returned
// classes pair with `badge badge-xs` (or any size).
export function seriesStatusBadgeClass(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("continu") || s.includes("running")) {
    return "badge-soft badge-success";
  }
  if (s.includes("cancel")) {
    return "badge-soft badge-error";
  }
  return "badge-soft";
}

// Show queue items (refresh / update / rename / etc.) — shape from
// _queued_show_to_json in medusa/queues/utils.py.
export interface ShowQueueItem {
  showSlug: string | null;
  showTitle: string | null;
  showDir: string | null;
  inProgress: boolean;
  priority: "low" | "normal" | "high" | number;
  added: string; // ISO datetime
  actionId: number;
  queueType: string; // 'REFRESH' | 'UPDATE' | 'RENAME' | 'ADD' | ...
}

// Post-processing queue items — base shape from generic_queue.QueueItem.to_json
// plus the `config` block added in medusa/process_tv.py:PostProcessQueueItem
// (and `output` once the job finishes successfully).
export interface PostProcessQueueItem {
  identifier: string;
  name: string;
  priority: "low" | "normal" | "high" | number;
  actionId: number;
  queueTime: string;
  success: boolean | null;
  inProgress: boolean;
  startTime: string | null;
  updateTime: string | null;
  config?: {
    path: string;
    info_hash: string | null;
    resource_name: string;
    force: boolean;
    is_priority: boolean;
    process_method: "copy" | "move" | "hardlink" | "symlink" | string;
    delete_on: boolean;
    failed: boolean;
    proc_type: "auto" | "manual" | string;
    ignore_subs: boolean;
  };
  output?: string;
  [extra: string]: unknown;
}

// Scheduler entry from medusa/schedulers/utils.py:_scheduler_to_json. When a
// scheduler isn't initialized, only key + name are present; all others optional.
//
// `isEnabled` is normally a bool, but `_is_enabled()` returns the literal
// string 'Paused' for key === 'backlog' when the backlog is paused — so we
// widen the type rather than try to coerce.
export interface SchedulerItem {
  key: string;
  name: string;
  isAlive?: boolean;
  isEnabled?: boolean | "Paused";
  isActive?: boolean;
  startTime?: string | null;
  cycleTime?: number | null; // seconds between runs
  nextRun?: number | null; // seconds until next run; null if disabled
  lastRun?: string;
  isSilent?: boolean;
  queueLength?: number;
}

// Disk space block from medusa/queues/utils.py:generate_location_disk_space.
// `freeSpace` is a pre-formatted string ('123.4 GB'); no total or percentage.
export interface DiskSpaceEntry {
  type: string;
  location: string;
  freeSpace: string;
}

export interface DiskSpace {
  tvDownloadDir: DiskSpaceEntry;
  rootDir: DiskSpaceEntry[];
}

// /api/v2/config/system response. Used by both the Queue page (showQueue +
// postProcessQueue) and the System page (everything else).
export interface SystemConfig {
  showQueue: ShowQueueItem[];
  postProcessQueue: PostProcessQueueItem[];
  schedulers?: SchedulerItem[];
  diskSpace?: DiskSpace;
  memoryUsage?: string;
  branch?: string;
  commitHash?: string;
}

// Items that arrive only via WebSocket QueueItemUpdate events — search
// (daily/manual/backlog/snatch/retry/proper) and the download handler
// heartbeat. There's no HTTP endpoint to list them; we accumulate state
// from events as they come in.
//
// Shape is the union of fields we've seen across emitters in
// medusa/search/queue.py and medusa/schedulers/download_handler.py; all
// non-base fields are optional since the emitters extend differently.
export interface LiveQueueEpisodeSegment {
  identifier?: string;
  season?: number;
  episode?: number;
  title?: string;
}

export interface LiveQueueItem {
  identifier: string;
  name: string;
  priority?: "low" | "normal" | "high" | number;
  actionId?: number;
  queueTime: string;
  startTime?: string | null;
  updateTime?: string | null;
  inProgress?: boolean;
  success?: boolean | null;
  show?: { id?: { slug?: string }; title?: string; name?: string };
  segment?: LiveQueueEpisodeSegment[];
  manualSearchType?: string;
  isActive?: boolean; // DOWNLOADHANDLER only
  force?: boolean;
  [extra: string]: unknown;
}

export type LiveQueueCategory =
  | "search"
  | "snatch"
  | "downloadHandler"
  | "other";

// Classify a QueueItemUpdate by its `name` field. The legend below mirrors the
// emitter source — keep in sync if PyMedusa adds new queue types.
export function categorizeLiveItem(name: string): LiveQueueCategory {
  if (name === "DOWNLOADHANDLER") return "downloadHandler";
  if (name.startsWith("SNATCH-")) return "snatch";
  if (
    name === "Daily Search" ||
    name === "Proper Search" ||
    name.startsWith("MANUAL-") ||
    name.startsWith("BACKLOG-") ||
    name.startsWith("RETRY-")
  ) {
    return "search";
  }
  return "other";
}

// Short label for the badge on a search-row.
export function searchTypeLabel(name: string): string {
  if (name === "Daily Search") return "DAILY";
  if (name === "Proper Search") return "PROPER";
  if (name.startsWith("MANUAL-")) return "MANUAL";
  if (name.startsWith("BACKLOG-")) return "BACKLOG";
  if (name.startsWith("RETRY-")) return "RETRY";
  if (name.startsWith("SNATCH-")) return "SNATCH";
  return name.toUpperCase();
}
