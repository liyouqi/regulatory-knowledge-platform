import express from "express";
import { describe, expect, it, vi } from "vitest";
import { createMonitorRouter } from "./monitor-router";

type MonitorRouterOptions = Parameters<typeof createMonitorRouter>[0];

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

async function postRefreshToday(options: MonitorRouterOptions) {
  const app = express();
  app.use("/api/monitor", createMonitorRouter(options));
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
        url: "/api/monitor/refresh-today",
        headers: {},
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

  it("allows one current-month page refresh per UTC day", async () => {
    const refresh = vi.fn().mockResolvedValue({
      schemaVersion: "monitor-feed@1.0.0",
      month: "2026-10",
      generatedAt: "2026-10-07T12:00:00.000Z",
      sources: [],
      events: [],
    });
    const response = await postRefreshToday({
      now: () => new Date("2026-10-07T12:00:00.000Z"),
      readFeeds: () => [
        {
          schemaVersion: "monitor-feed@1.0.0",
          month: "2026-10",
          generatedAt: "2026-10-06T12:00:00.000Z",
          sources: [],
          events: [],
        },
      ],
      refresh,
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      month: "2026-10",
      generatedAt: "2026-10-07T12:00:00.000Z",
    });
    expect(refresh).toHaveBeenCalledWith({ month: "2026-10" });
  });

  it("rejects a second page refresh on the same UTC day", async () => {
    const refresh = vi.fn();
    const response = await postRefreshToday({
      now: () => new Date("2026-10-07T18:00:00.000Z"),
      readFeeds: () => [
        {
          schemaVersion: "monitor-feed@1.0.0",
          month: "2026-10",
          generatedAt: "2026-10-07T08:00:00.000Z",
          sources: [],
          events: [],
        },
      ],
      refresh,
    });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      code: "already_refreshed_today",
      month: "2026-10",
    });
    expect(refresh).not.toHaveBeenCalled();
  });
});
