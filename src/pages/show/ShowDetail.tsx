import { useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  AlertTriangle,
  RefreshCw,
  Pause,
  HardDrive,
  Clock,
} from "lucide-react";
import api, { getAssetUrl } from "../../lib/api";
import { formatBytes } from "../../lib/time";
import {
  INDEXER_ID_TO_SLUG,
  qualityName,
  qualitySummary,
  seriesStatusBadgeClass,
  type Episode,
  type Series,
  type ShowStatsResponse,
} from "../../types/medusa";
import SeasonAccordion from "../../components/SeasonAccordion";
import ShowActionsMenu from "../../components/ShowActionsMenu";
import {
  useSeriesMassUpdate,
  usePauseSeries,
  ACTION_LABELS,
} from "../../lib/series-actions";

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

  // Endpoint caps at 1000 per page; safety cap at 20 pages.
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

  // Shared cache with ShowList; falls back to a fetch on direct nav.
  const showStats = useQuery({
    queryKey: ["stats", "show"],
    queryFn: ({ signal }) =>
      api.get<ShowStatsResponse>("/stats/show", { signal }).then((r) => r.data),
    staleTime: 60_000,
  });

  const stat = useMemo(() => {
    const rows = showStats.data?.stats;
    if (!rows) return undefined;
    return rows.find((r) => {
      const prefix = INDEXER_ID_TO_SLUG[r.indexerId];
      return prefix && `${prefix}${r.seriesId}` === slug;
    });
  }, [showStats.data, slug]);

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
  // Guard against the false-positive flash before episodes load.
  const hasSeasonMismatch =
    episodes.isSuccess &&
    reportedSeasons !== null &&
    reportedSeasons !== renderedSeasons;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <Link to="/" className="btn btn-ghost btn-sm gap-1">
          <ChevronLeft size={16} /> Back
        </Link>
        <div className="flex items-center gap-2">
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

      <header className="relative rounded-box overflow-hidden border-2 border-base-300">
        {/* Fanart backdrop. Faded + bottom gradient so the meta stays legible.
            onError hides the img on 404; the gradient over a transparent
            background remains invisible when there's no fanart. */}
        <img
          src={getAssetUrl(s.id.slug, "fanart")}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover opacity-40 pointer-events-none"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
        <div
          className="absolute inset-0 pointer-events-none bg-linear-to-b from-transparent via-base-100/40 to-base-100/95"
          aria-hidden="true"
        />
        <div className="relative flex flex-col sm:flex-row gap-6 p-4">
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
            {/* Meta is broken into three logical groups so the eye can scan
                each in one go: library shape, schedule, system. Each row only
                renders if it has at least one item, so ended/orphaned shows
                don't get empty rows. */}
            <div className="text-xs text-base-content/50 pt-1 space-y-1">
              <div className="flex flex-wrap gap-x-1 gap-y-1">
                <span>
                  {renderedSeasons} season{renderedSeasons === 1 ? "" : "s"} ·{" "}
                  {episodes.data?.length ?? 0} episodes
                </span>
                {stat && stat.epTotal > 0 && (
                  <span>
                    {"· "}
                    {stat.epDownloaded} / {stat.epTotal} downloaded
                  </span>
                )}
                {stat && stat.epSnatched > 0 && (
                  <span>
                    {"· "}
                    {stat.epSnatched} snatched (in progress)
                  </span>
                )}
                {s.size !== undefined && s.size > 0 && (
                  <span>{formatBytes(s.size)} on disk</span>
                )}
              </div>

              {s.status === "Continuing" && (s.airs || s.nextAirDate) && (
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {s.airs && <span>Airs {s.airs}</span>}
                  {s.nextAirDate && (
                    <span>Next: {formatAirDate(s.nextAirDate)}</span>
                  )}
                  {!s.nextAirDate && s.prevAirDate && (
                    <span>
                      Last aired: {formatAirDate(s.prevAirDate, true)}
                    </span>
                  )}
                </div>
              )}

              {s.status !== "Continuing" && s.prevAirDate && (
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  <span>Last aired: {formatAirDate(s.prevAirDate, true)}</span>
                </div>
              )}

              {(s.lastUpdate || s.config.location) && (
                <div className="flex flex-wrap gap-x-3 gap-y-1">
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
              )}
            </div>
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

// `includeYear` disambiguates past dates from older seasons.
function formatAirDate(iso: string, includeYear = false): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(includeYear ? { year: "numeric" } : {}),
  });
}
