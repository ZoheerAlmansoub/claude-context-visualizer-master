import { useMemo, useState } from "react";
import { Check, Copy, Download, Eye, EyeOff, Sparkles } from "lucide-react";
import { api, copyText, type AgentKind, type GeneratedArtifact } from "../api";
import { artifactPathForAgent } from "../lib/apply-pack";
import { ApplyPackPanel } from "./ui/ApplyPackPanel";
import { ActionButton } from "./ui/ActionButton";

type Props = {
  agent: AgentKind;
  sessionId: string;
  projectPath?: string;
};

const AGENT_TABS: Array<{ id: AgentKind; label: string }> = [
  { id: "cursor", label: "Cursor" },
  { id: "claude", label: "Claude" },
  { id: "pi", label: "Pi" },
  { id: "opencode", label: "OpenCode" },
];

export function ArtifactsPanel({ agent, sessionId, projectPath }: Props) {
  const [artifacts, setArtifacts] = useState<GeneratedArtifact[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [pathAgent, setPathAgent] = useState<AgentKind>(agent);
  const [paths, setPaths] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const generate = () => {
    setLoading(true);
    api
      .generateArtifacts(agent, sessionId, { useLlm: true, locale: "en" })
      .then((r) => {
        setArtifacts(r.artifacts);
        const nextPaths: Record<string, string> = {};
        const nextSelected: Record<string, boolean> = {};
        for (const a of r.artifacts) {
          const key = `${a.kind}-${a.name}`;
          nextPaths[key] = artifactPathForAgent(pathAgent, a);
          nextSelected[key] = a.confidence !== "low";
        }
        setPaths(nextPaths);
        setSelected(nextSelected);
      })
      .catch((e) => alert(String(e)))
      .finally(() => setLoading(false));
  };

  const artifactKey = (a: GeneratedArtifact) => `${a.kind}-${a.name}`;

  const applyItems = useMemo(
    () =>
      artifacts
        .filter((a) => selected[artifactKey(a)] !== false)
        .map((a) => {
          const key = artifactKey(a);
          return {
            id: key,
            path: paths[key] ?? artifactPathForAgent(pathAgent, a),
            content: a.rendered || a.content,
            action: "create" as const,
            selected: selected[key] !== false,
            confidence: a.confidence,
            label: `${a.kind}: ${a.name}`,
            diffPreview: (a.rendered || a.content).slice(0, 300),
          };
        }),
    [artifacts, paths, selected, pathAgent],
  );

  const onAgentTab = (tab: AgentKind) => {
    setPathAgent(tab);
    setPaths((prev) => {
      const next = { ...prev };
      for (const a of artifacts) {
        const key = artifactKey(a);
        next[key] = artifactPathForAgent(tab, a);
      }
      return next;
    });
  };

  const save = async (artifact: GeneratedArtifact) => {
    const key = artifactKey(artifact);
    const path = (paths[key] ?? artifactPathForAgent(pathAgent, artifact)).trim();
    if (!path) {
      alert("Enter a file path");
      return;
    }
    try {
      await api.writeArtifact(path, artifact.rendered || artifact.content, { projectRoot: projectPath });
      alert(`Saved to ${path}`);
    } catch (e) {
      alert(String(e));
    }
  };

  return (
    <div className="panel artifacts-panel">
      <div className="panel-toolbar">
        <p className="panel-hint">
          Generate skills, rules, and tool hints from session experience. Paths adapt per agent tab.
        </p>
        <ActionButton
          variant="primary"
          icon={Sparkles}
          loading={loading}
          loadingLabel="Generating…"
          onClick={generate}
        >
          Generate artifacts
        </ActionButton>
      </div>

      <div className="artifact-agent-tabs">
        {AGENT_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={pathAgent === t.id ? "active" : ""}
            onClick={() => onAgentTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="panel-loading">
          <span className="improvement-loading-spinner" aria-hidden />
          <span>Generating artifacts…</span>
        </div>
      )}

      {artifacts.length === 0 && !loading && (
        <div className="empty-panel">Click Generate to extract skills and rules.</div>
      )}

      <div className="artifact-list">
        {artifacts.map((a) => {
          const key = artifactKey(a);
          return (
            <div key={key} className="artifact-card">
              <div className="artifact-header">
                <input
                  type="checkbox"
                  checked={selected[key] !== false}
                  onChange={(e) => setSelected((prev) => ({ ...prev, [key]: e.target.checked }))}
                />
                <span className={`badge badge-${a.kind}`}>{a.kind}</span>
                <strong>{a.name}</strong>
                <span className={`confidence confidence-${a.confidence}`}>{a.confidence}</span>
              </div>
              <p className="artifact-desc">{a.description}</p>
              <p className="artifact-trigger">Trigger: {a.trigger}</p>
              <input
                type="text"
                className="analysis-save-path-input"
                value={paths[key] ?? artifactPathForAgent(pathAgent, a)}
                onChange={(e) => setPaths((prev) => ({ ...prev, [key]: e.target.value }))}
              />
              <div className="panel-actions">
                <ActionButton
                  icon={expanded === key ? EyeOff : Eye}
                  onClick={() => setExpanded(expanded === key ? null : key)}
                >
                  {expanded === key ? "Hide" : "Preview"}
                </ActionButton>
                <ActionButton
                  icon={copied === key ? Check : Copy}
                  onClick={() =>
                    copyText(a.rendered || a.content).then(() => {
                      setCopied(key);
                      setTimeout(() => setCopied(null), 1500);
                    })
                  }
                >
                  {copied === key ? "Copied!" : "Copy"}
                </ActionButton>
                <ActionButton icon={Download} onClick={() => save(a)}>
                  Save
                </ActionButton>
              </div>
              {expanded === key && (
                <pre className="artifact-preview">{a.rendered || a.content}</pre>
              )}
            </div>
          );
        })}
      </div>

      {artifacts.length > 0 && (
        <ApplyPackPanel items={applyItems} projectRoot={projectPath} locale="en" />
      )}
    </div>
  );
}
