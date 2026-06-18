import { useEffect, useMemo, useState } from "react";
import { api, type AgentKind, type ProjectInfo, type SessionListItem } from "../api";

type Props = {
  agent: AgentKind;
  onAgentChange: (agent: AgentKind) => void;
  selected: string | null;
  onSelect: (s: SessionListItem) => void;
  collapsed: boolean;
  onToggle: () => void;
};

const AGENTS: Array<{ id: AgentKind; label: string }> = [
  { id: "claude", label: "Claude" },
  { id: "pi", label: "Pi" },
  { id: "opencode", label: "OpenCode" },
];

function fmtTokens(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}

function fmtDate(ms: number): string {
  const d = new Date(ms);
  const now = Date.now();
  const diff = now - ms;
  const day = 24 * 60 * 60 * 1000;
  if (diff < day) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  if (diff < 7 * day) {
    return d.toLocaleDateString([], { weekday: "short" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function Sidebar({ agent, onAgentChange, selected, onSelect, collapsed, onToggle }: Props) {
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [sessionsByProject, setSessionsByProject] = useState<Record<string, SessionListItem[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");

  useEffect(() => {
    setProjects([]);
    setSessionsByProject({});
    setExpanded(new Set());
    api.projects(agent).then((p) => {
      setProjects(p);
      if (p[0] && !p[0].unavailableReason) setExpanded(new Set([p[0].slug]));
    });
  }, [agent]);

  useEffect(() => {
    for (const slug of expanded) {
      if (!sessionsByProject[slug]) {
        api.sessions(agent, slug).then((s) => {
          setSessionsByProject((prev) => ({ ...prev, [slug]: s }));
        });
      }
    }
  }, [agent, expanded, sessionsByProject]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return projects;
    return projects.filter(
      (p) =>
        p.path.toLowerCase().includes(q) ||
        (sessionsByProject[p.slug] ?? []).some((s) => s.title.toLowerCase().includes(q)),
    );
  }, [projects, query, sessionsByProject]);

  if (collapsed) {
    return (
      <aside className="sidebar sidebar-rail">
        <button
          className="rail-toggle"
          onClick={onToggle}
          title="Expand sidebar"
          aria-label="Expand sidebar"
        >
          »
        </button>
      </aside>
    );
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-brand">
          <span className="dot" />
          <span className="brand-label">Session Intelligence</span>
          <button
            className="rail-toggle collapse"
            onClick={onToggle}
            title="Collapse sidebar"
            aria-label="Collapse sidebar"
          >
            «
          </button>
        </div>
        <div className="agent-switcher" aria-label="Agent selector">
          {AGENTS.map((a) => (
            <button
              key={a.id}
              className={agent === a.id ? "active" : ""}
              onClick={() => onAgentChange(a.id)}
              type="button"
            >
              {a.label}
            </button>
          ))}
        </div>
        <input
          placeholder="Search projects or titles…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {filtered.length === 0 && (
        <div className="empty-state-sidebar">No matches.</div>
      )}
      {filtered.map((p) => {
        if (p.unavailableReason) {
          return (
            <div key={`${p.agent}:${p.slug}`} className="agent-unavailable">
              <div className="agent-unavailable-title">{p.path}</div>
              <div>{p.unavailableReason}</div>
            </div>
          );
        }
        const isOpen = expanded.has(p.slug);
        const shortLabel = p.path.split(/[\\/]/).slice(-2).join("/") || p.path;
        return (
          <div key={`${p.agent}:${p.slug}`} className="project-group">
            <div
              className={`project-name ${isOpen ? "open" : ""}`}
              onClick={() => {
                setExpanded((prev) => {
                  const n = new Set(prev);
                  if (n.has(p.slug)) n.delete(p.slug);
                  else n.add(p.slug);
                  return n;
                });
              }}
              title={p.path}
            >
              <span className="chevron">▶</span>
              <span className="label">{shortLabel}</span>
              <span className="count">{p.sessionCount}</span>
            </div>
            {isOpen && (sessionsByProject[p.slug] ?? []).map((s) => (
              <div
                key={`${s.agent}:${s.id}`}
                className={`session-row${selected === s.id ? " selected" : ""}`}
                onClick={() => onSelect(s)}
                title={s.title}
              >
                <div className="session-title">{s.title}</div>
                <div className="session-meta">
                  <span className="tokens">{fmtTokens(s.realTotal)} tok</span>
                  {s.hasCompaction && <span className="compaction-mark">compacted</span>}
                  <span className="sep">·</span>
                  <span>{fmtDate(s.mtimeMs)}</span>
                </div>
              </div>
            ))}
            {isOpen && !sessionsByProject[p.slug] && (
              <div className="loading" style={{ padding: "12px 16px", textAlign: "left" }}>
                Loading…
              </div>
            )}
          </div>
        );
      })}
    </aside>
  );
}
