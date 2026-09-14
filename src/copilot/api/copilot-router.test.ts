import express from "express";
import { describe, expect, it, vi } from "vitest";
import type { CopilotService } from "../service/copilot-service";
import { createCopilotRouter } from "./copilot-router";

async function appRequest(
  service: CopilotService | null,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
) {
  const app = express();
  app.use("/api/copilot", createCopilotRouter({ service }));
  return new Promise<{
    status: number;
    body: unknown;
    headers: Record<string, string>;
  }>((resolve, reject) => {
    const headers: Record<string, string> = {};
    const response = {
      statusCode: 200,
      writableEnded: false,
      setHeader(name: string, value: string) {
        headers[name.toLowerCase()] = value;
      },
      status(status: number) {
        this.statusCode = status;
        return this;
      },
      json(value: unknown) {
        this.writableEnded = true;
        resolve({ status: this.statusCode, body: value, headers });
      },
      on: () => undefined,
    };
    (app as unknown as { handle: (...arguments_: unknown[]) => void }).handle(
      {
        method,
        url: path,
        headers: {},
        body,
        on: () => undefined,
      } as never,
      response as never,
      reject,
    );
  });
}

describe("Copilot API router", () => {
  it("reports provider capability without exposing configuration", async () => {
    const response = await appRequest(null, "GET", "/api/copilot/status");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      schemaVersion: "0.1.0",
      status: "unavailable",
      capabilities: {
        contextAnswer: false,
        currentDocumentRetrieval: false,
        corpusRetrieval: false,
        serverConversationMemory: false,
      },
    });
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("rejects invalid bodies before provider invocation", async () => {
    const service = {
      respond: async () => {
        throw new Error("must not be called");
      },
    } as unknown as CopilotService;
    const response = await appRequest(service, "POST", "/api/copilot/respond", {
      requestId: "bad",
    });
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      requestId: "bad",
      error: { code: "invalid_request" },
    });
  });

  it("logs a validated Reader question with its stable context", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const response = await appRequest(null, "POST", "/api/copilot/respond", {
      schemaVersion: "0.1.0",
      requestId: "reader-request",
      mode: "chat",
      context: {
        documentId: "document-1",
        provisionId: "article-5",
      },
      messages: [],
      question: "Does this apply to payment institutions?",
    });

    expect(response.status).toBe(503);
    expect(JSON.parse(String(info.mock.calls[0]?.[0]))).toMatchObject({
      event: "copilot_query",
      surface: "reader_copilot",
      interaction: "user_question",
      requestId: "reader-request",
      documentId: "document-1",
      provisionId: "article-5",
      query: "Does this apply to payment institutions?",
    });
    info.mockRestore();
  });
});
