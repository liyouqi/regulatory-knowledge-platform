import { mkdir, readFile, writeFile } from "node:fs/promises";
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
  publicationType?: string;
  key: string;
};

type SourceAdapter = {
  source: MonitorSource;
  url: string;
  collect(since: string): Promise<FeedItem[]>;
};

type SourceCollection = {
  adapter: SourceAdapter;
  items: FeedItem[];
  error?: string;
};

type RefreshOptions = {
  outputDirectory?: string;
  onProgress?: (message: string) => void;
};

const EUR_LEX_RSS = "https://eur-lex.europa.eu/EN/display-feed.rss?rssId=162";
const CSSF_PUBLICATIONS = "https://www.cssf.lu/en/publication-data/";
const EBA_PRESS_RELEASES =
  "https://www.eba.europa.eu/publications-and-media/press-releases";

function decode(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/&#x([\da-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
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

function isRelevantEurLex(item: FeedItem): boolean {
  const title = item.title.toLowerCase();
  if (/^celex:[^:]+$/i.test(item.title)) return false;
  if (/closure of the accounts|discharge in respect of.*budget/.test(title))
    return false;
  return /bank|credit institution|investment firm|financial service|financial market|insurance|payment service|electronic money|crypto.asset|securit|investment fund|money laundering|terrorist financing|capital requirement|prudential|market abuse|prospectus|deposit guarantee|resolution|covered bond|operational resilience|sustainability disclosure|accounting standard|audit/.test(
    title,
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
  return [
    ...html.matchAll(
      /<article class="teaser-columns"[^>]*>([\s\S]*?)<\/article>/gi,
    ),
  ].flatMap(([, block]) => {
    const link = block.match(
      /class="[^"]*teaser-columns__title[^"]*"[^>]*>[\s\S]*?<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i,
    );
    const dateMatch = block.match(
      /\b(\d{1,2}\s+(?:JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s+20\d{2})\b/i,
    );
    const publishedAt = dateMatch ? dateOnly(dateMatch[1]) : undefined;
    if (!link || !publishedAt) return [];
    const url = new URL(link[1], EBA_PRESS_RELEASES).toString();
    const title = decode(link[2]);
    const summary = block.match(
      /class="[^"]*teaser-columns__text[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    );
    return [
      {
        title,
        url,
        publishedAt,
        ...(summary ? { summary: decode(summary[1]) } : {}),
        key: url,
      },
    ];
  });
}

function cssfListingItems(html: string): FeedItem[] {
  return html
    .split(/<li class="library-element">/i)
    .slice(1)
    .flatMap((block) => {
      const type = block.match(
        /class="library-element__type"[^>]*>([\s\S]*?)<\/p>/i,
      );
      const publicationType = type ? decode(type[1]) : "";
      const link = block.match(
        /class="library-element__title"[^>]*>\s*<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i,
      );
      const date = block.match(/Published on\s+(\d{2})\.(\d{2})\.(20\d{2})/i);
      if (!link || !date) return [];
      const url = new URL(link[1], CSSF_PUBLICATIONS).toString();
      const summary = block.match(
        /class="library-element__subtitle"[^>]*>([\s\S]*?)<\/div>/i,
      );
      return [
        {
          title: decode(link[2]),
          url,
          publishedAt: `${date[3]}-${date[2]}-${date[1]}`,
          ...(publicationType ? { publicationType } : {}),
          ...(summary && decode(summary[1])
            ? { summary: decode(summary[1]) }
            : {}),
          key: url,
        },
      ];
    });
}

async function collectArchive(
  since: string,
  pageUrl: (page: number) => string,
  parse: (html: string) => FeedItem[],
): Promise<FeedItem[]> {
  const collected: FeedItem[] = [];
  for (let start = 0; start < 40; start += 4) {
    const pages = await Promise.all(
      [start, start + 1, start + 2, start + 3].map(async (page) =>
        parse(await fetchText(pageUrl(page))),
      ),
    );
    const batch = pages.flat();
    collected.push(...batch);
    if (batch.length === 0 || batch.some((item) => item.publishedAt < since)) {
      break;
    }
  }
  return [
    ...new Map(collected.map((item) => [item.key, item] as const)).values(),
  ];
}

const adapters: SourceAdapter[] = [
  {
    source: "EUR-Lex",
    url: EUR_LEX_RSS,
    async collect() {
      return rssItems(await fetchText(EUR_LEX_RSS)).filter(isRelevantEurLex);
    },
  },
  {
    source: "CSSF",
    url: CSSF_PUBLICATIONS,
    async collect(since) {
      const items = await collectArchive(
        since,
        (page) =>
          page === 0
            ? CSSF_PUBLICATIONS
            : `${CSSF_PUBLICATIONS}page/${page + 1}/`,
        cssfListingItems,
      );
      return items.filter(
        (item) =>
          !/^(warning|list|statistics|agenda|newsletter|form|internal organisation)$/i.test(
            item.publicationType ?? "",
          ),
      );
    },
  },
  {
    source: "EBA",
    url: EBA_PRESS_RELEASES,
    async collect(since) {
      return collectArchive(
        since,
        (page) =>
          page === 0
            ? EBA_PRESS_RELEASES
            : `${EBA_PRESS_RELEASES}?page=${page}`,
        ebaListingItems,
      );
    },
  },
];

async function collectSources(
  since: string,
  onProgress?: (message: string) => void,
): Promise<SourceCollection[]> {
  return Promise.all(
    adapters.map(async (adapter) => {
      try {
        const items = await adapter.collect(since);
        onProgress?.(
          `${adapter.source}: collected ${items.length} listing items`,
        );
        return { adapter, items };
      } catch (error) {
        onProgress?.(`${adapter.source}: source request failed`);
        return {
          adapter,
          items: [],
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );
}

function classification(source: MonitorSource, title: string) {
  const text = title.toLowerCase();
  const topic = /dora|ict|cyber|digital|operational resilience/.test(text)
    ? "ICT & operational resilience"
    : /money laundering|aml|financial crime/.test(text)
      ? "AML & financial crime"
      : /capital|prudential|crr|crd/.test(text)
        ? "Prudential & capital"
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

async function buildMonitorFeed(
  options: RefreshOptions & { month: string },
  results: SourceCollection[],
): Promise<MonitorFeed> {
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
  options.onProgress?.(
    `${options.month}: ${candidates.length} events queued for enrichment`,
  );
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
        } catch (error) {
          failed += 1;
          options.onProgress?.(
            `${options.month}: kept basic event ${event.source.title.slice(0, 80)} (${error instanceof Error ? error.message : "enrichment failed"})`,
          );
          return event;
        }
      }),
    );
    events.push(...enriched);
    options.onProgress?.(
      `${options.month}: processed ${Math.min(index + batch.length, candidates.length)} of ${candidates.length}`,
    );
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
  const latestPath = resolve(outputDirectory, "latest.json");
  const currentLatestMonth = await readFile(latestPath, "utf8")
    .then((content) => (JSON.parse(content) as MonitorFeed).month)
    .catch(() => "");
  await Promise.all([
    writeFile(resolve(outputDirectory, `${options.month}.json`), body),
    ...(options.month >= currentLatestMonth
      ? [writeFile(latestPath, body)]
      : []),
  ]);
  return feed;
}

export async function refreshMonitor(options: {
  month: string;
  outputDirectory?: string;
  onProgress?: (message: string) => void;
}): Promise<MonitorFeed> {
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(options.month)) {
    throw new Error("--month must use YYYY-MM");
  }
  return buildMonitorFeed(
    options,
    await collectSources(options.month, options.onProgress),
  );
}

export async function refreshMonitorYear(options: {
  year: string;
  outputDirectory?: string;
  onProgress?: (message: string) => void;
}): Promise<MonitorFeed[]> {
  if (!/^20\d{2}$/.test(options.year)) {
    throw new Error("--year must use YYYY");
  }
  const results = await collectSources(
    `${options.year}-01`,
    options.onProgress,
  );
  const months = [
    ...new Set(
      results.flatMap((result) =>
        result.items
          .filter((item) => item.publishedAt.startsWith(options.year))
          .map((item) => item.publishedAt.slice(0, 7)),
      ),
    ),
  ].sort();
  options.onProgress?.(
    `${options.year}: found events in ${months.length} months (${months.join(", ") || "none"})`,
  );
  const feeds: MonitorFeed[] = [];
  for (const month of months) {
    feeds.push(
      await buildMonitorFeed(
        {
          month,
          outputDirectory: options.outputDirectory,
          onProgress: options.onProgress,
        },
        results,
      ),
    );
  }
  return feeds;
}
