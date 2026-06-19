import { useEffect, useRef, useState } from "react";
import { Shield, Play, Download, RefreshCw, Square, RotateCcw } from "lucide-react";
import {
  api,
  copyText,
  type AgentKind,
  type GovernancePipelineMode,
  type GovernancePipelineResult,
  type LlmProviderKind,
  type ProjectContextSummary,
  type RecurringPattern,
  type SessionListItem,
} from "../api";
import { ActionButton } from "./ui/ActionButton";

type Props = {
  agent: AgentKind;
  session: SessionListItem;
  locale?: "ar" | "en";
};

const LABELS = {
  en: {
    title: "Project governance",
    projectRoot: "Project root",
    verified: "Verified",
    unverified: "Unverified",
    patterns: "Cross-session patterns",
    runSession: "Govern this session",
    runProject: "Govern this project",
    exportPlaybook: "Export playbook",
    running: "Running pipeline…",
    pipeline: "Pipeline steps",
    playbook: "Playbook preview",
    copyPlaybook: "Copy playbook",
    noPatterns: "No cross-session patterns yet.",
    loadContext: "Loading project context…",
    mode: "Mode",
    quick: "Quick",
    standard: "Standard",
    full: "Full",
    stop: "Stop",
    resume: "Resume",
    progress: "Progress",
    filesLoaded: "memory/rules files",
    expandContext: "Show file list",
  },
  ar: {
    title: "حوكمة المشروع",
    projectRoot: "جذر المشروع",
    verified: "موثّق",
    unverified: "غير موثّق",
    patterns: "أنماط عبر الجلسات",
    runSession: "حوكمة هذه الجلسة",
    runProject: "حوكمة المشروع",
    exportPlaybook: "تصدير Playbook",
    running: "جاري تشغيل Pipeline…",
    pipeline: "خطوات Pipeline",
    playbook: "معاينة Playbook",
    copyPlaybook: "نسخ Playbook",
    noPatterns: "لا توجد أنماط cross-session بعد.",
    loadContext: "جاري تحميل سياق المشروع…",
    mode: "الوضع",
    quick: "سريع",
    standard: "قياسي",
    full: "كامل",
    stop: "إيقاف",
    resume: "استئناف",
    progress: "التقدم",
    filesLoaded: "ملفات memory/rules",
    expandContext: "عرض قائمة الملفات",
  },
} as const;

function pipelineProgress(steps: GovernancePipelineResult["steps"]): number {
  if (!steps.length) return 0;
  const done = steps.filter((s) => s.status === "done" || s.status === "error" || s.status === "skipped").length;
  return Math.round((done / steps.length) * 100);
}

export function GovernancePanel({ agent, session, locale = "en" }: Props) {
  const L = LABELS[locale];
  const [provider, setProvider] = useState<LlmProviderKind>("openrouter");
  const [model, setModel] = useState("");
  const [mode, setMode] = useState<GovernancePipelineMode>("standard");
  const [autoApply, setAutoApply] = useState(false);
  const [context, setContext] = useState<ProjectContextSummary | null>(null);
  const [showFiles, setShowFiles] = useState(false);
  const [patterns, setPatterns] = useState<RecurringPattern[]>([]);
  const [pipeline, setPipeline] = useState<GovernancePipelineResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    api.llmConfig().then((cfg) => {
      setProvider(cfg.defaultProvider);
      setModel(cfg.defaultModel);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.projectContextSummary(agent, session.project, session.projectPath),
      api.projectInsights(agent, session.project),
    ])
      .then(([ctx, p]) => {
        setContext(ctx);
        setPatterns(p.patterns);
      })
      .catch((e) => alert(String(e)))
      .finally(() => setLoading(false));
  }, [agent, session.project, session.projectPath]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const startPolling = (pipelineId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const latest = await api.getGovernancePipeline(pipelineId);
        if (!latest) return;
        setPipeline(latest);
        if (latest.status === "complete" || latest.status === "cancelled" || latest.status === "error") {
          setRunning(false);
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {}
    }, 1500);
  };

  const runSession = async () => {
    setRunning(true);
    try {
      const result = await api.governSession(agent, session.id, {
        provider,
        model,
        locale,
        force: true,
        mode,
        autoApply,
      });
      setPipeline(result);
      startPolling(result.pipelineId);
    } catch (e) {
      alert(String(e));
      setRunning(false);
    }
  };

  const runProject = async () => {
    setRunning(true);
    try {
      const result = await api.governProject(agent, session.project, {
        provider,
        model,
        locale,
        force: true,
        mode,
        autoApply,
      });
      setPipeline(result);
      startPolling(result.pipelineId);
    } catch (e) {
      alert(String(e));
      setRunning(false);
    }
  };

  const stopPipeline = async () => {
    if (!pipeline?.pipelineId) return;
    try {
      const result = await api.cancelGovernancePipeline(pipeline.pipelineId);
      if (result) setPipeline(result);
      setRunning(false);
    } catch (e) {
      alert(String(e));
    }
  };

  const resumePipeline = async () => {
    if (!pipeline?.pipelineId) return;
    setRunning(true);
    try {
      const result = await api.resumeGovernancePipeline(pipeline.pipelineId);
      if (result) {
        setPipeline(result);
        startPolling(result.pipelineId);
      }
    } catch (e) {
      alert(String(e));
      setRunning(false);
    }
  };

  const exportPlaybook = async () => {
    setRunning(true);
    try {
      const md = await api.fetchPlaybook(agent, session.project, { save: true, refresh: true });
      setPipeline((prev) => ({ ...(prev ?? { pipelineId: "", scope: "project", steps: [] }), playbookMarkdown: md }));
    } catch (e) {
      alert(String(e));
    } finally {
      setRunning(false);
    }
  };

  if (loading) return <div className="loading">{L.loadContext}</div>;

  const progress = pipeline ? pipelineProgress(pipeline.steps) : 0;

  return (
    <div className="panel governance-panel">
      <header className="governance-header">
        <h2 className="card-title">
          <Shield size={18} /> {L.title}
        </h2>
        <div className="governance-controls">
          <label className="governance-mode">
            {L.mode}
            <select value={mode} onChange={(e) => setMode(e.target.value as GovernancePipelineMode)} disabled={running}>
              <option value="quick">{L.quick}</option>
              <option value="standard">{L.standard}</option>
              <option value="full">{L.full}</option>
            </select>
          </label>
          <label className="checkbox-inline">
            <input type="checkbox" checked={autoApply} onChange={(e) => setAutoApply(e.target.checked)} disabled={running} />
            Auto-apply high confidence
          </label>
        </div>
        <div className="governance-actions">
          <ActionButton onClick={runSession} disabled={running} icon={Play}>
            {running ? L.running : L.runSession}
          </ActionButton>
          <ActionButton onClick={runProject} disabled={running} variant="secondary" icon={RefreshCw}>
            {L.runProject}
          </ActionButton>
          {running && pipeline && (
            <ActionButton onClick={stopPipeline} variant="secondary" icon={Square}>
              {L.stop}
            </ActionButton>
          )}
          {!running && pipeline?.status === "cancelled" && (
            <ActionButton onClick={resumePipeline} variant="secondary" icon={RotateCcw}>
              {L.resume}
            </ActionButton>
          )}
          <ActionButton onClick={exportPlaybook} disabled={running} variant="secondary" icon={Download}>
            {L.exportPlaybook}
          </ActionButton>
        </div>
      </header>

      {context && (
        <section className="governance-section">
          <p className="panel-hint">
            <strong>{L.projectRoot}:</strong> {context.projectRoot}{" "}
            <span className={context.verified ? "badge-ok" : "badge-warn"}>
              {context.verified ? L.verified : L.unverified}
            </span>
            {context.warning ? ` — ${context.warning}` : ""}
          </p>
          <p className="panel-hint">
            {context.files.length} {L.filesLoaded} (hash {context.inventoryHash})
            {context.files.length > 0 && (
              <button type="button" className="link-btn" onClick={() => setShowFiles((v) => !v)}>
                {L.expandContext}
              </button>
            )}
          </p>
          {showFiles && (
            <ul className="context-file-list">
              {context.files.map((f) => (
                <li key={f.relativePath}>
                  <code>{f.relativePath}</code> — {f.sizeBytes} bytes
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {pipeline && running && (
        <section className="governance-section">
          <div className="pipeline-progress-label">
            {L.progress}: {progress}%
          </div>
          <div className="pipeline-progress-bar">
            <div className="pipeline-progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </section>
      )}

      <section className="governance-section">
        <h3 className="card-title">{L.patterns}</h3>
        {patterns.length === 0 ? (
          <div className="empty-panel">{L.noPatterns}</div>
        ) : (
          <div className="pattern-list">
            {patterns.slice(0, 8).map((p) => (
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

      {pipeline && (
        <>
          <section className="governance-section">
            <h3 className="card-title">{L.pipeline}</h3>
            <ul className="pipeline-steps">
              {pipeline.steps.map((s) => (
                <li key={s.type} className={`pipeline-step pipeline-${s.status}`}>
                  <code>{s.type}</code> — {s.status}
                  {s.error ? `: ${s.error}` : ""}
                </li>
              ))}
            </ul>
            {pipeline.applyResults && pipeline.applyResults.length > 0 && (
              <p className="panel-hint">
                Auto-applied {pipeline.applyResults.filter((r) => r.ok).length}/{pipeline.applyResults.length} files
              </p>
            )}
          </section>
          {pipeline.playbookMarkdown && (
            <section className="governance-section">
              <div className="governance-playbook-head">
                <h3 className="card-title">{L.playbook}</h3>
                <ActionButton
                  variant="secondary"
                  onClick={() => copyText(pipeline.playbookMarkdown ?? "")}
                >
                  {L.copyPlaybook}
                </ActionButton>
              </div>
              <pre className="governance-playbook">{pipeline.playbookMarkdown}</pre>
            </section>
          )}
        </>
      )}
    </div>
  );
}
