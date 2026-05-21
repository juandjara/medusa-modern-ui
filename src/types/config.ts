// Shapes returned by Medusa's config endpoints. One interface per
// endpoint, composed from named sub-interfaces. Pages should import
// the relevant top-level type and access only the fields they need
//
// Backend sources of truth: medusa/server/api/v2/config.py (data_main,
// data_clients, data_postprocessing, data_search).

// -----------------------------------------------------------------------------
// /api/v2/config/main
// -----------------------------------------------------------------------------

export interface WebInterfaceCfg {
  apiKey: string;
  log: boolean;
  username: string;
  password: string;
  port: number;
  host: string;
  notifyOnLogin: boolean;
  ipv6: boolean;
  httpsEnable: boolean;
  httpsCert: string;
  httpsKey: string;
  handleReverseProxy: boolean;
}

export interface ConfigMain {
  webInterface: WebInterfaceCfg;
  // Wire shape: [defaultIndexAsString, path0, path1, ...]. Empty means no dirs.
  rootDirs: string[];
  webRoot: string;
  cpuPreset: string;
  noRestart: boolean;
  encryptionVersion: boolean;
  calendarUnprotected: boolean;
  calendarIcons: boolean;
  versionNotify: boolean;
  autoUpdate: boolean;
  updateFrequency: number;
  notifyOnUpdate: boolean;
  indexerDefault: number;
  indexerDefaultLanguage: string;
  indexerTimeout: number;
  showUpdateHour: number;
  recommendedShowUpdateHour?: number;
  proxySetting: string;
  proxyProviders: boolean;
  proxyIndexers: boolean;
  proxyClients: boolean;
  proxyOthers: boolean;
  brokenProviders?: string[];
  providers?: {
    prowlarr?: {
      url?: string;
      apikey?: string;
    };
  };
}

// -----------------------------------------------------------------------------
// /api/v2/config/clients
// -----------------------------------------------------------------------------

export interface NzbgetCfg {
  host: string;
  username: string;
  password: string;
  useHttps: boolean;
  category: string;
  categoryAnime: string;
  categoryAnimeBacklog: string;
  categoryBacklog: string;
  priority: number;
}

export interface SabnzbdCfg {
  host: string;
  username: string;
  password: string;
  apiKey: string;
  category: string;
  categoryAnime: string;
  categoryAnimeBacklog: string;
  categoryBacklog: string;
  forced: boolean;
}

export interface TorrentCfg {
  enabled: boolean;
  method: string;
  host: string;
  username: string;
  password: string;
  authType: string;
  rpcUrl: string;
  dir: string;
  path: string;
  label: string;
  labelAnime: string;
  seedLocation: string;
  seedTime: number;
  paused: boolean;
  stopped: boolean;
  highBandwidth: boolean;
  saveMagnetFile: boolean;
  verifySSL: boolean;
}

export interface NzbCfg {
  enabled: boolean;
  dir: string;
  method: string;
  nzbget: NzbgetCfg;
  sabnzbd: SabnzbdCfg;
}

export interface RssCfg {
  dir: string;
  max_items: number;
}

export interface ConfigClients {
  nzb: NzbCfg;
  torrents: TorrentCfg;
  rss: RssCfg;
}

// -----------------------------------------------------------------------------
// /api/v2/config/postprocessing
// -----------------------------------------------------------------------------

export interface NamingCfg {
  pattern: string;
  multiEp: number;
  patternAirByDate: string;
  patternSports: string;
  patternAnime: string;
  enableCustomNamingAirByDate: boolean;
  enableCustomNamingSports: boolean;
  enableCustomNamingAnime: boolean;
  animeMultiEp: number;
  animeNamingType: number;
  stripYear: boolean;
}

export interface DownloadHandlerCfg {
  enabled: boolean;
  frequency: number;
  minFrequency: number;
  torrentSeedRatio: number;
  torrentSeedAction: string;
}

export interface ConfigPostProcessing {
  naming: NamingCfg;
  showDownloadDir: string;
  defaultClientPath: string;
  processAutomatically: boolean;
  postponeIfSyncFiles: boolean;
  postponeIfNoSubs: boolean;
  renameEpisodes: boolean;
  createMissingShowDirs: boolean;
  addShowsWithoutDir: boolean;
  moveAssociatedFiles: boolean;
  nfoRename: boolean;
  airdateEpisodes: boolean;
  unpack: boolean;
  deleteRarContent: boolean;
  noDelete: boolean;
  processMethod: string;
  specificProcessMethod: boolean;
  processMethodTorrent: string;
  processMethodNzb: string;
  reflinkAvailable: boolean;
  autoPostprocessorFrequency: number;
  syncFiles: string[];
  fileTimestampTimezone: string;
  allowedExtensions: string[];
  extraScripts: string[];
  extraScriptsUrl?: string;
  multiEpStrings: Record<string, string>;
  downloadHandler: DownloadHandlerCfg;
  ffmpeg: { checkStreams: boolean; path: string };
}

// -----------------------------------------------------------------------------
// /api/v2/config/search
// -----------------------------------------------------------------------------

export interface FailedDownloadsCfg {
  enabled: boolean;
  deleteFailed: boolean;
}

export interface GeneralSearchCfg {
  randomizeProviders: boolean;
  downloadPropers: boolean;
  checkPropersInterval: string;
  propersSearchDays: number;
  backlogDays: number;
  backlogFrequency: number;
  minBacklogFrequency: number;
  dailySearchFrequency: number;
  minDailySearchFrequency: number;
  usenetRetention: number;
  trackersList: string[];
  allowHighPriority: boolean;
  cacheTrimming: boolean;
  maxCacheAge: number;
  removeFromClient: boolean;
  failedDownloads: FailedDownloadsCfg;
}

export interface SearchFiltersCfg {
  ignored: string[];
  undesired: string[];
  preferred: string[];
  required: string[];
  ignoredSubsList: string[];
  ignoreUnknownSubs: boolean;
}

export interface ConfigSearch {
  general: GeneralSearchCfg;
  filters: SearchFiltersCfg;
}
