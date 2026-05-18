import { useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  AlertTriangle,
  RefreshCw,
  Pause,
  Settings as SettingsIcon,
  HardDrive,
  Clock,
} from "lucide-react";
import api, { getAssetUrl } from "../lib/api";
import {
  qualityName,
  qualitySummary,
  seriesStatusBadgeClass,
  type Episode,
  type Series,
} from "../types/medusa";
import SeasonAccordion from "../components/SeasonAccordion";
import ShowActionsMenu from "../components/ShowActionsMenu";
import {
  useSeriesMassUpdate,
  usePauseSeries,
  ACTION_LABELS,
} from "../lib/series-actions";

export default function ShowDetail() {
  const { slug = "" } = useParams<{ slug: string }>();

  const show = useQuery({
    queryKey: ["series", slug, "detailed"],
    queryFn: ({ signal }) =>
      api
        .get<Series>(`/series/${slug}`, { signal, params: { detailed: true } })
        .then((r) => r.data),
    enabled: !!slug,
  });

  // Page through /episodes until we've drained the dataset. The endpoint caps
  // limit at 1000; we keep paging while pages come back full. Safety cap at 20
  // pages = 20k episodes — far above anything real.
  const episodes = useQuery({
    queryKey: ["series", slug, "episodes"],
    queryFn: async ({ signal }) => {
      const all: Episode[] = [];
      const PAGE_SIZE = 1000;
      for (let page = 1; page <= 20; page += 1) {
        const res = await api.get<Episode[]>(`/series/${slug}/episodes`, {
          signal,
          params: { limit: PAGE_SIZE, page },
        });
        all.push(...res.data);
        if (res.data.length < PAGE_SIZE) break;
      }
      return all;
    },
    enabled: !!slug,
  });

  const actions = useSeriesMassUpdate(slug);
  const pause = usePauseSeries(slug);

  const seasons = useMemo(() => {
    const map = new Map<number, Episode[]>();
    for (const ep of episodes.data ?? []) {
      const list = map.get(ep.season) ?? [];
      list.push(ep);
      map.set(ep.season, list);
    }
    return [...map.entries()]
      .sort(([a], [b]) => b - a)
      .map(([season, eps]) => ({
        season,
        episodes: eps.sort((a, b) => b.episode - a.episode),
      }));
  }, [episodes.data]);

  if (show.isLoading || !show.data)
    return (
      <div className="flex justify-center py-20">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );

  const s = show.data;
  const reportedSeasons = s.seasonCount?.length ?? null;
  const renderedSeasons = seasons.length;
  const hasSeasonMismatch =
    reportedSeasons !== null && reportedSeasons !== renderedSeasons;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <Link to="/" className="btn btn-ghost btn-sm gap-1">
          <ChevronLeft size={16} /> Back
        </Link>
        <div className="flex items-center gap-2">
          <Link
            to={`/show/${s.id.slug}/settings`}
            className="btn btn-ghost btn-sm gap-1"
            title="Show settings"
          >
            <SettingsIcon size={14} /> Settings
          </Link>
          <ShowActionsMenu
            series={s}
            isPending={actions.isPending}
            queued={actions.queued}
            onAction={actions.run}
            onTogglePause={() => pause.mutate(!s.config.paused)}
            isPausePending={pause.isPending}
          />
        </div>
      </div>

      {actions.queued && (
        <div className="alert alert-soft alert-info text-sm">
          <RefreshCw size={16} className="animate-spin" />
          <div className="flex-1">
            {ACTION_LABELS[actions.queued]} queued — data will refresh shortly.
          </div>
          <button className="btn btn-sm btn-ghost" onClick={actions.reload}>
            Reload now
          </button>
        </div>
      )}

      {actions.error && (
        <div className="alert alert-soft alert-error text-sm">
          Failed to queue action.
        </div>
      )}

      {s.config.paused && (
        <div className="alert alert-soft alert-warning text-sm">
          <Pause size={16} />
          <div>
            This show is paused. PyMedusa won't search for new episodes until
            you resume it.
          </div>
        </div>
      )}

      <header className="flex flex-col sm:flex-row gap-6">
        <div className="w-40 aspect-2/3 bg-base-300 rounded shrink-0 overflow-hidden">
          <img
            src={getAssetUrl(s.id.slug, "poster")}
            alt={s.title}
            className="object-cover w-full h-full"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        </div>
        <div className="space-y-2 min-w-0">
          <h1 className="text-2xl font-bold">{s.title}</h1>
          <div className="flex flex-wrap gap-2 mb-6">
            {s.network && (
              <span
                title={s.network}
                className="shrink-0 inline-flex items-center bg-base-200 rounded px-1.5 py-0.5"
              >
                <img
                  alt={s.network}
                  className="h-5 w-auto max-w-20 object-contain"
                  src={getAssetUrl(s.id.slug, "network")}
                  onError={(e) => {
                    const wrapper = e.currentTarget.parentElement;
                    if (wrapper) wrapper.style.display = "none";
                  }}
                />
              </span>
            )}
            <span
              className={`badge badge-sm ${seriesStatusBadgeClass(s.status)}`}
            >
              {s.status}
            </span>
            <span className="badge badge-sm badge-soft">{s.year.start}</span>
            {s.config.qualities?.allowed && (
              <span
                className="badge badge-sm badge-soft"
                title={s.config.qualities.allowed
                  .map((q) => qualityName(q))
                  .join(", ")}
              >
                {qualitySummary(s.config.qualities.allowed)}
              </span>
            )}
            {s.showType === "anime" && (
              <span className="badge badge-sm badge-accent">anime</span>
            )}
          </div>
          {s.genres.length > 0 && (
            <div className="text-xs text-base-content/60">
              {s.genres.join(" · ")}
            </div>
          )}
          {s.plot && (
            <p className="text-sm text-base-content/70 max-w-2xl">{s.plot}</p>
          )}
          <div className="text-xs text-base-content/50 pt-1 flex flex-wrap gap-x-3 gap-y-1">
            <span>
              {renderedSeasons} season{renderedSeasons === 1 ? "" : "s"} ·{" "}
              {episodes.data?.length ?? 0} episodes
            </span>
            {s.lastUpdate && (
              <span className="inline-flex items-center gap-1">
                <Clock size={12} /> Metadata synced: {s.lastUpdate}
              </span>
            )}
            {s.config.location && (
              <span
                className={`inline-flex items-center gap-1 font-mono break-all ${
                  s.config.locationValid === false
                    ? "text-warning"
                    : "text-base-content/50"
                }`}
                title={
                  s.config.locationValid === false
                    ? "Folder not found on disk — post-processing and renaming will fail until this is restored."
                    : "Show folder on disk"
                }
              >
                {s.config.locationValid === false ? (
                  <AlertTriangle size={12} className="shrink-0" />
                ) : (
                  <HardDrive size={12} className="shrink-0" />
                )}
                {s.config.location}
              </span>
            )}
          </div>
        </div>
      </header>

      {hasSeasonMismatch && (
        <div className="alert alert-soft alert-warning text-sm">
          <AlertTriangle size={16} />
          <div>
            PyMedusa reports <strong>{reportedSeasons}</strong> seasons for this
            show, but only <strong>{renderedSeasons}</strong> were returned via
            the episodes endpoint. The two views disagree — likely a backend
            data issue, not a UI bug.
          </div>
        </div>
      )}

      {episodes.isLoading ? (
        <div className="flex justify-center py-10">
          <span className="loading loading-spinner" />
        </div>
      ) : (
        <div className="space-y-3">
          {seasons.map(({ season, episodes: eps }) => (
            <SeasonAccordion
              key={season}
              seriesSlug={s.id.slug}
              season={season}
              episodes={eps}
            />
          ))}
          {seasons.length === 0 && (
            <div className="text-sm text-base-content/50 italic">
              No episodes found for this show.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
