import type { AgentKind, GeneratedArtifact, RecurringPattern } from "../../api";
import { artifactApplyPath } from "../../lib/artifact-paths";

type Props = {
  patterns: RecurringPattern[];
  title: string;
  emptyMessage: string;
  limit?: number;
  showSessions?: boolean;
  agent?: AgentKind;
  locale?: "ar" | "en";
};

function fmt(n: number | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString();
}

export function PatternGrid({
  patterns,
  title,
  emptyMessage,
  limit = 8,
  showSessions = false,
  agent,
  locale = "en",
}: Props) {
  const artifactLabel = locale === "ar" ? "مقترح" : "Suggested artifact";
  return (
    <section className="card insights-card">
      <h3 className="card-title">{title}</h3>
      {patterns.length === 0 ? (
        <div className="empty-panel">{emptyMessage}</div>
      ) : (
        <div className="pattern-list">
          {patterns.slice(0, limit).map((p) => (
            <article key={p.id} className="pattern-card pattern-card-interactive">
              <div className="pattern-header">
                <strong>{p.label}</strong>
                <span className="pattern-count">×{p.count}</span>
              </div>
              <p className="pattern-desc">{p.description}</p>
              {p.estimatedTokenWaste != null && p.estimatedTokenWaste > 0 && (
                <p className="pattern-waste">Est. token waste: {fmt(p.estimatedTokenWaste)}</p>
              )}
              <p className="pattern-rec">{p.recommendation}</p>
              {p.suggestedArtifact && agent && (
                <p className="pattern-artifact">
                  <span className="pattern-artifact-label">{artifactLabel}:</span>{" "}
                  <code>{artifactApplyPath(agent, p.suggestedArtifact)}</code>
                  <span className="pattern-artifact-kind"> ({p.suggestedArtifact.kind})</span>
                </p>
              )}
              {showSessions && p.sessionIds.length > 1 && (
                <p className="pattern-sessions">Seen in {p.sessionIds.length} sessions</p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
