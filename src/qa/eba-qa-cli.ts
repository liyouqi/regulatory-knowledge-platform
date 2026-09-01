import { createHash } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  type EbaQaCatalogDataset,
  type EbaQaCatalogItem,
  type EbaQaDetail,
  type EbaQaDetailDataset,
  ebaQaCatalogDatasetSchema,
  ebaQaDetailDatasetSchema,
} from "../shared/eba-qa";
import {
  lastCatalogPage,
  parseEbaQaCatalogPage,
  parseEbaQaDetailPage,
} from "./eba-qa-parser";

const SEARCH_URL = "https://www.eba.europa.eu/single-rule-book-qa/search";
const DETAIL_URL =
  "https://www.eba.europa.eu/single-rule-book-qa/qna/view/publicId";
const OUTPUT_DIRECTORY = resolve(
  process.cwd(),
  "data/official-metadata/eba-qa",
);
const RAW_ROOT = resolve(process.cwd(), "data/raw/eba-qa");
const MAX_HTML_BYTES = 5 * 1024 * 1024;
const FETCH_CONCURRENCY = 4;

function officialEbaUrl(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    (url.hostname !== "www.eba.europa.eu" && url.hostname !== "eba.europa.eu")
  ) {
    throw new Error(`Expected official EBA HTTPS URL, received ${value}`);
  }
  url.hash = "";
  return url.toString();
}

async function fetchOfficialHtml(url: string): Promise<string> {
  let currentUrl = officialEbaUrl(url);
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    const response = await fetch(currentUrl, {
      headers: {
        Accept: "text/html",
        "User-Agent":
          "regulatory-knowledge-platform/0.1 (personal research project)",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(60_000),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("EBA Q&A redirected without location");
      if (redirects === 5) throw new Error("EBA Q&A exceeded redirect limit");
      currentUrl = officialEbaUrl(new URL(location, currentUrl).toString());
      continue;
    }
    if (!response.ok) {
      throw new Error(
        `EBA Q&A returned HTTP ${response.status}: ${currentUrl}`,
      );
    }
    officialEbaUrl(response.url);
    const contentType =
      response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("text/html")) {
      throw new Error(
        `Expected EBA HTML, received ${contentType || "unknown"}`,
      );
    }
    const declaredBytes = Number(response.headers.get("content-length") ?? "0");
    if (declaredBytes > MAX_HTML_BYTES) {
      throw new Error(`EBA HTML exceeds ${MAX_HTML_BYTES} bytes`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_HTML_BYTES) {
      throw new Error(`EBA HTML exceeds ${MAX_HTML_BYTES} bytes`);
    }
    return new TextDecoder().decode(bytes);
  }
  throw new Error("EBA Q&A exceeded redirect limit");
}

async function fetchInBatches<T>(
  values: T[],
  fetcher: (value: T) => Promise<string>,
): Promise<string[]> {
  const results: string[] = [];
  for (let index = 0; index < values.length; index += FETCH_CONCURRENCY) {
    const batch = values.slice(index, index + FETCH_CONCURRENCY);
    results.push(...(await Promise.all(batch.map(fetcher))));
  }
  return results;
}

function sha256Json(value: unknown): string {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")}`;
}

function datePath(value: string): string {
  return value.replaceAll(/[-:.]/gu, "");
}

async function atomicJson(path: string, value: unknown): Promise<void> {
  const pending = `${path}.pending-${process.pid}`;
  await writeFile(pending, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: "w",
  });
  await rename(pending, path);
}

async function writeRawSnapshot(
  retrievedAt: string,
  catalogPages: string[],
  detailRecords: EbaQaCatalogItem[],
  detailPages: string[],
): Promise<string> {
  const directory = resolve(RAW_ROOT, datePath(retrievedAt));
  await Promise.all([
    mkdir(resolve(directory, "catalog"), { recursive: true }),
    mkdir(resolve(directory, "details"), { recursive: true }),
  ]);
  await Promise.all([
    ...catalogPages.map((html, index) =>
      writeFile(
        resolve(
          directory,
          "catalog",
          `page-${String(index).padStart(3, "0")}.html`,
        ),
        html,
        "utf8",
      ),
    ),
    ...detailPages.map((html, index) =>
      writeFile(
        resolve(directory, "details", `${detailRecords[index].publicId}.html`),
        html,
        "utf8",
      ),
    ),
  ]);
  return directory;
}

function validateJoinedDatasets(
  catalog: EbaQaCatalogDataset,
  details: EbaQaDetailDataset,
): void {
  const catalogById = new Map(
    catalog.records.map((record) => [record.id, record]),
  );
  const detailIds = new Set(details.records.map((record) => record.id));
  for (const detail of details.records) {
    const catalogRecord = catalogById.get(detail.id);
    if (!catalogRecord) {
      throw new Error(`DORA Q&A detail is absent from catalogue: ${detail.id}`);
    }
    if (!catalogRecord.detailAvailable) {
      throw new Error(`DORA Q&A detail flag is false: ${detail.id}`);
    }
    if (!catalogRecord.legalActLabel.includes("2022/2554 (DORA Reg)")) {
      throw new Error(`Non-DORA detail entered DORA dataset: ${detail.id}`);
    }
  }
  for (const record of catalog.records) {
    if (record.detailAvailable !== detailIds.has(record.id)) {
      throw new Error(`Q&A detail availability mismatch: ${record.id}`);
    }
  }
}

async function fetchQaDataset(): Promise<void> {
  const retrievedAt = new Date().toISOString();
  const firstPage = await fetchOfficialHtml(SEARCH_URL);
  const finalPageNumber = lastCatalogPage(firstPage);
  const remainingUrls = Array.from(
    { length: finalPageNumber },
    (_, index) => `${SEARCH_URL}?page=${index + 1}`,
  );
  const catalogPages = [
    firstPage,
    ...(await fetchInBatches(remainingUrls, fetchOfficialHtml)),
  ];
  const parsedCatalog = catalogPages.flatMap((html, page) => {
    try {
      return parseEbaQaCatalogPage(html);
    } catch (error) {
      throw new Error(
        `EBA Final Q&A catalogue page ${page} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  });
  if (parsedCatalog.length === 0) {
    throw new Error("EBA Final Q&A catalogue is empty");
  }
  const doraRecords = parsedCatalog.filter((record) =>
    record.legalActLabel.includes("2022/2554 (DORA Reg)"),
  );
  if (doraRecords.length === 0) {
    throw new Error("EBA Final Q&A catalogue contains no DORA records");
  }
  const detailPages = await fetchInBatches(doraRecords, (record) =>
    fetchOfficialHtml(`${DETAIL_URL}/${record.publicId}`),
  );
  const details: EbaQaDetail[] = detailPages.map(parseEbaQaDetailPage);
  const detailIds = new Set(details.map((detail) => detail.id));
  const catalogRecords = parsedCatalog.map((record) => ({
    ...record,
    detailAvailable: detailIds.has(record.id),
  }));
  const catalog = ebaQaCatalogDatasetSchema.parse({
    schemaVersion: "1.0.0",
    sourceSystem: "eba-single-rulebook-qa",
    scope: "final",
    sourceUrl: SEARCH_URL,
    retrievedAt,
    declaredRecordCount: catalogRecords.length,
    contentHash: sha256Json(catalogRecords),
    records: catalogRecords,
  });
  const detailDataset = ebaQaDetailDatasetSchema.parse({
    schemaVersion: "1.0.0",
    sourceSystem: "eba-single-rulebook-qa",
    scope: "dora-final-details",
    sourceUrl: SEARCH_URL,
    retrievedAt,
    declaredRecordCount: details.length,
    contentHash: sha256Json(details),
    records: details,
  });
  validateJoinedDatasets(catalog, detailDataset);
  const rawDirectory = await writeRawSnapshot(
    retrievedAt,
    catalogPages,
    doraRecords,
    detailPages,
  );
  await mkdir(OUTPUT_DIRECTORY, { recursive: true });
  await Promise.all([
    atomicJson(resolve(OUTPUT_DIRECTORY, "catalog.json"), catalog),
    atomicJson(resolve(OUTPUT_DIRECTORY, "dora-details.json"), detailDataset),
  ]);
  console.table({
    retrievedAt,
    finalQaRecords: catalog.records.length,
    doraDetails: detailDataset.records.length,
    rawDirectory,
    outputDirectory: OUTPUT_DIRECTORY,
  });
}

try {
  const command = process.argv[2] ?? "fetch";
  if (command !== "fetch") {
    throw new Error("Usage: eba-qa-cli.ts fetch");
  }
  await fetchQaDataset();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
