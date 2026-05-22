import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import api from "../../lib/api";

// Manage section landing — a small card list, settings-style. Each card
// links to a specific bulk operation across the library. Grows as we ship
// more Manage tools (backlog overview, mass edit, episode statuses, etc.).
export default function Manage() {
  // Fetch with limit=0 ("all rows") so the badge reflects the true total even
  // when the user has many failed releases. The endpoint returns just the
  // rows we need to count; failed.db is small in practice.
  const failedCountQ = useQuery({
    queryKey: ["failed-releases-count"],
    queryFn: ({ signal }) =>
      api
        .get<{ id: number }[]>("/internal/getFailed", {
          signal,
          params: { limit: 0 },
        })
        .then((r) => r.data.length),
    staleTime: 60_000,
  });

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Manage</h1>
      <p className="text-sm text-base-content/60">
        Library-wide operations that don't fit on a single show's page.
      </p>

      <div className="bg-base-100 border-2 border-base-300 rounded-box">
        <div className="px-4 py-3 font-semibold border-b border-base-300">
          Cleanup
        </div>
        <ul>
          <li>
            <Link
              to="/manage/failed"
              className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-base-200/50 transition-colors"
            >
              <div>
                <div className="font-medium inline-flex items-center gap-2">
                  Failed releases
                  {failedCountQ.data !== undefined && failedCountQ.data > 0 && (
                    <span className="badge badge-sm badge-ghost">
                      {failedCountQ.data}
                    </span>
                  )}
                </div>
                <div className="text-xs text-base-content/60">
                  A blacklist for releases that failed post-processing, or were
                  flagged by the user or the download client. Search will skip
                  them on future runs.
                </div>
              </div>
              <ChevronRight size={16} className="text-base-content/40" />
            </Link>
          </li>
        </ul>
      </div>
    </div>
  );
}
