/**
 * Maps logical analysis session ids to safe cache directory names.
 * Windows disallows `:` in path segments (except drive letters).
 */
export function analysisSessionCacheDirName(sessionId: string): string {
  if (sessionId.startsWith("project:")) {
    const slug = sessionId.slice("project:".length);
    return `project__${slug.replace(/[:<>"/\\|?*]/g, "_")}`;
  }
  return sessionId.replace(/[:<>"/\\|?*]/g, "_");
}
