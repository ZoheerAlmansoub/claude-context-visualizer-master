import { useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { Detail } from "./components/Detail";
import type { AgentKind, SessionListItem } from "./api";

export function App() {
  const [agent, setAgent] = useState<AgentKind>("claude");
  const [selected, setSelected] = useState<SessionListItem | null>(null);
  const [collapsed, setCollapsed] = useState(false);

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
      />
      <main className="main">
        {selected ? (
          <Detail agent={agent} session={selected} />
        ) : (
          <div className="empty">
            <h2>Agent Session Intelligence</h2>
            <p>Select a session from the left to see its context breakdown.</p>
          </div>
        )}
      </main>
    </div>
  );
}
