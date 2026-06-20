import type { ReactNode } from "react";

type Stat = {
  label: string;
  value: ReactNode;
  hint?: string;
  accent?: boolean;
};

type Props = {
  title: string;
  subtitle?: ReactNode;
  stats: Stat[];
};

export function ProjectMetricsHero({ title, subtitle, stats }: Props) {
  return (
    <section className="card project-metrics-hero">
      <div className="project-metrics-head">
        <h2 className="card-title">{title}</h2>
        {subtitle && <div className="project-metrics-subtitle">{subtitle}</div>}
      </div>
      <div className="hero-stats project-metrics-grid">
        {stats.map((s) => (
          <div key={s.label} className={`stat${s.accent ? " stat-accent" : ""}`}>
            <div className="label">{s.label}</div>
            <div className="value">{s.value}</div>
            {s.hint && <div className="stat-hint">{s.hint}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}
