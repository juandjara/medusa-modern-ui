import type { ReactNode } from "react";

interface SectionProps {
  title: string;
  hint?: ReactNode;
  children: ReactNode;
}

// Standard card-shaped section wrapper used across settings pages. Renders a
// titled card with an optional sub-title hint, followed by the fields.
export default function Section({ title, hint, children }: SectionProps) {
  return (
    <section className="card bg-base-100 border-2 border-base-300 rounded-box">
      <div className="card-body p-4 space-y-3">
        <div>
          <h2 className="font-semibold text-lg">{title}</h2>
          {hint && <p className="text-sm text-base-content/60 mt-1">{hint}</p>}
        </div>
        {children}
      </div>
    </section>
  );
}
