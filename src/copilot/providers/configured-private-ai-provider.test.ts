import { describe, expect, it } from "vitest";
import { ConfiguredPrivateAiProvider } from "./configured-private-ai-provider";
import type { CopilotAnswerInput } from "./copilot-answer-provider";
import { CopilotProviderResponseError } from "./copilot-answer-provider";

function input(): CopilotAnswerInput {
  return {
    mode: "explain",
    question: "What does this mean?",
    messages: [],
    context: {
      runtime: {
        buildId: "build",
        profileId: "profile",
        profileHash: `sha256:${"a".repeat(64)}`,
      },
      document: {
        id: "document",
        shortName: "Law",
        officialTitle: "Law title",
        sourceUrl: "https://example.test/law",
        sourceSnapshotId: "snapshot",
        sourceVersion: "version",
        asOf: "2026-01-01",
      },
      provision: { id: "article", label: "Article 1", path: "/laws/1" },
      target: { entityId: "paragraph", label: "1" },
      selection: { text: "shall act", textRun: 0, start: 0, end: 9 },
      evidence: [
        {
          entityId: "paragraph",
          textRun: 0,
          label: "1",
          text: "shall act",
          path: "/laws/1#p1",
          sourceUrl: "https://example.test/law",
          sourceLocator: { kind: "xpath", value: "/ARTICLE[1]/PARAG[1]" },
        },
      ],
    },
  };
}

const config = {
  apiKey: "test-secret",
  baseUrl: "https://private.example/v1",
  chatCompletionsUrl: "https://private.example/v1/chat/completions",
  model: "test-model",
  timeoutSeconds: 5,
  authHeader: "Authorization",
  authScheme: "Bearer",
  thinkingMode: "disabled" as const,
};

describe("ConfiguredPrivateAiProvider", () => {
  it("sends bounded context and parses a grounded JSON answer", async () => {
    const calls: Array<[string | URL | Request, RequestInit | undefined]> = [];
    const fetcher: typeof fetch = async (resource, request) => {
      calls.push([resource, request]);
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  status: "answered",
                  answer: "It creates an obligation.",
                  cited_entity_ids: ["paragraph"],
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };
    const result = await new ConfiguredPrivateAiProvider(
      config,
      fetcher,
    ).answer(input());

    expect(result).toEqual({
      status: "answered",
      answer: "It creates an obligation.",
      citedEntityIds: ["paragraph"],
    });
    const call = calls[0];
    expect(call).toBeDefined();
    if (!call) return;
    const [url, request] = call;
    expect(String(url)).toBe(config.chatCompletionsUrl);
    expect(request?.headers).toMatchObject({
      Authorization: "Bearer test-secret",
    });
    const body = JSON.parse(String(request?.body));
    expect(body.thinking).toEqual({ type: "disabled" });
    expect(body.messages[0].content).toContain(
      "make the first sentence a direct plain-language identification or definition",
    );
    expect(body.messages[0].content).toContain(
      "if it is ambiguous, state what it means in the current context",
    );
    expect(body.messages[1].content).toContain("shall act");
    expect(body.messages[1].content).not.toContain("test-secret");
  });

  it("rejects an answered model response without supplied citations", async () => {
    const fetcher: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  status: "answered",
                  answer: "Unsupported",
                  cited_entity_ids: [],
                }),
              },
            },
          ],
        }),
        { status: 200 },
      );
    await expect(
      new ConfiguredPrivateAiProvider(config, fetcher).answer(input()),
    ).rejects.toBeInstanceOf(CopilotProviderResponseError);
  });
});
