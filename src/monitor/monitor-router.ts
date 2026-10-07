import express from "express";
import { logUserQuery } from "../shared/user-query-log";
import { MonitorAiTimeoutError, MonitorAiUnavailableError } from "./monitor-ai";
import type { MonitorAiService } from "./monitor-ai";
import type { MonitorAiMessage } from "./monitor-contract";
import {
  availableMonitorFeeds,
  readCurrentMonitorTimeline,
  readMonitorFeed,
} from "./monitor-data";
import { refreshMonitor } from "./monitor-refresh";

export function createMonitorRouter(
  options: {
    aiService?: MonitorAiService | null;
    now?: () => Date;
    refresh?: typeof refreshMonitor;
    readFeeds?: typeof availableMonitorFeeds;
  } = {},
) {
  const router = express.Router();
  const now = options.now ?? (() => new Date());
  const runRefresh = options.refresh ?? refreshMonitor;
  const readFeeds = options.readFeeds ?? availableMonitorFeeds;
  let refreshInProgress = false;

  router.get("/months", (_request, response) => {
    try {
      const feeds = availableMonitorFeeds();
      response.json({
        months: [...new Set(feeds.map((feed) => feed.month))].sort().reverse(),
      });
    } catch {
      response.json({ months: [] });
    }
  });

  router.get("/timeline", (_request, response) => {
    try {
      response.json(readCurrentMonitorTimeline());
    } catch {
      response
        .status(503)
        .json({ error: "The Monitor timeline is unavailable." });
    }
  });

  router.get("/feed", (request, response) => {
    try {
      response.json(
        readMonitorFeed(
          typeof request.query.month === "string"
            ? request.query.month
            : undefined,
        ),
      );
    } catch {
      response.status(503).json({ error: "The Monitor feed is unavailable." });
    }
  });

  router.use(express.json({ limit: "24kb", strict: true }));

  router.post("/explain", async (request, response) => {
    const eventId =
      typeof request.body?.eventId === "string"
        ? request.body.eventId.slice(0, 500)
        : "";
    const question =
      typeof request.body?.question === "string"
        ? request.body.question.trim().slice(0, 2_000)
        : "";
    const month =
      typeof request.body?.month === "string" &&
      /^20\d{2}-(0[1-9]|1[0-2])$/.test(request.body.month)
        ? request.body.month
        : undefined;
    const messages = Array.isArray(request.body?.messages)
      ? (request.body.messages as unknown[])
          .slice(-6)
          .flatMap((message): MonitorAiMessage[] => {
            if (
              typeof message === "object" &&
              message !== null &&
              (message as { role?: unknown }).role !== undefined &&
              ((message as { role?: unknown }).role === "user" ||
                (message as { role?: unknown }).role === "assistant") &&
              typeof (message as { text?: unknown }).text === "string"
            ) {
              return [
                {
                  role: (message as MonitorAiMessage).role,
                  text: (message as MonitorAiMessage).text.slice(0, 4_000),
                },
              ];
            }
            return [];
          })
      : [];

    if (!eventId || !question) {
      response.status(400).json({ error: "Event and question are required." });
      return;
    }
    const automaticExplanation =
      messages.length === 0 &&
      question.startsWith("Explain this regulatory update.");
    logUserQuery({
      surface: "monitor_copilot",
      interaction: automaticExplanation ? "automatic_explain" : "user_question",
      query: question,
      metadata: {
        mode: automaticExplanation ? "explain" : "chat",
        eventId,
        month,
      },
    });
    if (!options.aiService) {
      response
        .status(503)
        .json({ error: "Monitor Copilot is not configured." });
      return;
    }
    const event = readMonitorFeed(month).events.find(
      (candidate) => candidate.id === eventId,
    );
    if (!event) {
      response.status(404).json({ error: "Regulatory update not found." });
      return;
    }

    const controller = new AbortController();
    request.on("aborted", () => controller.abort());
    try {
      const answer = await options.aiService.explain(
        event,
        question,
        messages,
        controller.signal,
      );
      response.json({ answer, eventId: event.id, sourceUrl: event.source.url });
    } catch (error) {
      if (error instanceof MonitorAiTimeoutError) {
        response.status(504).json({ error: error.message });
      } else if (error instanceof MonitorAiUnavailableError) {
        response.status(503).json({ error: error.message });
      } else {
        response
          .status(500)
          .json({ error: "Monitor Copilot could not answer." });
      }
    }
  });

  router.post("/refresh", async (request, response) => {
    const token = process.env.MONITOR_REFRESH_TOKEN;
    if (!token || request.get("authorization") !== `Bearer ${token}`) {
      response
        .status(401)
        .json({ error: "Monitor refresh is not authorised." });
      return;
    }

    const requestedMonth =
      typeof request.query.month === "string" ? request.query.month : undefined;
    const month = requestedMonth ?? new Date().toISOString().slice(0, 7);

    if (refreshInProgress) {
      response.status(409).json({
        code: "refresh_in_progress",
        error: "A Monitor refresh is already in progress.",
      });
      return;
    }

    try {
      refreshInProgress = true;
      const feed = await runRefresh({ month });
      response.json({
        month: feed.month,
        generatedAt: feed.generatedAt,
        eventCount: feed.events.length,
        sources: feed.sources,
      });
    } catch (error) {
      response.status(500).json({
        error:
          error instanceof Error ? error.message : "Monitor refresh failed.",
      });
    } finally {
      refreshInProgress = false;
    }
  });

  router.post("/refresh-today", async (_request, response) => {
    const currentTime = now();
    const month = currentTime.toISOString().slice(0, 7);
    const today = currentTime.toISOString().slice(0, 10);
    const existing = readFeeds().find((feed) => feed.month === month);

    if (existing?.generatedAt.slice(0, 10) === today) {
      response.status(409).json({
        code: "already_refreshed_today",
        error: "Monitor has already been refreshed today.",
        month,
        generatedAt: existing.generatedAt,
        eventCount: existing.events.length,
      });
      return;
    }
    if (refreshInProgress) {
      response.status(409).json({
        code: "refresh_in_progress",
        error: "A Monitor refresh is already in progress.",
      });
      return;
    }

    try {
      refreshInProgress = true;
      const feed = await runRefresh({ month });
      response.json({
        month: feed.month,
        generatedAt: feed.generatedAt,
        eventCount: feed.events.length,
        sources: feed.sources,
      });
    } catch (error) {
      response.status(500).json({
        error:
          error instanceof Error ? error.message : "Monitor refresh failed.",
      });
    } finally {
      refreshInProgress = false;
    }
  });

  return router;
}
