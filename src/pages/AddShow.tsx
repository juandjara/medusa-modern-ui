import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, ExternalLink, CheckCircle2 } from "lucide-react";
import api from "../lib/api";
import type { SearchResult, SystemConfig } from "../types/medusa";
import { QUALITY_PRESETS } from "../types/medusa";

const SYSTEM_KEY = ["config", "system"] as const;
const DEFAULT_QUALITY_PRESET = "any_hd_4k";

// IDs from medusa/indexers/config.py. INDEXER_TVRAGE (2) is deprecated and
// omitted. 0 is the sentinel for "search every enabled indexer".
const INDEXER_OPTIONS = [
  { id: 0, label: "All indexers" },
  { id: 1, label: "TVDB" },
  { id: 4, label: "TMDB" },
  { id: 3, label: "TVMaze" },
  { id: 10, label: "IMDB" },
];

// Curated set of 2-letter language codes. The backend looks them up in
// indexerApi().config['langabbv_to_id'] — any standard ISO 639-1 code that's
// in that dict will work; unknown codes 500 the request. Empty string =
// use PyMedusa's configured INDEXER_DEFAULT_LANGUAGE.
const LANGUAGE_OPTIONS = [
  { code: "", label: "Default" },
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "it", label: "Italian" },
  { code: "pt", label: "Portuguese" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "zh", label: "Chinese" },
  { code: "ru", label: "Russian" },
  { code: "nl", label: "Dutch" },
  { code: "sv", label: "Swedish" },
  { code: "pl", label: "Polish" },
  { code: "ar", label: "Arabic" },
  { code: "tr", label: "Turkish" },
];

// Raw row shape from /api/v2/internal/searchIndexersForShowName. Each match
// is a positional tuple; we normalize into SearchResult at the queryFn
// boundary so the UI code reads as ordinary objects.
type SearchResultTuple = [
  string, // 0  indexer name (e.g. 'tvdb')
  number, // 1  indexer internal id (unused by us)
  string, // 2  show URL on the indexer's website
  number, // 3  show id in indexer's namespace
  string, // 4  series name
  string, // 5  firstaired ('YYYY-MM-DD' or 'N/A')
  string, // 6  network ('N/A' if missing)
  string, // 7  sanitized filename
  false | [string, number], // 8  already-in-library marker
];

function rowToResult(row: SearchResultTuple): SearchResult {
  const aired = row[5];
  const network = row[6];
  const inLib = row[8];
  return {
    indexer: row[0],
    showId: row[3],
    // The backend's indexer_api.config['show_url'].format(show_id) is a no-op
    // — the configured URLs (medusa/indexers/config.py) end with a trailing
    // slash and have no {} placeholder, so .format() returns the prefix
    // unchanged. We append the show id ourselves to get a working link.
    showUrl: `${row[2]}${row[3]}`,
    title: row[4],
    firstAired: aired && aired !== "N/A" ? aired : null,
    network: network && network !== "N/A" ? network : null,
    alreadyAddedSlug: Array.isArray(inLib) ? `${inLib[0]}${inLib[1]}` : null,
  };
}

function yearOf(result: SearchResult): string | null {
  return result.firstAired ? result.firstAired.slice(0, 4) : null;
}

export default function AddShow() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [indexerId, setIndexerId] = useState(0);
  const [language, setLanguage] = useState("");
  const [selected, setSelected] = useState<SearchResult | null>(null);
  // rootDir is nullable so we can derive the default from /config/system
  // inline instead of mirroring server state in a useEffect.
  const [options, setOptions] = useState<{
    status: "Wanted" | "Skipped";
    qualityPreset: string;
    rootDir: string | null;
    anime: boolean;
  }>({
    status: "Skipped",
    qualityPreset: DEFAULT_QUALITY_PRESET,
    rootDir: null,
    anime: false,
  });

  // Pulls the same /config/system payload the Queue + System pages use, so
  // navigating here after either is a cache hit. `diskSpace.rootDir` lists
  // every configured root directory.
  const system = useQuery<SystemConfig>({
    queryKey: SYSTEM_KEY,
    queryFn: ({ signal }) =>
      api.get<SystemConfig>("/config/system", { signal }).then((r) => r.data),
    staleTime: 60_000,
  });
  const rootDirs = system.data?.diskSpace?.rootDir ?? [];
  // Effective root dir: user pick, else first configured, else empty.
  const effectiveRootDir = options.rootDir ?? rootDirs[0]?.location ?? "";

  // GET /api/v2/internal/searchIndexersForShowName?query=...
  //   - Required: query
  //   - Optional: indexerId (0 = search all), language (2-letter)
  // Response: { results: SearchResultTuple[], languageId: number }
  const search = useQuery({
    queryKey: ["search-shows", query, indexerId, language],
    queryFn: ({ signal }) => {
      const params: Record<string, string | number> = { query, indexerId };
      if (language) params.language = language;
      return api
        .get<{
          results: SearchResultTuple[];
          languageId: number;
        }>("/internal/searchIndexersForShowName", { signal, params })
        .then((r) => r.data.results.map(rowToResult));
    },
    enabled: query.length >= 3,
  });

  // POST /series body per medusa/server/api/v2/series.py:181 —
  //   { id: { <indexer>: <showId> }, options: { status, quality, ... } }
  // Response is the queue item (show is added async after indexer fetch),
  // so we navigate back to the list rather than to /show/{slug}.
  const addShow = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error("No show selected");
      const preset = QUALITY_PRESETS[options.qualityPreset];
      return api.post("/series", {
        id: { [selected.indexer]: selected.showId },
        options: {
          status: options.status,
          quality: { allowed: preset.allowed, preferred: [] },
          anime: options.anime,
          // Sensible defaults for fields we don't expose; users can edit
          // these later from per-show settings.
          seasonFolders: true,
          scene: false,
          subtitles: false,
          rootDir: effectiveRootDir || undefined,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["series"] });
      navigate("/");
    },
  });

  if (!selected) {
    return (
      <div className="max-w-xl mx-auto space-y-6 pt-8">
        <h1 className="text-2xl font-bold">Add Show</h1>
        <label className="input">
          <Search size={18} />
          <input
            type="search"
            placeholder="Search for a show…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </label>

        <div className="flex flex-col sm:flex-row gap-3">
          <fieldset className="fieldset flex-1">
            <legend className="fieldset-legend">Indexer</legend>
            <select
              className="select select-sm w-full"
              value={indexerId}
              onChange={(e) => setIndexerId(Number(e.target.value))}
            >
              {INDEXER_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </fieldset>
          <fieldset className="fieldset flex-1">
            <legend className="fieldset-legend">Language</legend>
            <select
              className="select select-sm w-full"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              {LANGUAGE_OPTIONS.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.label}
                </option>
              ))}
            </select>
          </fieldset>
        </div>

        {search.isLoading && (
          <span className="loading loading-spinner block mx-auto" />
        )}

        {search.isError && (
          <div className="alert alert-soft alert-error text-sm">
            Search failed. Try again in a moment.
          </div>
        )}

        <div className="grid gap-2">
          {search.data?.map((s) => (
            <SearchResultCard
              key={`${s.indexer}-${s.showId}`}
              result={s}
              onPrimary={() => {
                if (s.alreadyAddedSlug) {
                  navigate(`/show/${s.alreadyAddedSlug}`);
                } else {
                  setSelected(s);
                }
              }}
            />
          ))}
        </div>

        {search.data?.length === 0 && query.length >= 3 && (
          <div className="text-center py-8 text-base-content/50 text-sm">
            No matches for "{query}".
          </div>
        )}
      </div>
    );
  }

  const selectedYear = yearOf(selected);

  return (
    <div className="max-w-lg mx-auto space-y-6 pt-8">
      <h1 className="text-2xl font-bold">Configure Show</h1>
      <div className="card bg-primary/10 p-4 space-y-1">
        <div className="font-semibold flex items-center gap-2">
          {selected.title}
          {selectedYear && (
            <span className="text-sm font-normal text-base-content/50">
              ({selectedYear})
            </span>
          )}
        </div>
        <div className="text-sm text-base-content/60 flex items-center gap-2 flex-wrap">
          {selected.network && <span>{selected.network}</span>}
          {selected.network && <span className="opacity-40">·</span>}
          <a
            href={selected.showUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs hover:underline inline-flex items-center gap-1"
          >
            View on {selected.indexer} <ExternalLink size={12} />
          </a>
        </div>
      </div>

      <fieldset className="fieldset w-full">
        <legend className="fieldset-legend">Initial Episode Status</legend>
        <select
          className="select w-full"
          value={options.status}
          onChange={(e) =>
            setOptions((s) => ({
              ...s,
              status: e.target.value as typeof s.status,
            }))
          }
        >
          <option value="Skipped">
            Skipped — don't auto-download anything
          </option>
          <option value="Wanted">Wanted — search for all aired episodes</option>
        </select>
      </fieldset>

      <fieldset className="fieldset w-full">
        <legend className="fieldset-legend">Quality</legend>
        <select
          className="select w-full"
          value={options.qualityPreset}
          onChange={(e) =>
            setOptions((s) => ({ ...s, qualityPreset: e.target.value }))
          }
        >
          {Object.entries(QUALITY_PRESETS).map(([key, preset]) => (
            <option key={key} value={key}>
              {preset.label}
            </option>
          ))}
        </select>
        <p className="label whitespace-normal">
          Editable per-show later from show settings.
        </p>
      </fieldset>

      <fieldset className="fieldset w-full">
        <legend className="fieldset-legend">Root Directory</legend>
        {rootDirs.length > 0 ? (
          <select
            className="select w-full"
            value={effectiveRootDir}
            onChange={(e) =>
              setOptions((s) => ({ ...s, rootDir: e.target.value }))
            }
          >
            {rootDirs.map((d) => (
              <option key={d.location} value={d.location}>
                {d.location} ({d.freeSpace} free)
              </option>
            ))}
          </select>
        ) : system.isLoading ? (
          <span className="loading loading-spinner loading-sm" />
        ) : (
          <p className="label whitespace-normal text-warning">
            No root directories configured. Add one in PyMedusa's settings
            first.
          </p>
        )}
      </fieldset>

      <fieldset className="fieldset w-full">
        <label className="label cursor-pointer justify-start gap-3 p-0">
          <input
            type="checkbox"
            className="toggle toggle-sm"
            checked={options.anime}
            onChange={(e) =>
              setOptions((s) => ({ ...s, anime: e.target.checked }))
            }
          />
          <span>
            <span className="font-medium text-base-content">Anime</span>
            <span className="block text-xs text-base-content/60 whitespace-normal">
              Enables absolute episode numbering and matches against AniDB /
              AniList aliases.
            </span>
          </span>
        </label>
      </fieldset>

      {addShow.isError && (
        <div className="alert alert-soft alert-error text-sm">
          Failed to add show.
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          className="btn btn-ghost flex-1"
          onClick={() => setSelected(null)}
        >
          Back
        </button>
        <button
          type="button"
          className="btn btn-primary flex-1"
          onClick={() => addShow.mutate()}
          disabled={addShow.isPending}
        >
          {addShow.isPending ? (
            <span className="loading loading-spinner loading-sm" />
          ) : (
            "Add Show"
          )}
        </button>
      </div>
    </div>
  );
}

function SearchResultCard({
  result,
  onPrimary,
}: {
  result: SearchResult;
  onPrimary: () => void;
}) {
  const year = yearOf(result);
  const inLibrary = result.alreadyAddedSlug !== null;

  // Card root is a div so we can place an external <a> next to the primary
  // <button> without invalid anchor-in-button nesting.
  return (
    <div className="card card-side bg-primary/10 flex items-center gap-2 pr-2 border border-base-100 hover:border-accent transition-colors">
      <button
        type="button"
        className="flex items-center gap-3 text-left flex-1 min-w-0 p-3"
        onClick={onPrimary}
      >
        <div className="min-w-0 flex-1">
          <div className="font-semibold flex items-center gap-2">
            <span className="truncate">{result.title}</span>
            {year && (
              <span className="text-sm font-normal text-base-content/50 shrink-0">
                ({year})
              </span>
            )}
          </div>
          <div className="text-xs text-base-content/50 flex items-center gap-2 mt-0.5">
            <span className="badge badge-ghost badge-xs">{result.indexer}</span>
            {result.network && <span>{result.network}</span>}
          </div>
        </div>
        {inLibrary ? (
          <span className="badge badge-success badge-sm gap-1 shrink-0">
            <CheckCircle2 size={12} /> In library
          </span>
        ) : (
          <span className="text-xs text-base-content/40 shrink-0">
            Select →
          </span>
        )}
      </button>
      <a
        href={result.showUrl}
        target="_blank"
        rel="noreferrer"
        className="btn btn-ghost btn-xs btn-square shrink-0"
        title={`View on ${result.indexer}`}
        aria-label={`View on ${result.indexer}`}
        onClick={(e) => e.stopPropagation()}
      >
        <ExternalLink size={12} />
      </a>
    </div>
  );
}
