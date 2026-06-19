import { useEffect, useState } from "react";
import { LayoutDashboard, Play, RefreshCw } from "lucide-react";
import {
  api,
  type AgentKind,
  type GovernancePipelineMode,
  type ProjectContextSummary,
  type RecurringPattern,
  type SessionListItem,
} from "../api";
import { ActionButton } from "./ui/ActionButton";

type Props = {
  agent: AgentKind;
  session: SessionListItem;
  locale?: "ar" | "en";
  onSelectSession?: (id: string) => void;
};

type DashboardData = {
  context: ProjectContextSummary;
  patterns: RecurringPattern[];
  sessions: Array<{ id: string; title: string; mtimeMs: number; realTotal: number | null; hasCompaction: boolean }>;
  schedule: { lastRunAt: string | null; lastSessionCount: number; minNewSessions: number };
  eligibility: { eligible: boolean; newSessions: number; reason: string };
};

export function ProjectDashboard({ agent, session, locale = "en", onSelectSession }: Props) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<GovernancePipelineMode>("standard");
  const [autoApply, setAutoApply] = useState(false);
  const [running, setRunning] = useState(false);

  const load = () => {
    setLoading(true);
    api
      .projectDashboard(agent, session.project, session.projectPath)
      .then(setData)
      .catch((e) => alert(String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(load, [agent, session.project, session.projectPath]);

  const govern = async () => {
    setRunning(true);
    try {
      await api.governProject(agent, session.project, { mode, autoApply, force: true, locale });
      load();
    } catch (e) {
      alert(String(e));
    } finally {
      setRunning(false);
    }
  };

  if (loading || !data) return <div className="loading">Loading project dashboard…</div>;

  const L = locale === "ar";

  return (
    <div className="panel project-dashboard">
      <header className="dashboard-header">
        <h2 className="card-title">
          <LayoutDashboard size={18} /> {L ? "لوحة المشروع" : "Project dashboard"}
        </h2>
        <p className="panel-hint">
          <strong>{data.context.projectRoot}</strong>{" "}
          <span className={data.context.verified ? "badge-ok" : "badge-warn"}>
            {data.context.verified ? (L ? "موثّق" : "Verified") : L ? "غير موثّق" : "Unverified"}
          </span>
        </p>
      </header>

      <section className="dashboard-stats">
        <div className="stat-card">
          <div className="label">{L ? "الجلسات" : "Sessions"}</div>
          <div className="value">{data.sessions.length}+</div>
        </div>
        <div className="stat-card">
          <div className="label">{L ? "ملفات الذاكرة" : "Memory files"}</div>
          <div className="value">{data.context.files.length}</div>
        </div>
        <div className="stat-card">
          <div className="label">{L ? "أنماط cross-session" : "Cross-session patterns"}</div>
          <div className="value">{data.patterns.length}</div>
        </div>
        <div className="stat-card">
          <div className="label">{L ? "جلسات جديدة" : "New since govern"}</div>
          <div className="value">{data.eligibility.newSessions}</div>
        </div>
      </section>

      {data.eligibility.eligible && (
        <div className="notice">
          {L
            ? `${data.eligibility.newSessions} جلسة جديدة — يُنصح بتشغيل حوكمة المشروع`
            : `${data.eligibility.newSessions} new session(s) — project governance recommended`}
        </div>
      )}

      <section className="governance-section">
        <div className="governance-controls">
          <label>
            Mode
            <select value={mode} onChange={(e) => setMode(e.target.value as GovernancePipelineMode)}>
              <option value="quick">Quick</option>
              <option value="standard">Standard</option>
              <option value="full">Full</option>
            </select>
          </label>
          <label className="checkbox-inline">
            <input type="checkbox" checked={autoApply} onChange={(e) => setAutoApply(e.target.checked)} />
            Auto-apply high confidence
          </label>
        </div>
        <div className="governance-actions">
          <ActionButton icon={Play} onClick={govern} disabled={running}>
            {running ? "Running…" : L ? "حوكمة المشروع" : "Govern project"}
          </ActionButton>
          <ActionButton variant="secondary" icon={RefreshCw} onClick={load}>
            Refresh
          </ActionButton>
        </div>
        {data.schedule.lastRunAt && (
          <p className="panel-hint">
            Last governance: {new Date(data.schedule.lastRunAt).toLocaleString()}
          </p>
        )}
      </section>

      <section className="insights-section">
        <h3 className="card-title">{L ? "أهم الأنماط" : "Top patterns"}</h3>
        {data.patterns.length === 0 ? (
          <div className="empty-panel">No cross-session patterns yet.</div>
        ) : (
          <div className="pattern-list">
            {data.patterns.slice(0, 6).map((p) => (
              <div key={p.id} className="pattern-card">
                <div className="pattern-header">
                  <strong>{p.label}</strong>
                  <span className="pattern-count">×{p.count}</span>
                </div>
                <p className="pattern-desc">{p.description}</p>
                <p className="pattern-rec">{p.recommendation}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="insights-section">
        <h3 className="card-title">{L ? "آخر الجلسات" : "Recent sessions"}</h3>
        <div className="dashboard-sessions">
          {data.sessions.map((s) => (
            <button
              key={s.id}
              type="button"
              className="dashboard-session-row"
              onClick={() => onSelectSession?.(s.id)}
            >
              <span>{s.title}</span>
              {s.hasCompaction && <span className="compaction-mark">compacted</span>}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
