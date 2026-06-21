import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { invalidateModelCatalogCache, listLlmModels } from "./model-catalog.ts";

const FIXTURES = join(import.meta.dir, "../fixtures/models");

describe("model-catalog cache", () => {
  test("returns parsed models from fetch and caches", async () => {
    invalidateModelCatalogCache();
    const openrouterJson = readFileSync(join(FIXTURES, "openrouter-sample.json"), "utf8");

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.includes("/models")) {
        return new Response(openrouterJson, { status: 200 });
      }
      return originalFetch(input);
    };

    try {
      const first = await listLlmModels("openrouter", {
        apiKey: "test-key-12345678",
        baseUrl: "https://openrouter.ai/api/v1",
      }, { skipCache: true });
      expect(first.ok).toBe(true);
      expect(first.models.length).toBe(2);
      expect(first.cached).toBe(false);

      const second = await listLlmModels("openrouter", {
        apiKey: "test-key-12345678",
        baseUrl: "https://openrouter.ai/api/v1",
      });
      expect(second.ok).toBe(true);
      expect(second.cached).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
      invalidateModelCatalogCache();
    }
  });

  test("requires api key for cloud providers", async () => {
    const result = await listLlmModels("openai", { apiKey: "" }, { skipCache: true });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("API key");
  });
});
