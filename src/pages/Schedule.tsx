import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { CalendarPlus, Copy, Check } from "lucide-react";
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
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-2xl font-bold">Schedule</h1>
        <CalendarSubscribe />
      </div>

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

function CalendarSubscribe() {
  const [copied, setCopied] = useState(false);

  // window.location.origin already reflects what the user typed into the
  // browser bar — works behind a reverse proxy or with a non-standard port.
  // Medusa serves the iCal feed at /<webRoot>/calendar. We don't know the
  // webRoot client-side, so we read it from the current pathname's leading
  // segments — but in practice it's the root or matches the SPA mount.
  const icalUrl = `${window.location.origin}/calendar`;
  // webcal:// is the magic scheme that hands the URL to the OS's default
  // calendar app (Apple Calendar, Outlook, etc.) for subscription. iOS and
  // macOS handle it natively; on Linux/Windows the calendar app needs to be
  // the registered handler.
  const webcalUrl = icalUrl.replace(/^https?:/, "webcal:");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(icalUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can be blocked (insecure context, permissions). Fall
      // back to selecting the text in a temporary input.
      const ta = document.createElement("input");
      ta.value = icalUrl;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div className="dropdown dropdown-end">
      <button tabIndex={0} className="btn btn-sm gap-1">
        <CalendarPlus size={14} /> Subscribe
      </button>
      <div
        tabIndex={0}
        className="dropdown-content bg-base-100 rounded-box z-10 shadow-sm border border-base-300 p-3 w-80 text-sm space-y-3"
      >
        <p className="text-xs text-base-content/60">
          Subscribe to this schedule from your calendar app — episodes show up
          as events on their air date.
        </p>
        <a
          href={webcalUrl}
          className="btn btn-sm btn-primary w-full gap-1"
          target="_blank"
          rel="noreferrer"
        >
          <CalendarPlus size={14} /> Open in calendar app
        </a>
        <div className="space-y-1">
          <div className="text-xs text-base-content/60">
            …or paste this URL into your calendar:
          </div>
          <div className="flex gap-1">
            <input
              readOnly
              className="input input-xs flex-1 font-mono"
              value={icalUrl}
              onFocus={(e) => e.currentTarget.select()}
            />
            <button
              type="button"
              className="btn btn-xs gap-1"
              onClick={copy}
              title="Copy URL"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
        <p className="text-xs text-base-content/50">
          By default the feed requires the same login as Medusa. Toggle{" "}
          <Link to="/settings/general" className="link link-hover text-primary">
            Public calendar (no auth)
          </Link>{" "}
          on if you want a credential-free URL.
        </p>
      </div>
    </div>
  );
}
