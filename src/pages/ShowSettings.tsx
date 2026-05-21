import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import api from "../lib/api";
import { useEditSeries } from "../lib/series-actions";
import {
  DEFAULT_EPISODE_STATUSES,
  type Series,
} from "../types/medusa";
import Toggle from "../components/forms/Toggle";
import QualityPicker from "../components/forms/QualityPicker";

export default function ShowSettings() {
  const { slug = "" } = useParams<{ slug: string }>();

  const { data: show, isLoading } = useQuery({
    queryKey: ["series", slug, "detailed"],
    queryFn: ({ signal }) =>
      api
        .get<Series>(`/series/${slug}`, { signal, params: { detailed: true } })
        .then((r) => r.data),
    enabled: !!slug,
  });

  if (isLoading || !show) {
    return (
      <div className="flex justify-center py-20">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  return <SettingsForm show={show} />;
}

interface FormState {
  defaultEpisodeStatus: string;
  qualityAllowed: number[];
  qualityPreferred: number[];
  anime: boolean;
  scene: boolean;
  subtitlesEnabled: boolean;
  seasonFolders: boolean;
  dvdOrder: boolean;
  airByDate: boolean;
}

function formFromShow(show: Series): FormState {
  const c = show.config;
  return {
    defaultEpisodeStatus: c.defaultEpisodeStatus ?? "Skipped",
    qualityAllowed: c.qualities?.allowed ?? [],
    qualityPreferred: c.qualities?.preferred ?? [],
    anime: !!c.anime,
    scene: !!c.scene,
    subtitlesEnabled: !!c.subtitlesEnabled,
    seasonFolders: c.seasonFolders ?? true,
    dvdOrder: !!c.dvdOrder,
    airByDate: !!c.airByDate,
  };
}

function SettingsForm({ show }: { show: Series }) {
  const navigate = useNavigate();
  const editSeries = useEditSeries(show.id.slug);
  // Local form state survives background refetches of the server cache.
  const [form, setForm] = useState<FormState>(() => formFromShow(show));

  const handleSave = () => {
    const body: Record<string, unknown> = {
      "config.defaultEpisodeStatus": form.defaultEpisodeStatus,
      "config.qualities.allowed": form.qualityAllowed,
      "config.qualities.preferred": form.qualityPreferred,
      "config.anime": form.anime,
      "config.scene": form.scene,
      "config.subtitlesEnabled": form.subtitlesEnabled,
      "config.seasonFolders": form.seasonFolders,
      "config.dvdOrder": form.dvdOrder,
      "config.airByDate": form.airByDate,
    };
    editSeries.mutate(body);
  };

  return (
    <div className="max-w-lg mx-auto pt-8 space-y-6">
      <div className="flex items-center justify-between">
        <Link
          to={`/show/${show.id.slug}`}
          className="btn btn-ghost btn-sm gap-1"
        >
          <ChevronLeft size={16} /> {show.title}
        </Link>
      </div>

      <h1 className="text-2xl font-bold">Show settings</h1>

      <fieldset className="fieldset w-full">
        <legend className="fieldset-legend">Default Episode Status</legend>
        <select
          className="select w-full"
          value={form.defaultEpisodeStatus}
          onChange={(e) =>
            setForm((s) => ({ ...s, defaultEpisodeStatus: e.target.value }))
          }
        >
          {DEFAULT_EPISODE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <p className="label whitespace-normal">
          Applied to newly aired episodes once PyMedusa picks them up from the
          indexer.
        </p>
      </fieldset>

      <fieldset className="fieldset w-full">
        <legend className="fieldset-legend">Quality</legend>
        <QualityPicker
          allowed={form.qualityAllowed}
          preferred={form.qualityPreferred}
          onChange={({ allowed, preferred }) =>
            setForm((s) => ({
              ...s,
              qualityAllowed: allowed,
              qualityPreferred: preferred,
            }))
          }
        />
      </fieldset>

      <fieldset className="fieldset w-full">
        <legend className="fieldset-legend mb-1">Behavior</legend>
        <div className="space-y-3">
          <Toggle
            label="Anime"
            hint="Absolute episode numbering; matches AniDB / AniList aliases."
            checked={form.anime}
            onChange={(v) => setForm((s) => ({ ...s, anime: v }))}
          />
          <Toggle
            label="Scene numbering"
            hint="Use scene-release season/episode numbers instead of indexer numbers."
            checked={form.scene}
            onChange={(v) => setForm((s) => ({ ...s, scene: v }))}
          />
          <Toggle
            label="Subtitles"
            hint="Search for and download subtitles for episodes."
            checked={form.subtitlesEnabled}
            onChange={(v) => setForm((s) => ({ ...s, subtitlesEnabled: v }))}
          />
          <Toggle
            label="Season folders"
            hint="Organize episodes into Season N subfolders."
            checked={form.seasonFolders}
            onChange={(v) => setForm((s) => ({ ...s, seasonFolders: v }))}
          />
          <Toggle
            label="DVD order"
            hint="Use the DVD-order season/episode numbering."
            checked={form.dvdOrder}
            onChange={(v) => setForm((s) => ({ ...s, dvdOrder: v }))}
          />
          <Toggle
            label="Air by date"
            hint="For shows that air daily, treat date as the episode identifier."
            checked={form.airByDate}
            onChange={(v) => setForm((s) => ({ ...s, airByDate: v }))}
          />
        </div>
      </fieldset>

      {editSeries.isError && (
        <div className="alert alert-soft alert-error text-sm">
          Failed to save changes. Try again.
        </div>
      )}
      {editSeries.isSuccess && (
        <div className="alert alert-soft alert-success text-sm">Saved.</div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          className="btn btn-ghost flex-1"
          onClick={() => navigate(`/show/${show.id.slug}`)}
          disabled={editSeries.isPending}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary flex-1"
          onClick={handleSave}
          disabled={editSeries.isPending}
        >
          {editSeries.isPending ? (
            <span className="loading loading-spinner loading-sm" />
          ) : (
            "Save"
          )}
        </button>
      </div>
    </div>
  );
}

// function Toggle({
//   label,
//   description,
//   checked,
//   onChange,
// }: {
//   label: string;
//   description: string;
//   checked: boolean;
//   onChange: (v: boolean) => void;
// }) {
//   return (
//     <label className="flex items-start gap-2 cursor-pointer justify-start">
//       <input
//         type="checkbox"
//         className="toggle toggle-sm mt-0.5"
//         checked={checked}
//         onChange={(e) => onChange(e.target.checked)}
//       />
//       <span>
//         <span className="font-medium text-base-content">{label}</span>
//         <span className="block text-xs text-base-content/60 whitespace-normal">
//           {description}
//         </span>
//       </span>
//     </label>
//   );
// }
