// Shared text extraction for transcripts and titles.

const USER_QUERY_RE = /<user_query>([\s\S]*?)<\/user_query>/i;
const USER_REQUEST_RE = /<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/i;
const TIMESTAMP_RE = /<timestamp>[\s\S]*?<\/timestamp>\s*/gi;
const XML_TAG_RE = /<\/?[a-z_-]+[^>]*>/gi;

export function stripXmlTags(s: string): string {
  return s.replace(XML_TAG_RE, " ").replace(/\s+/g, " ").trim();
}

export function extractUserQuery(raw: string): string {
  const userRequest = raw.match(USER_REQUEST_RE);
  if (userRequest?.[1]?.trim()) return userRequest[1].trim();
  const match = raw.match(USER_QUERY_RE);
  if (match?.[1]?.trim()) return match[1].trim();
  return raw.replace(TIMESTAMP_RE, "").trim();
}

export function extractTitle(raw: string): string {
  if (!raw) return "";
  const args = raw.match(/<command-args>([\s\S]*?)<\/command-args>/);
  if (args?.[1]?.trim()) return truncate(args[1].trim());
  const fromQuery = extractUserQuery(raw);
  const cleaned = stripXmlTags(fromQuery || raw);
  if (cleaned) return truncate(cleaned);
  const line = raw.split("\n").find((l) => l.trim()) ?? "";
  return truncate(line);
}

export function truncate(s: string, max = 100): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

export function contentBlocksToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return content == null ? "" : String(content);
  return content
    .map((block) => {
      if (typeof block === "string") return block;
      if (!block || typeof block !== "object") return "";
      const b = block as Record<string, unknown>;
      if (b.type === "text" && typeof b.text === "string") return b.text;
      if (b.type === "tool_use" && typeof b.name === "string") {
        return `[tool: ${b.name}]`;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

export function formatUserMessagesMarkdown(
  messages: Array<{ turn: number; text: string; timestamp?: string }>,
): string {
  return messages
    .map((m) => {
      const header = m.timestamp
        ? `## Turn ${m.turn} (${m.timestamp})`
        : `## Turn ${m.turn}`;
      return `${header}\n\n${m.text}`;
    })
    .join("\n\n---\n\n");
}
