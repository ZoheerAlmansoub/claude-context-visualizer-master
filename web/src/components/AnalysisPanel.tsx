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
import { RecordLog } from "./ui/RecordLog";

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
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null);
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
    setSelectedAnalysisId(null);
  }, [agent, sessionId, loadHistory]);

  const historyForType = useMemo(
    () => history.filter((h) => h.type === type),
    [history, type],
  );

  const matchingEntry = useMemo(
    () =>
      historyForType.find((h) => h.provider === provider && h.locale === locale) ?? null,
    [historyForType, provider, locale],
  );

  const loadAnalysis = useCallback(
    (analysisId: string) => {
      setSelectedAnalysisId(analysisId);
      setLoadingSaved(true);
      api
        .getAnalysis(agent, sessionId, analysisId)
        .then((r) => {
          setResult(r);
          setType(r.type);
          setProvider(r.provider);
          setLocale(r.locale ?? "en");
        })
        .catch(() => setResult(null))
        .finally(() => setLoadingSaved(false));
    },
    [agent, sessionId],
  );

  useEffect(() => {
    if (selectedAnalysisId || !matchingEntry) return;
    loadAnalysis(matchingEntry.analysisId);
  }, [selectedAnalysisId, matchingEntry, loadAnalysis]);

  const resetSelection = () => {
    setSelectedAnalysisId(null);
    setResult(null);
  };

  const run = (force: boolean) => {
    setLoading(true);
    if (force) resetSelection();
    api
      .analyze(agent, sessionId, { type, provider, locale, force })
      .then((r) => {
        setResult(r);
        setSelectedAnalysisId(r.analysisId);
        loadHistory();
      })
      .catch((e) => alert(String(e)))
      .finally(() => setLoading(false));
  };

  const hasCachedForCombo = Boolean(matchingEntry);

  return (
    <div className="panel analysis-panel">
      <div className="panel-toolbar">
        <div className="panel-form">
          <select
            value={type}
            onChange={(e) => {
              setType(e.target.value as AnalyzeType);
              resetSelection();
            }}
          >
            {(config?.analysisTypes ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <select
            value={provider}
            onChange={(e) => {
              setProvider(e.target.value as LlmProviderKind);
              resetSelection();
            }}
          >
            {(config?.providers ?? []).map((p) => (
              <option key={p.id} value={p.id} disabled={!p.configured && p.id !== "ollama"}>
                {p.label}{!p.configured && p.id !== "ollama" ? " (not configured)" : ""}
              </option>
            ))}
          </select>
          <select
            value={locale}
            onChange={(e) => {
              setLocale(e.target.value as "ar" | "en");
              resetSelection();
            }}
          >
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
            onClick={() => run(hasCachedForCombo)}
          >
            {hasCachedForCombo
              ? locale === "ar"
                ? "تحليل جديد"
                : "New analysis"
              : locale === "ar"
                ? "تحليل"
                : "Analyze"}
          </ActionButton>
        </div>
      </div>

      <div className="privacy-notice">
        Analysis sends session transcript to the selected LLM provider. Each run is saved locally
        as a separate record so you can compare providers, models, and locales over time.
      </div>

      {historyLoading && (
        <div className="panel-loading compact">
          <span className="improvement-loading-spinner" aria-hidden />
          <span>Loading saved analyses…</span>
        </div>
      )}

      {!historyLoading && history.length > 0 && (
        <RecordLog
          heading={`${typeLabel(config, type)} · ${locale === "ar" ? "سجل التحليلات" : "Analysis log"}`}
          count={historyForType.length}
          defaultExpandedId={selectedAnalysisId ?? historyForType[0]?.analysisId}
          items={historyForType.map((entry, index) => ({
            id: entry.analysisId,
            title: `Run #${historyForType.length - index}`,
            subtitle: fmtDate(entry.createdAt),
            active: selectedAnalysisId === entry.analysisId,
            meta: [
              entry.provider,
              entry.model,
              entry.locale.toUpperCase(),
              entry.tokensUsed != null ? `~${entry.tokensUsed} tok` : "",
            ].filter(Boolean),
            onSelect: () => loadAnalysis(entry.analysisId),
            children:
              loadingSaved && selectedAnalysisId === entry.analysisId && !result ? (
                <div className="panel-loading compact">
                  <span className="improvement-loading-spinner" aria-hidden />
                  <span>Loading analysis…</span>
                </div>
              ) : result?.analysisId === entry.analysisId ? (
                <div className="analysis-result nested">
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
              ) : (
                <div className="record-log-placeholder">Expand to load this analysis.</div>
              ),
          }))}
        />
      )}

      {loading && <AnalysisLoadingState locale={locale} />}

      {!result && !loading && !historyLoading && historyForType.length === 0 && (
        <div className="empty-panel">
          No saved analyses for this type yet. Choose provider and locale, then click Analyze.
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
