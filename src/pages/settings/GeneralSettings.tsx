import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { ChevronLeft, TriangleAlert, RefreshCw } from "lucide-react";
import api from "../../lib/api";
import Field from "../../components/forms/Field";
import Toggle from "../../components/forms/Toggle";
import SaveBar from "../../components/forms/SaveBar";
import SecretInput from "../../components/forms/SecretInput";
import Section from "../../components/forms/Section";

interface WebInterfaceCfg {
  apiKey: string;
  log: boolean;
  username: string;
  password: string;
  port: number;
  host: string;
  notifyOnLogin: boolean;
  ipv6: boolean;
  httpsEnable: boolean;
  httpsCert: string;
  httpsKey: string;
  handleReverseProxy: boolean;
}

interface MainCfg {
  webInterface: WebInterfaceCfg;
  webRoot: string;
  cpuPreset: string;
  noRestart: boolean;
  encryptionVersion: boolean;
  calendarUnprotected: boolean;
  calendarIcons: boolean;
  versionNotify: boolean;
  autoUpdate: boolean;
  updateFrequency: number;
  notifyOnUpdate: boolean;
  indexerDefault: number;
  indexerDefaultLanguage: string;
  indexerTimeout: number;
  showUpdateHour: number;
  proxySetting: string;
  proxyProviders: boolean;
  proxyIndexers: boolean;
  proxyClients: boolean;
  proxyOthers: boolean;
}

const CPU_PRESETS = [
  { value: "LOW", label: "Low" },
  { value: "NORMAL", label: "Normal" },
  { value: "HIGH", label: "High" },
];

// Maps medusa/indexers/config.py — only the indexers Medusa has built-in
// support for. TheTVDB is the default upstream.
const INDEXER_OPTIONS = [
  { value: 1, label: "TheTVDB" },
  { value: 3, label: "TVmaze" },
  { value: 4, label: "TMDb" },
];

// Common ISO-639-1 codes covering the languages Medusa actually has good
// data for. Free-text fallback lives in the input for anything outside.
const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "it", label: "Italian" },
  { value: "pt", label: "Portuguese" },
  { value: "nl", label: "Dutch" },
  { value: "ja", label: "Japanese" },
  { value: "zh", label: "Chinese" },
];

type DraftMap = Record<string, unknown>;

function getByPath(obj: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (o, k) => (o == null ? o : (o as Record<string, unknown>)[k]),
      obj,
    );
}

function setByPath(obj: Record<string, unknown>, path: string, value: unknown) {
  const keys = path.split(".");
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (!(k in cur) || typeof cur[k] !== "object" || cur[k] === null) {
      cur[k] = {};
    }
    cur = cur[k] as Record<string, unknown>;
  }
  cur[keys[keys.length - 1]] = value;
}

// Subset of fields whose effect requires a Medusa restart to take hold.
// We don't auto-restart on save; this just powers the warning banner.
const RESTART_REQUIRED_FIELDS = new Set([
  "webInterface.host",
  "webInterface.port",
  "webInterface.ipv6",
  "webInterface.httpsEnable",
  "webInterface.httpsCert",
  "webInterface.httpsKey",
  "webInterface.handleReverseProxy",
  "webRoot",
  "webInterface.apiKey",
]);

export default function GeneralSettings() {
  const queryClient = useQueryClient();

  const configQ = useQuery({
    queryKey: ["config", "main"],
    queryFn: ({ signal }) =>
      api
        .get<{ data: MainCfg } | MainCfg>("/config/main", { signal })
        .then((r) => {
          const d = r.data as { data?: MainCfg };
          return d.data ?? (r.data as MainCfg);
        }),
  });

  const saved = configQ.data;
  const [draft, setDraft] = useState<DraftMap>({});

  const get = useMemo(
    () =>
      <T,>(path: string): T => {
        if (path in draft) return draft[path] as T;
        return getByPath(saved, path) as T;
      },
    [draft, saved],
  );
  const set = (path: string, value: unknown) =>
    setDraft((d) => ({ ...d, [path]: value }));

  const dirty = Object.keys(draft).some(
    (k) => draft[k] !== getByPath(saved, k),
  );

  const restartRequired = Object.keys(draft).some(
    (k) => RESTART_REQUIRED_FIELDS.has(k) && draft[k] !== getByPath(saved, k),
  );

  const save = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {};
      for (const [path, value] of Object.entries(draft)) {
        setByPath(payload, path, value);
      }
      return api.patch("/config/main", payload);
    },
    onSuccess: () => {
      setDraft({});
      queryClient.invalidateQueries({ queryKey: ["config", "main"] });
    },
  });

  if (configQ.isLoading || !saved) {
    return (
      <div className="flex justify-center py-20">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-2">
        <Link to="/settings" className="btn btn-ghost btn-sm gap-1">
          <ChevronLeft size={16} /> Settings
        </Link>
      </div>

      <header>
        <h1 className="text-2xl font-bold">General &amp; web interface</h1>
        <p className="text-sm text-base-content/60 mt-1">
          How Medusa serves its UI and API, plus indexer defaults, update
          policy, and proxy routing.
        </p>
      </header>

      <SaveBar
        dirty={dirty}
        pending={save.isPending}
        success={save.isSuccess}
        error={save.isError}
        onSave={() => save.mutate()}
      />

      {dirty && restartRequired && (
        <div className="alert alert-soft alert-warning text-sm">
          <TriangleAlert size={14} />
          Some pending changes (binding, HTTPS, API key, encryption) only take
          effect after Medusa restarts.
        </div>
      )}

      <WebInterfaceSection get={get} set={set} />
      <AuthSection get={get} set={set} />
      <HttpsSection get={get} set={set} />
      <ProxySection get={get} set={set} />
      <CalendarSection get={get} set={set} />
      <IndexerSection get={get} set={set} />
      <PerformanceSection get={get} set={set} />
      <UpdatesSection get={get} set={set} />
    </div>
  );
}

type Getter = <T>(path: string) => T;
type Setter = (path: string, value: unknown) => void;

function WebInterfaceSection({ get, set }: { get: Getter; set: Setter }) {
  return (
    <Section
      title="Web interface"
      hint="Where the Medusa UI listens. Changes to host / port / IPv6 / web root need a restart."
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Listen host" hint="IP to bind. 0.0.0.0 = all interfaces.">
          <input
            className="input input-sm w-full"
            value={get<string>("webInterface.host") ?? ""}
            onChange={(e) => set("webInterface.host", e.target.value)}
            spellCheck={false}
          />
        </Field>
        <Field label="Listen port">
          <input
            type="number"
            min={1}
            max={65535}
            className="input input-sm w-full"
            value={get<number>("webInterface.port") ?? 8081}
            onChange={(e) => set("webInterface.port", Number(e.target.value))}
          />
        </Field>
      </div>

      <Toggle
        label="Bind to IPv6 too"
        hint="Listen on the IPv6 stack in addition to IPv4."
        checked={!!get<boolean>("webInterface.ipv6")}
        onChange={(v) => set("webInterface.ipv6", v)}
      />

      <Field
        label="Web root"
        hint='Mount the UI under a subpath, e.g. "/medusa" for reverse-proxy use. Blank = root.'
      >
        <input
          className="input input-sm w-full"
          value={get<string>("webRoot") ?? ""}
          onChange={(e) => set("webRoot", e.target.value)}
          spellCheck={false}
          placeholder="/medusa"
        />
      </Field>

      <Toggle
        label="Log HTTP requests"
        hint="Write each incoming request to the log. Useful for debugging reverse-proxy / auth issues; chatty otherwise."
        checked={!!get<boolean>("webInterface.log")}
        onChange={(v) => set("webInterface.log", v)}
      />
    </Section>
  );
}

function AuthSection({ get, set }: { get: Getter; set: Setter }) {
  return (
    <Section
      title="Authentication"
      hint="Credentials for the Medusa UI. Leave both username and password blank to disable auth (not recommended)."
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Username">
          <input
            className="input input-sm w-full"
            value={get<string>("webInterface.username") ?? ""}
            onChange={(e) => set("webInterface.username", e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
        <Field label="Password">
          <SecretInput
            value={get<string>("webInterface.password") ?? ""}
            onChange={(v) => set("webInterface.password", v)}
          />
        </Field>
      </div>

      <ApiKeyField get={get} set={set} />

      <Toggle
        label="Notify on successful login"
        hint="Fires the configured notifiers whenever someone logs into the Medusa UI."
        checked={!!get<boolean>("webInterface.notifyOnLogin")}
        onChange={(v) => set("webInterface.notifyOnLogin", v)}
      />

      <Toggle
        label="Obfuscate passwords in config.ini"
        hint="Stores passwords (web auth, SAB/NZBget, torrent-client creds…) XOR-Base64-encoded instead of plain text. Not real encryption — anyone with access to the file and Medusa's source can recover them; it just keeps a quick cat / screenshot / paste from leaking cleartext. Passwords must be ASCII only when on."
        checked={!!get<boolean>("encryptionVersion")}
        onChange={(v) => set("encryptionVersion", v)}
      />
    </Section>
  );
}

function ApiKeyField({ get, set }: { get: Getter; set: Setter }) {
  // Legacy Tornado endpoint, returns the new key as plain text. Auth via
  // SECURE_TOKEN cookie (same model as /home/pickManualSearch, /browser, etc.)
  const regen = useMutation({
    mutationFn: () =>
      axios
        .get<string>("/config/general/generate_api_key", {
          responseType: "text",
        })
        .then((r) => String(r.data).trim()),
    onSuccess: (newKey) => set("webInterface.apiKey", newKey),
  });

  return (
    <Field
      label="API key"
      hint={
        <span>
          Used to authenticate asset URLs and the legacy v1 API. Generating
          a new one invalidates the previous key for any 3rd-party tool using
          it. Restart Medusa after saving so other clients pick up the change.
        </span>
      }
    >
      <div className="flex gap-2 items-stretch">
        <div className="flex-1 min-w-0">
          <SecretInput
            value={get<string>("webInterface.apiKey") ?? ""}
            onChange={(v) => set("webInterface.apiKey", v)}
            withLabel
          />
        </div>
        <button
          type="button"
          className="btn btn-sm gap-1"
          onClick={() => regen.mutate()}
          disabled={regen.isPending}
          title="Request a fresh key from the server"
        >
          <RefreshCw
            size={14}
            className={regen.isPending ? "animate-spin" : ""}
          />
          Generate
        </button>
      </div>
      {regen.isError && (
        <p className="text-xs text-error mt-1 inline-flex items-center gap-1">
          <TriangleAlert size={12} /> Couldn't generate a new key.
        </p>
      )}
    </Field>
  );
}

function HttpsSection({ get, set }: { get: Getter; set: Setter }) {
  const enabled = !!get<boolean>("webInterface.httpsEnable");
  return (
    <Section
      title="HTTPS &amp; reverse proxy"
      hint="Terminate TLS directly in Medusa or hand it off to a reverse proxy. Restart required for all toggles in this section."
    >
      <Toggle
        label="Serve over HTTPS"
        hint="Medusa terminates TLS itself using the cert/key below. Off = HTTP only; pair with a reverse proxy to add TLS."
        checked={enabled}
        onChange={(v) => set("webInterface.httpsEnable", v)}
      />

      {enabled && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Certificate path" hint="PEM file.">
            <input
              className="input input-sm w-full"
              value={get<string>("webInterface.httpsCert") ?? ""}
              onChange={(e) => set("webInterface.httpsCert", e.target.value)}
              spellCheck={false}
            />
          </Field>
          <Field label="Private key path" hint="PEM file.">
            <input
              className="input input-sm w-full"
              value={get<string>("webInterface.httpsKey") ?? ""}
              onChange={(e) => set("webInterface.httpsKey", e.target.value)}
              spellCheck={false}
            />
          </Field>
        </div>
      )}

      <Toggle
        label="Behind a reverse proxy"
        hint="Trust X-Forwarded-* headers so Medusa sees the original client IP / scheme instead of the proxy."
        checked={!!get<boolean>("webInterface.handleReverseProxy")}
        onChange={(v) => set("webInterface.handleReverseProxy", v)}
      />
    </Section>
  );
}

function CalendarSection({ get, set }: { get: Getter; set: Setter }) {
  return (
    <Section
      title="Calendar"
      hint="Settings for the iCal feed at /calendar that the Schedule page links to."
    >
      <Toggle
        label="Public calendar (no auth)"
        hint="Expose the iCal feed (/calendar) without authentication. Lets external clients subscribe; trade-off is anyone who knows the URL sees your show list."
        checked={!!get<boolean>("calendarUnprotected")}
        onChange={(v) => set("calendarUnprotected", v)}
      />

      <Toggle
        label="Show icons on calendar"
        hint="Render show posters/icons in iCal events. Some calendar apps render them, others ignore."
        checked={!!get<boolean>("calendarIcons")}
        onChange={(v) => set("calendarIcons", v)}
      />
    </Section>
  );
}

function IndexerSection({ get, set }: { get: Getter; set: Setter }) {
  return (
    <Section
      title="Indexer defaults"
      hint="Defaults applied when adding a new show. Per-show settings override these."
    >
      <Field label="Default indexer">
        <select
          className="select select-sm w-full max-w-xs"
          value={get<number>("indexerDefault") ?? 1}
          onChange={(e) => set("indexerDefault", Number(e.target.value))}
        >
          {INDEXER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Default language">
        <select
          className="select select-sm w-full max-w-xs"
          value={get<string>("indexerDefaultLanguage") ?? "en"}
          onChange={(e) => set("indexerDefaultLanguage", e.target.value)}
        >
          {LANGUAGE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="Indexer timeout (seconds)"
        hint="Max time to wait for an indexer response before giving up."
      >
        <input
          type="number"
          min={1}
          className="input input-sm w-32"
          value={get<number>("indexerTimeout") ?? 20}
          onChange={(e) => set("indexerTimeout", Number(e.target.value))}
        />
      </Field>

      <Field
        label="Show-update hour (0–23)"
        hint="Hour of day when the daily show-info refresh runs. Spreads load away from snatch / PP work."
      >
        <input
          type="number"
          min={0}
          max={23}
          className="input input-sm w-32"
          value={get<number>("showUpdateHour") ?? 3}
          onChange={(e) => set("showUpdateHour", Number(e.target.value))}
        />
      </Field>
    </Section>
  );
}

function UpdatesSection({ get, set }: { get: Getter; set: Setter }) {
  const versionNotify = !!get<boolean>("versionNotify");
  const autoUpdate = !!get<boolean>("autoUpdate");
  return (
    <Section
      title="Updates"
      hint="How Medusa learns about and applies its own updates."
    >
      <Toggle
        label="Check for new versions"
        hint="Periodically query the upstream branch for newer commits. Off disables both the badge and auto-update."
        checked={versionNotify}
        onChange={(v) => set("versionNotify", v)}
      />

      {versionNotify && (
        <>
          <Toggle
            label="Auto-update"
            hint="When an update is found, install it without asking. Requires Medusa to be installed from git."
            checked={autoUpdate}
            onChange={(v) => set("autoUpdate", v)}
          />

          {autoUpdate && (
            <Field
              label="Check frequency (hours)"
              hint="How often the update check runs."
            >
              <input
                type="number"
                min={1}
                className="input input-sm w-32"
                value={get<number>("updateFrequency") ?? 1}
                onChange={(e) => set("updateFrequency", Number(e.target.value))}
              />
            </Field>
          )}

          <Toggle
            label="Notify on update"
            hint="Fire the configured notifiers whenever Medusa updates itself."
            checked={!!get<boolean>("notifyOnUpdate")}
            onChange={(v) => set("notifyOnUpdate", v)}
          />
        </>
      )}
    </Section>
  );
}

function ProxySection({ get, set }: { get: Getter; set: Setter }) {
  const url = get<string>("proxySetting") ?? "";
  const hasProxy = url.trim().length > 0;
  return (
    <Section
      title="HTTP proxy"
      hint="Route outbound HTTP through a proxy. Leave the URL blank to disable."
    >
      <Field label="Proxy URL" hint="e.g. http://proxy:3128">
        <input
          className="input input-sm w-full"
          value={url}
          onChange={(e) => set("proxySetting", e.target.value)}
          spellCheck={false}
        />
      </Field>

      {hasProxy && (
        <div className="grid grid-cols-2 gap-3">
          <Toggle
            label="Use for providers"
            hint="Route search-provider requests through the proxy."
            checked={!!get<boolean>("proxyProviders")}
            onChange={(v) => set("proxyProviders", v)}
          />
          <Toggle
            label="Use for indexers"
            hint="Route TheTVDB / TVmaze / TMDb requests through the proxy."
            checked={!!get<boolean>("proxyIndexers")}
            onChange={(v) => set("proxyIndexers", v)}
          />
          <Toggle
            label="Use for download clients"
            hint="Route SAB / NZBget / torrent-client requests through the proxy."
            checked={!!get<boolean>("proxyClients")}
            onChange={(v) => set("proxyClients", v)}
          />
          <Toggle
            label="Use for everything else"
            hint="Route the remaining outbound requests (notifiers, image fetches, etc.) through the proxy."
            checked={!!get<boolean>("proxyOthers")}
            onChange={(v) => set("proxyOthers", v)}
          />
        </div>
      )}
    </Section>
  );
}

function PerformanceSection({ get, set }: { get: Getter; set: Setter }) {
  return (
    <Section
      title="Performance"
      hint="Tunes how aggressively Medusa uses the CPU and whether it lets itself restart on its own."
    >
      <Field
        label="CPU usage preset"
        hint="Lower presets sleep more between operations — kind to shared hosts and Raspberry Pis. Higher is faster but more CPU-hungry."
      >
        <select
          className="select select-sm w-full max-w-xs"
          value={get<string>("cpuPreset") ?? "NORMAL"}
          onChange={(e) => set("cpuPreset", e.target.value)}
        >
          {CPU_PRESETS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>

      <Toggle
        label="No automatic restart"
        hint="Prevent Medusa from restarting itself (e.g. after an update). You'll be responsible for restarting manually after such changes."
        checked={!!get<boolean>("noRestart")}
        onChange={(v) => set("noRestart", v)}
      />
    </Section>
  );
}
