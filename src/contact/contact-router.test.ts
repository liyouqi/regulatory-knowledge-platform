import express from "express";
import { describe, expect, it, vi } from "vitest";
import { createContactRouter } from "./contact-router";

async function requestContact(
  service: Parameters<typeof createContactRouter>[0]["service"],
  method: "GET" | "POST",
  url: string,
  body?: unknown,
) {
  const app = express();
  app.use("/api/contact", createContactRouter({ service }));
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
        method,
        url,
        headers: {},
        body,
        ip: "127.0.0.1",
        get: () => undefined,
        on: () => undefined,
      } as never,
      response as never,
      reject,
    );
  });
}

describe("contact API", () => {
  it("does not disclose the recipient through status or submit responses", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    expect(
      await requestContact({ send }, "GET", "/api/contact/status"),
    ).toEqual({
      status: 200,
      body: { available: true },
    });

    const response = await requestContact(
      { send },
      "POST",
      "/api/contact/submit",
      {
        topic: "data_issue",
        message: "Article heading appears to be missing.",
        replyEmail: "reader@example.com",
        surface: "reader",
        pageUrl: "https://example.test/read/crr/articles/4",
        context: "CRR · Article 4",
        website: "",
      },
    );
    expect(response).toEqual({ status: 202, body: { delivered: true } });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: "data_issue",
        replyEmail: "reader@example.com",
      }),
    );
    expect(info.mock.calls.flat().join(" ")).not.toContain(
      "reader@example.com",
    );
    info.mockRestore();
  });

  it("reports unavailable without exposing configuration details", async () => {
    expect(await requestContact(null, "GET", "/api/contact/status")).toEqual({
      status: 200,
      body: { available: false },
    });
  });
});
