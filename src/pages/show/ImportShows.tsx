import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  Check,
  ExternalLink,
  FolderInput,
  FolderSearch,
  Search,
  TriangleAlert,
  X as XIcon,
} from "lucide-react";
import api from "../../lib/api";
import { useWebSocket } from "../../lib/websocket";
import {
  EPISODE_STATUS_CODE,
  QUALITY_PRESETS,
  type SystemConfig,
} from "../../types/medusa";

// -----------------------------------------------------------------------------
// Backend response from GET /api/v2/internal/existingSeries
// -----------------------------------------------------------------------------

interface ExistingSeriesEntry {
  path: string;
  alreadyAdded: boolean;
  metadata: {
    seriesId: number | null;
    seriesName: string | null;
    indexer: number | null; // numeric indexer id (1 = TVDB, 3 = TVMaze, 4 = TMDB)
  };
}

// /internal/searchIndexersForShowName returns a fixed-position tuple. Mirrors
// AddShow.tsx — kept private here to avoid a cross-page export.
type SearchResultTuple = [
  string, // 0 indexer display name (e.g. 'TVDBv2')
  number, // 1 indexer internal id
  string, // 2 show URL on indexer's website (prefix only)
  number, // 3 show id in indexer's namespace
  string, // 4 series name
  string, // 5 firstaired 'YYYY-MM-DD' | 'N/A'
  string, // 6 network 'N/A' if missing
  string, // 7 sanitized filename
  false | [string, number], // 8 already-in-library marker
];

interface SearchHit {
  // String slug used by POST /series (e.g. 'tvdb', not 'TVDBv2').
  indexerSlug: string;
  // Numeric indexer id (same as backend's `metadata.indexer`).
  indexerId: number;
  showId: number;
  title: string;
  year: string | null;
  network: string | null;
  // Deep link to the show's page on the indexer's own site.
  showUrl: string;
  alreadyAddedSlug: string | null;
}

const INDEXER_NAME_TO_SLUG: Record<string, string> = {
  TVDBv2: "tvdb",
  TVmaze: "tvmaze",
  TMDB: "tmdb",
  IMDb: "imdb",
};

const INDEXER_NAME_TO_NUMERIC_ID: Record<string, number> = {
  TVDBv2: 1,
  TVmaze: 3,
  TMDB: 4,
  IMDb: 10,
};

// Reverse of INDEXER_NAME_TO_NUMERIC_ID — for NFO-discovered rows where the
// backend only gave us the numeric id; we need the slug for POST /series.
const INDEXER_NUMERIC_ID_TO_SLUG: Record<number, string> = {
  1: "tvdb",
  3: "tvmaze",
  4: "tmdb",
  10: "imdb",
};

function rowToHit(row: SearchResultTuple): SearchHit {
  const aired = row[5];
  const network = row[6];
  const inLib = row[8];
  return {
    indexerSlug: INDEXER_NAME_TO_SLUG[row[0]] ?? row[0].toLowerCase(),
    indexerId: INDEXER_NAME_TO_NUMERIC_ID[row[0]] ?? 0,
    showId: row[3],
    title: row[4],
    year: aired && aired !== "N/A" ? aired.slice(0, 4) : null,
    network: network && network !== "N/A" ? network : null,
    // Tuple position 2 is a URL prefix (no {} placeholder, .format() returns it
    // unchanged); concat the show id ourselves to get a working link.
    showUrl: `${row[2]}${row[3]}`,
    alreadyAddedSlug: Array.isArray(inLib) ? `${inLib[0]}${inLib[1]}` : null,
  };
}

const DEFAULT_QUALITY_PRESET = "any_hd";

// 0 = ask every enabled indexer in parallel; otherwise restrict to one. Same
// list AddShow.tsx uses; TVRage (id 2) is deprecated upstream.
const INDEXER_OPTIONS = [
  { id: 0, label: "All indexers" },
  { id: 1, label: "TVDB" },
  { id: 4, label: "TMDB" },
  { id: 3, label: "TVMaze" },
  { id: 10, label: "IMDB" },
];

// -----------------------------------------------------------------------------
// Per-row state — keyed by folder path
// -----------------------------------------------------------------------------

type ImportStatus = "idle" | "queued" | "running" | "added" | "failed";

interface RowState {
  // User-picked identity overrides the NFO-detected one. Either source ends up
  // in the same shape; null means "not identified yet."
  picked: SearchHit | null;
  // Inline search picker open?
  pickerOpen: boolean;
  // Import progress (post-submit).
  status: ImportStatus;
  step: string | null;
  queueItemId: string | null;
  resultSlug: string | null;
}

const defaultRow = (): RowState => ({
  picked: null,
  pickerOpen: false,
  status: "idle",
  step: null,
  queueItemId: null,
  resultSlug: null,
});

// Identification can come from two sources: the NFO Medusa already read (in
// `entry.metadata`) or the user's inline pick (`row.picked`). User pick wins
// when present.
function effectiveHit(
  entry: ExistingSeriesEntry,
  row: RowState,
): {
  indexerSlug: string;
  indexerId: number;
  showId: number;
  title: string;
} | null {
  if (row.picked) {
    return {
      indexerSlug: row.picked.indexerSlug,
      indexerId: row.picked.indexerId,
      showId: row.picked.showId,
      title: row.picked.title,
    };
  }
  const m = entry.metadata;
  if (m.indexer && m.seriesId && m.seriesName) {
    const slug = INDEXER_NUMERIC_ID_TO_SLUG[m.indexer];
    if (!slug) return null;
    return {
      indexerSlug: slug,
      indexerId: m.indexer,
      showId: m.seriesId,
      title: m.seriesName,
    };
  }
  return null;
}

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

interface AddShowQueueItem {
  identifier: string;
}

export default function ImportShows() {
  const queryClient = useQueryClient();

  // Root dirs come from /config/system.diskSpace.rootDir — order matches the
  // backend's app.ROOT_DIRS[1:], which is what /internal/existingSeries indexes
  // by integer position.
  const system = useQuery<SystemConfig>({
    queryKey: ["config", "system"],
    queryFn: ({ signal }) =>
      api.get<SystemConfig>("/config/system", { signal }).then((r) => r.data),
    staleTime: 60_000,
  });
  const rootDirs = useMemo(
    () => system.data?.diskSpace?.rootDir ?? [],
    [system.data],
  );

  // Indices into rootDirs that the user wants to scan. Until they touch the
  // checkboxes we treat "all selected" as the implicit default, so we don't
  // have to mirror rootDirs into state via an effect.
  const allIndices = useMemo(
    () => new Set(rootDirs.map((_, i) => i)),
    [rootDirs],
  );
  const [_selectedDirIdx, setSelectedDirIdx] = useState<Set<number> | null>(
    null,
  );
  const selectedDirIdx = _selectedDirIdx ?? allIndices;

  // Bulk options applied to every imported row.
  const [bulk, setBulk] = useState<{
    status: "Wanted" | "Skipped";
    qualityPreset: string;
    anime: boolean;
  }>({
    status: "Skipped",
    qualityPreset: DEFAULT_QUALITY_PRESET,
    anime: false,
  });

  // Indexer used by the inline "Identify…" picker. Does not affect NFO-driven
  // auto-identification (those rows already carry an indexer id).
  const [pickerIndexerId, setPickerIndexerId] = useState(0);

  // Per-row state, keyed by entry.path.
  const [rows, setRows] = useState<Record<string, RowState>>({});
  // Paths the user has ticked for import.
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const scan = useMutation({
    mutationFn: async () => {
      const indices = [...selectedDirIdx].sort().join(",");
      const res = await api.get<ExistingSeriesEntry[]>(
        "/internal/existingSeries",
        { params: indices ? { rootDirs: indices } : undefined },
      );
      return res.data;
    },
    onSuccess: (data) => {
      // Reset per-row state to a clean slate so a re-scan doesn't keep stale
      // progress / pickers around.
      const next: Record<string, RowState> = {};
      const auto = new Set<string>();
      for (const entry of data) {
        next[entry.path] = defaultRow();
        // Auto-select identifiable rows that aren't already in the library.
        if (
          !entry.alreadyAdded &&
          entry.metadata.indexer &&
          entry.metadata.seriesId
        ) {
          auto.add(entry.path);
        }
      }
      setRows(next);
      setSelected(auto);
    },
  });

  const setRow = (path: string, patch: Partial<RowState>) =>
    setRows((r) => ({
      ...r,
      [path]: { ...(r[path] ?? defaultRow()), ...patch },
    }));

  const toggleSelected = (path: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  // Posts one /series per ticked row. The backend queue handles serialization;
  // we kick them off back-to-back and let per-row WS events drive UI updates.
  const submitOne = useMutation({
    mutationFn: async (args: {
      path: string;
      hit: { indexerSlug: string; showId: number };
    }) => {
      const preset = QUALITY_PRESETS[bulk.qualityPreset];
      const res = await api.post<AddShowQueueItem>("/series", {
        id: { [args.hit.indexerSlug]: args.hit.showId },
        options: {
          status: EPISODE_STATUS_CODE[bulk.status],
          quality: { allowed: preset.allowed, preferred: [] },
          anime: bulk.anime,
          seasonFolders: true,
          scene: false,
          subtitles: false,
          showDir: args.path,
        },
      });
      return { path: args.path, identifier: res.data.identifier };
    },
    onSuccess: ({ path, identifier }) => {
      setRow(path, { status: "queued", queueItemId: identifier });
    },
    onError: (_e, vars) => {
      setRow(vars.path, { status: "failed" });
    },
  });

  const startImport = async () => {
    const entries = scan.data ?? [];
    for (const entry of entries) {
      if (!selected.has(entry.path)) continue;
      const row = rows[entry.path] ?? defaultRow();
      const hit = effectiveHit(entry, row);
      if (!hit) continue;
      setRow(entry.path, { status: "queued" });
      submitOne.mutate({ path: entry.path, hit });
    }
  };

  // WS plumbing. QueueItemShow carries both step progress and the terminal
  // signal: `success === true` means the queue item finished successfully,
  // even though `inProgress` confusingly stays true. Computing the slug
  // ourselves from the identified hit avoids the showAdded event, which
  // doesn't fire reliably for existing-folder imports.
  useWebSocket({
    QueueItemShow: (raw) => {
      const item = raw as {
        identifier?: string;
        success?: boolean | null;
        step?: string[];
      };
      if (!item.identifier) return;
      const entry = Object.entries(rows).find(
        ([, r]) => r.queueItemId === item.identifier,
      );
      if (!entry) return;
      const [path, row] = entry;

      const next: Partial<RowState> = {};
      if (item.step && item.step.length > 0) {
        next.step = item.step[item.step.length - 1];
        if (row.status !== "added") next.status = "running";
      }
      if (item.success === false) {
        next.status = "failed";
      } else if (item.success === true && row.status !== "added") {
        const dataEntry = (scan.data ?? []).find((e) => e.path === path);
        const hit = dataEntry ? effectiveHit(dataEntry, row) : null;
        if (hit) {
          next.status = "added";
          next.resultSlug = `${hit.indexerSlug}${hit.showId}`;
          queryClient.invalidateQueries({ queryKey: ["series"] });
        }
      }
      setRow(path, next);
    },
  });

  const entries = scan.data ?? [];
  const importable = entries.filter((e) => {
    if (e.alreadyAdded) return false;
    const row = rows[e.path];
    return !!effectiveHit(e, row ?? defaultRow());
  });
  const selectedCount = importable.filter((e) => selected.has(e.path)).length;
  const importing = Object.values(rows).some(
    (r) => r.status === "queued" || r.status === "running",
  );

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-2">
        <Link to="/" className="btn btn-ghost btn-sm gap-1">
          <ChevronLeft size={16} /> Shows
        </Link>
      </div>

      <header className="space-y-1">
        <h1 className="text-2xl font-bold inline-flex items-center gap-2">
          <FolderInput size={22} /> Import shows from disk
        </h1>
        <p className="text-sm text-base-content/60">
          Scan your root folders for existing show directories and bring them
          into Medusa in bulk. Folders with a recognisable NFO file get
          identified automatically; for the rest, search the indexer inline.
        </p>
      </header>

      <RootDirSection
        rootDirs={rootDirs}
        selectedIdx={selectedDirIdx}
        onToggle={(idx) =>
          setSelectedDirIdx((curr) => {
            const base = curr ?? allIndices;
            const next = new Set(base);
            if (next.has(idx)) next.delete(idx);
            else next.add(idx);
            return next;
          })
        }
        pickerIndexerId={pickerIndexerId}
        onPickerIndexerChange={setPickerIndexerId}
        onScan={() => scan.mutate()}
        scanning={scan.isPending}
        canScan={selectedDirIdx.size > 0}
      />

      {scan.isError && (
        <div className="alert alert-soft alert-error text-sm">
          <TriangleAlert size={14} />
          Scan failed. Check that the selected root directories exist and are
          readable by Medusa.
        </div>
      )}

      {scan.data && (
        <>
          <BulkOptions bulk={bulk} onChange={setBulk} />

          <ResultsTable
            entries={entries}
            rows={rows}
            selected={selected}
            pickerIndexerId={pickerIndexerId}
            onToggleSelected={toggleSelected}
            onPickerOpen={(p, open) => setRow(p, { pickerOpen: open })}
            onPicked={(p, hit) => setRow(p, { picked: hit, pickerOpen: false })}
          />

          <div className="flex items-center justify-between gap-3 pt-1">
            <div className="text-sm text-base-content/60">
              {entries.length === 0
                ? "No folders found in the selected root directories."
                : `${selectedCount} selected · ${importable.length} importable · ${entries.length - importable.length} skipped`}
            </div>
            <button
              type="button"
              className="btn btn-primary btn-sm gap-1"
              onClick={startImport}
              disabled={selectedCount === 0 || importing}
            >
              <FolderInput size={14} />
              {importing ? "Importing…" : `Import ${selectedCount} selected`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Root directory selector
// -----------------------------------------------------------------------------

function RootDirSection({
  rootDirs,
  selectedIdx,
  onToggle,
  pickerIndexerId,
  onPickerIndexerChange,
  onScan,
  scanning,
  canScan,
}: {
  rootDirs: { location: string; freeSpace: string }[];
  selectedIdx: Set<number>;
  onToggle: (idx: number) => void;
  pickerIndexerId: number;
  onPickerIndexerChange: (id: number) => void;
  onScan: () => void;
  scanning: boolean;
  canScan: boolean;
}) {
  if (rootDirs.length === 0) {
    return (
      <div className="alert alert-soft alert-warning text-sm">
        <TriangleAlert size={14} />
        <span>
          No root directories configured. Add one in{" "}
          <Link to="/settings/general" className="link link-hover">
            General settings
          </Link>{" "}
          first.
        </span>
      </div>
    );
  }
  return (
    <section className="card bg-base-100 border-2 border-base-300 rounded-box">
      <div className="card-body p-4 space-y-3">
        <h2 className="font-semibold">Scan these root folders</h2>
        <ul className="space-y-1">
          {rootDirs.map((d, idx) => (
            <li
              key={d.location}
              className="flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-base-200/40"
            >
              <input
                type="checkbox"
                className="checkbox checkbox-sm"
                checked={selectedIdx.has(idx)}
                onChange={() => onToggle(idx)}
                aria-label={`Scan ${d.location}`}
              />
              <span
                className="font-mono text-sm flex-1 truncate"
                title={d.location}
              >
                {d.location}
              </span>
              <span className="text-xs text-base-content/50 shrink-0">
                {d.freeSpace} free
              </span>
            </li>
          ))}
        </ul>
        <div className="flex items-end gap-3 flex-wrap pt-1">
          <button
            type="button"
            className="btn btn-primary btn-sm gap-1"
            onClick={onScan}
            disabled={!canScan || scanning}
          >
            {scanning ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              <FolderSearch size={14} />
            )}
            {scanning ? "Scanning…" : "Scan"}
          </button>

          <label className="flex flex-col gap-1 text-sm ml-auto">
            <span className="text-xs text-base-content/60">
              Inline-search indexer
            </span>
            <select
              className="select select-sm"
              value={pickerIndexerId}
              onChange={(e) => onPickerIndexerChange(Number(e.target.value))}
              title="Indexer used when you click Identify on an unknown folder. Auto-detected (NFO) rows keep their own indexer."
            >
              {INDEXER_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </section>
  );
}

// -----------------------------------------------------------------------------
// Bulk options bar
// -----------------------------------------------------------------------------

function BulkOptions({
  bulk,
  onChange,
}: {
  bulk: { status: "Wanted" | "Skipped"; qualityPreset: string; anime: boolean };
  onChange: (next: typeof bulk) => void;
}) {
  return (
    <section className="card bg-base-100 border-2 border-base-300 rounded-box">
      <div className="card-body p-4 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        <label className="block">
          <span className="text-xs text-base-content/60">Initial status</span>
          <select
            className="select select-sm w-full mt-1"
            value={bulk.status}
            onChange={(e) =>
              onChange({
                ...bulk,
                status: e.target.value as "Wanted" | "Skipped",
              })
            }
          >
            <option value="Skipped">Skipped — don't auto-search</option>
            <option value="Wanted">
              Wanted — search for all aired episodes
            </option>
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-base-content/60">Quality preset</span>
          <select
            className="select select-sm w-full mt-1"
            value={bulk.qualityPreset}
            onChange={(e) =>
              onChange({ ...bulk, qualityPreset: e.target.value })
            }
          >
            {Object.entries(QUALITY_PRESETS).map(([key, p]) => (
              <option key={key} value={key}>
                {p.label ?? key}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 sm:self-end py-2">
          <input
            type="checkbox"
            className="checkbox checkbox-sm"
            checked={bulk.anime}
            onChange={(e) => onChange({ ...bulk, anime: e.target.checked })}
          />
          <span className="text-sm">Treat all as anime</span>
        </label>
      </div>
    </section>
  );
}

// -----------------------------------------------------------------------------
// Results table
// -----------------------------------------------------------------------------

function ResultsTable({
  entries,
  rows,
  selected,
  pickerIndexerId,
  onToggleSelected,
  onPickerOpen,
  onPicked,
}: {
  entries: ExistingSeriesEntry[];
  rows: Record<string, RowState>;
  selected: Set<string>;
  pickerIndexerId: number;
  onToggleSelected: (path: string) => void;
  onPickerOpen: (path: string, open: boolean) => void;
  onPicked: (path: string, hit: SearchHit) => void;
}) {
  if (entries.length === 0) return null;
  return (
    <ul className="space-y-2">
      {entries.map((entry) => (
        <FolderRow
          key={entry.path}
          entry={entry}
          row={rows[entry.path] ?? defaultRow()}
          isSelected={selected.has(entry.path)}
          pickerIndexerId={pickerIndexerId}
          onToggleSelected={() => onToggleSelected(entry.path)}
          onPickerOpen={(open) => onPickerOpen(entry.path, open)}
          onPicked={(hit) => onPicked(entry.path, hit)}
        />
      ))}
    </ul>
  );
}

function FolderRow({
  entry,
  row,
  isSelected,
  pickerIndexerId,
  onToggleSelected,
  onPickerOpen,
  onPicked,
}: {
  entry: ExistingSeriesEntry;
  row: RowState;
  isSelected: boolean;
  pickerIndexerId: number;
  onToggleSelected: () => void;
  onPickerOpen: (open: boolean) => void;
  onPicked: (hit: SearchHit) => void;
}) {
  const hit = effectiveHit(entry, row);
  const identified = !!hit;
  const folderName = entry.path.replace(/^.*[\\/]/, "");

  // Pre-populate the picker query with the folder name — usually a usable
  // starting point for the indexer search.
  const initialQuery = useMemo(() => folderName, [folderName]);

  return (
    <li
      className={`rounded-box border bg-base-100 ${
        entry.alreadyAdded
          ? "border-base-300 opacity-60"
          : identified
            ? "border-base-300"
            : "border-warning/30"
      }`}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <input
          type="checkbox"
          className="checkbox checkbox-sm"
          checked={isSelected}
          onChange={onToggleSelected}
          disabled={entry.alreadyAdded || !identified || row.status === "added"}
          aria-label={`Select ${folderName}`}
        />
        <div className="flex-1 min-w-0">
          <div
            className="font-mono text-xs text-base-content/60 truncate"
            title={entry.path}
          >
            {entry.path}
          </div>
          <div className="text-sm font-medium truncate">
            {entry.alreadyAdded
              ? "Already in your library"
              : hit
                ? `${hit.title} — ${hit.indexerSlug.toUpperCase()} #${hit.showId}`
                : "Not identified yet"}
          </div>
        </div>
        <RowStatusBadge entry={entry} row={row} identified={identified} />
        {!entry.alreadyAdded && row.status === "idle" && (
          <button
            type="button"
            className="btn btn-ghost btn-xs gap-1"
            onClick={() => onPickerOpen(!row.pickerOpen)}
          >
            <Search size={12} />
            {identified ? "Change" : "Identify"}
          </button>
        )}
      </div>

      {row.pickerOpen && (
        <div className="border-t border-base-300 p-3 bg-base-200/30">
          <InlineSearchPicker
            initialQuery={initialQuery}
            indexerId={pickerIndexerId}
            onPick={(h) => onPicked(h)}
            onClose={() => onPickerOpen(false)}
          />
        </div>
      )}
    </li>
  );
}

function RowStatusBadge({
  entry,
  row,
  identified,
}: {
  entry: ExistingSeriesEntry;
  row: RowState;
  identified: boolean;
}) {
  if (entry.alreadyAdded) {
    return <span className="badge badge-xs badge-ghost">In library</span>;
  }
  if (row.status === "added") {
    return (
      <Link
        to={`/show/${row.resultSlug}`}
        className="badge badge-xs badge-success gap-1 hover:underline"
      >
        <Check size={10} /> Added
      </Link>
    );
  }
  if (row.status === "failed") {
    return (
      <span className="badge badge-xs badge-error gap-1">
        <TriangleAlert size={10} /> Failed
      </span>
    );
  }
  if (row.status === "running") {
    return (
      <span className="badge badge-xs badge-info gap-1">
        <span className="loading loading-spinner loading-xs" />
        {row.step ?? "Working…"}
      </span>
    );
  }
  if (row.status === "queued") {
    return <span className="badge badge-xs badge-info">Queued</span>;
  }
  if (!identified) {
    return <span className="badge badge-xs badge-warning">Unknown</span>;
  }
  return <span className="badge badge-xs badge-success">Identified</span>;
}

// -----------------------------------------------------------------------------
// Inline search picker — minimal version of AddShow's search flow.
// -----------------------------------------------------------------------------

function InlineSearchPicker({
  initialQuery,
  indexerId,
  onPick,
  onClose,
}: {
  initialQuery: string;
  indexerId: number;
  onPick: (hit: SearchHit) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const search = useQuery({
    queryKey: ["import-search", query, indexerId],
    queryFn: ({ signal }) =>
      api
        .get<{
          results: SearchResultTuple[];
          languageId: number;
        }>("/internal/searchIndexersForShowName", {
          signal,
          params: { query, indexerId },
        })
        .then((r) => r.data.results.map(rowToHit)),
    enabled: query.length >= 3,
    // Keep results around when query is being edited so the user can compare.
    staleTime: 30_000,
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search
            size={14}
            className="z-10 absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40"
          />
          <input
            type="search"
            className="input input-sm w-full pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the indexer for this show…"
            autoFocus
          />
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onClose}
          aria-label="Close picker"
        >
          <XIcon size={14} />
        </button>
      </div>

      {search.isLoading && query.length >= 3 && (
        <div className="text-xs text-base-content/50 px-1">Searching…</div>
      )}
      {search.isError && (
        <div className="text-xs text-error px-1">Search failed. Try again.</div>
      )}
      {search.data && search.data.length === 0 && query.length >= 3 && (
        <div className="text-xs text-base-content/50 px-1">
          No matches for "{query}".
        </div>
      )}

      {search.data && search.data.length > 0 && (
        <ul className="space-y-1 max-h-72 overflow-y-auto">
          {search.data.map((hit) => (
            <li
              key={`${hit.indexerSlug}-${hit.showId}`}
              className="group rounded-md bg-base-100 border-2 border-base-300 transition-colors hover:border-accent"
            >
              <div className="flex items-stretch">
                <button
                  type="button"
                  className="flex-1 min-w-0 text-left px-3 py-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={() => onPick(hit)}
                  disabled={!!hit.alreadyAddedSlug}
                  title={
                    hit.alreadyAddedSlug
                      ? "Already in your library"
                      : `Pick ${hit.title}`
                  }
                >
                  <div className="font-medium text-sm truncate">
                    {hit.title}
                    {hit.year && (
                      <span className="text-xs text-base-content/50 font-normal ml-1">
                        ({hit.year})
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-base-content/50 flex items-center gap-2 flex-wrap">
                    {hit.network && <span>{hit.network}</span>}
                    <span className="opacity-60">
                      {hit.indexerSlug.toUpperCase()} #{hit.showId}
                    </span>
                    {hit.alreadyAddedSlug && (
                      <span className="badge badge-xs badge-ghost">
                        In library
                      </span>
                    )}
                  </div>
                </button>
                <a
                  href={hit.showUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 px-3 flex items-center text-base-content/40 hover:text-primary border-l border-base-300"
                  title={`Open on ${hit.indexerSlug.toUpperCase()}`}
                  aria-label={`Open ${hit.title} on ${hit.indexerSlug}`}
                >
                  <ExternalLink size={14} />
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
