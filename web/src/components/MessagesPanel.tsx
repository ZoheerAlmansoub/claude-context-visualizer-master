import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Sparkles, FileText } from "lucide-react";
import {
  api,
  copyText,
  type AgentKind,
  type LlmProviderKind,
  type PromptImprovementResult,
  type SessionTranscript,
} from "../api";
import { ActionButton } from "./ui/ActionButton";
import { ImprovementLoadingCards, ImprovementResultCards } from "./ui/ImprovementResultCards";

type Props = {
  agent: AgentKind;
  sessionId: string;
};

function fmt(n: number): string {
  return n.toLocaleString();
}

function detectLocale(text: string): "ar" | "en" {
  return /[\u0600-\u06FF]/.test(text) ? "ar" : "en";
}

export function MessagesPanel({ agent, sessionId }: Props) {
  const [transcript, setTranscript] = useState<SessionTranscript | null>(null);
  const [improvements, setImprovements] = useState<Record<string, PromptImprovementResult>>({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [improving, setImproving] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<string | null>(null);
  const [filterPostCompaction, setFilterPostCompaction] = useState(false);
  const [llmProvider, setLlmProvider] = useState<LlmProviderKind>("anthropic");

  const loadData = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.transcript(agent, sessionId, filterPostCompaction),
      api.listPromptImprovements(agent, sessionId),
      api.llmConfig(),
    ])
      .then(([t, imp, cfg]) => {
        setTranscript(t);
        setLlmProvider(cfg.defaultProvider);
        const map: Record<string, PromptImprovementResult> = {};
        for (const item of imp.improvements) map[item.messageId] = item;
        setImprovements(map);
      })
      .catch((e) => alert(String(e)))
      .finally(() => setLoading(false));
  }, [agent, sessionId, filterPostCompaction]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const showCopied = (id: string) => {
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  };

  const handleCopy = (id: string, text: string) => {
    copyText(text).then(() => showCopied(id));
  };

  const runImprove = async (messageId: string, text: string, force = false) => {
    const locale = detectLocale(text);
    setExpanded((prev) => new Set(prev).add(messageId));
    setImproving((prev) => new Set(prev).add(messageId));
    try {
      const result = await api.improvePrompt(agent, sessionId, messageId, {
        provider: llmProvider,
        locale,
        force,
      });
      setImprovements((prev) => ({ ...prev, [messageId]: result }));
    } catch (e) {
      alert(String(e));
    } finally {
      setImproving((prev) => {
        const n = new Set(prev);
        n.delete(messageId);
        return n;
      });
    }
  };

  if (loading || !transcript) {
    return (
      <div className="panel-loading">
        <span className="improvement-loading-spinner" aria-hidden />
        <span>Loading messages…</span>
      </div>
    );
  }

  const userMessages = transcript.userMessages ?? {
    messages: [],
    aggregatedText: "",
    totalChars: 0,
    totalTokens: 0,
  };
  const warnings = transcript.warnings ?? [];
  const stats = transcript.userMessageStats ?? {
    visibleCount: userMessages.messages.length,
    totalCount: userMessages.messages.length,
    postCompactionOnly: filterPostCompaction,
  };
  const hiddenByFilter =
    filterPostCompaction && stats.totalCount > stats.visibleCount;
  const improvedCount = Object.keys(improvements).length;

  return (
    <div className="panel messages-panel">
      <div className="panel-toolbar">
        <div className="panel-stats">
          {userMessages.messages.length} messages
          {hiddenByFilter && ` (of ${stats.totalCount} total)`}
          {improvedCount > 0 && ` · ${improvedCount} improved`}
          {" · "}
          {fmt(userMessages.totalTokens)} tokens · {fmt(userMessages.totalChars)} chars
        </div>
        <div className="panel-actions">
          {stats.totalCount > 0 && transcript.compactionBoundaryIndex != null && (
            <label className="checkbox-label" title="Show only user messages after the latest context compaction">
              <input
                type="checkbox"
                checked={filterPostCompaction}
                onChange={(e) => setFilterPostCompaction(e.target.checked)}
              />
              Post-compaction only
            </label>
          )}
          <ActionButton
            icon={copied === "all-md" ? Check : Copy}
            onClick={() => handleCopy("all-md", userMessages.aggregatedText)}
          >
            {copied === "all-md" ? "Copied!" : "Copy all (markdown)"}
          </ActionButton>
          <ActionButton
            icon={copied === "all-plain" ? Check : FileText}
            onClick={() =>
              handleCopy(
                "all-plain",
                userMessages.messages.map((m) => m.text).join("\n\n---\n\n"),
              )
            }
          >
            {copied === "all-plain" ? "Copied!" : "Copy all (plain)"}
          </ActionButton>
        </div>
      </div>

      {hiddenByFilter && (
        <div className="notice compaction">
          Showing {stats.visibleCount} of {stats.totalCount} user messages after
          compaction. Uncheck &quot;Post-compaction only&quot; to see the full session history.
        </div>
      )}

      {warnings.length > 0 && (
        <div className="notice warning">
          {warnings.map((w, i) => (
            <div key={i}>{w}</div>
          ))}
        </div>
      )}

      <div className="message-list">
        {userMessages.messages.length === 0 && (
          <div className="empty-panel">No user messages in this session.</div>
        )}
        {userMessages.messages.map((msg) => {
          const open = expanded.has(msg.id);
          const imp = improvements[msg.id];
          const busy = improving.has(msg.id);
          const locale = detectLocale(msg.text);
          return (
            <div
              key={msg.id}
              className={`message-card${open ? " expanded" : ""}${imp ? " has-improvement" : ""}${busy ? " is-improving" : ""}`}
            >
              <div
                className="message-header"
                onClick={() =>
                  setExpanded((prev) => {
                    const n = new Set(prev);
                    if (n.has(msg.id)) n.delete(msg.id);
                    else n.add(msg.id);
                    return n;
                  })
                }
              >
                <span className="message-turn">Turn {msg.turn}</span>
                {msg.timestamp && <span className="message-ts">{msg.timestamp}</span>}
                <span className="message-tokens">{fmt(msg.tokens ?? 0)} tok</span>
                {imp && !busy && <span className="badge badge-improved">Improved</span>}
                {busy && <span className="badge badge-loading">Improving…</span>}
                <div className="message-header-actions" onClick={(e) => e.stopPropagation()}>
                  <ActionButton
                    variant="ghost"
                    className="btn-copy-inline"
                    icon={copied === `orig-${msg.id}` ? Check : Copy}
                    onClick={() => handleCopy(`orig-${msg.id}`, msg.text)}
                  >
                    {copied === `orig-${msg.id}` ? "Copied" : "Copy"}
                  </ActionButton>
                  <ActionButton
                    variant="accent"
                    icon={Sparkles}
                    loading={busy}
                    loadingLabel={locale === "ar" ? "جاري التحسين…" : "Improving…"}
                    onClick={() => runImprove(msg.id, msg.text, Boolean(imp))}
                    title="Rewrite this prompt for better agent results"
                  >
                    {imp ? "Re-improve" : "Improve prompt"}
                  </ActionButton>
                </div>
              </div>
              <div className="message-preview">
                {msg.text.slice(0, open ? undefined : 200)}
                {!open && msg.text.length > 200 ? "…" : ""}
              </div>
              {open && (
                <>
                  <pre className="message-full">{msg.text}</pre>
                  {busy && <ImprovementLoadingCards locale={locale} />}
                  {!busy && imp && (
                    <ImprovementResultCards
                      imp={imp}
                      copiedId={copied}
                      onCopy={handleCopy}
                    />
                  )}
                  {!imp && !busy && (
                    <div className="improvement-hint">
                      Use <strong>Improve prompt</strong> to get a structured rewrite with learning
                      tips for this message.
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
