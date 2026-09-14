import { describe, expect, it, vi } from "vitest";
import { logUserQuery } from "./user-query-log";

describe("structured user-query logging", () => {
  it("writes one Cloud Logging-compatible JSON line", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    logUserQuery({
      surface: "reader_copilot",
      interaction: "user_question",
      query: "What does this requirement mean?",
      requestId: "request-1",
      metadata: {
        documentId: "document-1",
        provisionId: "article-5",
        absent: undefined,
      },
    });

    expect(info).toHaveBeenCalledOnce();
    const [line] = info.mock.calls[0] ?? [];
    expect(typeof line).toBe("string");
    expect(JSON.parse(String(line))).toEqual({
      severity: "INFO",
      message: "Copilot query received",
      event: "copilot_query",
      documentId: "document-1",
      provisionId: "article-5",
      surface: "reader_copilot",
      interaction: "user_question",
      query: "What does this requirement mean?",
      requestId: "request-1",
    });

    info.mockRestore();
  });
});
