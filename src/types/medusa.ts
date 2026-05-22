// `id.slug` is the stable, URL-safe identifier used in all v2 routes.
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
  // Total bytes on disk — only present when fetched with ?detailed=true.
  size?: number;
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

// Valid values for config.defaultEpisodeStatus on the per-show settings form
// - only these four are meaningful as a "what to do with newly-discovered
// episodes" policy. Other EpisodeStatus values are lifecycle-only.
export const DEFAULT_EPISODE_STATUSES = [
  "Wanted",
  "Skipped",
  "Ignored",
  "Archived",
] as const;

// Slug = INDEXER_ID_TO_SLUG[indexerId] + seriesId, e.g. "tmdb" + 125935.
export interface ShowStat {
  indexerId: number;
  seriesId: number;
  epSnatched: number;
  epDownloaded: number;
  epTotal: number;
  epAirsNext: string | null;
  epAirsPrev: string | null;
  seriesSize: number;
  airs: string | null;
  network: string | null;
}

export interface ShowStatsResponse {
  stats: ShowStat[];
  maxDownloadCount: number;
}

// Mirrors medusa/indexers/config.py.
export const INDEXER_ID_TO_SLUG: Record<number, string> = {
  1: "tvdb",
  3: "tvmaze",
  4: "tmdb",
  10: "imdb",
};

// Numeric codes for PATCH /series/{slug}/episodes. Mirrors medusa/common.py;
// note the gap between 7 and 9 (no 8) and that Subtitled is 10, not Failed.
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

export interface SeriesListResponse {
  data: Series[];
  total: number;
}

export interface SeriesDetailResponse {
  data: Series;
}

// Normalised from the positional tuples returned by
// `/api/v2/internal/searchIndexersForShowName` (see SearchResultTuple in AddShow.tsx).
// No poster / overview here — those only land after the show is added
// and the indexer fetch completes.
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

// GET /api/v2/recommended/{source}, paginated. Source identifiers: "imdb",
// "trakt", "anidb", "anilist".
export interface RecommendedShow {
  // Numeric external source id (EXTERNAL_IMDB etc.) — also indexes the categories response.
  source: number;
  seriesId: number;
  title: string;
  // The TVDB/TMDB/etc. mapping Medusa resolves so it can be added.
  // May be 0 when the source hasn't been resolved to a known indexer.
  mappedIndexer: number;
  // Display name like "TVDBv2", convert to slug for POST /series.
  mappedIndexerName: string | null;
  mappedSeriesId: number;
  rating: string; // "8.4" as string
  votes: number;
  imageHref: string; // outbound link to the show on the source's site
  imageSrc: string; // local cache path like "cache/images/imdb/<id>.jpg"
  externals: Record<string, number | string>;
  isAnime: boolean;
  // Already in the user's library? Backend computes this.
  showInLibrary: boolean;
  subcat: string; // category bucket: "popular", "trending", …
  genres: string[];
  plot: string;
}

// GET /api/v2/recommended/categories. Keys are stringified source ids,
// values are the available subcategories for that source.
export type RecommendedCategories = Record<string, string[]>;

// Source-id ↔ readable name for show recommendations.
// EXTERNAL_* constants from medusa/indexers/config.py
// the backend keys the categories dict by these numeric ids.
export const RECOMMENDED_SOURCES: {
  id: number;
  slug: "imdb" | "anidb" | "trakt" | "anilist";
  label: string;
}[] = [
  { id: 12, slug: "trakt", label: "Trakt" },
  { id: 10, slug: "imdb", label: "IMDb" },
  { id: 11, slug: "anidb", label: "AniDB" },
  { id: 13, slug: "anilist", label: "AniList" },
];

// Bitmask values from medusa/common.py:Quality.
// Shifts start at `1 << 1`, so SDTV = 2, NOT 1
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

// Default quality bitmasks: Any HD (TV / WEB / BluRay), no SD, no 4K
export const DEFAULT_QUALITY_ALLOWED = [
  QUALITY.HDTV,
  QUALITY.FULLHDTV,
  QUALITY.HDWEBDL,
  QUALITY.FULLHDWEBDL,
  QUALITY.HDBLURAY,
  QUALITY.FULLHDBLURAY,
];

// Keys are stable form-state identifiers;
// `allowed` is the bitmask array sent in POST/PATCH /series bodies.
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

// Full shape from medusa/providers/generic_provider.py:to_json.
// Optional blocks only exist on certain provider types. `cookies` is everywhere.
// `apikey`, `minseed`, etc are gated by `hasattr` on the Python side.
export interface ProviderConfig {
  enabled: boolean;
  url?: string;
  customUrl?: string | null;
  username?: string | null;
  password?: string | null;
  apikey?: string | null;
  search: {
    mode?: string; // 'eponly' | 'sponly'
    fallback?: boolean | number;
    separator?: string;
    seasonTemplates?: unknown;
    manual: { enabled: boolean };
    backlog: { enabled: boolean };
    daily: { enabled: boolean; maxRecentItems?: number; stopAt?: number };
    delay: { enabled: boolean; duration: number };
  };
  cookies?: { enabled?: boolean; values?: string; required?: string[] };
  // Torrent-only:
  minseed?: number;
  minleech?: number;
  ratio?: number | string;
  clientRatio?: number;
  passkey?: string | null;
  digest?: string | null;
  hash?: string | null;
  pin?: string | null;
  pid?: string | null;
  confirmed?: boolean;
  ranked?: boolean;
  sorting?: string;
  // Newznab-only:
  catIds?: string[];
  params?: Record<string, unknown>;
}

// `manager` / `idManager` are only present when the provider's __init__ set them.
// Newznab/Torznab always do (manager defaults to null), other built-in providers don't.
// `manager === 'prowlarr'` marks Prowlarr-imported indexers.
export interface ProviderSummary {
  id: string;
  name: string;
  imageName: string;
  type: string; // 'nzb' | 'torrent'
  subType: string; // 'newznab' | 'torznab' | 'torrentrss' | 'generic' | …
  public: boolean;
  manager?: string | null;
  idManager?: string;
  animeOnly?: boolean;
  needsAuth?: boolean;
  supportsBacklog?: boolean;
  supportsAbsoluteNumbering?: boolean;
  default?: boolean;
  url?: string;
  urls?: string[];
  btCacheUrls?: string[];
  properStrings?: string[];
  headers?: Record<string, string>;
  config: ProviderConfig;
}

export interface ProwlarrIndexer {
  id: number;
  name: string;
  protocol: "usenet" | "torrent";
  privacy?: "public" | "private" | "semiPrivate";
  enable?: boolean;
  language?: string;
}

export interface CachedRelease {
  // Cache rowid; pass back to `home/pickManualSearch` to snatch.
  identifier: string;
  release: string;
  season: number;
  episodes: number[];
  seasonPack: boolean;
  indexer: number;
  seriesId: number;
  showSlug: string;
  url: string;
  infoUrl: string | null;
  time: string;
  // PyMedusa quality bitmask (see QUALITY constants).
  quality: number;
  releaseGroup: string | null;
  dateAdded: string;
  version: number;
  // Torrent metrics: -1 means N/A (Usenet results).
  seeders: number;
  size: number;
  leechers: number;
  pubdate: string | null;
  provider: {
    id: string;
    name: string;
    imageName: string;
  };
}

export interface ScheduleEntry {
  airdate: string; // 'YYYY-MM-DD'
  airs: string; // schedule string like 'Tuesday 0:00AM'
  localAirTime: string; // ISO datetime in viewer's local zone (server-computed)
  epName: string;
  epPlot: string;
  season: number;
  episode: number;
  episodeSlug: string; // 's03e08'
  indexerId: number;
  indexer: string;
  network: string | null;
  paused: boolean;
  quality: number;
  showSlug: string;
  showName: string;
  showStatus: string;
  tvdbid: number | null;
  weekday: number;
  runtime: number;
}

export type ScheduleSection = "missed" | "today" | "soon" | "later";

export type ScheduleResponse = Record<ScheduleSection, ScheduleEntry[]>;

// `statusName` is the server-formatted label, so no client-side enum map.
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

// Sorted-array comparison so storage order doesn't matter.
export function detectQualityPreset(allowed: number[]): string | null {
  const a = [...allowed].sort((x, y) => x - y);
  for (const [key, preset] of Object.entries(QUALITY_PRESETS)) {
    const b = [...preset.allowed].sort((x, y) => x - y);
    if (a.length === b.length && a.every((v, i) => v === b[i])) return key;
  }
  return null;
}

// Strips the trailing '(default)' suffix so it fits in tight badge chrome.
export function qualitySummary(allowed: number[]): string {
  const key = detectQualityPreset(allowed);
  if (key) return QUALITY_PRESETS[key].label.replace(/\s*\([^)]+\)\s*$/, "");
  return "Custom";
}

// daisyUI classes for series status strings emitted by PyMedusa to be used in badges
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

// `output` is only present once the job finishes successfully.
// All fields optional because consumers see different snapshots of the underlying QueueItem at different stages.
// Queue page reads the basic state fields,
// PostProcess page reads queueTime / output / config in detail.
// Backend setup is in medusa/queues/generic_queue.py and medusa/process_tv.py.
export interface PostProcessQueueItem {
  identifier: string;
  name: string;
  priority?: "low" | "normal" | "high" | number;
  actionId?: number;
  queueTime?: string;
  success?: boolean | null;
  inProgress?: boolean;
  startTime?: string | null;
  updateTime?: string | null;
  config?: {
    path?: string;
    info_hash?: string | null;
    resource_name?: string;
    force?: boolean;
    is_priority?: boolean;
    process_method?: string;
    delete_on?: boolean;
    failed?: boolean;
    proc_type?: string;
    ignore_subs?: boolean;
  };
  output?: string[];
}

// Uninitialised schedulers only have key + name.
// `isEnabled` widens to "Paused" because `_is_enabled()` returns that literal
// for key === 'backlog' when the backlog is paused.
// Better to widen the type here to not loose information.
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

export interface SystemConfig {
  showQueue: ShowQueueItem[];
  postProcessQueue: PostProcessQueueItem[];
  schedulers?: SchedulerItem[];
  diskSpace?: DiskSpace;
  memoryUsage?: string;
  branch?: string;
  commitHash?: string;
}

// Search and download-handler items only arrive via WebSocket;
// no HTTP endpoint lists them. Non-base fields are optional because
// different emitters (search/queue.py, download_handler.py) extend the base shape.
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

// Keep in sync with PyMedusa's queue-name emitters if new types are added.
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

export function searchTypeLabel(name: string): string {
  if (name === "Daily Search") return "DAILY";
  if (name === "Proper Search") return "PROPER";
  if (name.startsWith("MANUAL-")) return "MANUAL";
  if (name.startsWith("BACKLOG-")) return "BACKLOG";
  if (name.startsWith("RETRY-")) return "RETRY";
  if (name.startsWith("SNATCH-")) return "SNATCH";
  return name.toUpperCase();
}
