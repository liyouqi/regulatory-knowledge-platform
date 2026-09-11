import { describe, expect, it } from "vitest";
import { loadPrivateAiConfig } from "./private-ai-config";

describe("private AI configuration", () => {
  it("builds the OpenAI-compatible endpoint without exposing the secret", () => {
    const result = loadPrivateAiConfig({
      PRIVATE_AI_API_KEY: "test-secret",
      PRIVATE_AI_BASE_URL: "https://private.example/v1/",
      PRIVATE_AI_MODEL: "test-model",
      PRIVATE_AI_THINKING_MODE: "disabled",
    });

    expect(result.available).toBe(true);
    if (!result.available) return;
    expect(result.config.chatCompletionsUrl).toBe(
      "https://private.example/v1/chat/completions",
    );
    expect(result.config.thinkingMode).toBe("disabled");
    expect(
      JSON.stringify({ ...result.config, apiKey: "[redacted]" }),
    ).not.toContain("test-secret");
  });

  it("reports unavailable for missing or invalid configuration", () => {
    expect(loadPrivateAiConfig({}).available).toBe(false);
    expect(
      loadPrivateAiConfig({
        PRIVATE_AI_API_KEY: "secret",
        PRIVATE_AI_BASE_URL: "file:///tmp/model",
        PRIVATE_AI_MODEL: "model",
      }).available,
    ).toBe(false);
  });
});
