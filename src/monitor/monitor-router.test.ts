import express from "express";
import { describe, expect, it, vi } from "vitest";
import { createMonitorRouter } from "./monitor-router";

async function postExplain(body: unknown) {
  const app = express();
  app.use("/api/monitor", createMonitorRouter({ aiService: null }));
  return new Promise<{ status: number; body: unknown }>((resolve, reject) => {
    const response = {
      statusCode: 200,
      setHeader: () => undefined,
      status(status: number) {
        this.statusCode = status;
        return this;
      },
      json(value: unknown) {
        resolve({ status: this.statusCode, body: value });
      },
    };
    (app as unknown as { handle: (...arguments_: unknown[]) => void }).handle(
      {
        method: "POST",
        url: "/api/monitor/explain",
        headers: {},
        body,
        on: () => undefined,
      } as never,
      response as never,
      reject,
    );
  });
}

describe("Monitor API router", () => {
  it("logs a validated Monitor question with its event context", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const response = await postExplain({
      eventId: "monitor:eur-lex:32026R2041",
      month: "2026-09",
      question: "Which teams should review this update?",
      messages: [{ role: "assistant", text: "Initial explanation" }],
    });

    expect(response.status).toBe(503);
    expect(JSON.parse(String(info.mock.calls[0]?.[0]))).toMatchObject({
      event: "copilot_query",
      surface: "monitor_copilot",
      interaction: "user_question",
      mode: "chat",
      eventId: "monitor:eur-lex:32026R2041",
      month: "2026-09",
      query: "Which teams should review this update?",
    });
    info.mockRestore();
  });
});
