import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Inbox,
  TriangleAlert,
} from "lucide-react";
import api from "../../lib/api";
import ConfirmDialog from "../../components/ConfirmDialog";
import { pushToast } from "../../lib/toasts";
import {
  EPISODE_STATUS_CODE,
  type EpisodeStatus,
  type EpisodeStatusCode,
} from "../../types/medusa";
import type { ConfigSearch } from "../../types/config";

// -----------------------------------------------------------------------------
// Backend response from GET /api/v2/internal/getEpisodeStatus
// -----------------------------------------------------------------------------

interface EpisodeRow {
  episode: number;
  season: number;
  slug: string; // "s01e02"
  name: string;
}

interface ShowGroup {
  slug: string;
  name: string;
  episodes: EpisodeRow[];
}

// Backend key is showSlug. The `selected`/`showEpisodes` fields in the response
// are legacy UI cruft; we don't read them.
type EpisodeStatusResponse = { episodeStatus: Record<string, ShowGroup> };

// -----------------------------------------------------------------------------
// Status options
// -----------------------------------------------------------------------------

// All statuses except Unaired are valid "from" filters. Picking Snatched
// transparently expands to include Snatched (Proper) and Snatched (Best) on
// the backend, so we don't list those variants separately as a from-option.
const FROM_STATUSES: { code: EpisodeStatusCode; label: string }[] = [
  { code: EPISODE_STATUS_CODE.Snatched, label: "Snatched (all variants)" },
  { code: EPISODE_STATUS_CODE.Wanted, label: "Wanted" },
  { code: EPISODE_STATUS_CODE.Downloaded, label: "Downloaded" },
  { code: EPISODE_STATUS_CODE.Archived, label: "Archived" },
  { code: EPISODE_STATUS_CODE.Skipped, label: "Skipped" },
  { code: EPISODE_STATUS_CODE.Ignored, label: "Ignored" },
  { code: EPISODE_STATUS_CODE.Subtitled, label: "Subtitled" },
  { code: EPISODE_STATUS_CODE.Failed, label: "Failed" },
];

// Mirrors legacy availableNewStatus (manage-episode-status.vue:84). The base
// targets are Wanted/Downloaded/Skipped/Ignored. Archived is offered only
// when moving from Downloaded. Failed is offered only when moving from a
// "snatched-ish" status AND USE_FAILED_DOWNLOADS is on.
function targetStatuses(
  fromCode: EpisodeStatusCode,
  failedTrackingEnabled: boolean,
): { code: EpisodeStatusCode; label: EpisodeStatus }[] {
  const out: { code: EpisodeStatusCode; label: EpisodeStatus }[] = [
    { code: EPISODE_STATUS_CODE.Wanted, label: "Wanted" },
    { code: EPISODE_STATUS_CODE.Downloaded, label: "Downloaded" },
    { code: EPISODE_STATUS_CODE.Skipped, label: "Skipped" },
    { code: EPISODE_STATUS_CODE.Ignored, label: "Ignored" },
  ];
  if (fromCode === EPISODE_STATUS_CODE.Downloaded) {
    out.push({ code: EPISODE_STATUS_CODE.Archived, label: "Archived" });
  }
  const failedEligible: EpisodeStatusCode[] = [
    EPISODE_STATUS_CODE.Snatched,
    EPISODE_STATUS_CODE["Snatched (Proper)"],
    EPISODE_STATUS_CODE["Snatched (Best)"],
    EPISODE_STATUS_CODE.Downloaded,
    EPISODE_STATUS_CODE.Archived,
  ];
  if (failedTrackingEnabled && failedEligible.includes(fromCode)) {
    out.push({ code: EPISODE_STATUS_CODE.Failed, label: "Failed" });
  }
  return out.filter((o) => o.code !== fromCode);
}

function parseFrom(raw: string | null): EpisodeStatusCode | null {
  const n = Number(raw);
  return FROM_STATUSES.some((s) => s.code === n)
    ? (n as EpisodeStatusCode)
    : null;
}

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

export default function EpisodeStatuses() {
  const [searchParams, setSearchParams] = useSearchParams();
  const from = parseFrom(searchParams.get("from"));

  const setFrom = (next: EpisodeStatusCode | null) => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === null) p.delete("from");
        else p.set("from", String(next));
        return p;
      },
      { replace: true },
    );
  };

  const searchCfgQ = useQuery({
    queryKey: ["config", "search"],
    queryFn: ({ signal }) =>
      api.get<ConfigSearch>("/config/search", { signal }).then((r) => r.data),
    staleTime: 60_000,
  });
  const failedTrackingEnabled =
    searchCfgQ.data?.general?.failedDownloads?.enabled ?? true;

  const dataQ = useQuery({
    queryKey: ["episode-status", from] as const,
    queryFn: ({ signal }) =>
      api
        .get<EpisodeStatusResponse>("/internal/getEpisodeStatus", {
          signal,
          params: { status: from },
        })
        .then((r) => r.data.episodeStatus),
    enabled: from !== null,
    staleTime: 30_000,
  });

  // Sort the shows alphabetically once, so they don't reorder mid-edit.
  const sortedShows = useMemo(() => {
    if (!dataQ.data) return [];
    return Object.values(dataQ.data).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [dataQ.data]);

  const totalEpisodes = sortedShows.reduce(
    (acc, s) => acc + s.episodes.length,
    0,
  );

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-2">
        <Link to="/manage" className="btn btn-ghost btn-sm gap-1">
          <ChevronLeft size={16} /> Manage
        </Link>
      </div>

      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Episode statuses</h1>
        <p className="text-sm text-base-content/60">
          Find every episode in your library with a given status, then bulk-flip
          them to a new status. Useful for retrying a batch of{" "}
          <strong>Snatched</strong> releases that never came through, marking
          off shows you're not following any more, or recovering after a
          provider issue.
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-base-content/60">From status</span>
          <select
            className="select select-sm"
            value={from ?? ""}
            onChange={(e) =>
              setFrom(e.target.value === "" ? null : (Number(e.target.value) as EpisodeStatusCode))
            }
          >
            <option value="">Pick a status…</option>
            {FROM_STATUSES.map((s) => (
              <option key={s.code} value={s.code}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        {from !== null && !dataQ.isLoading && (
          <div className="text-sm text-base-content/60 pb-1.5">
            {totalEpisodes > 0
              ? `${totalEpisodes} episode${totalEpisodes === 1 ? "" : "s"} across ${sortedShows.length} show${sortedShows.length === 1 ? "" : "s"}`
              : ""}
          </div>
        )}
      </div>

      {from === null && (
        <div className="text-center py-16 text-base-content/50 space-y-2">
          <Inbox size={32} className="mx-auto opacity-40" />
          <div>Pick a status above to load episodes.</div>
        </div>
      )}

      {dataQ.isLoading && (
        <div className="flex justify-center py-16">
          <span className="loading loading-spinner loading-lg" />
        </div>
      )}

      {dataQ.isError && (
        <div className="alert alert-soft alert-error text-sm">
          <TriangleAlert size={14} />
          Couldn't load episodes. Check the server logs.
        </div>
      )}

      {dataQ.data && sortedShows.length === 0 && (
        <div className="text-center py-16 text-base-content/50 space-y-2">
          <Inbox size={32} className="mx-auto opacity-40" />
          <div>No episodes in your library have that status.</div>
        </div>
      )}

      {from !== null && dataQ.data && sortedShows.length > 0 && (
        <Results
          // Remount on filter change so the selection state resets cleanly
          // instead of being a stale set of slugs from the old status.
          key={`${from}-${dataQ.dataUpdatedAt}`}
          fromCode={from}
          shows={sortedShows}
          failedTrackingEnabled={failedTrackingEnabled}
        />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Results panel (selection + bulk-apply)
// -----------------------------------------------------------------------------

type EpId = string; // `${showSlug}|${epSlug}`
const makeEpId = (showSlug: string, epSlug: string): EpId =>
  `${showSlug}|${epSlug}`;

function Results({
  fromCode,
  shows,
  failedTrackingEnabled,
}: {
  fromCode: EpisodeStatusCode;
  shows: ShowGroup[];
  failedTrackingEnabled: boolean;
}) {
  const queryClient = useQueryClient();

  const allEpIds = useMemo(() => {
    const s = new Set<EpId>();
    for (const show of shows) {
      for (const ep of show.episodes) s.add(makeEpId(show.slug, ep.slug));
    }
    return s;
  }, [shows]);

  // Default to everything checked — matches the legacy UI's `selected: true`.
  // Component remounts on each new data set, so a fresh useState is correct.
  const [selected, setSelected] = useState<Set<EpId>>(() => new Set(allEpIds));
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const targets = useMemo(
    () => targetStatuses(fromCode, failedTrackingEnabled),
    [fromCode, failedTrackingEnabled],
  );
  const [toCode, setToCode] = useState<EpisodeStatusCode>(targets[0].code);

  const [confirmOpen, setConfirmOpen] = useState(false);

  // Apply mutation. Payload mirrors the legacy contract: { status, shows: [{
  // slug, episodes: [epSlug, …] }] }.
  const apply = useMutation({
    mutationFn: async () => {
      const payload = {
        status: toCode,
        shows: shows
          .map((show) => ({
            slug: show.slug,
            episodes: show.episodes
              .filter((ep) => selected.has(makeEpId(show.slug, ep.slug)))
              .map((ep) => ep.slug),
          }))
          .filter((s) => s.episodes.length > 0),
      };
      const { data } = await api.post<{ count: number }>(
        "/internal/updateEpisodeStatus",
        payload,
      );
      return data.count;
    },
    onSuccess: (count) => {
      const newLabel = targets.find((t) => t.code === toCode)?.label ?? "";
      pushToast({
        title: count > 0 ? `Updated ${count} episode${count === 1 ? "" : "s"}` : "No episodes changed",
        body: count > 0 ? `Status set to ${newLabel}.` : undefined,
        type: "notice",
      });
      // Refresh the from-status list (rows just left the bucket) and any
      // open show pages.
      queryClient.invalidateQueries({ queryKey: ["episode-status", fromCode] });
      queryClient.invalidateQueries({ queryKey: ["series"] });
    },
    onError: () => {
      pushToast({
        title: "Couldn't update episodes",
        body: "Check the server logs.",
        type: "error",
      });
    },
  });

  const toggleEpisode = (id: EpId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleShow = (show: ShowGroup, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const ep of show.episodes) {
        const id = makeEpId(show.slug, ep.slug);
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const toggleExpanded = (slug: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(allEpIds));
  const clearAll = () => setSelected(new Set());

  const selectedCount = selected.size;
  const targetLabel =
    targets.find((t) => t.code === toCode)?.label ?? "Wanted";

  return (
    <>
      <div className="card bg-base-100 border-2 border-base-300 rounded-box">
        <div className="card-body p-4 space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs text-base-content/60">
                Set selected episodes to
              </span>
              <select
                className="select select-sm"
                value={toCode}
                onChange={(e) =>
                  setToCode(Number(e.target.value) as EpisodeStatusCode)
                }
              >
                {targets.map((t) => (
                  <option key={t.code} value={t.code}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => setConfirmOpen(true)}
              disabled={selectedCount === 0 || apply.isPending}
            >
              {apply.isPending
                ? "Applying…"
                : `Apply to ${selectedCount} episode${selectedCount === 1 ? "" : "s"}`}
            </button>
            <div className="flex gap-2 pb-0.5">
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={selectAll}
                disabled={selectedCount === allEpIds.size}
              >
                Select all
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={clearAll}
                disabled={selectedCount === 0}
              >
                Clear all
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {shows.map((show) => {
          const showEpIds = show.episodes.map((ep) =>
            makeEpId(show.slug, ep.slug),
          );
          const showSelected = showEpIds.filter((id) =>
            selected.has(id),
          ).length;
          const allShowSelected = showSelected === show.episodes.length;
          const isOpen = expanded.has(show.slug);
          return (
            <section
              key={show.slug}
              className="card bg-base-100 border border-base-300 rounded-box overflow-hidden"
            >
              <header className="flex items-center gap-3 px-4 py-2">
                <input
                  type="checkbox"
                  className="checkbox checkbox-sm"
                  checked={allShowSelected}
                  ref={(el) => {
                    if (el)
                      el.indeterminate =
                        !allShowSelected && showSelected > 0;
                  }}
                  onChange={(e) => toggleShow(show, e.currentTarget.checked)}
                  aria-label={`Select all ${show.name} episodes`}
                />
                <button
                  type="button"
                  className="flex items-center gap-1 flex-1 min-w-0 text-left hover:underline"
                  onClick={() => toggleExpanded(show.slug)}
                >
                  {isOpen ? (
                    <ChevronDown size={14} className="shrink-0" />
                  ) : (
                    <ChevronRight size={14} className="shrink-0" />
                  )}
                  <Link
                    to={`/show/${show.slug}`}
                    className="font-medium truncate hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {show.name}
                  </Link>
                  <span className="text-xs text-base-content/60 ml-1 shrink-0">
                    {showSelected}/{show.episodes.length}
                  </span>
                </button>
              </header>
              {isOpen && (
                <ul className="border-t border-base-300 divide-y divide-base-300/60">
                  {show.episodes.map((ep) => {
                    const id = makeEpId(show.slug, ep.slug);
                    return (
                      <li
                        key={id}
                        className="flex items-center gap-3 px-4 py-1.5 text-sm hover:bg-base-200/50"
                      >
                        <input
                          type="checkbox"
                          className="checkbox checkbox-xs"
                          checked={selected.has(id)}
                          onChange={() => toggleEpisode(id)}
                          aria-label={`Select ${show.name} ${ep.slug}`}
                        />
                        <span className="font-mono text-xs text-base-content/70 w-14 shrink-0">
                          {ep.slug}
                        </span>
                        <span className="truncate">{ep.name}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={`Set ${selectedCount} episode${selectedCount === 1 ? "" : "s"} to ${targetLabel}?`}
        body={
          <>
            <p>
              This updates the status on{" "}
              <strong>
                {selectedCount} episode{selectedCount === 1 ? "" : "s"}
              </strong>{" "}
              across the selected shows.
            </p>
            {toCode === EPISODE_STATUS_CODE.Wanted && (
              <p className="mt-2">
                <strong>Wanted</strong> episodes will be picked up on the next
                scheduled search.
              </p>
            )}
            {toCode === EPISODE_STATUS_CODE.Failed && (
              <p className="mt-2">
                Marking as <strong>Failed</strong> adds these releases to the
                failed-releases blocklist so future searches skip them.
              </p>
            )}
          </>
        }
        confirmLabel="Apply"
        variant={
          toCode === EPISODE_STATUS_CODE.Failed ? "danger" : "normal"
        }
        onConfirm={() => apply.mutate()}
        onClose={() => setConfirmOpen(false)}
      />
    </>
  );
}
