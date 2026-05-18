import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import api from "../lib/api";
import { formatRelative, parseActionDate } from "../lib/time";
import { qualityName, type HistoryEntry } from "../types/medusa";
import StatusBadge from "../components/StatusBadge";

const PAGE_SIZE = 20;

// Drives the dropdown filter. Server returns plenty of other status strings
// (Archived, Ignored, Subtitled, Snatched (Proper)/(Best)…); these four are
// what we'd typically filter on. Filtering is client-side over the loaded
// page — fine until somebody wants to filter across the whole history.
const FILTERABLE_STATUSES = ["Downloaded", "Snatched", "Failed", "Subtitled"];

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
    queryKey: ["history", page],
    queryFn: async ({ signal }) => {
      const res = await api.get<HistoryEntry[]>("/history", {
        signal,
        params: {
          page,
          limit: PAGE_SIZE,
          // PyMedusa's history handler accepts a JSON-encoded sort spec — the
          // field map in history.py:80 keys `actiondate`/`date` to SQL `date`.
          // Most-recent first.
          sort: JSON.stringify([{ field: "actionDate", type: "desc" }]),
        },
      });
      // PyMedusa paginates via headers (X-Pagination-Count is the total row
      // count across all pages). Fall back to the page length if missing.
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

  const filtered = filter
    ? items.filter((h) => h.statusName === filter)
    : items;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">History</h1>
        <select
          className="select select-bordered select-sm"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
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
              {filtered.map((h) => (
                <HistoryRow key={h.id} entry={h} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="text-center py-12 text-base-content/50">
          {filter
            ? `No "${filter}" entries on this page.`
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
