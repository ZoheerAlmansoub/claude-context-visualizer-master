/** Grounding score helpers (shared between server auto-apply and web badges). */

export type GroundingLevel = "high" | "medium" | "low";

export type GroundingResult = {
  score: number;
  level: GroundingLevel;
  reasons: string[];
};

export type GroundingArtifact = {
  content: string;
  sourceTurns: number[];
  confidence: "high" | "medium" | "low";
};

export type GroundingMemoryDraft = {
  path: string;
  action: "create" | "update" | "append";
  rationale: string;
  content: string;
};

export type GroundingTranscript = {
  conversation: Array<{ turn: number; text: string }>;
};

export type GroundingProjectFile = {
  relativePath: string;
};

export type GroundingProjectContext = {
  files: GroundingProjectFile[];
};

const MIN_CONTENT_LENGTH = 40;

function levelFromScore(score: number): GroundingLevel {
  if (score >= 70) return "high";
  if (score >= 45) return "medium";
  return "low";
}

function turnExists(transcript: GroundingTranscript | undefined, turns: number[]): boolean {
  if (!transcript || !turns.length) return false;
  const maxTurn = transcript.conversation.reduce((m, c) => Math.max(m, c.turn), 0);
  return turns.every((t) => t >= 1 && t <= maxTurn);
}

function pathInInventory(path: string, projectContext?: GroundingProjectContext): boolean {
  if (!projectContext) return false;
  const norm = path.replace(/\\/g, "/").toLowerCase();
  return projectContext.files.some((f) => f.relativePath.replace(/\\/g, "/").toLowerCase() === norm);
}

function isAllowedMemoryPath(path: string): boolean {
  const p = path.replace(/\\/g, "/").trim().toLowerCase();
  if (/\.cursor\/rules\//.test(p) || /\.mdc$/.test(p) || /skill\.md$/i.test(p)) return false;
  return (
    /^agents\.md$/i.test(p) ||
    /^claude\.md$/i.test(p) ||
    /^design\.md$/i.test(p) ||
    p.startsWith("docs/context/") ||
    p.includes("/docs/context/")
  );
}

export function scoreArtifactGrounding(
  artifact: GroundingArtifact,
  transcript?: GroundingTranscript,
): GroundingResult {
  const reasons: string[] = [];
  let score = 50;

  if (artifact.content.trim().length >= MIN_CONTENT_LENGTH) {
    score += 15;
  } else {
    reasons.push("content too short");
    score -= 20;
  }

  if (artifact.sourceTurns.length) {
    if (turnExists(transcript, artifact.sourceTurns)) {
      score += 25;
      reasons.push("source turns verified in transcript");
    } else {
      score -= 15;
      reasons.push("source turns not found in transcript");
    }
  } else {
    score -= 10;
    reasons.push("no source turns cited");
  }

  if (artifact.confidence === "high") score += 10;
  if (artifact.confidence === "low") score -= 10;

  score = Math.max(0, Math.min(100, score));
  return { score, level: levelFromScore(score), reasons };
}

export function scoreMemoryDraftGrounding(
  draft: GroundingMemoryDraft,
  transcript?: GroundingTranscript,
  projectContext?: GroundingProjectContext,
): GroundingResult {
  const reasons: string[] = [];
  let score = 45;

  if (draft.content.trim().length >= MIN_CONTENT_LENGTH) {
    score += 20;
  } else {
    reasons.push("content too short");
    score -= 25;
  }

  if (isAllowedMemoryPath(draft.path)) {
    score += 10;
  } else {
    score -= 20;
    reasons.push("path not a standard memory file");
  }

  if (draft.action === "update" || draft.action === "append") {
    if (pathInInventory(draft.path, projectContext)) {
      score += 15;
      reasons.push("target file exists on disk");
    } else {
      score -= 10;
      reasons.push("update/append but file not in project inventory");
    }
  } else if (draft.action === "create" && !pathInInventory(draft.path, projectContext)) {
    score += 5;
  }

  if (draft.rationale.trim().length > 20) score += 10;

  const hasEvidence =
    transcript &&
    draft.rationale &&
    transcript.conversation.some((m) =>
      draft.rationale.toLowerCase().includes(m.text.slice(0, 24).toLowerCase()),
    );
  if (hasEvidence) {
    score += 15;
    reasons.push("rationale overlaps session text");
  }

  score = Math.max(0, Math.min(100, score));
  return { score, level: levelFromScore(score), reasons };
}

export function passesAutoApplyGrounding(level: GroundingLevel): boolean {
  return level === "high" || level === "medium";
}

export function minContentLength(): number {
  return MIN_CONTENT_LENGTH;
}

export function groundingBadgeLabel(level: GroundingLevel, locale: "ar" | "en" = "en"): string {
  const labels = {
    en: { high: "Grounding: high", medium: "Grounding: medium", low: "Grounding: low" },
    ar: { high: "ربط بالأدلة: عالي", medium: "ربط بالأدلة: متوسط", low: "ربط بالأدلة: منخفض" },
  };
  return labels[locale][level];
}
