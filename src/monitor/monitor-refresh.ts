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
import {
  EUR_LEX_CELLAR_SPARQL,
  collectEurLexCellarBackfill,
} from "./sources/eurlex-cellar";

type FeedItem = {
  title: string;
  url: string;
  publishedAt: string;
  summary?: string;
  publicationType?: string;
  reference?: string;
  sourceText?: string;
  authority?: MonitorSource;
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
const ESMA_PRESS_RELEASES =
  "https://www.esma.europa.eu/press-news/press-releases";
const ESMA_CONSULTATIONS =
  "https://www.esma.europa.eu/cs/press-news/consultations";
const EIOPA_NEWS = "https://www.eiopa.europa.eu/media/news_en";
const AMLA_SITEMAP = "https://www.amla.europa.eu/sitemap.xml";
const EC_FINANCE_NEWS = "https://finance.ec.europa.eu/news_en";

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
  return /bank|credit institution|investment firm|financial service|financial market|insurance|reinsurance|pension|payment service|electronic money|crypto.asset|securities|securitisation|investment fund|money laundering|terrorist financing|capital requirement|own funds|prudential|market abuse|prospectus|deposit guarantee|bank resolution|covered bond|operational resilience|sustainability disclosure|accounting standard|statutory audit|2022\/2554|2023\/1114|575\/2013|2013\/36|2014\/65|600\/2014|648\/2012|2015\/2366|2009\/138|2011\/61|2009\/65|2024\/1620|2024\/1624/.test(
    title,
  );
}

function isAdministrativeNoise(title: string): boolean {
  return /\bappoints?\b|\belects?\b|term of office|board of appeal|candidate.*(?:chair|board)|vacanc|job opportunit|proposal to appoint/i.test(
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
        ...(jointAuthority(title) ? { authority: "ESAs" as const } : {}),
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

function jointAuthority(title: string): MonitorSource | undefined {
  return /\bESAs\b|European Supervisory Authorities|EBA, EIOPA and ESMA/i.test(
    title,
  )
    ? "ESAs"
    : undefined;
}

function esmaPressItems(html: string): FeedItem[] {
  return [...html.matchAll(/<tr(?:\s[^>]*)?>([\s\S]*?)<\/tr>/gi)].flatMap(
    ([, block]) => {
      const date = block.match(/<time[^>]+datetime="([^"]+)"/i);
      const link = block.match(
        /headers="view-title-table-column"[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i,
      );
      const publishedAt = date ? dateOnly(date[1]) : undefined;
      if (!link || !publishedAt) return [];
      const title = decode(link[2]);
      const url = new URL(link[1], ESMA_PRESS_RELEASES).toString();
      return [
        {
          title,
          url,
          publishedAt,
          publicationType: "Press release",
          ...(jointAuthority(title) ? { authority: "ESAs" as const } : {}),
          key: url,
        },
      ];
    },
  );
}

function esmaConsultationItems(html: string): FeedItem[] {
  return [...html.matchAll(/<tr(?:\s[^>]*)?>([\s\S]*?)<\/tr>/gi)].flatMap(
    ([, block]) => {
      const date = block.match(
        /headers="view-field-consultation-date-1-table-column"[^>]*>\s*From\s+(\d{2})\/(\d{2})\/(20\d{2})/i,
      );
      const link = block.match(
        /headers="view-title-table-column"[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i,
      );
      if (!date || !link) return [];
      const title = decode(link[2]);
      const url = new URL(link[1], ESMA_CONSULTATIONS).toString();
      return [
        {
          title,
          url,
          publishedAt: `${date[3]}-${date[2]}-${date[1]}`,
          publicationType: "Consultation",
          ...(jointAuthority(title) ? { authority: "ESAs" as const } : {}),
          key: url,
        },
      ];
    },
  );
}

function eclNewsItems(html: string, baseUrl: string): FeedItem[] {
  return [
    ...html.matchAll(/<article(?:\s[^>]*)?>([\s\S]*?)<\/article>/gi),
  ].flatMap(([, block]) => {
    const date = block.match(/<time[^>]+datetime="([^"]+)"/i);
    const link = block.match(
      /class="ecl-content-block__title"[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*data-ecl-title-link[^>]*>([\s\S]*?)<\/a>/i,
    );
    const publishedAt = date ? dateOnly(date[1]) : undefined;
    if (!link || !publishedAt) return [];
    const title = decode(link[2]);
    if (
      /\bappoints?\b|\belects?\b|term of office|board of appeal|vacanc|job opportunit/i.test(
        title,
      )
    ) {
      return [];
    }
    const url = new URL(link[1], baseUrl).toString();
    return [
      {
        title,
        url,
        publishedAt,
        ...(jointAuthority(title) ? { authority: "ESAs" as const } : {}),
        key: url,
      },
    ];
  });
}

async function amlaItems(since: string): Promise<FeedItem[]> {
  const sitemap = await fetchText(AMLA_SITEMAP);
  const candidates = [
    ...sitemap.matchAll(
      /<url><loc>([^<]+)<\/loc><lastmod>([^<]+)<\/lastmod>/gi,
    ),
  ]
    .map(([, url, modified]) => ({
      url: decode(url),
      publishedAt: dateOnly(modified),
    }))
    .filter(
      (item): item is { url: string; publishedAt: string } =>
        Boolean(item.publishedAt && item.publishedAt >= since) &&
        /\/policy\/public-consultations\/|\/press-release-|\/amla-(?:consult|launch|take|final|introduc)|\/news-media\/news-articles\/(?:updated-taxonomy|amla-launches-survey)/i.test(
          item.url,
        ),
    );
  const items = await Promise.all(
    candidates.map(async (candidate): Promise<FeedItem | null> => {
      const html = await fetchText(candidate.url);
      const titleMatch = html.match(
        /<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i,
      );
      if (!titleMatch) return null;
      const pageDate = html.match(/<time[^>]+datetime="([^"]+)"/i);
      const description = html.match(
        /<meta[^>]+name="description"[^>]+content="([^"]+)"/i,
      );
      return {
        title: decode(titleMatch[1]),
        url: candidate.url,
        publishedAt: pageDate
          ? (dateOnly(pageDate[1]) ?? candidate.publishedAt)
          : candidate.publishedAt,
        ...(description ? { summary: decode(description[1]) } : {}),
        publicationType: candidate.url.includes("/public-consultations/")
          ? "Consultation"
          : "Publication",
        sourceText: publicationText(html),
        key: candidate.url,
      };
    }),
  );
  return items.filter((item): item is FeedItem => item !== null);
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
    url: EUR_LEX_CELLAR_SPARQL,
    async collect(since) {
      const backfill = await collectEurLexCellarBackfill(since);
      const latest = await fetchText(EUR_LEX_RSS)
        .then((xml) => rssItems(xml).filter(isRelevantEurLex))
        .catch(() => []);
      return [
        ...new Map(
          [...backfill, ...latest].map((item) => [item.key, item] as const),
        ).values(),
      ];
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
          ) &&
          !/administrative sanction|proposal to appoint|\bappointment\b|basic statistical data|global situation of|population concerned by the enforcement|investment policy of UCIs|origin of UCI initiators|breakdown according to currency|development of net assets and number of UCIs|list of fund units|issuers of securities whose home Member State|dissolution and judicial liquidation/i.test(
            item.title,
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
  {
    source: "ESMA",
    url: ESMA_PRESS_RELEASES,
    async collect(since) {
      const [pressReleases, consultations] = await Promise.all([
        collectArchive(
          since,
          (page) =>
            page === 0
              ? ESMA_PRESS_RELEASES
              : `${ESMA_PRESS_RELEASES}?page=${page}`,
          esmaPressItems,
        ),
        collectArchive(
          since,
          (page) =>
            page === 0
              ? ESMA_CONSULTATIONS
              : `${ESMA_CONSULTATIONS}?page=${page}`,
          esmaConsultationItems,
        ),
      ]);
      return [
        ...new Map(
          [...pressReleases, ...consultations].map((item) => [item.key, item]),
        ).values(),
      ];
    },
  },
  {
    source: "EIOPA",
    url: EIOPA_NEWS,
    async collect(since) {
      return collectArchive(
        since,
        (page) => (page === 0 ? EIOPA_NEWS : `${EIOPA_NEWS}?page=${page}`),
        (html) => eclNewsItems(html, EIOPA_NEWS),
      );
    },
  },
  {
    source: "AMLA",
    url: AMLA_SITEMAP,
    collect: amlaItems,
  },
  {
    source: "European Commission",
    url: EC_FINANCE_NEWS,
    async collect(since) {
      return collectArchive(
        since,
        (page) =>
          page === 0 ? EC_FINANCE_NEWS : `${EC_FINANCE_NEWS}?page=${page}`,
        (html) => eclNewsItems(html, EC_FINANCE_NEWS),
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
        const items = (await adapter.collect(since)).filter(
          (item) => !isAdministrativeNoise(item.title),
        );
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
      ...(item.reference ? { reference: item.reference } : {}),
    },
    classification: {
      topic: classification(source, item.title).topic,
      eventType: item.publicationType ?? "Publication",
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
  const outputDirectory =
    options.outputDirectory ?? resolve(process.cwd(), "data/monitor");
  const existingFeed = await readFile(
    resolve(outputDirectory, `${options.month}.json`),
    "utf8",
  )
    .then((content) => JSON.parse(content) as MonitorFeed)
    .catch(() => null);
  const existingById = new Map(
    (existingFeed?.events ?? [])
      .filter(
        (event) =>
          event.analysis.summary && event.analysis.keyPoints.length > 0,
      )
      .map((event) => [event.id, event] as const),
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
        const event = toEvent(item.authority ?? result.adapter.source, item);
        const normalisedTitle = event.source.title
          .toLowerCase()
          .replace(/\W+/g, " ")
          .trim();
        const identity =
          event.source.authority === "ESAs"
            ? `ESAs:${normalisedTitle}`
            : `${event.source.authority}:${event.source.publishedAt}:${normalisedTitle}`;
        eventById.set(identity, { event, item });
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
  const reusableCount = candidates.filter(({ event }) =>
    existingById.has(event.id),
  ).length;
  if (reusableCount > 0) {
    options.onProgress?.(
      `${options.month}: reusing ${reusableCount} existing AI briefs; only new items will call the model`,
    );
  }
  let completed = 0;
  let failed = 0;
  const events: MonitorEvent[] = [];

  for (let index = 0; index < candidates.length; index += 3) {
    const batch = candidates.slice(index, index + 3);
    const enriched = await Promise.all(
      batch.map(async ({ event, item }, batchIndex) => {
        if (!enrichmentService) return event;
        const existing = existingById.get(event.id);
        if (existing) {
          completed += 1;
          return existing;
        }
        try {
          options.onProgress?.(
            `${options.month}: AI ${index + batchIndex + 1}/${candidates.length} · ${event.source.authority} · ${event.source.title.slice(0, 90)}`,
          );
          const sourceText =
            item.sourceText ?? publicationText(await fetchText(item.url));
          const result = await enrichmentService.enrich(event, sourceText);
          completed += 1;
          return result;
        } catch {
          failed += 1;
          options.onProgress?.(
            `${options.month}: kept basic event ${event.source.title.slice(0, 80)} (AI request or response failed)`,
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
