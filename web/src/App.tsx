import { useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { Detail } from "./components/Detail";
import { LlmSettings } from "./components/LlmSettings";
import type { AgentKind, SessionListItem } from "./api";

export function App() {
  const [agent, setAgent] = useState<AgentKind>("claude");
  const [selected, setSelected] = useState<SessionListItem | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [showLlmSettings, setShowLlmSettings] = useState(false);

  const handleAgentChange = (next: AgentKind) => {
    setAgent(next);
    setSelected(null);
  };

  return (
    <div className={`app${collapsed ? " sidebar-collapsed" : ""}`}>
      <Sidebar
        agent={agent}
        onAgentChange={handleAgentChange}
        selected={selected?.id ?? null}
        onSelect={setSelected}
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        onOpenLlmSettings={() => setShowLlmSettings(true)}
      />
      <main className="main">
        {selected ? (
          <Detail agent={agent} session={selected} />
        ) : (
          <div className="empty">
            <h2>Agent Session Intelligence</h2>
            <p>Select a session to view context breakdown, messages, AI analysis, and insights.</p>
            <button type="button" className="btn-secondary" onClick={() => setShowLlmSettings(true)}>
              LLM settings
            </button>
          </div>
        )}
      </main>
      {showLlmSettings && (
        <LlmSettings onClose={() => setShowLlmSettings(false)} onSaved={() => {}} />
      )}
    </div>
  );
}
