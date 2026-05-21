import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  History,
  MoreVertical,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import api from "../lib/api";
import type { Episode, EpisodeStatus } from "../types/medusa";
import { EPISODE_STATUS_CODE } from "../types/medusa";
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

export default function SeasonAccordion({
  seriesSlug,
  season,
  episodes,
}: Props) {
  const queryClient = useQueryClient();
  const [searchTarget, setSearchTarget] = useState<number | null>(null);
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
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["series", seriesSlug, "episodes"],
      });
    },
  });

  const allIdentifiers = episodes.map((e) => e.identifier);

  return (
    <div className="bg-base-100 border-2 border-base-300 rounded-box">
      <div className="flex items-center gap-3 px-4 py-3">
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
            {episodes.length} episodes · {downloaded} downloaded
          </span>
        </button>

        <Link
          to={`/history?show=${seriesSlug}&season=${season}`}
          className="btn btn-ghost btn-sm gap-1"
          title="History for this season"
        >
          <History size={12} /> History
        </Link>

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
      </div>

      {open && (
        <div className="border-t border-base-300 overflow-x-auto">
          <table className="table table-zebra table-xs">
            <thead>
              <tr>
                <th>#</th>
                <th>Title</th>
                <th>Air Date</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {episodes.map((ep) => (
                <tr key={ep.identifier}>
                  <td>{ep.episode}</td>
                  <td className={ep.title ? "" : "text-base-content/30 italic"}>
                    {ep.title || "TBA"}
                  </td>
                  <td className="text-xs whitespace-nowrap">
                    {ep.airDate ? ep.airDate.split("T")[0] : "—"}
                  </td>
                  <td>
                    <StatusBadge status={ep.status} />
                  </td>
                  <td>
                    <div className="flex items-center gap-1">
                      <button
                        className="btn btn-ghost btn-xs btn-square"
                        title="Search"
                        onClick={() => setSearchTarget(ep.episode)}
                      >
                        <Search size={14} />
                      </button>
                      <Link
                        to={`/history?show=${seriesSlug}&season=${season}&episode=${ep.episode}`}
                        className="btn btn-ghost btn-xs btn-square"
                        title="History for this episode"
                      >
                        <History size={14} />
                      </Link>
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
                          className="dropdown-content menu bg-base-100 rounded-box z-10 shadow-sm border border-base-300 p-2 w-44"
                        >
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
                                Set {status}
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
    </div>
  );
}
