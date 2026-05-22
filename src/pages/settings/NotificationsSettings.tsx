import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import { ChevronLeft, ChevronDown, ChevronUp } from "lucide-react";
import useDraftConfig from "../../lib/useDraftConfig";
import Field from "../../components/forms/Field";
import Toggle from "../../components/forms/Toggle";
import SaveBar from "../../components/forms/SaveBar";
import SecretInput from "../../components/forms/SecretInput";
import TagInput from "../../components/forms/TagInput";
import TestRow from "../../components/forms/TestRow";
import type { ConfigNotifiers } from "../../types/config";

type Getter = <T>(path: string) => T;
type Setter = (path: string, value: unknown) => void;

// Medusa stores Kodi/Plex hosts as arrays. The legacy /home/testKODI and
// /home/testPMS endpoints take a comma-separated string, so we join when
// sending; the form input is a TagInput that reads/writes the array directly.
function hostsToString(hosts: string[] | undefined): string {
  return (hosts ?? []).join(", ");
}

export default function NotificationsSettings() {
  const { isLoading, get, set, dirty, save } = useDraftConfig<ConfigNotifiers>({
    section: "notifiers",
  });
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  const toggleExpand = (id: string) =>
    setExpandedId((curr) => (curr === id ? null : id));

  // Row props are uniform across services; this saves repeating them.
  const rowProps = (id: string) => ({
    id,
    expanded: expandedId === id,
    onToggleExpand: () => toggleExpand(id),
    get,
    set,
  });

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-2">
        <Link to="/settings" className="btn btn-ghost btn-sm gap-1">
          <ChevronLeft size={16} /> Settings
        </Link>
      </div>

      <header>
        <h1 className="text-2xl font-bold">Notifications</h1>
        <p className="text-sm text-base-content/60 mt-1">
          Tick to enable; click a name to expand its settings. Additional
          services available in Medusa's legacy UI; the most common ones live
          here.
        </p>
      </header>

      <SaveBar
        dirty={dirty}
        pending={save.isPending}
        success={save.isSuccess}
        error={save.isError}
        onSave={() => save.mutate()}
      />

      <ul className="space-y-2">
        <KodiRow {...rowProps("kodi")} />
        <PlexServerRow {...rowProps("plex.server")} />
        <EmbyRow {...rowProps("emby")} />
        <SynologyIndexerRow {...rowProps("synologyIndex")} />
        <SynologyNotifierRow {...rowProps("synology")} />
        <PushbulletRow {...rowProps("pushbullet")} />
        <PushoverRow {...rowProps("pushover")} />
        <TelegramRow {...rowProps("telegram")} />
        <DiscordRow {...rowProps("discord")} />
        <SlackRow {...rowProps("slack")} />
        <EmailRow {...rowProps("email")} />
      </ul>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Notifier icon — pulls from the legacy slim UI's CSS sprite, scaled to 16×16
// so it sits next to the row checkbox without bulking the layout. Mapping
// matches the `icon-notifiers-*` classes in slim's style.css.
// -----------------------------------------------------------------------------

const NOTIFIER_SPRITE_INDEX: Record<string, number> = {
  kodi: 0,
  plex: 1,
  plexth: 2,
  emby: 3,
  nmj: 4,
  syno1: 5,
  syno2: 6,
  pytivo: 7,
  growl: 8,
  prowl: 9,
  libnotify: 10,
  pushover: 11,
  boxcar2: 12,
  pushalot: 13,
  pushbullet: 14,
  freemobile: 15,
  telegram: 16,
  twitter: 17,
  trakt: 18,
  email: 19,
  anime: 20,
  look: 21,
  slack: 22,
  join: 23,
  discord: 24,
};

function NotifierIcon({ name }: { name: string }) {
  const idx = NOTIFIER_SPRITE_INDEX[name];
  if (idx === undefined) return null;
  // Original sprite is 832×32 with 32px tiles. Halved for the row.
  return (
    <div
      className="shrink-0"
      style={{
        width: 16,
        height: 16,
        backgroundImage: 'url("/images/32x_sprite_colored_notifiers.png")',
        backgroundPosition: `-${idx * 16}px 0`,
        backgroundSize: "416px 16px",
        backgroundRepeat: "no-repeat",
      }}
      aria-hidden
    />
  );
}

// -----------------------------------------------------------------------------
// Shared row chrome
// -----------------------------------------------------------------------------

interface RowProps {
  get: Getter;
  set: Setter;
  expanded: boolean;
  onToggleExpand: () => void;
}

function NotifierRow({
  title,
  icon,
  hint,
  enabled,
  onEnabledChange,
  expanded,
  onToggleExpand,
  children,
}: {
  title: string;
  // Sprite key from NOTIFIER_SPRITE_INDEX; omit to hide the icon column.
  icon?: string;
  hint?: ReactNode;
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  expanded: boolean;
  onToggleExpand: () => void;
  children?: ReactNode;
}) {
  return (
    <li className="rounded-box border bg-base-100 border-base-300">
      <div className="flex items-center gap-2 px-3 py-2">
        <input
          type="checkbox"
          className="checkbox checkbox-sm"
          checked={enabled}
          onChange={(e) => onEnabledChange(e.target.checked)}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Enable ${title}`}
        />
        {icon && <NotifierIcon name={icon} />}
        <button
          type="button"
          className="font-medium flex-1 text-left hover:underline truncate"
          onClick={onToggleExpand}
        >
          {title}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          onClick={onToggleExpand}
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>
      {expanded && (
        <div className="border-t border-base-300 px-3 py-3 space-y-3">
          {hint && <p className="text-sm text-base-content/60">{hint}</p>}
          {children}
        </div>
      )}
    </li>
  );
}

// Shared three-toggle group used by all notifier services.
function NotifyOnGroup({
  prefix,
  get,
  set,
}: {
  prefix: string;
  get: Getter;
  set: Setter;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      <Toggle
        label="On snatch"
        checked={!!get<boolean>(`${prefix}.notifyOnSnatch`)}
        onChange={(v) => set(`${prefix}.notifyOnSnatch`, v)}
      />
      <Toggle
        label="On download"
        checked={!!get<boolean>(`${prefix}.notifyOnDownload`)}
        onChange={(v) => set(`${prefix}.notifyOnDownload`, v)}
      />
      <Toggle
        label="On subtitle"
        checked={!!get<boolean>(`${prefix}.notifyOnSubtitleDownload`)}
        onChange={(v) => set(`${prefix}.notifyOnSubtitleDownload`, v)}
      />
    </div>
  );
}

// Tiny helper for the test legacy-Tornado calls — handles result text matching
// and error fallback consistently.
function useLegacyTest(
  call: () => Promise<string>,
  okPattern: RegExp = /success/i,
) {
  const [state, setState] = useState<{
    ok: boolean;
    result: string | null;
  }>({ ok: false, result: null });

  const test = useMutation({
    mutationFn: async () => {
      const data = await call();
      return String(data)
        .replace(/<br\s*\/?>/gi, " ")
        .trim();
    },
    onSuccess: (text) => setState({ ok: okPattern.test(text), result: text }),
    onError: () => setState({ ok: false, result: "Request failed; see logs." }),
  });

  return { test, state };
}

// -----------------------------------------------------------------------------
// Kodi
// -----------------------------------------------------------------------------

function KodiRow({ get, set, expanded, onToggleExpand }: RowProps) {
  const enabled = !!get<boolean>("kodi.enabled");
  const { test, state } = useLegacyTest(() =>
    axios
      .get<string>("/home/testKODI", {
        params: {
          host: hostsToString(get<string[]>("kodi.host")),
          username: get<string>("kodi.username") ?? "",
          password: get<string>("kodi.password") ?? "",
        },
      })
      .then((r) => r.data),
  );

  return (
    <NotifierRow
      title="Kodi"
      icon="kodi"
      hint="Notify one or more Kodi installs and (optionally) refresh the library after each download."
      enabled={enabled}
      onEnabledChange={(v) => set("kodi.enabled", v)}
      expanded={expanded}
      onToggleExpand={onToggleExpand}
    >
      <NotifyOnGroup prefix="kodi" get={get} set={set} />

      <Field
        label="Kodi host(s)"
        hint="IP:port of the Kodi web server. Enter or comma to add another."
      >
        <TagInput
          value={get<string[]>("kodi.host") ?? []}
          onChange={(next) => set("kodi.host", next)}
          placeholder="192.168.1.10:8080"
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Username">
          <input
            className="input input-sm w-full"
            value={get<string>("kodi.username") ?? ""}
            onChange={(e) => set("kodi.username", e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
        <Field label="Password">
          <SecretInput
            value={get<string>("kodi.password") ?? ""}
            onChange={(v) => set("kodi.password", v)}
          />
        </Field>
      </div>

      <Toggle
        label="Always send notifications"
        hint="Fire even when Kodi is asleep. Most installs leave this off."
        checked={!!get<boolean>("kodi.alwaysOn")}
        onChange={(v) => set("kodi.alwaysOn", v)}
      />

      <Toggle
        label="Update Kodi library after download"
        checked={!!get<boolean>("kodi.update.library")}
        onChange={(v) => set("kodi.update.library", v)}
      />

      {!!get<boolean>("kodi.update.library") && (
        <>
          <Toggle
            label="Full library update"
            hint="Scan the entire library instead of just the show's folder. Heavier on the Kodi machine."
            checked={!!get<boolean>("kodi.update.full")}
            onChange={(v) => set("kodi.update.full", v)}
          />
          <Toggle
            label="Update only the first host"
            hint="Useful when multiple Kodi installs share the same library DB."
            checked={!!get<boolean>("kodi.update.onlyFirst")}
            onChange={(v) => set("kodi.update.onlyFirst", v)}
          />
          <Toggle
            label="Clean library after update"
            hint="Removes stale entries from Kodi's DB once the scan finishes."
            checked={!!get<boolean>("kodi.cleanLibrary")}
            onChange={(v) => set("kodi.cleanLibrary", v)}
          />
        </>
      )}

      <TestRow
        result={state.result}
        ok={state.ok}
        pending={test.isPending}
        onClick={() => test.mutate()}
      />
    </NotifierRow>
  );
}

// -----------------------------------------------------------------------------
// Plex Media Server
// -----------------------------------------------------------------------------

function PlexServerRow({ get, set, expanded, onToggleExpand }: RowProps) {
  const enabled = !!get<boolean>("plex.server.enabled");
  const { test, state } = useLegacyTest(
    () =>
      axios
        .get<string>("/home/testPMS", {
          params: {
            host: hostsToString(get<string[]>("plex.server.host")),
            username: get<string>("plex.server.username") ?? "",
            password: get<string>("plex.server.password") ?? "",
            plex_server_token: get<string>("plex.server.token") ?? "",
          },
        })
        .then((r) => r.data),
    /successful/i,
  );

  return (
    <NotifierRow
      title="Plex Media Server"
      icon="plex"
      hint="Refresh the Plex library when new episodes land. Notifications go to Plex Server (not Plex Home Theater)."
      enabled={enabled}
      onEnabledChange={(v) => set("plex.server.enabled", v)}
      expanded={expanded}
      onToggleExpand={onToggleExpand}
    >
      <Toggle
        label="Update library after download"
        checked={!!get<boolean>("plex.server.updateLibrary")}
        onChange={(v) => set("plex.server.updateLibrary", v)}
      />

      <Field
        label="Plex server host(s)"
        hint="IP:port of the Plex server. Enter or comma to add another."
      >
        <TagInput
          value={get<string[]>("plex.server.host") ?? []}
          onChange={(next) => set("plex.server.host", next)}
          placeholder="192.168.1.10:32400"
        />
      </Field>

      <Toggle
        label="Use HTTPS"
        hint="Talk to Plex over https://. Only if your server has a valid cert."
        checked={!!get<boolean>("plex.server.https")}
        onChange={(v) => set("plex.server.https", v)}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Username" hint="Plex account username (optional).">
          <input
            className="input input-sm w-full"
            value={get<string>("plex.server.username") ?? ""}
            onChange={(e) => set("plex.server.username", e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
        <Field label="Password">
          <SecretInput
            value={get<string>("plex.server.password") ?? ""}
            onChange={(v) => set("plex.server.password", v)}
          />
        </Field>
      </div>

      <Field
        label="Auth token (X-Plex-Token)"
        hint="Recommended over username/password. Find it under your server's settings or via the docs."
      >
        <SecretInput
          value={get<string>("plex.server.token") ?? ""}
          onChange={(v) => set("plex.server.token", v)}
          withLabel
        />
      </Field>

      <TestRow
        result={state.result}
        ok={state.ok}
        pending={test.isPending}
        onClick={() => test.mutate()}
      />
    </NotifierRow>
  );
}

// -----------------------------------------------------------------------------
// Emby / Jellyfin — tests /System/Info directly (Jellyfin dropped the legacy
// /Notifications/Admin endpoint that the bundled testEMBY hits).
// -----------------------------------------------------------------------------

interface SystemInfoResponse {
  ProductName?: string;
  ServerName?: string;
  Version?: string;
}

function normalizeBaseUrl(host: string): string {
  const trimmed = host.trim().replace(/\/+$/, "");
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `http://${trimmed}`;
}

function EmbyRow({ get, set, expanded, onToggleExpand }: RowProps) {
  const enabled = !!get<boolean>("emby.enabled");
  const [testState, setTestState] = useState<{
    ok: boolean;
    result: string | null;
  }>({ ok: false, result: null });

  const test = useMutation({
    mutationFn: async () => {
      const host = (get<string>("emby.host") ?? "").trim();
      const apiKey = (get<string>("emby.apiKey") ?? "").trim();
      if (!host) throw new Error("MISSING_HOST");
      if (!apiKey) throw new Error("MISSING_KEY");
      const url = `${normalizeBaseUrl(host)}/System/Info`;
      const res = await axios.get<SystemInfoResponse>(url, {
        headers: { "X-MediaBrowser-Token": apiKey },
        timeout: 8000,
      });
      return res.data;
    },
    onSuccess: (data) => {
      const product = data.ProductName ?? "Server";
      const name = data.ServerName ? ` "${data.ServerName}"` : "";
      const version = data.Version ? ` v${data.Version}` : "";
      setTestState({
        ok: true,
        result: `Connected to ${product}${name}${version}.`,
      });
    },
    onError: (err) => {
      if (err instanceof Error && err.message === "MISSING_HOST") {
        setTestState({ ok: false, result: "Enter a server host first." });
        return;
      }
      if (err instanceof Error && err.message === "MISSING_KEY") {
        setTestState({ ok: false, result: "Enter an API key first." });
        return;
      }
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        if (status === 401 || status === 403) {
          setTestState({
            ok: false,
            result: "Reached the server, but the API key was rejected.",
          });
          return;
        }
        if (status) {
          setTestState({
            ok: false,
            result: `Server replied with HTTP ${status}.`,
          });
          return;
        }
      }
      setTestState({
        ok: false,
        result: "Couldn't reach the server — check the host and network.",
      });
    },
  });

  return (
    <NotifierRow
      title="Emby / Jellyfin"
      icon="emby"
      hint="Jellyfin forked from Emby and stayed mostly API-compatible — the library refresh works for both. Test probes /System/Info directly, since Jellyfin removed the legacy notification endpoint."
      enabled={enabled}
      onEnabledChange={(v) => set("emby.enabled", v)}
      expanded={expanded}
      onToggleExpand={onToggleExpand}
    >
      <Field label="Server host" hint="IP:port of the Emby or Jellyfin server.">
        <input
          className="input input-sm w-full"
          value={get<string>("emby.host") ?? ""}
          onChange={(e) => set("emby.host", e.target.value)}
          spellCheck={false}
          placeholder="192.168.1.10:8096"
        />
      </Field>

      <Field
        label="API key"
        hint="Generate one in the server admin under Advanced → API Keys."
      >
        <SecretInput
          value={get<string>("emby.apiKey") ?? ""}
          onChange={(v) => set("emby.apiKey", v)}
          withLabel
        />
      </Field>

      <TestRow
        result={testState.result}
        ok={testState.ok}
        pending={test.isPending}
        onClick={() => test.mutate()}
      />
    </NotifierRow>
  );
}

// -----------------------------------------------------------------------------
// Pushbullet
// -----------------------------------------------------------------------------

function PushbulletRow({ get, set, expanded, onToggleExpand }: RowProps) {
  const enabled = !!get<boolean>("pushbullet.enabled");
  const { test, state } = useLegacyTest(() =>
    axios
      .get<string>("/home/testPushbullet", {
        params: { api: get<string>("pushbullet.api") ?? "" },
      })
      .then((r) => r.data),
  );

  return (
    <NotifierRow
      title="Pushbullet"
      icon="pushbullet"
      hint="Send push notifications to your phone / browser via pushbullet.com."
      enabled={enabled}
      onEnabledChange={(v) => set("pushbullet.enabled", v)}
      expanded={expanded}
      onToggleExpand={onToggleExpand}
    >
      <NotifyOnGroup prefix="pushbullet" get={get} set={set} />

      <Field
        label="Access token"
        hint="Create one at pushbullet.com → Settings → Access Tokens."
      >
        <SecretInput
          value={get<string>("pushbullet.api") ?? ""}
          onChange={(v) => set("pushbullet.api", v)}
          withLabel
        />
      </Field>

      <Field
        label="Device (optional)"
        hint="Target a specific device by its Pushbullet ID. Leave blank to push to all your devices."
      >
        <input
          className="input input-sm w-full"
          value={get<string>("pushbullet.device") ?? ""}
          onChange={(e) => set("pushbullet.device", e.target.value)}
          spellCheck={false}
        />
      </Field>

      <TestRow
        result={state.result}
        ok={state.ok}
        pending={test.isPending}
        onClick={() => test.mutate()}
      />
    </NotifierRow>
  );
}

// -----------------------------------------------------------------------------
// Pushover
// -----------------------------------------------------------------------------

// Sounds curated from Pushover's API docs. Free-text fallback in the input
// handles any custom sounds Pushover adds later.
const PUSHOVER_SOUNDS = [
  "pushover",
  "bike",
  "bugle",
  "cashregister",
  "classical",
  "cosmic",
  "falling",
  "gamelan",
  "incoming",
  "intermission",
  "magic",
  "mechanical",
  "pianobar",
  "siren",
  "spacealarm",
  "tugboat",
  "alien",
  "climb",
  "persistent",
  "echo",
  "updown",
  "vibrate",
  "none",
];

const PUSHOVER_PRIORITIES = [
  { value: -2, label: "Lowest (no sound / vibration)" },
  { value: -1, label: "Low (quiet)" },
  { value: 0, label: "Normal" },
  { value: 1, label: "High (bypass quiet hours)" },
  { value: 2, label: "Emergency (requires ack)" },
];

function PushoverRow({ get, set, expanded, onToggleExpand }: RowProps) {
  const enabled = !!get<boolean>("pushover.enabled");
  const { test, state } = useLegacyTest(() =>
    axios
      .get<string>("/home/testPushover", {
        params: {
          userKey: get<string>("pushover.userKey") ?? "",
          apiKey: get<string>("pushover.apiKey") ?? "",
        },
      })
      .then((r) => r.data),
  );

  return (
    <NotifierRow
      title="Pushover"
      icon="pushover"
      hint="Paid push service with finer-grained controls than Pushbullet — priorities, sounds, per-device targeting."
      enabled={enabled}
      onEnabledChange={(v) => set("pushover.enabled", v)}
      expanded={expanded}
      onToggleExpand={onToggleExpand}
    >
      <NotifyOnGroup prefix="pushover" get={get} set={set} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field
          label="User key"
          hint="Your user key from pushover.net (top of the dashboard)."
        >
          <SecretInput
            value={get<string>("pushover.userKey") ?? ""}
            onChange={(v) => set("pushover.userKey", v)}
            withLabel
          />
        </Field>
        <Field
          label="App API key"
          hint="The token of the Pushover application you registered for Medusa."
        >
          <SecretInput
            value={get<string>("pushover.apiKey") ?? ""}
            onChange={(v) => set("pushover.apiKey", v)}
            withLabel
          />
        </Field>
      </div>

      <Field
        label="Device (optional)"
        hint="Send to a specific device name. Blank = all your devices."
      >
        <input
          className="input input-sm w-full"
          value={get<string>("pushover.device") ?? ""}
          onChange={(e) => set("pushover.device", e.target.value)}
          spellCheck={false}
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Priority">
          <select
            className="select select-sm w-full"
            value={get<number>("pushover.priority") ?? 0}
            onChange={(e) => set("pushover.priority", Number(e.target.value))}
          >
            {PUSHOVER_PRIORITIES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Sound">
          <input
            list="pushover-sounds"
            className="input input-sm w-full"
            value={get<string>("pushover.sound") ?? "pushover"}
            onChange={(e) => set("pushover.sound", e.target.value)}
            spellCheck={false}
          />
          <datalist id="pushover-sounds">
            {PUSHOVER_SOUNDS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>
      </div>

      <TestRow
        result={state.result}
        ok={state.ok}
        pending={test.isPending}
        onClick={() => test.mutate()}
      />
    </NotifierRow>
  );
}

// -----------------------------------------------------------------------------
// Telegram
// -----------------------------------------------------------------------------

function TelegramRow({ get, set, expanded, onToggleExpand }: RowProps) {
  const enabled = !!get<boolean>("telegram.enabled");
  const { test, state } = useLegacyTest(() =>
    axios
      .get<string>("/home/testTelegram", {
        params: {
          telegram_id: get<string>("telegram.id") ?? "",
          telegram_apikey: get<string>("telegram.api") ?? "",
        },
      })
      .then((r) => r.data),
  );

  return (
    <NotifierRow
      title="Telegram"
      icon="telegram"
      hint="Post to a chat, group, or channel via a Telegram bot. Create one with @BotFather, then start a chat with it (or add it to the group / channel) before testing."
      enabled={enabled}
      onEnabledChange={(v) => set("telegram.enabled", v)}
      expanded={expanded}
      onToggleExpand={onToggleExpand}
    >
      <NotifyOnGroup prefix="telegram" get={get} set={set} />

      <Field label="Bot token" hint="From @BotFather after creating the bot.">
        <SecretInput
          value={get<string>("telegram.api") ?? ""}
          onChange={(v) => set("telegram.api", v)}
          withLabel
        />
      </Field>

      <Field
        label="Chat / group / channel ID"
        hint="Numeric ID. For groups it's negative (e.g. -100123…); for channels use the @channelname form."
      >
        <input
          className="input input-sm w-full"
          value={get<string>("telegram.id") ?? ""}
          onChange={(e) => set("telegram.id", e.target.value)}
          spellCheck={false}
        />
      </Field>

      <TestRow
        result={state.result}
        ok={state.ok}
        pending={test.isPending}
        onClick={() => test.mutate()}
      />
    </NotifierRow>
  );
}

// -----------------------------------------------------------------------------
// Discord
// -----------------------------------------------------------------------------

function DiscordRow({ get, set, expanded, onToggleExpand }: RowProps) {
  const enabled = !!get<boolean>("discord.enabled");
  const { test, state } = useLegacyTest(() =>
    axios
      .get<string>("/home/testDiscord", {
        params: {
          discord_webhook: get<string>("discord.webhook") ?? "",
          discord_tts: get<boolean>("discord.tts") ? "1" : "0",
          discord_override_avatar: get<boolean>("discord.overrideAvatar")
            ? "1"
            : "0",
        },
      })
      .then((r) => r.data),
  );

  return (
    <NotifierRow
      title="Discord"
      icon="discord"
      hint="Post to a Discord channel via a webhook. Create one under the channel's Edit → Integrations → Webhooks."
      enabled={enabled}
      onEnabledChange={(v) => set("discord.enabled", v)}
      expanded={expanded}
      onToggleExpand={onToggleExpand}
    >
      <NotifyOnGroup prefix="discord" get={get} set={set} />

      <Field label="Webhook URL">
        <SecretInput
          value={get<string>("discord.webhook") ?? ""}
          onChange={(v) => set("discord.webhook", v)}
          withLabel
        />
      </Field>

      <Field
        label="Bot name (optional)"
        hint="Overrides the webhook's default name on each post."
      >
        <input
          className="input input-sm w-full"
          value={get<string>("discord.name") ?? ""}
          onChange={(e) => set("discord.name", e.target.value)}
          spellCheck={false}
          placeholder="Medusa"
        />
      </Field>

      <Toggle
        label="Text-to-speech"
        hint="Discord reads the message aloud in the channel. Most servers leave this off."
        checked={!!get<boolean>("discord.tts")}
        onChange={(v) => set("discord.tts", v)}
      />

      <Toggle
        label="Override webhook avatar"
        hint="Use Medusa's logo instead of the webhook's configured avatar."
        checked={!!get<boolean>("discord.overrideAvatar")}
        onChange={(v) => set("discord.overrideAvatar", v)}
      />

      <TestRow
        result={state.result}
        ok={state.ok}
        pending={test.isPending}
        onClick={() => test.mutate()}
      />
    </NotifierRow>
  );
}

// -----------------------------------------------------------------------------
// Slack
// -----------------------------------------------------------------------------

function SlackRow({ get, set, expanded, onToggleExpand }: RowProps) {
  const enabled = !!get<boolean>("slack.enabled");
  const { test, state } = useLegacyTest(() =>
    axios
      .get<string>("/home/testslack", {
        params: { slack_webhook: get<string>("slack.webhook") ?? "" },
      })
      .then((r) => r.data),
  );

  return (
    <NotifierRow
      title="Slack"
      icon="slack"
      hint="Post to a Slack channel via an Incoming Webhook."
      enabled={enabled}
      onEnabledChange={(v) => set("slack.enabled", v)}
      expanded={expanded}
      onToggleExpand={onToggleExpand}
    >
      <NotifyOnGroup prefix="slack" get={get} set={set} />

      <Field
        label="Webhook URL"
        hint="From your Slack app's Incoming Webhooks page."
      >
        <SecretInput
          value={get<string>("slack.webhook") ?? ""}
          onChange={(v) => set("slack.webhook", v)}
          withLabel
        />
      </Field>

      <TestRow
        result={state.result}
        ok={state.ok}
        pending={test.isPending}
        onClick={() => test.mutate()}
      />
    </NotifierRow>
  );
}

// -----------------------------------------------------------------------------
// Email
// -----------------------------------------------------------------------------

function EmailRow({ get, set, expanded, onToggleExpand }: RowProps) {
  const enabled = !!get<boolean>("email.enabled");
  const recipients = get<string[]>("email.addressList") ?? [];

  const { test, state } = useLegacyTest(() =>
    axios
      .get<string>("/home/testEmail", {
        params: {
          host: get<string>("email.host") ?? "",
          port: get<number>("email.port") ?? 25,
          smtp_from: get<string>("email.from") ?? "",
          use_tls: get<boolean>("email.tls") ? "1" : "0",
          user: get<string>("email.username") ?? "",
          pwd: get<string>("email.password") ?? "",
          to: recipients[0] ?? "",
        },
      })
      .then((r) => r.data),
  );

  return (
    <NotifierRow
      title="Email"
      icon="email"
      hint="Send notifications via SMTP. Test goes to the first recipient in the list."
      enabled={enabled}
      onEnabledChange={(v) => set("email.enabled", v)}
      expanded={expanded}
      onToggleExpand={onToggleExpand}
    >
      <NotifyOnGroup prefix="email" get={get} set={set} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="SMTP host">
          <input
            className="input input-sm w-full"
            value={get<string>("email.host") ?? ""}
            onChange={(e) => set("email.host", e.target.value)}
            spellCheck={false}
            placeholder="smtp.example.com"
          />
        </Field>
        <Field label="SMTP port">
          <input
            type="number"
            min={1}
            max={65535}
            className="input input-sm w-full"
            value={get<number>("email.port") ?? 25}
            onChange={(e) => set("email.port", Number(e.target.value))}
          />
        </Field>
      </div>

      <Toggle
        label="Use TLS"
        hint="STARTTLS / TLS on the SMTP connection. Required by most modern providers."
        checked={!!get<boolean>("email.tls")}
        onChange={(v) => set("email.tls", v)}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="SMTP username">
          <input
            className="input input-sm w-full"
            value={get<string>("email.username") ?? ""}
            onChange={(e) => set("email.username", e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
        <Field label="SMTP password">
          <SecretInput
            value={get<string>("email.password") ?? ""}
            onChange={(v) => set("email.password", v)}
          />
        </Field>
      </div>

      <Field
        label="From address"
        hint="Some providers require this match the SMTP username."
      >
        <input
          className="input input-sm w-full"
          value={get<string>("email.from") ?? ""}
          onChange={(e) => set("email.from", e.target.value)}
          spellCheck={false}
          placeholder="medusa@example.com"
        />
      </Field>

      <Field label="Recipients" hint="Enter or comma to add another.">
        <TagInput
          value={recipients}
          onChange={(next) => set("email.addressList", next)}
          placeholder="me@example.com"
        />
      </Field>

      <Field label="Subject prefix">
        <input
          className="input input-sm w-full"
          value={get<string>("email.subject") ?? ""}
          onChange={(e) => set("email.subject", e.target.value)}
          spellCheck={false}
          placeholder="[Medusa]"
        />
      </Field>

      <TestRow
        result={state.result}
        ok={state.ok}
        pending={test.isPending}
        onClick={() => test.mutate()}
      />
    </NotifierRow>
  );
}

// -----------------------------------------------------------------------------
// Synology Indexer (synoindex) — local-only, NAS-side. No notify-on triggers
// because it's not a notifier; it just tells DSM "a new media file landed."
// No upstream test endpoint — either the binary runs or it doesn't.
// -----------------------------------------------------------------------------

function SynologyIndexerRow({ get, set, expanded, onToggleExpand }: RowProps) {
  const enabled = !!get<boolean>("synologyIndex.enabled");
  return (
    <NotifierRow
      title="Synology Indexer"
      icon="syno1"
      hint="Calls DSM's `synoindex` after each download so newly-added episodes show up in DSM's Media Server / DLNA index without waiting for a full scan. Only works when Medusa runs on the Synology NAS itself."
      enabled={enabled}
      onEnabledChange={(v) => set("synologyIndex.enabled", v)}
      expanded={expanded}
      onToggleExpand={onToggleExpand}
    />
  );
}

// -----------------------------------------------------------------------------
// Synology DSM Notifier — posts to the DSM notification bell via the local
// `synodsmnotify` binary. Same on-the-NAS caveat as the Indexer.
// -----------------------------------------------------------------------------

function SynologyNotifierRow({ get, set, expanded, onToggleExpand }: RowProps) {
  const enabled = !!get<boolean>("synology.enabled");
  return (
    <NotifierRow
      title="Synology DSM Notifier"
      icon="syno2"
      hint="Sends Medusa events to the DSM notification system (the bell icon in DSM's top bar). Runs `synodsmnotify` locally — Medusa must be on the Synology NAS."
      enabled={enabled}
      onEnabledChange={(v) => set("synology.enabled", v)}
      expanded={expanded}
      onToggleExpand={onToggleExpand}
    >
      <NotifyOnGroup prefix="synology" get={get} set={set} />
    </NotifierRow>
  );
}
