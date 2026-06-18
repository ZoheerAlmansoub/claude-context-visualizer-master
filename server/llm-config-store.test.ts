import { describe, expect, test } from "bun:test";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { CACHE_DIR } from "./paths.ts";

describe("llm-config-store", () => {
  test("update persists and applies without restart", async () => {
    const settingsPath = join(CACHE_DIR, "llm-settings.json");
    if (existsSync(settingsPath)) unlinkSync(settingsPath);

    const store = await import("./llm-config-store.ts");
    const view = store.updateLlmSettings({
      defaultProvider: "nvidia",
      nvidiaApiKey: "test-key-12345678",
      nvidiaTextModel: "nvidia/test-model",
    });

    expect(view.defaultProvider).toBe("nvidia");
    expect(view.providers.find((p) => p.id === "nvidia")?.configured).toBe(true);

    const legacy = store.getLlmConfigLegacy();
    expect(legacy.nvidiaApiKey).toBe("test-key-12345678");
    expect(legacy.defaultProvider).toBe("nvidia");

    if (existsSync(settingsPath)) unlinkSync(settingsPath);
  });
});
