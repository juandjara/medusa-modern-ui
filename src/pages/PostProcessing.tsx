import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  Check,
  TriangleAlert,
  Calendar,
  Radio,
  Wrench,
} from "lucide-react";
import api from "../lib/api";

interface NamingConfig {
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

interface DownloadHandlerConfig {
  enabled: boolean;
  frequency: number;
  minFrequency: number;
  torrentSeedRatio: number;
  torrentSeedAction: string;
}

interface PostProcessingConfig {
  naming: NamingConfig;
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
  downloadHandler: DownloadHandlerConfig;
  ffmpeg: { checkStreams: boolean; path: string };
}

const PROCESS_METHODS_BASE: { value: string; label: string }[] = [
  { value: "copy", label: "Copy" },
  { value: "move", label: "Move" },
  { value: "hardlink", label: "Hard link" },
  { value: "symlink", label: "Symbolic link" },
  { value: "keeplink", label: "Keep link (symlink without moving source)" },
];

const TIMEZONE_OPTIONS = [
  { value: "local", label: "Local" },
  { value: "network", label: "Network" },
];

const ANIME_NAMING_TYPE = [
  { value: 1, label: "Use anime pattern" },
  { value: 2, label: "Use normal pattern" },
  { value: 3, label: "Use both" },
];

type DraftMap = Record<string, unknown>;

function getByPath(obj: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (o, k) => (o == null ? o : (o as Record<string, unknown>)[k]),
      obj,
    );
}

function setByPath(obj: Record<string, unknown>, path: string, value: unknown) {
  const keys = path.split(".");
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (!(k in cur) || typeof cur[k] !== "object" || cur[k] === null) {
      cur[k] = {};
    }
    cur = cur[k] as Record<string, unknown>;
  }
  cur[keys[keys.length - 1]] = value;
}

interface ClientsCfgSlim {
  torrents?: { enabled?: boolean; method?: string };
  nzb?: { enabled?: boolean; method?: string };
}

export default function PostProcessing() {
  const queryClient = useQueryClient();

  const configQ = useQuery({
    queryKey: ["config", "postprocessing"],
    queryFn: ({ signal }) =>
      api
        .get<
          { data: PostProcessingConfig } | PostProcessingConfig
        >("/config/postprocessing", { signal })
        .then((r) => {
          const d = r.data as { data?: PostProcessingConfig };
          return d.data ?? (r.data as PostProcessingConfig);
        }),
  });

  // Used by the Trigger section to warn if the configured client doesn't
  // support the Download handler (e.g., Synology DS / MLDonkey raise
  // NotImplementedError on get_status).
  const clientsQ = useQuery({
    queryKey: ["config", "clients"],
    queryFn: ({ signal }) =>
      api
        .get<{ data: ClientsCfgSlim } | ClientsCfgSlim>("/config/clients", {
          signal,
        })
        .then((r) => {
          const d = r.data as { data?: ClientsCfgSlim };
          return d.data ?? (r.data as ClientsCfgSlim);
        }),
  });

  const saved = configQ.data;
  const [draft, setDraft] = useState<DraftMap>({});

  const get = useMemo(
    () =>
      <T,>(path: string): T => {
        if (path in draft) return draft[path] as T;
        return getByPath(saved, path) as T;
      },
    [draft, saved],
  );
  const set = (path: string, value: unknown) =>
    setDraft((d) => ({ ...d, [path]: value }));

  const dirty = Object.keys(draft).some(
    (k) => draft[k] !== getByPath(saved, k),
  );

  const save = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = { postProcessing: {} };
      for (const [path, value] of Object.entries(draft)) {
        setByPath(
          payload.postProcessing as Record<string, unknown>,
          path,
          value,
        );
      }
      return api.patch("/config/main", payload);
    },
    onSuccess: () => {
      setDraft({});
      queryClient.invalidateQueries({ queryKey: ["config", "postprocessing"] });
    },
  });

  if (configQ.isLoading || !saved) {
    return (
      <div className="flex justify-center py-20">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  const processMethods = saved.reflinkAvailable
    ? [
        ...PROCESS_METHODS_BASE,
        { value: "reflink", label: "Reflink (copy-on-write)" },
      ]
    : PROCESS_METHODS_BASE;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-2">
        <Link to="/settings" className="btn btn-ghost btn-sm gap-1">
          <ChevronLeft size={16} /> Settings
        </Link>
      </div>

      <header>
        <h1 className="text-2xl font-bold">Post-processing</h1>
        <p className="text-sm text-base-content/60 mt-1">
          What happens after a download lands: where files come from, how
          they're moved/copied into the library, how they're renamed, and how
          completion is detected.
        </p>
      </header>

      <div className="flex items-center gap-2 sticky top-0 bg-base-200 py-2 z-10">
        <button
          type="button"
          className="btn btn-sm btn-primary"
          onClick={() => save.mutate()}
          disabled={!dirty || save.isPending}
        >
          {save.isPending ? (
            <span className="loading loading-spinner loading-xs" />
          ) : (
            "Save changes"
          )}
        </button>
        {dirty && (
          <span className="text-xs text-warning inline-flex items-center gap-1">
            <TriangleAlert size={12} /> Unsaved changes
          </span>
        )}
        {save.isSuccess && !dirty && (
          <span className="text-xs text-success inline-flex items-center gap-1">
            <Check size={12} /> Saved
          </span>
        )}
        {save.isError && (
          <span className="text-xs text-error inline-flex items-center gap-1">
            <TriangleAlert size={12} /> Save failed
          </span>
        )}
      </div>

      <TriggerSection
        get={get}
        set={set}
        minFreq={saved.downloadHandler.minFrequency}
        clients={clientsQ.data ?? null}
      />
      <GeneralSection get={get} set={set} />
      <MethodSection get={get} set={set} processMethods={processMethods} />
      <FileHandlingSection get={get} set={set} />
      <ShowCreationSection get={get} set={set} />
      <NamingSection
        get={get}
        set={set}
        multiEpStrings={saved.multiEpStrings}
      />
      <FFmpegSection get={get} set={set} />
    </div>
  );
}

type Getter = <T>(path: string) => T;
type Setter = (path: string, value: unknown) => void;

function GeneralSection({ get, set }: { get: Getter; set: Setter }) {
  return (
    <Section title="General">
      <Field
        label="Download directory"
        hint={
          <span>
            Primary input for the <strong>scheduled scanner</strong>. Also used
            as a trusted-root for the <strong>download handler</strong> (PP only
            fires for paths under this folder), as a fallback{" "}
            <code>proc_dir</code> for manual <code>POST /postprocess</code>{" "}
            calls that omit one, and by <strong>subtitle search</strong> and{" "}
            <strong>disk-space reporting</strong>. Safe to leave blank only in{" "}
            <strong>External mode</strong> when your script always passes its
            own path.
          </span>
        }
      >
        <input
          className="input input-sm w-full"
          value={get<string>("showDownloadDir") ?? ""}
          onChange={(e) => set("showDownloadDir", e.target.value)}
          spellCheck={false}
        />
      </Field>

      <Field
        label="Default client path"
        hint="Maps the path the download client reports back to a path Medusa can read. Use when the client runs in a container or on a different host."
      >
        <input
          className="input input-sm w-full"
          value={get<string>("defaultClientPath") ?? ""}
          onChange={(e) => set("defaultClientPath", e.target.value)}
          spellCheck={false}
        />
      </Field>

      <Toggle
        label="Don't delete sources"
        hint="Even if the method would delete the source after copy/move, keep it. Combine with Copy method for non-destructive workflows."
        checked={!!get<boolean>("noDelete")}
        onChange={(v) => set("noDelete", v)}
      />

      <Toggle
        label="Postpone if sync files present"
        hint="Skip processing while files with extensions like .part / .!ut / .crdownload files are still in the folder."
        checked={!!get<boolean>("postponeIfSyncFiles")}
        onChange={(v) => set("postponeIfSyncFiles", v)}
      />

      {get<boolean>("postponeIfSyncFiles") ? (
        <Field
          label="Sync file extensions"
          hint="Extensions to treat as in-progress markers. Comma-separated."
        >
          <CsvInput
            value={get<string[]>("syncFiles") ?? []}
            onChange={(v) => set("syncFiles", v)}
            placeholder=".part, .!ut, .crdownload"
          />
        </Field>
      ) : null}
    </Section>
  );
}

function MethodSection({
  get,
  set,
  processMethods,
}: {
  get: Getter;
  set: Setter;
  processMethods: { value: string; label: string }[];
}) {
  const specific = !!get<boolean>("specificProcessMethod");
  return (
    <Section title="Method">
      <Field
        label={specific ? "Default method" : "Method"}
        hint="How a file gets from the download folder into the library."
      >
        <select
          className="select select-sm"
          value={get<string>("processMethod") ?? "copy"}
          onChange={(e) => set("processMethod", e.target.value)}
        >
          {processMethods.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </Field>

      <Toggle
        label="Per-source method"
        hint="Apply different methods to torrent and NZB downloads — handy when torrents need to keep seeding (hardlink/symlink) but NZB can move."
        checked={specific}
        onChange={(v) => set("specificProcessMethod", v)}
      />

      {specific && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Torrent method">
            <select
              className="select select-sm w-full"
              value={get<string>("processMethodTorrent") ?? "copy"}
              onChange={(e) => set("processMethodTorrent", e.target.value)}
            >
              {processMethods.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="NZB method">
            <select
              className="select select-sm w-full"
              value={get<string>("processMethodNzb") ?? "move"}
              onChange={(e) => set("processMethodNzb", e.target.value)}
            >
              {processMethods.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}

      <Toggle
        label="Unpack RAR archives"
        hint="Extract .rar / multi-part .r## sets before processing."
        checked={!!get<boolean>("unpack")}
        onChange={(v) => set("unpack", v)}
      />
      <Toggle
        label="Delete extracted RAR debris"
        hint="After unpack succeeds, remove the .rar files and leftover artefacts."
        checked={!!get<boolean>("deleteRarContent")}
        onChange={(v) => set("deleteRarContent", v)}
      />
    </Section>
  );
}

function FileHandlingSection({ get, set }: { get: Getter; set: Setter }) {
  const moveAssociated = !!get<boolean>("moveAssociatedFiles");
  const airdateStamp = !!get<boolean>("airdateEpisodes");
  return (
    <Section title="File handling">
      <Toggle
        label="Manage associated files (subtitles, NFOs, posters…)"
        hint="When on, Medusa moves files in the 'Keep' list below alongside the media and DELETES everything else next to it. When off, associated files are left untouched in the download folder."
        checked={moveAssociated}
        onChange={(v) => set("moveAssociatedFiles", v)}
      />

      {moveAssociated && (
        <Field
          label="Keep associated file extensions"
          hint="Whitelist of extensions to move alongside the media. Anything outside this list is deleted. Leave empty to delete every associated file. Comma-separated, no leading dots. Defaults: srt, nfo, sub, idx."
        >
          <CsvInput
            value={get<string[]>("allowedExtensions") ?? []}
            onChange={(v) => set("allowedExtensions", v)}
            placeholder="srt, nfo, sub, idx"
          />
        </Field>
      )}

      <Toggle
        label="Rename NFO files"
        hint="Apply the naming pattern to .nfo files too."
        checked={!!get<boolean>("nfoRename")}
        onChange={(v) => set("nfoRename", v)}
      />
      <Toggle
        label="Stamp episode files with airdate"
        hint="Set the file's mtime to the episode's air date so file managers sort chronologically."
        checked={airdateStamp}
        onChange={(v) => set("airdateEpisodes", v)}
      />

      {airdateStamp && (
        <Field
          label="Timestamp source"
          hint="Network = the show's broadcast timezone (recommended). Local = the host's clock."
        >
          <select
            className="select select-sm"
            value={get<string>("fileTimestampTimezone") ?? "local"}
            onChange={(e) => set("fileTimestampTimezone", e.target.value)}
          >
            {TIMEZONE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Toggle
        label="Postpone if subtitles missing"
        hint="Wait for subtitles to arrive before moving the file."
        checked={!!get<boolean>("postponeIfNoSubs")}
        onChange={(v) => set("postponeIfNoSubs", v)}
      />

      <Field
        label="Post-process hooks (extra scripts)"
        hint={
          <span>
            Python scripts Medusa runs after a file has been successfully
            post-processed — for notifications, library refresh, custom cleanup,
            etc. Each script is invoked with (episode_location, file_path,
            indexer_id, season, episode, airdate). These do NOT trigger
            post-processing; they fire after it succeeds, regardless of the
            trigger mode above. Comma-separated absolute paths. See{" "}
            <a
              target="_blank"
              rel="noreferrer"
              className="link link-hover text-primary"
              href="https://github.com/pymedusa/Medusa/wiki/Post-Processing#extra-scripts"
            >
              the wiki
            </a>{" "}
            for more info.
          </span>
        }
      >
        <CsvInput
          value={get<string[]>("extraScripts") ?? []}
          onChange={(v) => set("extraScripts", v)}
          placeholder="/opt/scripts/notify.py"
        />
      </Field>
    </Section>
  );
}

function ShowCreationSection({ get, set }: { get: Getter; set: Setter }) {
  return (
    <Section title="Show creation">
      <Toggle
        label="Add shows without a folder"
        hint="If a download lands for a show Medusa doesn't track yet, add it without requiring a pre-existing series folder."
        checked={!!get<boolean>("addShowsWithoutDir")}
        onChange={(v) => set("addShowsWithoutDir", v)}
      />
      <Toggle
        label="Create missing show folders"
        hint="If the show exists in Medusa but its folder is missing, create it before processing."
        checked={!!get<boolean>("createMissingShowDirs")}
        onChange={(v) => set("createMissingShowDirs", v)}
      />
    </Section>
  );
}

function NamingSection({
  get,
  set,
  multiEpStrings,
}: {
  get: Getter;
  set: Setter;
  multiEpStrings: Record<string, string>;
}) {
  const customAnime = !!get<boolean>("naming.enableCustomNamingAnime");
  const customSports = !!get<boolean>("naming.enableCustomNamingSports");
  const customAbd = !!get<boolean>("naming.enableCustomNamingAirByDate");

  const multiEpOptions = Object.entries(multiEpStrings).map(
    ([value, label]) => ({
      value: Number(value),
      label,
    }),
  );

  return (
    <Section
      title="Naming"
      hint="Rename files using a pattern. A live preview with token reference will arrive in a dedicated tab."
    >
      <Toggle
        label="Rename episodes"
        hint="Apply the naming pattern when moving files into the library. Off keeps the original release filename."
        checked={!!get<boolean>("renameEpisodes")}
        onChange={(v) => set("renameEpisodes", v)}
      />

      <Field
        label="Naming pattern"
        hint="Tokens like %SN (show), %0S/%0E (zero-padded), %EN (episode title), %QN (quality), %RG (release group)."
      >
        <input
          className="input input-sm w-full font-mono"
          value={get<string>("naming.pattern") ?? ""}
          onChange={(e) => set("naming.pattern", e.target.value)}
          spellCheck={false}
        />
      </Field>

      <Field
        label="Multi-episode style"
        hint="How files containing more than one episode are named."
      >
        <select
          className="select select-sm"
          value={get<number>("naming.multiEp") ?? 1}
          onChange={(e) => set("naming.multiEp", Number(e.target.value))}
        >
          {multiEpOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>

      <Toggle
        label="Strip year from show name"
        hint="Drop the (2023)-style year suffix when emitting %SN."
        checked={!!get<boolean>("naming.stripYear")}
        onChange={(v) => set("naming.stripYear", v)}
      />

      {/* Air-by-date */}
      <div className="border-t-2 border-base-300 pt-5">
        <Toggle
          label="Custom pattern for air-by-date shows"
          checked={customAbd}
          onChange={(v) => set("naming.enableCustomNamingAirByDate", v)}
        />
        {customAbd && (
          <Field label="Air-by-date pattern">
            <input
              className="input input-sm w-full font-mono"
              value={get<string>("naming.patternAirByDate") ?? ""}
              onChange={(e) => set("naming.patternAirByDate", e.target.value)}
              spellCheck={false}
            />
          </Field>
        )}
      </div>

      {/* Sports */}
      <div>
        <Toggle
          label="Custom pattern for sports"
          checked={customSports}
          onChange={(v) => set("naming.enableCustomNamingSports", v)}
        />
        {customSports && (
          <Field label="Sports pattern">
            <input
              className="input input-sm w-full font-mono"
              value={get<string>("naming.patternSports") ?? ""}
              onChange={(e) => set("naming.patternSports", e.target.value)}
              spellCheck={false}
            />
          </Field>
        )}
      </div>

      {/* Anime */}
      <div>
        <Toggle
          label="Custom pattern for anime"
          checked={customAnime}
          onChange={(v) => set("naming.enableCustomNamingAnime", v)}
        />
        {customAnime && (
          <>
            <Field label="Anime pattern">
              <input
                className="input input-sm w-full font-mono"
                value={get<string>("naming.patternAnime") ?? ""}
                onChange={(e) => set("naming.patternAnime", e.target.value)}
                spellCheck={false}
              />
            </Field>
            <Field
              label="Anime numbering"
              hint="How absolute / SxxEyy numbering is combined."
            >
              <select
                className="select select-sm"
                value={get<number>("naming.animeNamingType") ?? 3}
                onChange={(e) =>
                  set("naming.animeNamingType", Number(e.target.value))
                }
              >
                {ANIME_NAMING_TYPE.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Anime multi-episode style">
              <select
                className="select select-sm"
                value={get<number>("naming.animeMultiEp") ?? 1}
                onChange={(e) =>
                  set("naming.animeMultiEp", Number(e.target.value))
                }
              >
                {multiEpOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}
      </div>
    </Section>
  );
}

type Trigger = "scheduled" | "handler" | "external";

const TRIGGER_OPTIONS: {
  value: Trigger;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  description: string;
}[] = [
  {
    value: "scheduled",
    label: "Scheduled scan",
    icon: Calendar,
    description:
      "Medusa walks the download folder every N minutes and processes anything new. Good when the client writes finished downloads to a known folder.",
  },
  {
    value: "handler",
    label: "Download handler",
    icon: Radio,
    description:
      "Medusa polls the download client for completion and triggers post-processing the moment a download finishes. Closer to real-time, requires a supported client.",
  },
  {
    value: "external",
    label: "External trigger",
    icon: Wrench,
    description:
      "Nothing inside Medusa runs. Something outside — e.g. your download client's post-download script, a cron job, or a manual click — calls POST /api/v2/postprocess to tell Medusa when to process.",
  },
];

// Torrent methods that don't override the GenericClient hooks the Download
// handler needs (get_status / torrent_completed / etc.). Confirmed by
// grepping medusa/clients/torrent/<method>.py for the overridden methods.
const TORRENT_METHODS_WITHOUT_DH_SUPPORT: Record<string, string> = {
  downloadstation: "Synology Download Station",
  mlnet: "MLDonkey",
};

function TriggerSection({
  get,
  set,
  minFreq,
  clients,
}: {
  get: Getter;
  set: Setter;
  minFreq: number;
  clients: ClientsCfgSlim | null;
}) {
  const scheduled = !!get<boolean>("processAutomatically");
  const handler = !!get<boolean>("downloadHandler.enabled");
  const both = scheduled && handler;
  const mode: Trigger = handler
    ? "handler"
    : scheduled
      ? "scheduled"
      : "external";

  // Surfaces in handler mode: which configured clients can't be polled.
  const dhBlockers: string[] = [];
  if (clients?.torrents?.enabled) {
    const m = clients.torrents.method ?? "";
    if (m === "blackhole") {
      dhBlockers.push("Torrent method is set to blackhole — DH skips it.");
    } else if (m in TORRENT_METHODS_WITHOUT_DH_SUPPORT) {
      dhBlockers.push(
        `${TORRENT_METHODS_WITHOUT_DH_SUPPORT[m]} doesn't expose a status API to Medusa (no get_status implementation). The DH will log NotImplementedError warnings and never trigger PP for torrents from this client.`,
      );
    }
  }
  if (clients?.nzb?.enabled) {
    const m = clients.nzb.method ?? "";
    if (m === "blackhole") {
      dhBlockers.push("NZB method is set to blackhole — DH skips it.");
    }
    // sabnzbd and nzbget both implement the polling API; nothing else to gate.
  }

  // Setting the mode is an atomic write — both booleans flip in one batched
  // setDraft so the dirty-detection and PATCH payload stay consistent.
  const setMode = (m: Trigger) => {
    set("processAutomatically", m === "scheduled");
    set("downloadHandler.enabled", m === "handler");
  };

  return (
    <Section
      title="Trigger"
      hint="How post-processing kicks off. Pick one — the modes don't mix safely (the scheduler and download handler will fight over the same files; external scripts assume neither is running)."
    >
      {both && (
        <div className="alert alert-warning text-sm">
          <TriangleAlert size={14} />
          <div>
            Both scheduled scan and download handler are currently enabled. Pick
            one — leaving both on will cause duplicate processing attempts.
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {TRIGGER_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const active = mode === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setMode(opt.value)}
              className={`text-left rounded-box border-2 p-3 transition-colors cursor-pointer ${
                active
                  ? "border-primary bg-primary/5"
                  : "border-base-300 hover:border-base-content/40"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon size={16} />
                <span className="font-medium">{opt.label}</span>
                {active && <Check size={14} className="ml-auto text-primary" />}
              </div>
              <p className="text-xs text-base-content/60">{opt.description}</p>
            </button>
          );
        })}
      </div>

      {mode === "scheduled" && (
        <Field
          label="Scan frequency (minutes)"
          hint="How often the scheduled scanner walks the download directory."
        >
          <input
            type="number"
            min={1}
            className="input input-sm w-32"
            value={get<number>("autoPostprocessorFrequency") ?? 10}
            onChange={(e) =>
              set("autoPostprocessorFrequency", Number(e.target.value))
            }
          />
        </Field>
      )}

      {mode === "handler" && dhBlockers.length > 0 && (
        <div className="alert alert-warning text-sm items-start">
          <TriangleAlert size={14} className="mt-0.5" />
          <div className="space-y-1">
            <div className="font-medium">
              The configured download client may not work with the Download
              handler:
            </div>
            <ul className="list-disc list-inside text-xs">
              {dhBlockers.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
            <div className="text-xs">
              Switch to <strong>Scheduled scan</strong> (Medusa walks the
              download folder on its own) or <strong>External trigger</strong>{" "}
              (let the client's own post-download hook call{" "}
              <code>POST /api/v2/postprocess</code>) instead.
            </div>
          </div>
        </div>
      )}

      {mode === "handler" && (
        <>
          <Field
            label={`Poll frequency (minutes, ≥ ${minFreq})`}
            hint="How often Medusa asks the client for status updates."
          >
            <input
              type="number"
              min={minFreq}
              className="input input-sm w-32"
              value={get<number>("downloadHandler.frequency") ?? minFreq}
              onChange={(e) =>
                set("downloadHandler.frequency", Number(e.target.value))
              }
            />
          </Field>

          <Field
            label="Target seed ratio"
            hint="Ratio at which Medusa will act on a torrent after post-process. -1 = use the global ratio. 0 = act immediately after post-process."
          >
            <input
              type="number"
              step="0.1"
              className="input input-sm w-32"
              value={get<number>("downloadHandler.torrentSeedRatio") ?? -1}
              onChange={(e) =>
                set("downloadHandler.torrentSeedRatio", Number(e.target.value))
              }
            />
          </Field>

          <Field
            label="Seed action"
            hint="What to do once the target ratio is reached (or after post-process if ratio is 0)."
          >
            <select
              className="select select-sm"
              value={get<string>("downloadHandler.torrentSeedAction") ?? ""}
              onChange={(e) =>
                set("downloadHandler.torrentSeedAction", e.target.value)
              }
            >
              <option value="">No action</option>
              <option value="pause">Pause torrent</option>
              <option value="remove">Remove torrent (keep data)</option>
              <option value="remove_with_data">Remove torrent and data</option>
            </select>
          </Field>
        </>
      )}

      {mode === "external" && (
        <p className="text-sm text-base-content/60">
          Nothing runs in the background. Whatever drives processing — your
          download client's post-download script, a cron job, or a manual click
          — should call <code>POST /api/v2/postprocess</code> with the path to
          process.
        </p>
      )}
    </Section>
  );
}

function FFmpegSection({ get, set }: { get: Getter; set: Setter }) {
  return (
    <Section title="FFmpeg">
      <Toggle
        label="Check video streams"
        hint="Run ffprobe on each file before processing to verify it's a playable video."
        checked={!!get<boolean>("ffmpeg.checkStreams")}
        onChange={(v) => set("ffmpeg.checkStreams", v)}
      />
      <Field
        label="FFmpeg binary path"
        hint="Leave blank to use the default ffmpeg binary."
      >
        <input
          className="input input-sm w-full"
          value={get<string>("ffmpeg.path") ?? ""}
          onChange={(e) => set("ffmpeg.path", e.target.value)}
          spellCheck={false}
        />
      </Field>
    </Section>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card bg-base-100 border-2 border-base-300 rounded-box">
      <div className="card-body p-4 space-y-3">
        <div>
          <h2 className="font-semibold text-lg">{title}</h2>
          {hint && <p className="text-sm text-base-content/60 mt-1">{hint}</p>}
        </div>
        {children}
      </div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="fieldset">
      <legend className="fieldset-legend">{label}</legend>
      {children}
      {hint && <p className="text-xs text-base-content/50 mt-1">{hint}</p>}
    </fieldset>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="cursor-pointer flex items-start gap-2 max-w-2xl">
      <input
        type="checkbox"
        className="toggle toggle-sm mt-0.5"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="label-text text-sm block">{label}</span>
        {hint && (
          <span className="text-xs text-base-content/50 block mt-0.5">
            {hint}
          </span>
        )}
      </span>
    </label>
  );
}

function CsvInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  // Local text buffer so commas / trailing whitespace don't get scrubbed
  // mid-typing. Commit to the parent on blur or Enter.
  const [text, setText] = useState(value.join(", "));
  return (
    <input
      className="input input-sm w-full"
      value={text}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const next = text
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        onChange(next);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}
