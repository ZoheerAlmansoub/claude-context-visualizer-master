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
  type AgentKind,
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
import { ApplyPackPanel } from "./ApplyPackPanel";
import { collectFromAnalysisResult } from "../../lib/apply-pack";
import {
  groundingBadgeLabel,
  scoreArtifactGrounding,
  scoreMemoryDraftGrounding,
  type GroundingLevel,
} from "@shared/grounding.ts";

type Props = {
  result: AnalyzeResult;
  copiedId: string | null;
  onCopy: (id: string, text: string) => void;
  locale: "ar" | "en";
  agent?: AgentKind;
  projectRoot?: string;
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
    memoryFilesHint: "Persistent project context (AGENTS.md, CLAUDE.md, design.md) — not Cursor rules.",
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
    fullModelResponse: "Full model response",
    emptyStructured: "No structured items returned.",
    sourceHeuristicTitle: "Pattern-based analysis",
    sourceHeuristicBody:
      "Derived from detected session events. The model response could not be parsed, but the data below is grounded in real tool calls and errors.",
    sourceHeuristicTimeoutBody:
      "NVIDIA gateway timed out after retries. Showing pattern-based analysis from session events instead of an error.",
    sourceHybridTitle: "Combined analysis",
    sourceHybridBody: "LLM insights merged with patterns detected in the session.",
    appendNote: "append/update: verify existing file before saving (overwrite).",
    keyDecisions: "Key decisions",
    grounding: "Grounding",
    weeklyPlan: "Weekly plan",
    suggestedRule: "Suggested rule",
    suggestedSkill: "Suggested skill",
    practiceExercise: "Practice exercise",
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
    memoryFilesHint: "سياق المشروع الدائم (AGENTS.md, CLAUDE.md, design.md) — وليس قواعد Cursor.",
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
    fullModelResponse: "استجابة النموذج الكاملة",
    emptyStructured: "لم تُرجع عناصر منظّمة.",
    sourceHeuristicTitle: "تحليل من الأنماط المكتشفة",
    sourceHeuristicBody:
      "مبني على أحداث الجلسة الفعلية. تعذّر تحليل استجابة النموذج، لكن البيانات أدناه مستندة إلى استدعاءات الأدوات والأخطاء الحقيقية.",
    sourceHeuristicTimeoutBody:
      "انتهت مهلة بوابة NVIDIA بعد إعادة المحاولة. يُعرض تحليل من الأنماط المكتشفة بدلاً من خطأ.",
    sourceHybridTitle: "تحليل مُدمج",
    sourceHybridBody: "نتائج النموذج مدمجة مع أنماط مكتشفة في الجلسة.",
    appendNote: "append/update: تحقق من الملف الحالي قبل الحفظ (يستبدل المحتوى).",
    keyDecisions: "قرارات رئيسية",
    grounding: "ربط بالأدلة",
    weeklyPlan: "الخطة الأسبوعية",
    suggestedRule: "قاعدة مقترحة",
    suggestedSkill: "مهارة مقترحة",
    practiceExercise: "تمرين عملي",
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
            <th>Turns</th>
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
              <td>{w.turns?.length ? w.turns.join(", ") : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

import { artifactApplyPath } from "../../lib/artifact-paths";

function GroundingBadge({ level, locale }: { level: GroundingLevel; locale: "ar" | "en" }) {
  return (
    <span className={`grounding-badge grounding-${level}`} title={groundingBadgeLabel(level, locale)}>
      {groundingBadgeLabel(level, locale)}
    </span>
  );
}

function ArtifactCard({
  artifact,
  id,
  copiedId,
  onCopy,
  L,
  agent = "cursor",
  projectRoot,
  locale = "en",
}: {
  artifact: GeneratedArtifact;
  id: string;
  copiedId: string | null;
  onCopy: (id: string, text: string) => void;
  L: LabelSet;
  agent?: AgentKind;
  projectRoot?: string;
  locale?: "ar" | "en";
}) {
  const [expanded, setExpanded] = useState(false);
  const [savePath, setSavePath] = useState(artifactApplyPath(agent, artifact));
  const body = artifact.rendered ?? artifact.content;
  const grounding = scoreArtifactGrounding(artifact);

  const save = async () => {
    const path = savePath.trim() || prompt("Enter full file path:", "")?.trim();
    if (!path) return;
    try {
      await api.writeArtifact(path, body, { projectRoot });
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
        <GroundingBadge level={grounding.level} locale={locale} />
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
  projectRoot,
  locale = "en",
}: {
  file: MemoryFileDraft;
  id: string;
  copiedId: string | null;
  onCopy: (id: string, text: string) => void;
  L: LabelSet;
  projectRoot?: string;
  locale?: "ar" | "en";
}) {
  const [expanded, setExpanded] = useState(false);
  const [savePath, setSavePath] = useState(file.path);
  const grounding = scoreMemoryDraftGrounding(file);

  const save = async () => {
    const path = savePath.trim();
    if (!path) {
      alert("Enter a file path");
      return;
    }
    try {
      await api.writeArtifact(path, file.content, {
        projectRoot,
        action: file.action === "create" ? undefined : file.action,
      });
      alert(`Saved to ${path}`);
    } catch (e) {
      alert(String(e));
    }
  };

  return (
    <article className="artifact-card analysis-artifact-card">
      <div className="artifact-header">
        <span className="badge badge-memory">{file.action}</span>
        <strong>{file.path}</strong>
        <GroundingBadge level={grounding.level} locale={locale} />
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

function SubAgentCard({
  agent,
  L,
  agentKind = "cursor",
  projectRoot,
}: {
  agent: SubAgentSpec;
  L: LabelSet;
  agentKind?: AgentKind;
  projectRoot?: string;
}) {
  const slug = agent.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const defaultPath = artifactApplyPath(
    agentKind ?? "cursor",
    {
      kind: "subagent",
      name: agent.name,
      description: agent.role,
      trigger: agent.whenToUse,
      content: `# ${agent.name}\n\n**Role:** ${agent.role}\n\n**When:** ${agent.whenToUse}\n\n**Context:** ${agent.contextBudget}\n\n**Handoff:** ${agent.handoffPoints}\n\n**Tools:** ${agent.tools.join(", ")}`,
      sourceTurns: [],
      confidence: agent.confidence,
    },
  );
  const [savePath, setSavePath] = useState(defaultPath);

  const save = async () => {
    const path = savePath.trim();
    if (!path) return;
    const body = `# Sub-agent: ${agent.name}\n\n**Role:** ${agent.role}\n\n**When:** ${agent.whenToUse}\n\n**Context:** ${agent.contextBudget}\n\n**Handoff:** ${agent.handoffPoints}\n\n**Tools:** ${agent.tools.join(", ")}`;
    try {
      await api.writeArtifact(path, body, { projectRoot });
      alert(`Saved to ${path}`);
    } catch (e) {
      alert(String(e));
    }
  };

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
      <div className="panel-actions">
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
    </article>
  );
}

function StructuredBody({
  structured,
  prefix,
  copiedId,
  onCopy,
  L,
  agent = "cursor",
  projectRoot,
  locale = "en",
}: {
  structured: StructuredAnalysis;
  prefix: string;
  copiedId: string | null;
  onCopy: (id: string, text: string) => void;
  L: LabelSet;
  agent?: AgentKind;
  projectRoot?: string;
  locale?: "ar" | "en";
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
                  agent={agent}
                  projectRoot={projectRoot}
                  locale={locale}
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
            <p className="analysis-action-note">{L.memoryFilesHint}</p>
            <div className="artifact-list">
              {structured.files.map((f, i) => (
                <MemoryFileCard
                  key={`${f.path}-${i}`}
                  file={f}
                  id={`${prefix}-mem-${i}`}
                  copiedId={copiedId}
                  onCopy={onCopy}
                  L={L}
                  projectRoot={projectRoot}
                  locale={locale}
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
                <SubAgentCard
                  key={`${a.name}-${i}`}
                  agent={a}
                  L={L}
                  agentKind={agent}
                  projectRoot={projectRoot}
                />
              ))}
            </div>
          </section>
        </>
      );
    case "project-health":
      return (
        <>
          <section className="analysis-section">
            <h4>{L.summary}</h4>
            <MarkdownView content={structured.summary} />
            <p>
              <strong>Health score:</strong> {structured.healthScore}/100
            </p>
          </section>
          {structured.rootCauses.map((rc) => (
            <section key={rc.id} className="analysis-section">
              <h4>
                {rc.title} ({rc.impact})
              </h4>
              <MarkdownView content={`${rc.description}\n\n**Fix:** ${rc.recommendation}`} />
            </section>
          ))}
        </>
      );
    case "user-fluency":
    case "user-growth":
      return (
        <>
          <section className="analysis-section">
            <h4>{L.summary}</h4>
            <MarkdownView content={structured.summary} />
            <p>
              <strong>Score:</strong> {structured.overallScore}/100
            </p>
          </section>
          {structured.kind === "user-growth" && structured.weeklyPlan.length > 0 && (
            <section className="analysis-section">
              <h4>{L.weeklyPlan}</h4>
              <ul className="analysis-weekly-plan">
                {structured.weeklyPlan.map((d) => (
                  <li key={d.day}>
                    <strong>{d.day}</strong> — {d.focus}: {d.task}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {structured.growthAreas.map((g) => (
            <section key={g.area} className="analysis-section">
              <h4>{g.area}</h4>
              <MarkdownView content={g.whyItMatters} />
              <ul>
                {g.concreteActions.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
              {g.suggestedRule && (
                <p>
                  <strong>{L.suggestedRule}:</strong> {g.suggestedRule}
                </p>
              )}
              {g.suggestedSkill && (
                <p>
                  <strong>{L.suggestedSkill}:</strong> {g.suggestedSkill}
                </p>
              )}
              {g.practiceExercise && (
                <p>
                  <strong>{L.practiceExercise}:</strong> {g.practiceExercise}
                </p>
              )}
            </section>
          ))}
        </>
      );
    case "memory-diff":
      return (
        <>
          <section className="analysis-section">
            <h4>{L.summary}</h4>
            <MarkdownView content={structured.summary} />
          </section>
          {structured.items.map((item, i) => (
            <section key={i} className="analysis-section">
              <h4>
                {item.path} ({item.action})
              </h4>
              <pre className="artifact-preview">{item.diffPreview}</pre>
            </section>
          ))}
        </>
      );
    case "rule-dedup":
      return (
        <>
          <section className="analysis-section">
            <h4>{L.summary}</h4>
            <MarkdownView content={structured.summary} />
          </section>
          {structured.items.map((item, i) => (
            <section key={i} className="analysis-section">
              <h4>
                {item.name} → {item.proposedPath} ({item.action})
              </h4>
              <MarkdownView content={item.rationale} />
              {item.content && <pre className="artifact-preview">{item.content}</pre>}
            </section>
          ))}
        </>
      );
    case "compaction-recovery":
      return (
        <>
          <section className="analysis-section">
            <h4>{L.summary}</h4>
            <MarkdownView content={structured.summary} />
            {structured.boundaryTurn != null && (
              <p>
                <strong>Boundary turn:</strong> {structured.boundaryTurn}
              </p>
            )}
          </section>
          {structured.recoveryItems.map((item, i) => (
            <section key={i} className="analysis-section">
              <h4>
                [{item.priority}] {item.action}
              </h4>
              <MarkdownView content={item.rationale} />
              {item.suggestedContent && (
                <pre className="artifact-preview">{item.suggestedContent}</pre>
              )}
            </section>
          ))}
        </>
      );
    case "mcp-tool-audit":
      return (
        <>
          <section className="analysis-section">
            <h4>{L.summary}</h4>
            <MarkdownView content={structured.summary} />
          </section>
          <div className="analysis-waste-table-wrap">
            <table className="analysis-waste-table">
              <thead>
                <tr>
                  <th>Tool</th>
                  <th>Severity</th>
                  <th>Pattern</th>
                  <th>Recommendation</th>
                  <th>Calls</th>
                  <th>Errors</th>
                </tr>
              </thead>
              <tbody>
                {structured.findings.map((f, i) => (
                  <tr key={i}>
                    <td>{f.toolName}</td>
                    <td>
                      <span className={`impact-badge impact-${f.severity === "critical" || f.severity === "high" ? "high" : "medium"}`}>
                        {f.severity}
                      </span>
                    </td>
                    <td>{f.pattern}</td>
                    <td>{f.recommendation}</td>
                    <td>{f.callCount}</td>
                    <td>{f.errorCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      );
    case "project-synthesis":
      return (
        <>
          <section className="analysis-section">
            <h4>{L.summary}</h4>
            <MarkdownView content={structured.summary} />
          </section>
          {structured.themes.map((t) => (
            <section key={t.id} className="analysis-section">
              <h4>
                {t.title} ({t.status})
              </h4>
              <MarkdownView content={t.summary} />
            </section>
          ))}
          {structured.decisions.length > 0 && (
            <section className="analysis-section">
              <h4>{L.keyDecisions}</h4>
              <ul className="analysis-decision-list">
                {structured.decisions.map((d, i) => (
                  <li key={i}>
                    <strong>{d.decision}</strong>
                    {d.rationale && <> — {d.rationale}</>}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {structured.memoryGaps.map((g, i) => (
            <section key={i} className="analysis-section">
              <h4>{g.path}</h4>
              <MarkdownView content={`${g.gap}\n\n→ ${g.suggestedAction}`} />
            </section>
          ))}
          {structured.driftWarnings.length > 0 && (
            <section className="analysis-section">
              <h4>Drift warnings</h4>
              <ul>
                {structured.driftWarnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </section>
          )}
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
    case "project-health":
      return structured.rootCauses.length === 0 && !structured.summary;
    case "user-fluency":
    case "user-growth":
      return structured.growthAreas.length === 0 && !structured.summary;
    case "memory-diff":
      return structured.items.length === 0 && !structured.summary;
    case "rule-dedup":
      return structured.items.length === 0 && !structured.summary;
    case "compaction-recovery":
      return structured.recoveryItems.length === 0 && !structured.summary;
    case "mcp-tool-audit":
      return structured.findings.length === 0 && !structured.summary;
    case "project-synthesis":
      return structured.themes.length === 0 && structured.decisions.length === 0 && !structured.summary;
    default:
      return true;
  }
}

function inferAnalysisSource(result: AnalyzeResult): AnalysisSource | undefined {
  if (result.analysisSource) return result.analysisSource;
  if (result.llmUnavailable === "timeout") return "heuristic";
  if (!result.structured || isStructuredEmpty(result.structured)) return undefined;
  if (
    result.parseWarning?.includes("Could not parse") ||
    result.parseWarning?.includes("Could not extract") ||
    result.parseWarning?.includes("تعذّر تحليل") ||
    result.parseWarning?.includes("تعذّر استخراج")
  ) {
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

export function AnalysisResultCards({ result, copiedId, onCopy, locale, agent = "cursor", projectRoot }: Props) {
  const L = LABELS[locale] ?? LABELS.en;
  const prefix = result.analysisId;
  const source = inferAnalysisSource(result);
  const hasStructured = result.structured && !isStructuredEmpty(result.structured);
  const isRecoveryNotice =
    !!result.parseWarning &&
    (/auto-repaired|Partial results|Partial|إصلاح JSON|جزء من النتائج/i.test(result.parseWarning));
  const isPartialFailure = isRecoveryNotice;
  const showParseWarning = Boolean(result.parseWarning);
  const showRawResponse =
    !!result.rawLlmResponse?.trim() &&
    (!hasStructured || result.rawLlmResponse.trim() !== result.markdown.trim());

  return (
    <div className="analysis-results">
      {source && hasStructured && (
        <AnalysisSourceBanner source={source} llmUnavailable={result.llmUnavailable} L={L} />
      )}
      {showParseWarning && (
        <div
          className={`analysis-parse-warning${hasStructured && !isPartialFailure ? " analysis-parse-recovered" : ""}${isPartialFailure ? " analysis-parse-failed" : ""}`}
          role="status"
        >
          <AlertTriangle size={14} />
          <span>
            <strong>
              {isPartialFailure
                ? locale === "ar"
                  ? "تحليل غير مكتمل"
                  : "Incomplete analysis"
                : isRecoveryNotice
                  ? locale === "ar"
                    ? "استرداد تلقائي"
                    : "Auto-recovered"
                  : L.parseWarning}
              :
            </strong>{" "}
            {isPartialFailure
              ? locale === "ar"
                ? "استجابة النموذج JSON مقطوعة — أعد تشغيل التحليل (Force). لا تعتمد على هذه النتائج."
                : "Model JSON was truncated — re-run analysis (Force). Do not rely on this partial output."
              : result.parseWarning}
          </span>
        </div>
      )}
      {hasStructured ? (
        <>
          <StructuredBody
            structured={result.structured!}
            prefix={prefix}
            copiedId={copiedId}
            onCopy={onCopy}
            L={L}
            agent={agent}
            projectRoot={projectRoot}
            locale={locale}
          />
          <ApplyPackPanel
            items={collectFromAnalysisResult(result, agent)}
            projectRoot={projectRoot}
            locale={locale}
          />
        </>
      ) : result.structured ? (
        <div className="empty-panel compact">{L.emptyStructured}</div>
      ) : (
        <MarkdownView content={result.markdown} className="analysis-markdown-body" />
      )}
      {showRawResponse && (
        <details className="analysis-raw-response">
          <summary>{L.fullModelResponse}</summary>
          <pre className="analysis-raw-pre">{result.rawLlmResponse}</pre>
        </details>
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
