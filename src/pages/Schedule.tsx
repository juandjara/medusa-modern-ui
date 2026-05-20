import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import api, { getAssetUrl } from "../lib/api";
import type {
  ScheduleEntry,
  ScheduleResponse,
  ScheduleSection,
} from "../types/medusa";

// Missed first so overdue episodes aren't buried; chronological after.
const SECTIONS: { key: ScheduleSection; label: string }[] = [
  { key: "missed", label: "Missed" },
  { key: "today", label: "Today" },
  { key: "soon", label: "Soon" },
  { key: "later", label: "Later" },
];

export default function Schedule() {
  const { data, isLoading } = useQuery({
    queryKey: ["schedule"],
    queryFn: ({ signal }) =>
      api
        .get<ScheduleResponse>("/schedule", {
          signal,
          // Backend expects the literal `category[]` key, not `category`.
          params: {
            "category[]": ["missed", "today", "soon", "later"],
            sort: "asc",
            paused: true,
          },
        })
        .then((r) => r.data),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  const totalCount = SECTIONS.reduce(
    (n, s) => n + (data?.[s.key]?.length ?? 0),
    0,
  );

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Schedule</h1>

      {totalCount === 0 && (
        <div className="text-center py-16 text-base-content/50">
          Nothing scheduled.
        </div>
      )}

      {SECTIONS.map(({ key, label }) => {
        const items = data?.[key] ?? [];
        if (items.length === 0) return null;
        return (
          <section key={key}>
            <h2 className="font-semibold text-sm uppercase tracking-wide text-base-content/60 mb-3">
              {label}
              <span className="ml-2 badge badge-sm badge-ghost">
                {items.length}
              </span>
            </h2>
            <ul className="space-y-2">
              {items.map((entry) => (
                <ScheduleRow
                  key={`${entry.showSlug}-${entry.episodeSlug}`}
                  entry={entry}
                  section={key}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function ScheduleRow({
  entry,
  section,
}: {
  entry: ScheduleEntry;
  section: ScheduleSection;
}) {
  const date = new Date(entry.localAirTime);
  const valid = !Number.isNaN(date.getTime());

  // Falls back to the raw airdate string if localAirTime can't parse.
  const month = valid
    ? date.toLocaleDateString(undefined, { month: "short" }).toUpperCase()
    : "—";
  const day = valid ? date.getDate() : (entry.airdate?.split("-")[2] ?? "—");
  const weekday = valid
    ? date.toLocaleDateString(undefined, { weekday: "short" })
    : "";
  const time = valid
    ? date.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      })
    : entry.airs;

  // Missed rows get a warning-tinted left border so they stand out.
  const accentClass =
    section === "missed"
      ? "border-warning/60"
      : section === "today"
        ? "border-primary/60"
        : "border-base-300";

  return (
    <li>
      <Link
        to={`/show/${entry.showSlug}`}
        className={`flex items-center gap-4 p-3 rounded-box border-l-5 bg-base-100 border border-base-300 hover:border-accent transition-colors ${accentClass}`}
      >
        <div className="text-center shrink-0 w-14">
          <div className="text-xs uppercase font-medium text-base-content/60">
            {month}
          </div>
          <div className="text-3xl font-bold leading-none">{day}</div>
          {weekday && (
            <div className="text-xs text-base-content/60 mt-0.5">{weekday}</div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            {entry.network && (
              <span
                title={entry.network}
                className="shrink-0 inline-flex items-center bg-base-200 rounded px-1 py-0.5"
              >
                <img
                  alt={entry.network}
                  className="h-4 w-auto max-w-12 object-contain"
                  src={getAssetUrl(entry.showSlug, "network")}
                  onError={(e) => {
                    const wrapper = e.currentTarget.parentElement;
                    if (wrapper) wrapper.style.display = "none";
                  }}
                />
              </span>
            )}
            <span className="font-medium truncate">{entry.showName}</span>
            {entry.paused ? (
              <span className="badge badge-xs badge-warning">paused</span>
            ) : null}
          </div>
          <div className="text-sm text-base-content/70 truncate">
            S{String(entry.season).padStart(2, "0")}E
            {String(entry.episode).padStart(2, "0")}
            {entry.epName ? ` — ${entry.epName}` : ""}
          </div>
          <div className="text-xs text-base-content/50 mt-0.5">
            {time}
            {entry.network && ` · ${entry.network}`}
          </div>
        </div>
      </Link>
    </li>
  );
}
