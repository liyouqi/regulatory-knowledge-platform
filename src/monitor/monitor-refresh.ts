import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadPrivateAiConfig } from "../copilot/providers/private-ai-config";
import type {
  MonitorEvent,
  MonitorFeed,
  MonitorSource,
  MonitorSourceStatus,
} from "./monitor-contract";
import { MonitorEnrichmentService } from "./monitor-enrichment";

type FeedItem = {
  title: string;
  url: string;
  publishedAt: string;
  summary?: string;
  key: string;
};

type SourceAdapter = {
  source: MonitorSource;
  url: string;
  collect(): Promise<FeedItem[]>;
};

const EUR_LEX_RSS = "https://eur-lex.europa.eu/EN/display-feed.rss?rssId=162";
const CSSF_RSS = "https://www.cssf.lu/en/feed/publications";
const EBA_PRESS_RELEASES =
  "https://www.eba.europa.eu/publications-and-media/press-releases";

function decode(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function publicationText(html: string): string {
  const withoutNoise = html
    .replace(/<(script|style|svg|noscript)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(nav|header|footer)[^>]*>[\s\S]*?<\/\1>/gi, " ");
  const main = withoutNoise.match(/<main[^>]*>([\s\S]*?)<\/main>/i)?.[1];
  const article = withoutNoise.match(
    /<article[^>]*>([\s\S]*?)<\/article>/i,
  )?.[1];
  return decode(main ?? article ?? withoutNoise).slice(0, 24_000);
}

function tag(block: string, name: string): string | undefined {
  const match = block.match(
    new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"),
  );
  return match ? decode(match[1]) : undefined;
}

function dateOnly(value: string): string | undefined {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? undefined
    : date.toISOString().slice(0, 10);
}

function rssItems(xml: string): FeedItem[] {
  return [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].flatMap(
    ([, block]) => {
      const title = tag(block, "title");
      const url = tag(block, "link");
      const publishedAt = dateOnly(
        tag(block, "pubDate") ?? tag(block, "dc:date") ?? "",
      );
      if (!title || !url || !publishedAt) return [];
      const summary = tag(block, "description");
      const key = tag(block, "guid") ?? url;
      return [
        { title, url, publishedAt, ...(summary ? { summary } : {}), key },
      ];
    },
  );
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "user-agent": "Regulatory-Monitor/0.1 (+local refresh)" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

function ebaListingItems(html: string): FeedItem[] {
  const items: FeedItem[] = [];
  const pattern = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(pattern)) {
    const url = new URL(match[1], EBA_PRESS_RELEASES).toString();
    const title = decode(match[2]);
    if (!title || !url.includes("eba.europa.eu/") || title.length < 12)
      continue;
    const nearby = html.slice(
      Math.max(0, match.index - 500),
      match.index + 800,
    );
    const dateMatch = nearby.match(
      /\b(\d{1,2}\s+(?:JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s+20\d{2})\b/i,
    );
    const publishedAt = dateMatch ? dateOnly(dateMatch[1]) : undefined;
    if (!publishedAt) continue;
    items.push({ title, url, publishedAt, key: url });
  }
  return items;
}

const adapters: SourceAdapter[] = [
  {
    source: "EUR-Lex",
    url: EUR_LEX_RSS,
    async collect() {
      return rssItems(await fetchText(EUR_LEX_RSS));
    },
  },
  {
    source: "CSSF",
    url: CSSF_RSS,
    async collect() {
      return rssItems(await fetchText(CSSF_RSS));
    },
  },
  {
    source: "EBA",
    url: EBA_PRESS_RELEASES,
    async collect() {
      return ebaListingItems(await fetchText(EBA_PRESS_RELEASES));
    },
  },
];

function classification(source: MonitorSource, title: string) {
  const text = title.toLowerCase();
  const topic = /dora|ict|cyber|digital|operational resilience/.test(text)
    ? "ICT & operational resilience"
    : /money laundering|aml|financial crime/.test(text)
      ? "AML & financial crime"
      : /capital|prudential|crr|crd/.test(text)
        ? "Prudential requirements"
        : "Regulatory update";
  const affectedEntities =
    source === "CSSF"
      ? ["Luxembourg financial sector"]
      : source === "EBA"
        ? ["EU credit institutions"]
        : ["EU financial services firms"];
  return {
    topic,
    affectedEntities,
    potentiallyAffectedFunctions: ["Compliance"],
  };
}

function toEvent(source: MonitorSource, item: FeedItem): MonitorEvent {
  return {
    id: `monitor:${source.toLowerCase().replace(/[^a-z]/g, "-")}:${encodeURIComponent(item.key)}`,
    source: {
      authority: source,
      title: item.title,
      url: item.url,
      publishedAt: item.publishedAt,
    },
    classification: {
      topic: classification(source, item.title).topic,
      eventType: "Publication",
      affectedEntities: classification(source, item.title).affectedEntities,
    },
    analysis: {
      ...(item.summary ? { summary: item.summary.slice(0, 800) } : {}),
      keyPoints: [],
      potentiallyAffectedFunctions: classification(source, item.title)
        .potentiallyAffectedFunctions,
    },
  };
}

export async function refreshMonitor(options: {
  month: string;
  outputDirectory?: string;
}): Promise<MonitorFeed> {
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(options.month)) {
    throw new Error("--month must use YYYY-MM");
  }

  const results = await Promise.all(
    adapters.map(async (adapter) => {
      try {
        const items = await adapter.collect();
        return { adapter, items };
      } catch (error) {
        return {
          adapter,
          items: [] as FeedItem[],
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );

  const sources: MonitorSourceStatus[] = results.map((result) => ({
    source: result.adapter.source,
    url: result.adapter.url,
    eventCount: result.items.filter((item) =>
      item.publishedAt.startsWith(options.month),
    ).length,
    ...("error" in result ? { error: result.error } : {}),
  }));
  const eventById = new Map<string, { event: MonitorEvent; item: FeedItem }>();
  for (const result of results) {
    for (const item of result.items) {
      if (item.publishedAt.startsWith(options.month)) {
        const event = toEvent(result.adapter.source, item);
        eventById.set(event.id, { event, item });
      }
    }
  }
  const aiConfig = loadPrivateAiConfig();
  const enrichmentService = aiConfig.available
    ? new MonitorEnrichmentService(aiConfig.config)
    : null;
  const candidates = [...eventById.values()];
  let completed = 0;
  let failed = 0;
  const events: MonitorEvent[] = [];

  for (let index = 0; index < candidates.length; index += 3) {
    const batch = candidates.slice(index, index + 3);
    const enriched = await Promise.all(
      batch.map(async ({ event, item }) => {
        if (!enrichmentService) return event;
        try {
          const sourceText = publicationText(await fetchText(item.url));
          const result = await enrichmentService.enrich(event, sourceText);
          completed += 1;
          return result;
        } catch {
          failed += 1;
          return event;
        }
      }),
    );
    events.push(...enriched);
  }

  const feed: MonitorFeed = {
    schemaVersion: "monitor-feed@1.0.0",
    month: options.month,
    generatedAt: new Date().toISOString(),
    enrichment: {
      mode: enrichmentService ? "configured-ai" : "basic",
      completed,
      failed,
    },
    sources,
    events: events.sort((a, b) =>
      b.source.publishedAt.localeCompare(a.source.publishedAt),
    ),
  };
  const outputDirectory =
    options.outputDirectory ?? resolve(process.cwd(), "data/monitor");
  await mkdir(outputDirectory, { recursive: true });
  const body = `${JSON.stringify(feed, null, 2)}\n`;
  await Promise.all([
    writeFile(resolve(outputDirectory, `${options.month}.json`), body),
    writeFile(resolve(outputDirectory, "latest.json"), body),
  ]);
  return feed;
}
