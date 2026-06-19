/**
 * Bun fetch defaults to a 5-minute socket inactivity timeout, which is too short
 * for large-model analysis (e.g. NVIDIA Nemotron with 4k output tokens).
 * @see https://github.com/oven-sh/bun/pull/6217
 */

export const LLM_FETCH_TIMEOUT_MS = Number(process.env.LLM_FETCH_TIMEOUT_MS ?? 20 * 60 * 1000);

type BunFetchInit = RequestInit & {
  /** Bun-only: false disables the built-in 5-minute inactivity timeout */
  timeout?: number | false;
};

export async function llmFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const signal = AbortSignal.timeout(LLM_FETCH_TIMEOUT_MS);
  const merged: BunFetchInit = {
    ...init,
    signal: init.signal ?? signal,
    timeout: false,
  };
  return fetch(url, merged as RequestInit);
}
