import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  History,
  MoreVertical,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import api from "../lib/api";
import { pushToast } from "../lib/toasts";
import type { Episode, EpisodeStatus } from "../types/medusa";
import { EPISODE_STATUS_CODE, qualityName } from "../types/medusa";
import type { ConfigSearch } from "../types/config";
import StatusBadge from "./StatusBadge";
import EpisodeSearchModal from "./EpisodeSearchModal";

interface Props {
  seriesSlug: string;
  season: number;
  episodes: Episode[];
}

const BULK_STATUSES: EpisodeStatus[] = [
  "Wanted",
  "Skipped",
  "Archived",
  "Ignored",
];

// "Mark release as failed" only makes sense when there's a current release
// to flag — i.e. the episode is in some snatched/downloaded state.
const SNATCHED_STATUSES: Set<EpisodeStatus> = new Set([
  "Snatched",
  "Snatched (Proper)",
  "Snatched (Best)",
  "Downloaded",
]);

export default function SeasonAccordion({
  seriesSlug,
  season,
  episodes,
}: Props) {
  const queryClient = useQueryClient();
  const [searchTarget, setSearchTarget] = useState<number | null>(null);
  const [seasonSearchOpen, setSeasonSearchOpen] = useState(false);

  // `USE_FAILED_DOWNLOADS` short-circuits the entire failure path on the
  // backend (process_tv.py:980), so "Mark release as failed" is dead when
  // the setting's off. Share the query key with PostProcess + SearchSettings.
  const searchCfgQ = useQuery({
    queryKey: ["config", "search"],
    queryFn: ({ signal }) =>
      api.get<ConfigSearch>("/config/search", { signal }).then((r) => r.data),
    staleTime: 60_000,
  });
  const failedTrackingEnabled =
    searchCfgQ.data?.general?.failedDownloads?.enabled ?? true;
  // Replaces daisyUI's <input type="checkbox" class="peer"> + .collapse pair.
  // The .collapse class sets overflow:hidden on the wrapper for its grid
  // animation, which clips popover dropdowns in the header — go with a
  // controlled expand instead so the bulk menu can render below the title.
  const [open, setOpen] = useState(false);

  const aired = episodes.filter((e) => e.status !== "Unaired");
  const downloaded = aired.filter(
    (e) => e.status === "Downloaded" || e.status === "Archived",
  ).length;

  const setStatus = useMutation({
    mutationFn: (payload: { identifiers: string[]; status: EpisodeStatus }) => {
      const body: Record<string, { status: number }> = {};
      for (const id of payload.identifiers) {
        body[id] = { status: EPISODE_STATUS_CODE[payload.status] };
      }
      return api.patch(`/series/${seriesSlug}/episodes`, body);
    },
    onSuccess: (_data, payload) => {
      queryClient.invalidateQueries({
        queryKey: ["series", seriesSlug, "episodes"],
      });
      const n = payload.identifiers.length;
      pushToast({
        title: `Set ${n} episode${n === 1 ? "" : "s"} to ${payload.status}`,
        type: "notice",
      });
    },
    onError: () => {
      pushToast({
        title: "Couldn't update episode status",
        body: "Check the server logs.",
        type: "error",
      });
    },
  });

  // POST /search/failed kicks off a FailedQueueItem on the backend: logs the
  // current release to failed.db so the search won't pick it again, reverts
  // the episode to Wanted, and immediately runs a fresh search excluding the
  // blacklisted release. The action only makes sense when the episode is in
  // a Snatched/Downloaded state — otherwise there's no current release to flag.
  const markFailed = useMutation({
    mutationFn: (identifier: string) =>
      api.post("/search/failed", {
        showSlug: seriesSlug,
        episodes: [identifier],
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["series", seriesSlug, "episodes"],
      });
      pushToast({
        title: "Release marked as failed",
        body: "The release was blacklisted and a fresh search was queued.",
        type: "notice",
      });
    },
    onError: () => {
      pushToast({
        title: "Couldn't mark the release as failed",
        body: "Check the server logs.",
        type: "error",
      });
    },
  });

  const allIdentifiers = episodes.map((e) => e.identifier);

  return (
    <div className="bg-base-100 border-2 border-base-300 rounded-box">
      <div className="flex items-center gap-2 p-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-3 flex-1 text-left cursor-pointer min-w-0"
          aria-expanded={open}
        >
          {open ? (
            <ChevronDown size={16} className="shrink-0" />
          ) : (
            <ChevronRight size={16} className="shrink-0" />
          )}
          <span className="font-semibold text-lg shrink-0">
            Season {season === 0 ? "Specials" : season}
          </span>
          <span className="text-sm font-normal text-base-content/50 truncate">
            {downloaded} / {episodes.length} episodes downloaded
          </span>
        </button>

        <div className="dropdown dropdown-end dropdown-top">
          <button
            tabIndex={0}
            className="btn btn-ghost btn-sm gap-1"
            title="Bulk actions for this season"
          >
            Bulk <ChevronDown size={12} />
          </button>
          <ul
            tabIndex={0}
            className="dropdown-content menu bg-base-100 rounded-box z-10 shadow-sm border border-base-300 p-2 w-56"
          >
            <li className="menu-title text-xs">Search</li>
            <li>
              <button
                onClick={() => setSeasonSearchOpen(true)}
                title="View cached releases and search across providers for season packs"
              >
                <Search size={12} />
                Search whole season
              </button>
            </li>
            <li className="menu-title text-xs">Set status for all</li>
            {BULK_STATUSES.map((status) => (
              <li key={status}>
                <button
                  onClick={() =>
                    setStatus.mutate({
                      identifiers: allIdentifiers,
                      status,
                    })
                  }
                  disabled={setStatus.isPending}
                >
                  {status}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <Link
          to={`/history?show=${seriesSlug}&season=${season}`}
          className="btn btn-ghost btn-sm btn-square"
          title="History for this season"
          aria-label="History for this season"
        >
          <History size={14} />
        </Link>
      </div>

      {open && (
        <div className="border-t border-base-300 overflow-x-auto">
          <table className="table table-zebra table-xs table-fixed w-full min-w-2xl">
            <thead>
              <tr>
                <th className="w-12">#</th>
                <th className="w-auto">Title</th>
                <th className="w-28">Air date</th>
                <th className="w-32">Status</th>
                <th className="w-24 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {episodes.map((ep) => (
                <tr key={ep.identifier}>
                  <td>{ep.episode}</td>
                  {/* td has no padding — the inner button owns it so the
                      whole cell area is a tap target for Manual search. */}
                  <td className="p-0">
                    <button
                      type="button"
                      onClick={() => setSearchTarget(ep.episode)}
                      className={`block w-full h-full text-left truncate cursor-pointer hover:text-primary hover:bg-base-200/40 px-3 py-2 ${
                        ep.title ? "" : "text-base-content/30 italic"
                      }`}
                      title={ep.title || "Open manual search"}
                    >
                      {ep.title || "TBA"}
                    </button>
                  </td>
                  <td className="text-xs whitespace-nowrap">
                    {ep.airDate ? ep.airDate.split("T")[0] : "—"}
                  </td>
                  <td>
                    {ep.quality &&
                    (ep.status === "Downloaded" || ep.status === "Archived") ? (
                      <span className="font-semibold badge badge-xs badge-success">
                        {qualityName(ep.quality)}
                      </span>
                    ) : (
                      <StatusBadge status={ep.status} />
                    )}
                  </td>
                  <td>
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        className="btn btn-ghost btn-xs btn-square"
                        title="Manual search"
                        onClick={() => setSearchTarget(ep.episode)}
                      >
                        <Search size={14} />
                      </button>
                      <div className="dropdown dropdown-end">
                        <button
                          tabIndex={0}
                          className="btn btn-ghost btn-xs btn-square"
                          aria-label="More actions"
                        >
                          <MoreVertical size={14} />
                        </button>
                        <ul
                          tabIndex={0}
                          className="dropdown-content menu bg-base-100 rounded-box z-10 shadow-sm border border-base-300 p-2 w-48"
                        >
                          <li>
                            <Link
                              to={`/history?show=${seriesSlug}&season=${season}&episode=${ep.episode}`}
                            >
                              <History size={14} /> View history
                            </Link>
                          </li>
                          {SNATCHED_STATUSES.has(ep.status) && (
                            <li>
                              <button
                                className={
                                  markFailed.isPending || !failedTrackingEnabled
                                    ? "opacity-50"
                                    : ""
                                }
                                onClick={() => markFailed.mutate(ep.identifier)}
                                disabled={
                                  markFailed.isPending || !failedTrackingEnabled
                                }
                                title={
                                  failedTrackingEnabled
                                    ? "Add the current release to the release blacklist and search again"
                                    : 'Option disabled because "Track failed releases" is off in Search settings'
                                }
                              >
                                <AlertTriangle
                                  size={14}
                                  className="text-warning"
                                />
                                Mark release as failed
                              </button>
                            </li>
                          )}
                          <li className="menu-title text-xs">Set status</li>
                          {BULK_STATUSES.map((status) => (
                            <li key={status}>
                              <button
                                onClick={() =>
                                  setStatus.mutate({
                                    identifiers: [ep.identifier],
                                    status,
                                  })
                                }
                                disabled={
                                  setStatus.isPending || ep.status === status
                                }
                              >
                                {status}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {searchTarget !== null && (
        <EpisodeSearchModal
          seriesSlug={seriesSlug}
          season={season}
          episode={searchTarget}
          open={searchTarget !== null}
          onClose={() => setSearchTarget(null)}
        />
      )}

      {seasonSearchOpen && (
        <EpisodeSearchModal
          seriesSlug={seriesSlug}
          season={season}
          open={seasonSearchOpen}
          onClose={() => setSeasonSearchOpen(false)}
        />
      )}
    </div>
  );
}
