import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, Tv } from "lucide-react";
import api, { getAssetUrl } from "../lib/api";
import {
  INDEXER_ID_TO_SLUG,
  seriesStatusBadgeClass,
  type Series,
  type ShowStat,
  type ShowStatsResponse,
} from "../types/medusa";

function useSeries() {
  return useQuery({
    queryKey: ["series"],
    queryFn: ({ signal }) =>
      api.get<Series[]>("/series", { signal }).then((r) => r.data),
  });
}

// Per-show stats (downloaded / total / size / next-airs). Independent of the
// series list — slow to refresh on its own cadence is fine for a progress
// indicator.
function useShowStats() {
  return useQuery({
    queryKey: ["stats", "show"],
    queryFn: ({ signal }) =>
      api.get<ShowStatsResponse>("/stats/show", { signal }).then((r) => r.data),
    staleTime: 60_000,
  });
}

export default function ShowList() {
  const { data: shows, isLoading } = useSeries();
  const { data: statsData } = useShowStats();
  const [search, setSearch] = useState("");

  // slug → stat lookup. Stats rows key off (indexerId, seriesId); we
  // reconstruct the slug the same way PyMedusa does.
  const statsBySlug = useMemo(() => {
    const map: Record<string, ShowStat> = {};
    for (const stat of statsData?.stats ?? []) {
      const prefix = INDEXER_ID_TO_SLUG[stat.indexerId];
      if (!prefix) continue;
      map[`${prefix}${stat.seriesId}`] = stat;
    }
    return map;
  }, [statsData]);

  const filtered = shows?.filter((s) =>
    s.title.toLowerCase().includes(search.toLowerCase()),
  );

  if (isLoading)
    return (
      <div className="flex justify-center py-20">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Shows</h1>
        <div className="join w-full sm:w-auto">
          <div className="join-item flex-1 relative">
            <Search
              size={16}
              className="absolute z-10 left-3 top-1/2 -translate-y-1/2 text-base-content/40"
            />
            <input
              className="input input-sm w-full sm:w-64 pl-9"
              placeholder="Filter shows…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Link to="/add" className="btn btn-primary btn-sm join-item">
            Add Show
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {filtered?.map((show) => (
          <Link
            key={show.id.slug}
            to={`/show/${show.id.slug}`}
            className="card card-sm bg-base-100 border-2 border-transparent hover:border-accent transition-colors"
          >
            <figure className="aspect-2/3 bg-base-300">
              <img
                src={getAssetUrl(show.id.slug, "posterThumb")}
                alt={show.title}
                loading="lazy"
                className="object-cover h-full w-full"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            </figure>
            <ShowProgress stat={statsBySlug[show.id.slug]} />
            <div className="card-body p-3">
              <h3 className="card-title text-sm line-clamp-1">{show.title}</h3>
              <div className="flex items-center flex-wrap gap-1">
                {show.network && (
                  <span
                    title={show.network}
                    className="shrink-0 inline-flex items-center bg-base-200 rounded px-1 py-0.5"
                  >
                    <img
                      alt={show.network}
                      className="h-4 w-auto max-w-12 object-contain"
                      src={getAssetUrl(show.id.slug, "network")}
                      onError={(e) => {
                        const wrapper = e.currentTarget.parentElement;
                        if (wrapper) wrapper.style.display = "none";
                      }}
                    />
                  </span>
                )}
                <span
                  className={`badge badge-xs ${seriesStatusBadgeClass(show.status)}`}
                >
                  {show.status}
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {filtered?.length === 0 && (
        <div className="text-center py-16 space-y-3 text-base-content/50">
          {search ? (
            <p>No shows match your filter.</p>
          ) : (
            <>
              <Tv className="mx-auto" size={32} />
              <div>
                <div>Your library is empty.</div>
                <div className="text-xs">
                  Add a show to start tracking episodes and downloads.
                </div>
              </div>
              <Link to="/add" className="btn btn-primary btn-sm gap-1">
                <Plus size={14} /> Add your first show
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Rendered as a separator strip between the poster and the card body, so it
// also conveys download progress at a glance without taking text-row space.
// Counts + percentage live in the hover tooltip.
function ShowProgress({ stat }: { stat: ShowStat | undefined }) {
  // Skip when stats haven't loaded yet (or PyMedusa has no record for this
  // show — e.g. one that was just added and hasn't been scanned).
  if (!stat || stat.epTotal === 0) return null;
  const pct = Math.min(
    100,
    Math.round((stat.epDownloaded / stat.epTotal) * 100),
  );
  const complete = stat.epDownloaded >= stat.epTotal;
  return (
    <progress
      className={`progress h-1 rounded-none block w-full ${complete ? "progress-success" : "progress-primary"}`}
      value={stat.epDownloaded}
      max={stat.epTotal}
      title={`${stat.epDownloaded} / ${stat.epTotal} episodes · ${pct}%${stat.epSnatched > 0 ? ` · ${stat.epSnatched} snatched` : ""}`}
    />
  );
}
