import { useState } from "react";
import {
  AlertTriangle,
  Bot,
  Check,
  Copy,
  Download,
  FileText,
  Info,
  Layers,
  Shield,
  Sparkles,
  Zap,
} from "lucide-react";
import {
  api,
  type AnalysisSource,
  type AnalyzeResult,
  type GeneratedArtifact,
  type MemoryFileDraft,
  type StructuredAnalysis,
  type SubAgentSpec,
  type TokenWasteItem,
} from "../../api";
import { ActionButton } from "./ActionButton";
import { MarkdownView } from "./MarkdownView";

type Props = {
  result: AnalyzeResult;
  copiedId: string | null;
  onCopy: (id: string, text: string) => void;
  locale: "ar" | "en";
};

const LABELS = {
  en: {
    summary: "Summary",
    wasteItems: "Token waste",
    source: "Source",
    impact: "Impact",
    description: "Description",
    recommendation: "Recommendation",
    artifacts: "Suggested artifacts",
    memoryFiles: "Memory file drafts",
    orchestration: "Agent orchestration",
    whenSwarm: "When to use swarm",
    copy: "Copy",
    copied: "Copied!",
    save: "Save",
    preview: "Preview",
    hide: "Hide",
    trigger: "Trigger",
    purpose: "Purpose",
    role: "Role",
    tools: "Tools",
    copyAll: "Copy full report",
    parseWarning: "Parse notice",
    emptyStructured: "No structured items returned.",
    sourceHeuristicTitle: "Pattern-based analysis",
    sourceHeuristicBody:
      "Derived from detected session events. The model response could not be parsed, but the data below is grounded in real tool calls and errors.",
    sourceHeuristicTimeoutBody:
      "NVIDIA gateway timed out after retries. Showing pattern-based analysis from session events instead of an error.",
    sourceHybridTitle: "Combined analysis",
    sourceHybridBody: "LLM insights merged with patterns detected in the session.",
    appendNote: "append/update: verify existing file before saving (overwrite).",
  },
  ar: {
    summary: "الملخص",
    wasteItems: "مصارف التوكنز",
    source: "المصدر",
    impact: "التأثير",
    description: "الوصف",
    recommendation: "التوصية",
    artifacts: "Artifacts مقترحة",
    memoryFiles: "مسودات ملفات الذاكرة",
    orchestration: "تنسيق الوكلاء",
    whenSwarm: "متى تستخدم swarm",
    copy: "نسخ",
    copied: "تم النسخ!",
    save: "حفظ",
    preview: "معاينة",
    hide: "إخفاء",
    trigger: "المُشغّل",
    purpose: "الغرض",
    role: "الدور",
    tools: "الأدوات",
    copyAll: "نسخ التقرير كاملاً",
    parseWarning: "تنبيه التحليل",
    emptyStructured: "لم تُرجع عناصر منظّمة.",
    sourceHeuristicTitle: "تحليل من الأنماط المكتشفة",
    sourceHeuristicBody:
      "مبني على أحداث الجلسة الفعلية. تعذّر تحليل استجابة النموذج، لكن البيانات أدناه مستندة إلى استدعاءات الأدوات والأخطاء الحقيقية.",
    sourceHeuristicTimeoutBody:
      "انتهت مهلة بوابة NVIDIA بعد إعادة المحاولة. يُعرض تحليل من الأنماط المكتشفة بدلاً من خطأ.",
    sourceHybridTitle: "تحليل مُدمج",
    sourceHybridBody: "نتائج النموذج مدمجة مع أنماط مكتشفة في الجلسة.",
    appendNote: "append/update: تحقق من الملف الحالي قبل الحفظ (يستبدل المحتوى).",
  },
} as const;

type LabelSet = (typeof LABELS)[keyof typeof LABELS];

function impactClass(impact: string): string {
  return `impact-${impact}`;
}

function WasteTable({ items, L }: { items: TokenWasteItem[]; L: LabelSet }) {
  if (!items.length) return null;
  return (
    <div className="analysis-waste-table-wrap">
      <table className="analysis-waste-table">
        <thead>
          <tr>
            <th>{L.source}</th>
            <th>{L.impact}</th>
            <th>{L.description}</th>
            <th>{L.recommendation}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((w, i) => (
            <tr key={i}>
              <td>{w.source}</td>
              <td>
                <span className={`impact-badge ${impactClass(w.estimatedImpact)}`}>
                  {w.estimatedImpact}
                </span>
              </td>
              <td>{w.description}</td>
              <td>{w.recommendation}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function defaultArtifactPath(artifact: GeneratedArtifact): string {
  const slug = artifact.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  switch (artifact.kind) {
    case "skill":
      return `~/.cursor/skills/${slug}/SKILL.md`;
    case "rule":
      return `.cursor/rules/${slug}.mdc`;
    case "hook":
      return `.cursor/hooks/${slug}.md`;
    case "subagent":
      return `.cursor/agents/${slug}.md`;
    default:
      return "";
  }
}

function ArtifactCard({
  artifact,
  id,
  copiedId,
  onCopy,
  L,
}: {
  artifact: GeneratedArtifact;
  id: string;
  copiedId: string | null;
  onCopy: (id: string, text: string) => void;
  L: LabelSet;
}) {
  const [expanded, setExpanded] = useState(false);
  const [savePath, setSavePath] = useState(defaultArtifactPath(artifact));
  const body = artifact.rendered ?? artifact.content;

  const save = async () => {
    const path = savePath.trim() || prompt("Enter full file path:", "")?.trim();
    if (!path) return;
    try {
      await api.writeArtifact(path, body);
      alert(`Saved to ${path}`);
    } catch (e) {
      alert(String(e));
    }
  };

  return (
    <article className="artifact-card analysis-artifact-card">
      <div className="artifact-header">
        <span className={`badge badge-${artifact.kind}`}>{artifact.kind}</span>
        <strong>{artifact.name}</strong>
        <span className={`confidence confidence-${artifact.confidence}`}>{artifact.confidence}</span>
      </div>
      <p className="artifact-desc">{artifact.description}</p>
      <p className="artifact-trigger">
        {L.trigger}: {artifact.trigger}
      </p>
      <div className="panel-actions">
        <ActionButton
          variant="ghost"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? L.hide : L.preview}
        </ActionButton>
        <ActionButton
          variant="ghost"
          icon={copiedId === id ? Check : Copy}
          onClick={() => onCopy(id, body)}
        >
          {copiedId === id ? L.copied : L.copy}
        </ActionButton>
        <ActionButton variant="ghost" icon={Download} onClick={save}>
          {L.save}
        </ActionButton>
      </div>
      <input
        type="text"
        className="analysis-save-path-input"
        placeholder="Optional save path"
        value={savePath}
        onChange={(e) => setSavePath(e.target.value)}
      />
      {expanded && <pre className="artifact-preview">{body}</pre>}
    </article>
  );
}

function MemoryFileCard({
  file,
  id,
  copiedId,
  onCopy,
  L,
}: {
  file: MemoryFileDraft;
  id: string;
  copiedId: string | null;
  onCopy: (id: string, text: string) => void;
  L: LabelSet;
}) {
  const [expanded, setExpanded] = useState(false);
  const [savePath, setSavePath] = useState(file.path);

  const save = async () => {
    const path = savePath.trim();
    if (!path) {
      alert("Enter a file path");
      return;
    }
    try {
      await api.writeArtifact(path, file.content);
      alert(`Saved to ${path}`);
    } catch (e) {
      alert(String(e));
    }
  };

  return (
    <article className="artifact-card analysis-artifact-card">
      <div className="artifact-header">
        <span className="badge badge-rule">{file.action}</span>
        <strong>{file.path}</strong>
      </div>
      <p className="artifact-desc">
        {L.purpose}: {file.purpose}
      </p>
      <p className="artifact-trigger">{file.rationale}</p>
      {(file.action === "append" || file.action === "update") && (
        <p className="analysis-action-note">{L.appendNote}</p>
      )}
      <div className="panel-actions">
        <ActionButton variant="ghost" onClick={() => setExpanded((v) => !v)}>
          {expanded ? L.hide : L.preview}
        </ActionButton>
        <ActionButton
          variant="ghost"
          icon={copiedId === id ? Check : Copy}
          onClick={() => onCopy(id, file.content)}
        >
          {copiedId === id ? L.copied : L.copy}
        </ActionButton>
        <ActionButton variant="ghost" icon={Download} onClick={save}>
          {L.save}
        </ActionButton>
      </div>
      <input
        type="text"
        className="analysis-save-path-input"
        value={savePath}
        onChange={(e) => setSavePath(e.target.value)}
      />
      {expanded && <pre className="artifact-preview">{file.content}</pre>}
    </article>
  );
}

function SubAgentCard({ agent, L }: { agent: SubAgentSpec; L: LabelSet }) {
  return (
    <article className="artifact-card analysis-artifact-card">
      <div className="artifact-header">
        <span className="badge badge-subagent">subagent</span>
        <strong>{agent.name}</strong>
        <span className={`confidence confidence-${agent.confidence}`}>{agent.confidence}</span>
      </div>
      <ul className="detail-card-list">
        <li>
          <strong>{L.role}:</strong> {agent.role}
        </li>
        <li>
          <strong>{L.trigger}:</strong> {agent.whenToUse}
        </li>
        <li>
          <strong>Context:</strong> {agent.contextBudget}
        </li>
        <li>
          <strong>Handoff:</strong> {agent.handoffPoints}
        </li>
        <li>
          <strong>{L.tools}:</strong> {agent.tools.join(", ") || "—"}
        </li>
      </ul>
    </article>
  );
}

function StructuredBody({
  structured,
  prefix,
  copiedId,
  onCopy,
  L,
}: {
  structured: StructuredAnalysis;
  prefix: string;
  copiedId: string | null;
  onCopy: (id: string, text: string) => void;
  L: LabelSet;
}) {
  switch (structured.kind) {
    case "token-audit":
      return (
        <>
          {structured.summary && (
            <section className="analysis-section">
              <h4>
                <Zap size={16} /> {L.summary}
              </h4>
              <MarkdownView content={structured.summary} />
            </section>
          )}
          {structured.wasteItems.length > 0 && (
            <section className="analysis-section">
              <h4>
                <AlertTriangle size={16} /> {L.wasteItems}
              </h4>
              <WasteTable items={structured.wasteItems} L={L} />
            </section>
          )}
        </>
      );
    case "prevention-rules":
    case "artifacts": {
      const items = structured.kind === "prevention-rules" ? structured.rules : structured.items;
      return (
        <>
          {structured.summary && (
            <section className="analysis-section">
              <h4>
                <Shield size={16} /> {L.summary}
              </h4>
              <MarkdownView content={structured.summary} />
            </section>
          )}
          <section className="analysis-section">
            <h4>
              <Sparkles size={16} /> {L.artifacts}
            </h4>
            <div className="artifact-list">
              {items.map((a, i) => (
                <ArtifactCard
                  key={`${a.kind}-${a.name}-${i}`}
                  artifact={a}
                  id={`${prefix}-art-${i}`}
                  copiedId={copiedId}
                  onCopy={onCopy}
                  L={L}
                />
              ))}
            </div>
          </section>
        </>
      );
    }
    case "memory-files":
      return (
        <>
          {structured.summary && (
            <section className="analysis-section">
              <h4>
                <FileText size={16} /> {L.summary}
              </h4>
              <MarkdownView content={structured.summary} />
            </section>
          )}
          <section className="analysis-section">
            <h4>
              <Layers size={16} /> {L.memoryFiles}
            </h4>
            <div className="artifact-list">
              {structured.files.map((f, i) => (
                <MemoryFileCard
                  key={`${f.path}-${i}`}
                  file={f}
                  id={`${prefix}-mem-${i}`}
                  copiedId={copiedId}
                  onCopy={onCopy}
                  L={L}
                />
              ))}
            </div>
          </section>
        </>
      );
    case "orchestration":
      return (
        <>
          {structured.summary && (
            <section className="analysis-section">
              <h4>
                <Bot size={16} /> {L.summary}
              </h4>
              <MarkdownView content={structured.summary} />
            </section>
          )}
          {structured.whenSwarm && (
            <section className="analysis-section">
              <h4>{L.whenSwarm}</h4>
              <MarkdownView content={structured.whenSwarm} />
            </section>
          )}
          <section className="analysis-section">
            <h4>
              <Bot size={16} /> {L.orchestration}
            </h4>
            <div className="artifact-list">
              {structured.agents.map((a, i) => (
                <SubAgentCard key={`${a.name}-${i}`} agent={a} L={L} />
              ))}
            </div>
          </section>
        </>
      );
    default:
      return null;
  }
}

function isStructuredEmpty(structured: StructuredAnalysis): boolean {
  switch (structured.kind) {
    case "token-audit":
      return structured.wasteItems.length === 0 && !structured.summary;
    case "prevention-rules":
      return structured.rules.length === 0 && !structured.summary;
    case "artifacts":
      return structured.items.length === 0 && !structured.summary;
    case "memory-files":
      return structured.files.length === 0 && !structured.summary;
    case "orchestration":
      return structured.agents.length === 0 && !structured.summary && !structured.whenSwarm;
    default:
      return true;
  }
}

function inferAnalysisSource(result: AnalyzeResult): AnalysisSource | undefined {
  if (result.analysisSource) return result.analysisSource;
  if (result.llmUnavailable === "timeout") return "heuristic";
  if (!result.structured || isStructuredEmpty(result.structured)) return undefined;
  if (result.parseWarning?.includes("JSON parse failed") || result.parseWarning?.includes("تعذّر تحليل JSON")) {
    return "heuristic";
  }
  return undefined;
}

function AnalysisSourceBanner({
  source,
  llmUnavailable,
  L,
}: {
  source: AnalysisSource;
  llmUnavailable?: "timeout";
  L: LabelSet;
}) {
  if (source === "llm") return null;
  const isHeuristic = source === "heuristic";
  const body =
    isHeuristic && llmUnavailable === "timeout"
      ? L.sourceHeuristicTimeoutBody
      : isHeuristic
        ? L.sourceHeuristicBody
        : L.sourceHybridBody;
  return (
    <div
      className={`analysis-source-banner ${isHeuristic ? "analysis-source-heuristic" : "analysis-source-hybrid"}`}
      role="status"
    >
      <Info size={14} />
      <span>
        <strong>{isHeuristic ? L.sourceHeuristicTitle : L.sourceHybridTitle}:</strong> {body}
      </span>
    </div>
  );
}

export function AnalysisResultCards({ result, copiedId, onCopy, locale }: Props) {
  const L = LABELS[locale] ?? LABELS.en;
  const prefix = result.analysisId;
  const source = inferAnalysisSource(result);
  const hasStructured = result.structured && !isStructuredEmpty(result.structured);
  const showParseWarning = result.parseWarning && !hasStructured;

  return (
    <div className="analysis-results">
      {source && hasStructured && (
        <AnalysisSourceBanner source={source} llmUnavailable={result.llmUnavailable} L={L} />
      )}
      {showParseWarning && (
        <div className="analysis-parse-warning" role="status">
          <AlertTriangle size={14} />
          <span>
            <strong>{L.parseWarning}:</strong> {result.parseWarning}
          </span>
        </div>
      )}
      {hasStructured ? (
        <StructuredBody
          structured={result.structured!}
          prefix={prefix}
          copiedId={copiedId}
          onCopy={onCopy}
          L={L}
        />
      ) : result.structured ? (
        <div className="empty-panel compact">{L.emptyStructured}</div>
      ) : (
        <MarkdownView content={result.markdown} className="analysis-markdown-body" />
      )}
      <div className="improvement-results-footer">
        <ActionButton
          variant="secondary"
          icon={copiedId === `${prefix}-md` ? Check : Copy}
          onClick={() => onCopy(`${prefix}-md`, result.markdown)}
        >
          {copiedId === `${prefix}-md` ? L.copied : L.copyAll}
        </ActionButton>
      </div>
    </div>
  );
}
