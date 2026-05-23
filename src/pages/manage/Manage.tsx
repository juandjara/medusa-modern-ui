import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpCircle, ChevronRight } from "lucide-react";
import api from "../../lib/api";

// Just the minimal slice of the backlog response we need for the summary
// badges on the hub card.
interface BacklogShowSummary {
  episodeCount: { wanted: number; allowed: number };
}

// Manage section landing — a small card list, settings-style. Each card
// links to a specific bulk operation across the library. Grows as we ship
// more Manage tools (backlog overview, mass edit, episode statuses, etc.).
export default function Manage() {
  // Fetch with limit=0 ("all rows") so the badge reflects the true total even
  // when the user has many failed releases. The endpoint returns just the
  // rows we need to count; failed.db is small in practice.
  const failedCountQ = useQuery({
    queryKey: ["failed-releases-count"],
    queryFn: ({ signal }) =>
      api
        .get<{ id: number }[]>("/internal/getFailed", {
          signal,
          params: { limit: 0 },
        })
        .then((r) => r.data.length),
    staleTime: 60_000,
  });

  // Pull the all-shows backlog so we can surface the upgrade-candidate count
  // on the hub card. Same query key as the BacklogOverview page when no
  // filters are applied — they share cache.
  const backlogQ = useQuery({
    queryKey: ["backlog", "all", "all"] as const,
    queryFn: ({ signal }) =>
      api
        .get<BacklogShowSummary[]>("/internal/getEpisodeBacklog", {
          signal,
          params: { status: "all", period: "all" },
        })
        .then((r) => r.data),
    staleTime: 60_000,
  });
  const backlogTotals = backlogQ.data
    ? backlogQ.data.reduce(
        (acc, s) => {
          acc.wanted += s.episodeCount.wanted;
          acc.upgrades += s.episodeCount.allowed;
          return acc;
        },
        { wanted: 0, upgrades: 0 },
      )
    : null;

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Manage</h1>
      <p className="text-sm text-base-content/60">
        Library-wide operations that don't fit on a single show's page.
      </p>

      <div className="bg-base-100 border-2 border-base-300 rounded-box">
        <div className="px-4 py-3 font-semibold border-b border-base-300">
          Library
        </div>
        <ul>
          <li>
            <Link
              to="/manage/backlog"
              className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-base-200/50 transition-colors border-b border-base-300"
            >
              <div>
                <div className="font-medium inline-flex items-center gap-2 flex-wrap">
                  Backlog overview
                  {backlogTotals && backlogTotals.wanted > 0 && (
                    <span className="badge badge-soft badge-sm badge-warning">
                      {backlogTotals.wanted} wanted
                    </span>
                  )}
                  {backlogTotals && backlogTotals.upgrades > 0 && (
                    <span className="badge badge-soft badge-sm badge-info gap-1">
                      <ArrowUpCircle size={12} />
                      {backlogTotals.upgrades} upgrade
                      {backlogTotals.upgrades === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
                <div className="text-xs text-base-content/60">
                  A list of all missing episodes (wanted) and downloads below
                  your show's allowed maximum quality (upgrade candidates)
                  across all shows. Here you can trigger{" "}
                  <strong>Backlog searches</strong> for all of them or for each
                  show individually
                </div>
              </div>
              <ChevronRight size={16} className="text-base-content/40" />
            </Link>
          </li>
          <li>
            <Link
              to="/manage/episode-statuses"
              className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-base-200/50 transition-colors border-b border-base-300"
            >
              <div>
                <div className="font-medium">Episode statuses</div>
                <div className="text-xs text-base-content/60">
                  Episode statuses are the lifecycle markers (Wanted, Snatched,
                  Downloaded, Failed, …) that drive what Medusa does on each
                  search pass. Here you can bulk flip all episodes with a given
                  status to a new one. This can be handy for retrying stalled
                  snatches or cleaning up shows you no longer follow.
                </div>
              </div>
              <ChevronRight size={16} className="text-base-content/40" />
            </Link>
          </li>
          <li>
            <Link
              to="/manage/bulk-shows"
              className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-base-200/50 transition-colors"
            >
              <div>
                <div className="font-medium">Bulk operations on shows</div>
                <div className="text-xs text-base-content/60">
                  Whole-show operations applied to many shows at once. Here you
                  can change settings (quality, paused, season folders, …) or
                  run a maintenance job (rescan, rename, refresh images, remove
                  from library) across a selection of your library.
                </div>
              </div>
              <ChevronRight size={16} className="text-base-content/40" />
            </Link>
          </li>
        </ul>
      </div>

      <div className="bg-base-100 border-2 border-base-300 rounded-box">
        <div className="px-4 py-3 font-semibold border-b border-base-300">
          Cleanup
        </div>
        <ul>
          <li>
            <Link
              to="/manage/failed"
              className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-base-200/50 transition-colors"
            >
              <div>
                <div className="font-medium inline-flex items-center gap-2">
                  Failed releases
                  {failedCountQ.data !== undefined && failedCountQ.data > 0 && (
                    <span className="badge badge-sm badge-ghost">
                      {failedCountQ.data}
                    </span>
                  )}
                </div>
                <div className="text-xs text-base-content/60">
                  A blacklist for releases that failed post-processing, or were
                  flagged by the user or the download client so searches skip
                  them on future runs. Here you can inspect and clean the
                  blacklist.
                </div>
              </div>
              <ChevronRight size={16} className="text-base-content/40" />
            </Link>
          </li>
        </ul>
      </div>
    </div>
  );
}
