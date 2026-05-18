import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
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

export default function History() {
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("");

  const { data, isLoading, isFetching } = useQuery<HistoryPage>({
    queryKey: ["history", page, filter],
    queryFn: async ({ signal }) => {
      const params: Record<string, string | number> = {
        page,
        limit: PAGE_SIZE,
        // PyMedusa's history handler accepts a JSON-encoded sort spec — the
        // field map in history.py:80 keys `actiondate`/`date` to SQL `date`.
        // Most-recent first.
        sort: JSON.stringify([{ field: "actionDate", type: "desc" }]),
      };
      const code = filter ? STATUS_CODES[filter] : undefined;
      if (code !== undefined) {
        // Server-side filter: { columnFilters: { action: <int> } }. The
        // `action` column is the integer status code (common.py).
        params.filter = JSON.stringify({ columnFilters: { action: code } });
      }
      const res = await api.get<HistoryEntry[]>("/history", { signal, params });
      // PyMedusa paginates via headers (X-Pagination-Count is the total row
      // count across all pages). After server-side filtering this reflects
      // the items total. Fall back to the page length if missing.
      const total = parseInt(
        (res.headers["x-pagination-count"] as string | undefined) ??
          String(res.data.length),
        10,
      );
      return { items: res.data, total, page, limit: PAGE_SIZE };
    },
    // Keep showing the previous page while a new page loads, so the table
    // doesn't flash empty during pagination.
    placeholderData: keepPreviousData,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">History</h1>
        <select
          className="select select-bordered select-sm"
          value={filter}
          onChange={(e) => {
            // Filtered totals may be smaller — drop back to page 1 so we
            // don't land beyond the new totalPages.
            setFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          {FILTERABLE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

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
          {filter
            ? `No "${filter}" history entries.`
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
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || isFetching}
            >
              <ChevronLeft size={14} /> Prev
            </button>
            <button
              className="btn btn-sm join-item"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
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
            className="hover:underline truncate inline-block max-w-[14rem]"
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
      <td>
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
