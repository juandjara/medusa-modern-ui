import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "./api";

// Scheduler keys with a documented "force run" trigger. Mirrors the legacy
// /manage/manageSearches/ UI (see System.tsx for the catalogue). Keys not
// listed here have no user-triggerable endpoint and stay read-only.
export const SCHEDULER_HAS_TRIGGER: Record<string, true> = {
  dailySearch: true,
  backlog: true,
  properFinder: true,
  subtitlesFinder: true,
  downloadHandler: true,
};

function triggerEndpoint(key: string) {
  switch (key) {
    case "dailySearch":
      return api.put("/search/daily");
    case "backlog":
      return api.put("/search/backlog");
    case "properFinder":
      return api.put("/search/proper");
    case "subtitlesFinder":
      return api.put("/search/subtitles");
    case "downloadHandler":
      return api.post("/system/operation", { type: "FORCEADH" });
    default:
      return Promise.reject(new Error(`No trigger configured for ${key}`));
  }
}

const SYSTEM_KEY = ["config", "system"] as const;

// Fires the matching trigger endpoint for a scheduler key. Each SchedulerRow
// owns its own instance so rows track pending state independently.
export function useRunScheduler() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (key: string) => triggerEndpoint(key),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SYSTEM_KEY });
    },
  });
}

// Pause / resume toggle specific to the backlog scheduler. Backend uses the
// same /search/backlog endpoint with an `options.paused` field rather than a
// separate route.
export function useToggleBacklogPaused() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (paused: boolean) =>
      api.put("/search/backlog", { options: { paused } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SYSTEM_KEY });
    },
  });
}

// Re-fetches scene exception aliases from external sources (XEM / AniDB /
// AniList). Async on the backend — returns immediately, work happens in a
// background job.
export function useRefreshSceneExceptions() {
  return useMutation({
    mutationFn: () =>
      api.post("/alias-source/all/operation", { type: "REFRESH" }),
  });
}

// Drops the cached scene exceptions DB. Next search that needs them will
// re-fetch from the indexer. Destructive in the sense that until the next
// refresh runs, scene-name matching will be limited to defaults.
export function useCleanSceneExceptionCache() {
  return useMutation({
    mutationFn: () => api.post("/internal/deleteSceneExceptions"),
  });
}
