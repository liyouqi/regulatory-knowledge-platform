import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { cpus, totalmem } from "node:os";
import { performance } from "node:perf_hooks";
import process from "node:process";
import { chromium } from "@playwright/test";
import Database from "better-sqlite3";
import { app } from "../server/app";

const WARMUP_CYCLES = 10;
const MEASURED_CYCLES = 100;
const PAGE_SAMPLES = 3;
const API_P95_BUDGET_MS = 100;

type ApiCase = {
  label: string;
  path: string;
};

type LatencySummary = {
  p50: number;
  p95: number;
  max: number;
};

type PageSample = {
  domContentLoadedMs: number | null;
  firstContentfulPaintMs: number | null;
  largestContentfulPaintMs: number | null;
  loadEventEndMs: number | null;
  payloadBytes: number;
};

const API_CASES: ApiCase[] = [
  {
    label: "readerDocumentFetch",
    path: "/api/documents/by-slug/dora",
  },
  {
    label: "provisionRelationships",
    path: "/api/relationships/eu%3A32022R2554/eu%3A32022R2554%3Aarticle%3A28",
  },
];

let apiOrigin = "";
let webOrigin = "";

function percentile(sortedValues: number[], percentileValue: number): number {
  return sortedValues[
    Math.max(0, Math.ceil(sortedValues.length * percentileValue) - 1)
  ];
}

function summarize(values: number[]): LatencySummary {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    p50: Number(percentile(sorted, 0.5).toFixed(3)),
    p95: Number(percentile(sorted, 0.95).toFixed(3)),
    max: Number(sorted.at(-1)?.toFixed(3)),
  };
}

function sqliteVersion(): string {
  const database = new Database(":memory:");
  try {
    const row = database
      .prepare("SELECT sqlite_version() AS version")
      .get() as { version: string };
    return row.version;
  } finally {
    database.close();
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForHealthy(url: string): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The process is still starting.
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function request(
  path: string,
): Promise<{ milliseconds: number; bytes: number }> {
  const startedAt = performance.now();
  const response = await fetch(`${apiOrigin}${path}`);
  const body = await response.text();
  const milliseconds = performance.now() - startedAt;
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}: ${body}`);
  }
  return { milliseconds, bytes: Buffer.byteLength(body) };
}

async function measureApi(caseDefinition: ApiCase) {
  for (let cycle = 0; cycle < WARMUP_CYCLES; cycle += 1) {
    await request(caseDefinition.path);
  }

  const timings: number[] = [];
  let responseBytes = 0;
  for (let cycle = 0; cycle < MEASURED_CYCLES; cycle += 1) {
    const result = await request(caseDefinition.path);
    timings.push(result.milliseconds);
    responseBytes = result.bytes;
  }

  return {
    responseBytes,
    latencyMs: summarize(timings),
  };
}

async function measurePage(pageUrl: string): Promise<PageSample> {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.__regulatoryLargestContentfulPaint = null;
      new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        const last = entries.at(-1);
        if (last) window.__regulatoryLargestContentfulPaint = last.startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });
    });
    await page.goto(pageUrl, { waitUntil: "networkidle" });
    await page.waitForTimeout(250);
    const sample = await page.evaluate(() => {
      const entries = performance.getEntries() as unknown as Array<{
        domContentLoadedEventEnd?: number;
        entryType: string;
        loadEventEnd?: number;
        name: string;
        startTime: number;
        transferSize?: number;
      }>;
      const navigation = entries.find(
        (entry) => entry.entryType === "navigation",
      );
      const firstContentfulPaint = entries.find(
        (entry) =>
          entry.entryType === "paint" &&
          entry.name === "first-contentful-paint",
      );
      const payloadBytes = entries
        .filter(
          (entry) =>
            entry.entryType === "resource" &&
            entry.name.startsWith(window.location.origin),
        )
        .reduce((total, entry) => total + (entry.transferSize ?? 0), 0);
      return {
        domContentLoadedMs: navigation?.domContentLoadedEventEnd ?? null,
        firstContentfulPaintMs: firstContentfulPaint?.startTime ?? null,
        largestContentfulPaintMs: window.__regulatoryLargestContentfulPaint,
        loadEventEndMs: navigation?.loadEventEnd ?? null,
        payloadBytes,
      };
    });
    await context.close();
    return sample;
  } finally {
    await browser.close();
  }
}

async function measureRepeatPage(pageUrl: string): Promise<PageSample> {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.__regulatoryLargestContentfulPaint = null;
      new PerformanceObserver((entryList) => {
        const last = entryList.getEntries().at(-1);
        if (last) window.__regulatoryLargestContentfulPaint = last.startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });
    });
    await page.goto(pageUrl, { waitUntil: "networkidle" });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(250);
    const sample = await page.evaluate(() => {
      const entries = performance.getEntries() as unknown as Array<{
        domContentLoadedEventEnd?: number;
        entryType: string;
        loadEventEnd?: number;
        name: string;
        startTime: number;
        transferSize?: number;
      }>;
      const navigation = entries.find(
        (entry) => entry.entryType === "navigation",
      );
      const firstContentfulPaint = entries.find(
        (entry) =>
          entry.entryType === "paint" &&
          entry.name === "first-contentful-paint",
      );
      const payloadBytes = entries
        .filter(
          (entry) =>
            entry.entryType === "resource" &&
            entry.name.startsWith(window.location.origin),
        )
        .reduce((total, entry) => total + (entry.transferSize ?? 0), 0);
      return {
        domContentLoadedMs: navigation?.domContentLoadedEventEnd ?? null,
        firstContentfulPaintMs: firstContentfulPaint?.startTime ?? null,
        largestContentfulPaintMs: window.__regulatoryLargestContentfulPaint,
        loadEventEndMs: navigation?.loadEventEnd ?? null,
        payloadBytes,
      };
    });
    await context.close();
    return sample;
  } finally {
    await browser.close();
  }
}

function pageSummary(samples: PageSample[]) {
  const summarizeNullable = (key: keyof Omit<PageSample, "payloadBytes">) => {
    const values = samples
      .map((sample) => sample[key])
      .filter((value): value is number => value !== null);
    return values.length === 0 ? null : summarize(values);
  };
  return {
    samples,
    domContentLoadedMs: summarizeNullable("domContentLoadedMs"),
    firstContentfulPaintMs: summarizeNullable("firstContentfulPaintMs"),
    largestContentfulPaintMs: summarizeNullable("largestContentfulPaintMs"),
    loadEventEndMs: summarizeNullable("loadEventEndMs"),
    payloadBytes: summarize(samples.map((sample) => sample.payloadBytes)),
  };
}

function startPreview(port: number): ChildProcess {
  return spawn(
    process.execPath,
    [
      "./node_modules/vite/bin/vite.js",
      "preview",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, REGULATORY_API_ORIGIN: apiOrigin },
      stdio: "ignore",
    },
  );
}

async function reserveLoopbackPort(): Promise<number> {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not reserve a benchmark preview port");
  }
  const { port } = address;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

async function closeProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.killed) return;
  child.kill("SIGTERM");
  await Promise.race([once(child, "exit"), delay(5_000)]);
}

declare global {
  interface Window {
    __regulatoryLargestContentfulPaint: number | null;
  }
}

const apiServer = app.listen(0, "127.0.0.1");
let preview: ChildProcess | undefined;
let apiListening = false;

try {
  await once(apiServer, "listening");
  apiListening = true;
  const address = apiServer.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not determine benchmark API address");
  }
  apiOrigin = `http://127.0.0.1:${address.port}`;
  await waitForHealthy(`${apiOrigin}/api/health`);
  const health = (await (await fetch(`${apiOrigin}/api/health`)).json()) as {
    runtimeDatabase: {
      buildId: string;
      profileId: string;
      profileHash: string;
      documents: number;
      records: number;
      definitions: number;
      relationships: number;
    };
  };

  const api: Record<
    string,
    Awaited<ReturnType<typeof measureApi>>
  > = Object.fromEntries(
    await Promise.all(
      API_CASES.map(async (caseDefinition) => [
        caseDefinition.label,
        await measureApi(caseDefinition),
      ]),
    ),
  );
  const apiBudgetPassed = Object.values(api).every(
    (result) => result.latencyMs.p95 < API_P95_BUDGET_MS,
  );

  const previewPort = await reserveLoopbackPort();
  webOrigin = `http://127.0.0.1:${previewPort}`;
  preview = startPreview(previewPort);
  await waitForHealthy(webOrigin);
  const freshSamples = await Promise.all(
    Array.from({ length: PAGE_SAMPLES }, () => measurePage(webOrigin)),
  );
  const warmSamples = await Promise.all(
    Array.from({ length: PAGE_SAMPLES }, () => measureRepeatPage(webOrigin)),
  );

  console.log(
    JSON.stringify(
      {
        measuredAt: new Date().toISOString(),
        runtime: {
          node: process.version,
          sqlite: sqliteVersion(),
          platform: process.platform,
          architecture: process.arch,
          cpu: cpus()[0]?.model ?? "unknown",
          logicalCpuCount: cpus().length,
          memoryGiB: Number((totalmem() / 1024 ** 3).toFixed(1)),
          browser: await chromium.launch().then(async (browser) => {
            try {
              return browser.version();
            } finally {
              await browser.close();
            }
          }),
        },
        corpus: health.runtimeDatabase,
        method: {
          api: {
            warmupCycles: WARMUP_CYCLES,
            measuredCycles: MEASURED_CYCLES,
            sampleCount: MEASURED_CYCLES,
            transport:
              "loopback HTTP; API process and browser preview run locally",
          },
          initialUi: {
            build: "vite production preview",
            freshBrowserContextSamples: PAGE_SAMPLES,
            repeatSamples: PAGE_SAMPLES,
            note: "Fresh refers to a new browser context; OS and disk caches are not cleared.",
          },
        },
        api,
        initialUi: {
          freshBrowserContext: pageSummary(freshSamples),
          repeatBrowserContext: pageSummary(warmSamples),
        },
        budgets: {
          provisionApiWarmP95Ms: API_P95_BUDGET_MS,
          passed: apiBudgetPassed,
        },
      },
      null,
      2,
    ),
  );

  if (!apiBudgetPassed) {
    process.exitCode = 1;
  }
} finally {
  if (preview) await closeProcess(preview);
  if (apiListening) {
    await new Promise<void>((resolve, reject) =>
      apiServer.close((error) => (error ? reject(error) : resolve())),
    );
  }
}
