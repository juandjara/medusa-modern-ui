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
  console.log("getByPath: ", { path, obj });
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
  section: string;
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
  save: UseMutationResult<unknown, Error, void, unknown>;
}

export default function useDraftConfig<T>(
  opts: UseDraftConfigOptions,
): DraftConfig<T> {
  const { section } = opts;
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

  const dirty = Object.keys(draft).some(
    (k) => draft[k] !== getByPath(saved, k),
  );

  const save = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {};
      const prefix = section === "main" ? "" : `${section}.`;
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
    save,
  };
}
