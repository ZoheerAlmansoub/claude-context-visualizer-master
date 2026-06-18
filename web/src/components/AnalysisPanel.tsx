import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Check, Copy, Settings2 } from "lucide-react";
import {
  api,
  copyText,
  type AgentKind,
  type AnalysisIndexEntry,
  type AnalyzeResult,
  type AnalyzeType,
  type LlmConfig,
  type LlmProviderKind,
} from "../api";
import { LlmSettings } from "./LlmSettings";
import { ActionButton } from "./ui/ActionButton";
import { AnalysisLoadingState } from "./ui/AnalysisLoadingState";

type Props = {
  agent: AgentKind;
  sessionId: string;
};

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function typeLabel(config: LlmConfig | null, type: AnalyzeType): string {
  return config?.analysisTypes.find((t) => t.id === type)?.label ?? type;
}

export function AnalysisPanel({ agent, sessionId }: Props) {
  const [config, setConfig] = useState<LlmConfig | null>(null);
  const [type, setType] = useState<AnalyzeType>("summarize");
  const [provider, setProvider] = useState<LlmProviderKind>("anthropic");
  const [locale, setLocale] = useState<"ar" | "en">("en");
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [history, setHistory] = useState<AnalysisIndexEntry[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [copied, setCopied] = useState(false);

  const loadHistory = useCallback(() => {
    setHistoryLoading(true);
    api
      .listAnalyses(agent, sessionId)
      .then((r) => setHistory(r.analyses))
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));
  }, [agent, sessionId]);

  useEffect(() => {
    api.llmConfig().then((c) => {
      setConfig(c);
      setProvider(c.defaultProvider);
      setType(c.analysisTypes[0]?.id ?? "summarize");
    });
  }, []);

  useEffect(() => {
    loadHistory();
    setResult(null);
  }, [agent, sessionId, loadHistory]);

  const matchingEntry = useMemo(
    () => history.find((h) => h.type === type && h.provider === provider && h.locale === locale),
    [history, type, provider, locale],
  );

  useEffect(() => {
    if (!matchingEntry) {
      setResult(null);
      return;
    }
    setLoadingSaved(true);
    api
      .getAnalysis(agent, sessionId, matchingEntry.analysisId)
      .then(setResult)
      .catch(() => setResult(null))
      .finally(() => setLoadingSaved(false));
  }, [agent, sessionId, matchingEntry?.analysisId]);

  const run = () => {
    setLoading(true);
    setResult(null);
    api
      .analyze(agent, sessionId, { type, provider, locale })
      .then((r) => {
        setResult(r);
        loadHistory();
      })
      .catch((e) => alert(String(e)))
      .finally(() => setLoading(false));
  };

  const loadFromHistory = (entry: AnalysisIndexEntry) => {
    setType(entry.type);
    setProvider(entry.provider);
    setLocale(entry.locale);
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
          <ActionButton variant="secondary" icon={Settings2} onClick={() => setShowSettings(true)}>
            LLM settings
          </ActionButton>
          <ActionButton
            variant="primary"
            icon={BarChart3}
            loading={loading}
            loadingLabel={locale === "ar" ? "جاري التحليل…" : "Analyzing…"}
            onClick={run}
          >
            {result ? "Re-analyze" : "Analyze"}
          </ActionButton>
        </div>
      </div>

      <div className="privacy-notice">
        Analysis sends session transcript to the selected LLM provider. Results are saved locally
        per session and reload automatically when you return.
      </div>

      {historyLoading && (
        <div className="panel-loading compact">
          <span className="improvement-loading-spinner" aria-hidden />
          <span>Loading saved analyses…</span>
        </div>
      )}

      {!historyLoading && history.length > 0 && (
        <div className="saved-results-bar">
          <span className="saved-results-label">Saved analyses ({history.length})</span>
          <div className="saved-results-chips">
            {history.map((entry) => (
              <button
                key={entry.analysisId}
                type="button"
                className={`saved-chip${matchingEntry?.analysisId === entry.analysisId ? " active" : ""}`}
                onClick={() => loadFromHistory(entry)}
                title={entry.preview}
              >
                {typeLabel(config, entry.type)} · {entry.locale.toUpperCase()} ·{" "}
                {fmtDate(entry.createdAt)}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading && <AnalysisLoadingState locale={locale} />}

      {loadingSaved && !loading && (
        <div className="panel-loading compact">
          <span className="improvement-loading-spinner" aria-hidden />
          <span>Loading saved analysis…</span>
        </div>
      )}

      {result && !loading && !loadingSaved && (
        <div className="analysis-result">
          <div className="panel-toolbar">
            <span className="panel-stats">
              {result.cached ? "Saved" : "Fresh"} · {result.provider} / {result.model}
              {result.locale ? ` · ${result.locale.toUpperCase()}` : ""}
              {result.createdAt ? ` · ${fmtDate(result.createdAt)}` : ""}
              {result.tokensUsed != null ? ` · ~${result.tokensUsed} tokens` : ""}
            </span>
            <ActionButton
              icon={copied ? Check : Copy}
              onClick={() =>
                copyText(result.markdown).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                })
              }
            >
              {copied ? "Copied!" : "Copy analysis"}
            </ActionButton>
          </div>
          <pre className="analysis-markdown">{result.markdown}</pre>
        </div>
      )}

      {!result && !loading && !historyLoading && !loadingSaved && history.length === 0 && (
        <div className="empty-panel">
          No saved analyses for this session. Choose type and provider, then click Analyze.
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
