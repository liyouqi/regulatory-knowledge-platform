import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import type {
  MonitorEvent,
  MonitorFeed,
  MonitorTimeline,
} from "./monitor-contract";

const monitorDirectory = resolve(process.cwd(), "data/monitor");

export type MonitorUpdateQuery = {
  month?: string;
  source?: string;
  topic?: string;
  query?: string;
  limit?: number;
};

export function availableMonitorFeeds(): MonitorFeed[] {
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

export function readCurrentMonitorTimeline(): MonitorTimeline {
  const year = new Date().toISOString().slice(0, 4);
  const feeds = availableMonitorFeeds().filter((feed) =>
    feed.month.startsWith(year),
  );
  const events = [
    ...new Map(
      feeds
        .flatMap((feed) => feed.events)
        .map((event) => [event.id, event] as const),
    ).values(),
  ].sort((left, right) =>
    right.source.publishedAt.localeCompare(left.source.publishedAt),
  );
  const sourceByName = new Map(
    feeds.flatMap((feed) =>
      feed.sources.map((source) => [source.source, source] as const),
    ),
  );
  return {
    schemaVersion: "monitor-timeline@1.0.0",
    year,
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
  };
}

export function queryMonitorUpdates(filters: MonitorUpdateQuery = {}) {
  const timeline = readCurrentMonitorTimeline();
  const needle = filters.query?.trim().toLowerCase();
  const matches = timeline.events.filter(
    (event) =>
      (!filters.month || event.source.publishedAt.startsWith(filters.month)) &&
      (!filters.source || event.source.authority === filters.source) &&
      (!filters.topic || event.classification.topic === filters.topic) &&
      (!needle ||
        [
          event.source.title,
          event.analysis.summary,
          ...event.analysis.keyPoints,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(needle)),
  );
  return {
    year: timeline.year,
    generatedAt: timeline.generatedAt,
    matchedCount: matches.length,
    updates: matches.slice(0, filters.limit ?? 20),
  };
}

export function findMonitorUpdate(eventId: string): MonitorEvent | undefined {
  return readCurrentMonitorTimeline().events.find(
    (event) => event.id === eventId,
  );
}
