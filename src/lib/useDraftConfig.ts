import { useMemo, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import api from "./api";

// Shared shape for the path-based draft state most settings pages use.
//
// Backend convention: each section is fetched from `/config/<section>`, but
// every PATCH lands on `/config/main` with the body nested under the section
// name (see medusa/server/api/v2/config.py:586). The "main" section itself
// is the exception — its body is sent flat with no wrapper.

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

interface UseDraftConfigOptions {
  // GET path is `/config/<section>` and the React Query key is
  // `["config", section]`. PATCH body is nested under the same name unless
  // `patchPrefix` overrides it.
  section: string;
  // When the backend's PATCH field bindings use a different case from the
  // GET endpoint (e.g. GET `/config/postprocessing` but PATCH keys are
  // `postProcessing.*`). Defaults to `section`. Pass an empty string when
  // PATCH expects a flat body (only "main" does today).
  patchPrefix?: string;
}

export interface DraftConfig<T> {
  saved: T | undefined;
  isLoading: boolean;
  // Typed getter combining the in-memory draft and the saved server payload.
  // Caller asserts the type at each path; we can't validate dotted-path
  // access against T without much more elaborate typing.
  get: <V>(path: string) => V;
  set: (path: string, value: unknown) => void;
  dirty: boolean;
  // Paths whose draft value differs from saved. Lets consumers reason about
  // *which* fields are pending (e.g. GeneralSettings' "restart required"
  // banner that only fires for a subset of fields).
  dirtyPaths: string[];
  save: UseMutationResult<unknown, Error, void, unknown>;
}

export default function useDraftConfig<T>(
  opts: UseDraftConfigOptions,
): DraftConfig<T> {
  const { section } = opts;
  // Default the PATCH prefix to the section name. `main` is the one section
  // whose body is sent flat; everything else nests by name.
  const patchPrefix =
    opts.patchPrefix !== undefined
      ? opts.patchPrefix
      : section === "main"
        ? ""
        : section;
  const queryClient = useQueryClient();

  const configQ = useQuery({
    queryKey: ["config", section],
    queryFn: ({ signal }) =>
      api.get<T>(`/config/${section}`, { signal }).then((r) => r.data),
  });

  const saved = configQ.data;
  const [draft, setDraft] = useState<DraftMap>({});

  const get = useMemo(
    () =>
      <V>(path: string): V => {
        if (path in draft) return draft[path] as V;
        return getByPath(saved, path) as V;
      },
    [draft, saved],
  );

  const set = (path: string, value: unknown) =>
    setDraft((d) => ({ ...d, [path]: value }));

  const dirtyPaths = useMemo(
    () => Object.keys(draft).filter((k) => draft[k] !== getByPath(saved, k)),
    [draft, saved],
  );
  const dirty = dirtyPaths.length > 0;

  const save = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {};
      const prefix = patchPrefix ? `${patchPrefix}.` : "";
      for (const [path, value] of Object.entries(draft)) {
        setByPath(payload, `${prefix}${path}`, value);
      }
      return api.patch("/config/main", payload);
    },
    onSuccess: () => {
      setDraft({});
      queryClient.invalidateQueries({ queryKey: ["config", section] });
    },
  });

  return {
    saved,
    isLoading: configQ.isLoading,
    get,
    set,
    dirty,
    dirtyPaths,
    save,
  };
}
