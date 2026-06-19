import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Check, Copy, Settings2 } from "lucide-react";
import {
  api,
  copyText,
  type AgentKind,
  type AnalysisCategory,
  type AnalysisIndexEntry,
  type AnalyzeResult,
  type AnalyzeType,
  type LlmConfig,
  type LlmProviderKind,
  type SessionListItem,
} from "../api";
import {
  CATEGORY_ORDER,
  FALLBACK_ANALYSIS_TYPES,
  groupAnalysisTypes,
  isStaleAnalysisTypesResponse,
  normalizeAnalysisTypes,
} from "../analysis-types";
import { LlmSettings } from "./LlmSettings";
import { ActionButton } from "./ui/ActionButton";
import { AnalysisLoadingState } from "./ui/AnalysisLoadingState";
import { AnalysisResultCards } from "./ui/AnalysisResultCards";
import { RecordLog } from "./ui/RecordLog";
import { AnalysisPipelineWizard } from "./AnalysisPipelineWizard";

type Props = {
  agent: AgentKind;
  sessionId: string;
  session?: SessionListItem;
};

const CATEGORY_LABELS: Record<AnalysisCategory, { en: string; ar: string }> = {
  overview: { en: "Overview", ar: "نظرة عامة" },
  context: { en: "Context & tokens", ar: "السياق والتوكنز" },
  loops: { en: "Loops & tools", ar: "الحلقات والأدوات" },
  artifacts: { en: "Artifacts & memory", ar: "Artifacts والذاكرة" },
  learning: { en: "Learning", ar: "التعلّم" },
  governance: { en: "Governance", ar: "الحوكمة" },
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
  const types = normalizeAnalysisTypes(config?.analysisTypes ?? []);
  return types.find((t) => t.id === type)?.label ?? type;
}

export function AnalysisPanel({ agent, sessionId, session }: Props) {
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
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [staleServer, setStaleServer] = useState(false);

  const analysisTypes = useMemo(
    () => normalizeAnalysisTypes(config?.analysisTypes ?? FALLBACK_ANALYSIS_TYPES),
    [config?.analysisTypes],
  );

  const groupedTypes = useMemo(() => {
    return groupAnalysisTypes(analysisTypes, CATEGORY_ORDER).map((group) => ({
      ...group,
      label: CATEGORY_LABELS[group.category][locale],
    }));
  }, [analysisTypes, locale]);

  const loadConfig = useCallback(() => {
    setConfigError(null);
    return api
      .llmConfig()
      .then((c) => {
        const rawCount = c.analysisTypes?.length ?? 0;
        setStaleServer(isStaleAnalysisTypesResponse(rawCount));
        const types = normalizeAnalysisTypes(c.analysisTypes ?? []);
        setConfig({ ...c, analysisTypes: types });
        setProvider(c.defaultProvider);
        const ids = types.map((t) => t.id);
        setType((prev) => (ids.includes(prev) ? prev : types[0]?.id ?? "summarize"));
      })
      .catch((e) => {
        setConfig({
          defaultProvider: "nvidia",
          defaultModel: "",
          providers: [],
          analysisTypes: FALLBACK_ANALYSIS_TYPES,
        });
        setConfigError(String(e));
      });
  }, []);

  const loadHistory = useCallback(() => {
    setHistoryLoading(true);
    api
      .listAnalyses(agent, sessionId)
      .then((r) => setHistory(r.analyses))
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));
  }, [agent, sessionId]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    loadHistory();
    setResult(null);
    setSelectedAnalysisId(null);
  }, [agent, sessionId, loadHistory]);

  const historyForType = useMemo(
    () => history.filter((h) => h.type === type),
    [history, type],
  );

  /** Show runs for current type; if none, show all session runs so history is never hidden. */
  const displayHistory = useMemo(
    () => (historyForType.length > 0 ? historyForType : history),
    [history, historyForType],
  );

  const showingAllTypes = history.length > 0 && historyForType.length === 0;

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

  const handleCopy = (id: string, text: string) => {
    copyText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    });
  };

  const hasCachedForCombo = Boolean(matchingEntry);
  const selectedType = analysisTypes.find((t) => t.id === type);

  const renderResult = (r: AnalyzeResult) => (
    <div className="analysis-result nested">
      <div className="panel-toolbar">
        <span className="panel-stats">
          {r.cached ? "Saved" : "Fresh"} · {r.provider} / {r.model}
          {r.locale ? ` · ${r.locale.toUpperCase()}` : ""}
          {r.createdAt ? ` · ${fmtDate(r.createdAt)}` : ""}
          {r.tokensUsed != null ? ` · ~${r.tokensUsed} tokens` : ""}
        </span>
        <ActionButton
          icon={copiedId === `${r.analysisId}-md` ? Check : Copy}
          onClick={() => handleCopy(`${r.analysisId}-md`, r.markdown)}
        >
          {copiedId === `${r.analysisId}-md`
            ? locale === "ar"
              ? "تم النسخ!"
              : "Copied!"
            : locale === "ar"
              ? "نسخ التحليل"
              : "Copy analysis"}
        </ActionButton>
      </div>
      <AnalysisResultCards
        result={r}
        copiedId={copiedId}
        onCopy={handleCopy}
        locale={locale}
        agent={agent}
        projectRoot={session?.projectPath}
      />
    </div>
  );

  return (
    <div className="panel analysis-panel">
      {session && (
        <AnalysisPipelineWizard
          agent={agent}
          session={session}
          provider={provider}
          model={config?.defaultModel ?? ""}
          locale={locale}
        />
      )}
      <div className="panel-toolbar">
        <div className="panel-form">
          <select
            value={type}
            title={selectedType?.description}
            onChange={(e) => {
              setType(e.target.value as AnalyzeType);
              resetSelection();
            }}
          >
            {groupedTypes.length > 0 ? (
              groupedTypes.map((group) => (
                <optgroup key={group.category} label={group.label}>
                  {group.types.map((t) => (
                    <option key={t.id} value={t.id} title={t.description}>
                      {t.label}
                    </option>
                  ))}
                </optgroup>
              ))
            ) : (
              analysisTypes.map((t) => (
                <option key={t.id} value={t.id} title={t.description}>
                  {t.label}
                </option>
              ))
            )}
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

      {selectedType?.description && (
        <p className="analysis-type-hint">{selectedType.description}</p>
      )}

      {staleServer && (
        <div className="analysis-parse-warning" role="status">
          {locale === "ar"
            ? "الخادم يعمل بنسخة قديمة — الأنواع الجديدة ظاهرة في القائمة لكن قد تفشل التحليلات حتى تعيد تشغيل الخادم (start.ps1 أو bun run dev)."
            : "API server is outdated — new types appear in the list but analysis may fail until you restart the server (start.ps1 or bun run dev)."}
        </div>
      )}

      {configError && (
        <div className="analysis-parse-warning" role="status">
          {locale === "ar"
            ? `تعذّر تحميل إعدادات LLM — استخدام القائمة الافتراضية. ${configError}`
            : `Could not load LLM config — using defaults. ${configError}`}
        </div>
      )}

      <div className="privacy-notice">
        Analysis sends session transcript to the selected LLM provider. Each run is saved locally
        as a separate record so you can compare providers, models, and locales over time.
      </div>

      <div className="analysis-body">
        {loading && (
          <AnalysisLoadingState
            locale={locale}
            typeLabel={selectedType?.label ?? type}
            provider={config?.providers.find((p) => p.id === provider)?.label ?? provider}
          />
        )}

        {historyLoading && (
          <div className="panel-loading compact">
            <span className="improvement-loading-spinner" aria-hidden />
            <span>{locale === "ar" ? "جاري تحميل السجل…" : "Loading saved analyses…"}</span>
          </div>
        )}

        {!historyLoading && displayHistory.length > 0 && (
          <RecordLog
            heading={
              loading
                ? locale === "ar"
                  ? "سجل التحليلات السابقة"
                  : "Previous analyses"
                : showingAllTypes
                  ? locale === "ar"
                    ? "سجل التحليلات (كل الأنواع)"
                    : "Analysis log (all types)"
                  : `${typeLabel(config, type)} · ${locale === "ar" ? "سجل التحليلات" : "Analysis log"}`
            }
            count={displayHistory.length}
            defaultExpandedId={
              loading ? null : selectedAnalysisId ?? displayHistory[0]?.analysisId
            }
            items={displayHistory.map((entry, index) => ({
              id: entry.analysisId,
              title: `Run #${displayHistory.length - index}`,
              subtitle: fmtDate(entry.createdAt),
              active: !loading && selectedAnalysisId === entry.analysisId,
              meta: [
                typeLabel(config, entry.type),
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
                    <span>{locale === "ar" ? "جاري التحميل…" : "Loading analysis…"}</span>
                  </div>
                ) : result?.analysisId === entry.analysisId ? (
                  renderResult(result)
                ) : (
                  <div className="record-log-placeholder">
                    {locale === "ar" ? "وسّع لتحميل هذا التحليل." : "Expand to load this analysis."}
                  </div>
                ),
            }))}
          />
        )}

        {!result && !loading && !historyLoading && displayHistory.length === 0 && (
          <div className="empty-panel">
            {locale === "ar"
              ? "لا توجد تحليلات محفوظة لهذا النوع بعد. اختر المزود واللغة ثم اضغط تحليل."
              : "No saved analyses for this type yet. Choose provider and locale, then click Analyze."}
          </div>
        )}
      </div>

      {showSettings && (
        <LlmSettings
          onClose={() => setShowSettings(false)}
          onSaved={(c) => {
            setConfig({
              ...c,
              analysisTypes: normalizeAnalysisTypes(c.analysisTypes ?? []),
            });
            setProvider(c.defaultProvider);
          }}
        />
      )}
    </div>
  );
}
