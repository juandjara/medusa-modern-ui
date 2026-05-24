import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  FolderInput,
  Plus,
  Search,
  Sparkles,
  Tv,
} from "lucide-react";
import api, { getAssetUrl } from "../../lib/api";
import {
  INDEXER_ID_TO_SLUG,
  seriesStatusBadgeClass,
  type Series,
  type ShowStat,
  type ShowStatsResponse,
} from "../../types/medusa";

function useSeries() {
  return useQuery({
    queryKey: ["series"],
    queryFn: ({ signal }) =>
      api.get<Series[]>("/series", { signal }).then((r) => r.data),
  });
}

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
        <div className="flex gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-none">
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
          <div className="join">
            <Link to="/add" className="btn btn-primary btn-sm gap-1 join-item">
              <Plus size={14} /> Add show
            </Link>
            <div className="dropdown dropdown-end">
              <button
                tabIndex={0}
                className="btn btn-primary btn-sm join-item"
                aria-label="More ways to add shows"
              >
                <ChevronDown size={14} />
              </button>
              <ul
                tabIndex={0}
                className="dropdown-content menu bg-base-100 rounded-box z-10 shadow-lg border border-base-300 p-2 w-64 mt-1"
              >
                <li>
                  <Link to="/recommended">
                    <Sparkles size={14} /> Recommended shows
                  </Link>
                </li>
                <li>
                  <Link to="/import">
                    <FolderInput size={14} /> Import from disk
                  </Link>
                </li>
              </ul>
            </div>
          </div>
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

function ShowProgress({ stat }: { stat: ShowStat | undefined }) {
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
