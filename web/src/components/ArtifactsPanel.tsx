import { useState } from "react";
import { Check, Copy, Download, Eye, EyeOff, Sparkles } from "lucide-react";
import { api, copyText, type AgentKind, type GeneratedArtifact } from "../api";
import { ActionButton } from "./ui/ActionButton";

type Props = {
  agent: AgentKind;
  sessionId: string;
};

export function ArtifactsPanel({ agent, sessionId }: Props) {
  const [artifacts, setArtifacts] = useState<GeneratedArtifact[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [savePath, setSavePath] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const generate = () => {
    setLoading(true);
    api
      .generateArtifacts(agent, sessionId, { useLlm: true, locale: "en" })
      .then((r) => setArtifacts(r.artifacts))
      .catch((e) => alert(String(e)))
      .finally(() => setLoading(false));
  };

  const save = async (artifact: GeneratedArtifact) => {
    if (!savePath.trim()) {
      alert("Enter a full file path (e.g. C:\\Users\\you\\.cursor\\skills\\my-skill\\SKILL.md)");
      return;
    }
    try {
      await api.writeArtifact(savePath.trim(), artifact.rendered || artifact.content);
      alert(`Saved to ${savePath}`);
    } catch (e) {
      alert(String(e));
    }
  };

  return (
    <div className="panel artifacts-panel">
      <div className="panel-toolbar">
        <p className="panel-hint">
          Generate Cursor skills, rules, and tool hints from session experience.
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

      <div className="artifact-save-path">
        <label>
          Save path (optional)
          <input
            type="text"
            placeholder="C:\Users\you\.cursor\skills\my-skill\SKILL.md"
            value={savePath}
            onChange={(e) => setSavePath(e.target.value)}
          />
        </label>
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
        {artifacts.map((a) => (
          <div key={`${a.kind}-${a.name}`} className="artifact-card">
            <div className="artifact-header">
              <span className={`badge badge-${a.kind}`}>{a.kind}</span>
              <strong>{a.name}</strong>
              <span className={`confidence confidence-${a.confidence}`}>{a.confidence}</span>
            </div>
            <p className="artifact-desc">{a.description}</p>
            <p className="artifact-trigger">Trigger: {a.trigger}</p>
            <div className="panel-actions">
              <ActionButton
                icon={expanded === a.name ? EyeOff : Eye}
                onClick={() => setExpanded(expanded === a.name ? null : a.name)}
              >
                {expanded === a.name ? "Hide" : "Preview"}
              </ActionButton>
              <ActionButton
                icon={copied === a.name ? Check : Copy}
                onClick={() =>
                  copyText(a.rendered || a.content).then(() => {
                    setCopied(a.name);
                    setTimeout(() => setCopied(null), 1500);
                  })
                }
              >
                {copied === a.name ? "Copied!" : "Copy"}
              </ActionButton>
              <ActionButton icon={Download} onClick={() => save(a)}>
                Save
              </ActionButton>
            </div>
            {expanded === a.name && (
              <pre className="artifact-preview">{a.rendered || a.content}</pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
