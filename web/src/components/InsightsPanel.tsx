import { useEffect, useState } from "react";
import { api, type AgentKind, type RecurringPattern, type SessionListItem } from "../api";

type Props = {
  agent: AgentKind;
  session: SessionListItem;
};

function fmt(n: number | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString();
}

export function InsightsPanel({ agent, session }: Props) {
  const [sessionPatterns, setSessionPatterns] = useState<RecurringPattern[]>([]);
  const [projectPatterns, setProjectPatterns] = useState<RecurringPattern[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.sessionInsights(agent, session.id),
      api.projectInsights(agent, session.project),
    ])
      .then(([s, p]) => {
        setSessionPatterns(s.patterns);
        setProjectPatterns(p.patterns);
      })
      .catch((e) => alert(String(e)))
      .finally(() => setLoading(false));
  }, [agent, session.id, session.project]);

  if (loading) return <div className="loading">Loading insights…</div>;

  return (
    <div className="panel insights-panel">
      <section className="insights-section">
        <h3 className="card-title">This session</h3>
        {sessionPatterns.length === 0 ? (
          <div className="empty-panel">No recurring issues detected in this session.</div>
        ) : (
          <PatternList patterns={sessionPatterns} />
        )}
      </section>

      <section className="insights-section">
        <h3 className="card-title">Project-wide ({session.project})</h3>
        <p className="panel-hint">Aggregated from recent sessions in this project.</p>
        {projectPatterns.length === 0 ? (
          <div className="empty-panel">No cross-session patterns yet.</div>
        ) : (
          <PatternList patterns={projectPatterns} showSessions />
        )}
      </section>
    </div>
  );
}

function PatternList({
  patterns,
  showSessions = false,
}: {
  patterns: RecurringPattern[];
  showSessions?: boolean;
}) {
  return (
    <div className="pattern-list">
      {patterns.map((p) => (
        <div key={p.id} className="pattern-card">
          <div className="pattern-header">
            <strong>{p.label}</strong>
            <span className="pattern-count">×{p.count}</span>
          </div>
          <p className="pattern-desc">{p.description}</p>
          {p.estimatedTokenWaste != null && p.estimatedTokenWaste > 0 && (
            <p className="pattern-waste">Est. token waste: {fmt(p.estimatedTokenWaste)}</p>
          )}
          <p className="pattern-rec">{p.recommendation}</p>
          {showSessions && p.sessionIds.length > 1 && (
            <p className="pattern-sessions">Seen in {p.sessionIds.length} sessions</p>
          )}
        </div>
      ))}
    </div>
  );
}
