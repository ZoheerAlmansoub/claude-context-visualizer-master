import { useEffect, useState } from "react";
import {
  api,
  copyText,
  type AgentKind,
  type SessionTranscript,
} from "../api";

type Props = {
  agent: AgentKind;
  sessionId: string;
};

function fmt(n: number): string {
  return n.toLocaleString();
}

export function MessagesPanel({ agent, sessionId }: Props) {
  const [transcript, setTranscript] = useState<SessionTranscript | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<string | null>(null);
  const [filterPostCompaction, setFilterPostCompaction] = useState(false);

  useEffect(() => {
    setLoading(true);
    api
      .transcript(agent, sessionId, filterPostCompaction)
      .then(setTranscript)
      .catch((e) => alert(String(e)))
      .finally(() => setLoading(false));
  }, [agent, sessionId, filterPostCompaction]);

  const showCopied = (id: string) => {
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  };

  if (loading || !transcript) return <div className="loading">Loading messages…</div>;

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

  return (
    <div className="panel messages-panel">
      <div className="panel-toolbar">
        <div className="panel-stats">
          {userMessages.messages.length} messages
          {hiddenByFilter && ` (of ${stats.totalCount} total)`}
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
          <button
            type="button"
            className="btn-secondary"
            onClick={() =>
              copyText(userMessages.aggregatedText).then(() => showCopied("all-md"))
            }
          >
            {copied === "all-md" ? "Copied!" : "Copy all (markdown)"}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() =>
              copyText(userMessages.messages.map((m) => m.text).join("\n\n---\n\n")).then(() =>
                showCopied("all-plain"),
              )
            }
          >
            {copied === "all-plain" ? "Copied!" : "Copy all (plain)"}
          </button>
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
          return (
            <div key={msg.id} className={`message-card${open ? " expanded" : ""}`}>
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
                <button
                  type="button"
                  className="btn-copy-inline"
                  onClick={(e) => {
                    e.stopPropagation();
                    copyText(msg.text).then(() => showCopied(msg.id));
                  }}
                >
                  {copied === msg.id ? "Copied" : "Copy"}
                </button>
              </div>
              <div className="message-preview">{msg.text.slice(0, open ? undefined : 200)}{!open && msg.text.length > 200 ? "…" : ""}</div>
              {open && <pre className="message-full">{msg.text}</pre>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
