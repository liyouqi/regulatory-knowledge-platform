import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import express from "express";
import { MonitorAiTimeoutError, MonitorAiUnavailableError } from "./monitor-ai";
import type { MonitorAiService } from "./monitor-ai";
import type { MonitorAiMessage, MonitorFeed } from "./monitor-contract";
import { refreshMonitor } from "./monitor-refresh";

const monitorDirectory = resolve(process.cwd(), "data/monitor");

function availableFeeds(): MonitorFeed[] {
  const files = readdirSync(monitorDirectory).filter(
    (name) =>
      name === "default.json" ||
      name === "latest.json" ||
      /^20\d{2}-\d{2}\.json$/.test(name),
  );
  const feeds = files.map(
    (name) =>
      JSON.parse(
        readFileSync(resolve(monitorDirectory, name), "utf8"),
      ) as MonitorFeed,
  );
  const byMonth = new Map<string, MonitorFeed>();
  for (const feed of feeds) {
    const current = byMonth.get(feed.month);
    if (!current || feed.generatedAt > current.generatedAt) {
      byMonth.set(feed.month, feed);
    }
  }
  return [...byMonth.values()].sort((left, right) =>
    right.month.localeCompare(left.month),
  );
}

export function readMonitorFeed(month?: string): MonitorFeed {
  if (month && /^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) {
    const monthly = resolve(monitorDirectory, `${month}.json`);
    if (existsSync(monthly)) {
      return JSON.parse(readFileSync(monthly, "utf8")) as MonitorFeed;
    }
  }
  const fallback = resolve(monitorDirectory, "default.json");
  if (month && existsSync(fallback)) {
    const defaultFeed = JSON.parse(
      readFileSync(fallback, "utf8"),
    ) as MonitorFeed;
    if (defaultFeed.month === month) return defaultFeed;
  }
  const latest = resolve(monitorDirectory, "latest.json");
  const path = existsSync(latest) ? latest : fallback;
  return JSON.parse(readFileSync(path, "utf8")) as MonitorFeed;
}

export function createMonitorRouter(
  options: {
    aiService?: MonitorAiService | null;
  } = {},
) {
  const router = express.Router();

  router.get("/months", (_request, response) => {
    try {
      const feeds = availableFeeds();
      response.json({
        months: [...new Set(feeds.map((feed) => feed.month))].sort().reverse(),
      });
    } catch {
      response.json({ months: [] });
    }
  });

  router.get("/years", (_request, response) => {
    try {
      const currentYear = new Date().toISOString().slice(0, 4);
      response.json({
        years: [
          ...new Set([
            currentYear,
            ...availableFeeds().map((feed) => feed.month.slice(0, 4)),
          ]),
        ]
          .sort()
          .reverse(),
      });
    } catch {
      response.json({ years: [new Date().toISOString().slice(0, 4)] });
    }
  });

  router.get("/timeline", (request, response) => {
    const requestedYear =
      typeof request.query.year === "string" &&
      /^20\d{2}$/.test(request.query.year)
        ? request.query.year
        : new Date().toISOString().slice(0, 4);
    try {
      const feeds = availableFeeds().filter((feed) =>
        feed.month.startsWith(requestedYear),
      );
      const events = [
        ...new Map(
          feeds
            .flatMap((feed) => feed.events)
            .map((event) => [event.id, event]),
        ).values(),
      ].sort((left, right) =>
        right.source.publishedAt.localeCompare(left.source.publishedAt),
      );
      const sourceByName = new Map(
        feeds.flatMap((feed) =>
          feed.sources.map((source) => [source.source, source] as const),
        ),
      );
      response.json({
        schemaVersion: "monitor-timeline@1.0.0",
        year: requestedYear,
        generatedAt:
          feeds
            .map((feed) => feed.generatedAt)
            .sort()
            .at(-1) ?? new Date().toISOString(),
        sources: [...sourceByName.values()].map((source) => ({
          ...source,
          eventCount: events.filter(
            (event) => event.source.authority === source.source,
          ).length,
        })),
        events,
      });
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

    try {
      const feed = await refreshMonitor({ month });
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
    }
  });

  return router;
}
