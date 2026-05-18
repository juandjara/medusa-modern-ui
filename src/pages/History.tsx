import { Link, useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import api from "../lib/api";
import { formatRelative, parseActionDate } from "../lib/time";
import { qualityName, type HistoryEntry } from "../types/medusa";
import StatusBadge from "../components/StatusBadge";

const PAGE_SIZE = 20;

// Server-side filter values. PyMedusa's history.py filters on the integer
// `action` column (see medusa/common.py); the string "Snatched" wouldn't
// match against an int column, so we map labels to the underlying codes.
// Labels match `statusName` strings emitted by the backend so the dropdown
// reads the same as the Status column.
const STATUS_CODES: Record<string, number> = {
  Downloaded: 4,
  Snatched: 2,
  "Snatched (Proper)": 9,
  "Snatched (Best)": 12,
  Failed: 11,
  Subtitled: 10,
};
const FILTERABLE_STATUSES = Object.keys(STATUS_CODES);

interface HistoryPage {
  items: HistoryEntry[];
  total: number;
  page: number;
  limit: number;
}

// Build the v2 history endpoint based on the active filters. PyMedusa exposes:
//   GET /history                                   — all rows
//   GET /history/{slug}                             — filtered to one show
//   GET /history/{slug}/episode/{sNNeNN}            — exact episode
// We pick the most specific endpoint we can. Season alone (no episode) has
// no server-side support, so we fetch /history/{slug} and filter client-side.
function buildHistoryPath(
  showSlug: string | null,
  season: number | null,
  episode: number | null,
): string {
  if (!showSlug) return "/history";
  if (season !== null && episode !== null) {
    const eid = `s${String(season).padStart(2, "0")}e${String(episode).padStart(2, "0")}`;
    return `/history/${showSlug}/episode/${eid}`;
  }
  return `/history/${showSlug}`;
}

export default function History() {
  const [searchParams, setSearchParams] = useSearchParams();

  // All filter / paging state lives in the URL — reads are derived, writes
  // call setSearchParams.
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const status = searchParams.get("status") ?? "";
  const showSlug = searchParams.get("show");
  const seasonParam = searchParams.get("season");
  const episodeParam = searchParams.get("episode");
  const season = seasonParam !== null ? parseInt(seasonParam, 10) : null;
  const episode = episodeParam !== null ? parseInt(episodeParam, 10) : null;

  // Patch URL params; reset to page 1 whenever any non-page param changes
  // (filtered totals can shrink — landing past totalPages would be broken).
  const updateParams = (patch: Record<string, string | null>) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      if (Object.keys(patch).some((k) => k !== "page")) next.delete("page");
      return next;
    });
  };

  const path = buildHistoryPath(showSlug, season, episode);

  const { data, isLoading, isFetching } = useQuery<HistoryPage>({
    queryKey: ["history", path, page, status],
    queryFn: async ({ signal }) => {
      const params: Record<string, string | number> = {
        page,
        limit: PAGE_SIZE,
        // PyMedusa's history handler accepts a JSON-encoded sort spec — the
        // field map in history.py:80 keys `actiondate`/`date` to SQL `date`.
        // Most-recent first.
        sort: JSON.stringify([{ field: "actionDate", type: "desc" }]),
      };
      const code = status ? STATUS_CODES[status] : undefined;
      if (code !== undefined) {
        // Server-side filter: { columnFilters: { action: <int> } }. The
        // `action` column is the integer status code (common.py).
        params.filter = JSON.stringify({ columnFilters: { action: code } });
      }
      const res = await api.get<HistoryEntry[]>(path, { signal, params });
      const total = parseInt(
        (res.headers["x-pagination-count"] as string | undefined) ??
          String(res.data.length),
        10,
      );
      return { items: res.data, total, page, limit: PAGE_SIZE };
    },
    placeholderData: keepPreviousData,
  });

  let items = data?.items ?? [];
  // Every HistoryEntry already carries showTitle, so the chip's display name
  // comes for free from the rows we just loaded — no extra fetch needed.
  // Falls back to the slug if the show has no entries (empty result).
  const showTitle = showSlug ? (items[0]?.showTitle ?? showSlug) : null;
  // Season-only filter has no server-side equivalent, so apply locally over
  // the show-filtered page. (Pagination counts may look off in this mode —
  // acceptable trade-off; if it becomes annoying we can server-filter.)
  if (showSlug && season !== null && episode === null) {
    items = items.filter((h) => h.season === season);
  }
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilterChips = showSlug || season !== null || episode !== null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">History</h1>
        <select
          className="select select-sm"
          value={status}
          onChange={(e) => updateParams({ status: e.target.value || null })}
        >
          <option value="">All statuses</option>
          {FILTERABLE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {hasFilterChips && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-base-content/60">Filtered by:</span>
          {showSlug && (
            <span className="badge badge-soft gap-1 pr-1">
              Show: {showTitle}
              <button
                type="button"
                className="btn btn-ghost btn-xs btn-square"
                aria-label="Clear show filter"
                onClick={() =>
                  updateParams({
                    show: null,
                    season: null,
                    episode: null,
                  })
                }
              >
                <X size={12} />
              </button>
            </span>
          )}
          {season !== null && (
            <span className="badge badge-soft gap-1 pr-1">
              Season {season}
              <button
                type="button"
                className="btn btn-ghost btn-xs btn-square"
                aria-label="Clear season filter"
                onClick={() => updateParams({ season: null, episode: null })}
              >
                <X size={12} />
              </button>
            </span>
          )}
          {episode !== null && (
            <span className="badge badge-soft gap-1 pr-1">
              Episode {episode}
              <button
                type="button"
                className="btn btn-ghost btn-xs btn-square"
                aria-label="Clear episode filter"
                onClick={() => updateParams({ episode: null })}
              >
                <X size={12} />
              </button>
            </span>
          )}
        </div>
      )}

      {isLoading && (
        <div className="flex justify-center py-20">
          <span className="loading loading-spinner loading-lg" />
        </div>
      )}

      {!isLoading && (
        <div className="overflow-x-auto">
          <table className="table table-zebra table-xs">
            <thead>
              <tr>
                <th>When</th>
                <th>Show</th>
                <th>Episode</th>
                <th>Quality</th>
                <th>Provider</th>
                <th>Release</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((h) => (
                <HistoryRow key={h.id} entry={h} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && items.length === 0 && (
        <div className="text-center py-12 text-base-content/50">
          {status || hasFilterChips
            ? "No history entries match these filters."
            : "No history entries."}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-base-content/70 pt-2">
          <div>
            Page {page} of {totalPages} · {total.toLocaleString()} entries
          </div>
          <div className="join">
            <button
              className="btn btn-sm join-item"
              onClick={() =>
                updateParams({ page: String(Math.max(1, page - 1)) })
              }
              disabled={page === 1 || isFetching}
            >
              <ChevronLeft size={14} /> Prev
            </button>
            <button
              className="btn btn-sm join-item"
              onClick={() =>
                updateParams({ page: String(Math.min(totalPages, page + 1)) })
              }
              disabled={page >= totalPages || isFetching}
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function HistoryRow({ entry }: { entry: HistoryEntry }) {
  const when = parseActionDate(entry.actionDate);
  return (
    <tr>
      <td className="text-xs whitespace-nowrap">
        {when ? (
          <span title={when.toLocaleString()}>
            {formatRelative(when.toISOString())}
          </span>
        ) : (
          "—"
        )}
      </td>
      <td className="text-sm">
        {entry.showSlug ? (
          <Link
            to={`/show/${entry.showSlug}`}
            className="hover:underline truncate inline-block max-w-56"
            title={entry.showTitle}
          >
            {entry.showTitle}
          </Link>
        ) : (
          entry.showTitle
        )}
      </td>
      <td className="whitespace-nowrap">
        S{String(entry.season).padStart(2, "0")}E
        {String(entry.episode).padStart(2, "0")}
      </td>
      <td className="whitespace-nowrap">
        <span className="badge badge-xs">{qualityName(entry.quality)}</span>
      </td>
      <td className="text-xs">
        {entry.provider?.name ? (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            {entry.provider.imageName && (
              <img
                src={`/images/providers/${entry.provider.imageName}`}
                alt=""
                width={16}
                height={16}
                className="shrink-0"
                onError={(e) => {
                  // Hide on 404 rather than showing a broken-image icon.
                  e.currentTarget.style.display = "none";
                }}
              />
            )}
            {entry.provider.name}
          </span>
        ) : (
          "—"
        )}
      </td>
      <td
        className="text-xs font-mono max-w-[20rem] truncate"
        title={entry.releaseName ?? entry.resource}
      >
        {entry.releaseName ?? entry.resource ?? "—"}
      </td>
      <td>
        <StatusBadge status={entry.statusName} />
      </td>
    </tr>
  );
}
