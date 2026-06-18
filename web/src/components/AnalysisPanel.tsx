import { useEffect, useState } from "react";
import {
  api,
  copyText,
  type AgentKind,
  type AnalyzeResult,
  type AnalyzeType,
  type LlmConfig,
  type LlmProviderKind,
} from "../api";
import { LlmSettings } from "./LlmSettings";

type Props = {
  agent: AgentKind;
  sessionId: string;
};

export function AnalysisPanel({ agent, sessionId }: Props) {
  const [config, setConfig] = useState<LlmConfig | null>(null);
  const [type, setType] = useState<AnalyzeType>("summarize");
  const [provider, setProvider] = useState<LlmProviderKind>("anthropic");
  const [locale, setLocale] = useState<"ar" | "en">("en");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.llmConfig().then((c) => {
      setConfig(c);
      setProvider(c.defaultProvider);
      setType(c.analysisTypes[0]?.id ?? "summarize");
    });
  }, []);

  const run = () => {
    setLoading(true);
    setResult(null);
    api
      .analyze(agent, sessionId, { type, provider, locale })
      .then(setResult)
      .catch((e) => alert(String(e)))
      .finally(() => setLoading(false));
  };

  return (
    <div className="panel analysis-panel">
      <div className="panel-toolbar">
        <div className="panel-form">
          <select value={type} onChange={(e) => setType(e.target.value as AnalyzeType)}>
            {(config?.analysisTypes ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <select value={provider} onChange={(e) => setProvider(e.target.value as LlmProviderKind)}>
            {(config?.providers ?? []).map((p) => (
              <option key={p.id} value={p.id} disabled={!p.configured && p.id !== "ollama"}>
                {p.label}{!p.configured && p.id !== "ollama" ? " (not configured)" : ""}
              </option>
            ))}
          </select>
          <select value={locale} onChange={(e) => setLocale(e.target.value as "ar" | "en")}>
            <option value="en">English</option>
            <option value="ar">Arabic</option>
          </select>
        </div>
        <div className="panel-actions">
          <button type="button" className="btn-secondary" onClick={() => setShowSettings(true)}>
            LLM settings
          </button>
          <button type="button" className="btn-primary" onClick={run} disabled={loading}>
            {loading ? "Analyzing…" : "Analyze"}
          </button>
        </div>
      </div>

      <div className="privacy-notice">
        Analysis sends session transcript to the selected LLM provider. API keys are stored locally on the server and can be edited in LLM settings — no restart required.
      </div>

      {result && (
        <div className="analysis-result">
          <div className="panel-toolbar">
            <span className="panel-stats">
              {result.cached ? "Cached" : "Fresh"} · {result.provider} / {result.model}
              {result.tokensUsed != null ? ` · ~${result.tokensUsed} tokens` : ""}
            </span>
            <button
              type="button"
              className="btn-secondary"
              onClick={() =>
                copyText(result.markdown).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                })
              }
            >
              {copied ? "Copied!" : "Copy analysis"}
            </button>
          </div>
          <pre className="analysis-markdown">{result.markdown}</pre>
        </div>
      )}

      {showSettings && (
        <LlmSettings
          onClose={() => setShowSettings(false)}
          onSaved={(c) => {
            setConfig({ ...c, analysisTypes: config?.analysisTypes ?? [] });
            setProvider(c.defaultProvider);
          }}
        />
      )}
    </div>
  );
}
