import { createHash, randomUUID } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { zipSync } from "fflate";
import {
  cellarTreeNoticeUrl,
  discoverEnglishFmx,
  officialCellarHttpsUrl,
} from "../../ingestion/cellar";
import type { EarthUniverse } from "../universe/earth-universe";
import {
  type EarthOfficialSnapshot,
  earthOfficialSnapshotSchema,
} from "./earth-snapshot";

const MAX_TREE_NOTICE_BYTES = 10 * 1024 * 1024;
const MAX_CONTENT_ITEM_BYTES = 50 * 1024 * 1024;
const MAX_PACKAGE_BYTES = 100 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_REDIRECTS = 5;
const celexPattern = /^[0-9][0-9A-Z()_-]{4,39}$/u;

export type FetchImplementation = typeof fetch;

export interface EarthAcquisitionOptions {
  outputRoot?: string;
  fetchImplementation?: FetchImplementation;
  now?: () => Date;
}

export interface EarthAcquisitionResult {
  celex: string;
  directory: string;
  snapshot: EarthOfficialSnapshot;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function officialUrl(value: string): string {
  try {
    return officialCellarHttpsUrl(value);
  } catch {
    throw new Error(`Refusing non-official Earth source URL: ${value}`);
  }
}

function assertOfficialResponse(response: Response): void {
  const resolved = new URL(response.url);
  if (
    resolved.protocol !== "https:" ||
    resolved.hostname !== "publications.europa.eu"
  ) {
    throw new Error(
      `Official source redirected outside HTTPS allowlist: ${response.url}`,
    );
  }
}

async function fetchOfficial(
  requestedUrl: string,
  accept: string,
  fetchImplementation: FetchImplementation,
): Promise<Response> {
  let currentUrl = officialUrl(requestedUrl);
  for (
    let redirectCount = 0;
    redirectCount <= MAX_REDIRECTS;
    redirectCount += 1
  ) {
    const response = await fetchImplementation(currentUrl, {
      headers: {
        Accept: accept,
        "User-Agent":
          "regulatory-knowledge-platform-earth/0.1 (build-time acquisition)",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.status < 300 || response.status >= 400) return response;
    const location = response.headers.get("location");
    if (!location)
      throw new Error("Official source returned redirect without location");
    if (redirectCount === MAX_REDIRECTS)
      throw new Error("Official source exceeded redirect limit");
    currentUrl = officialUrl(new URL(location, currentUrl).toString());
  }
  throw new Error("Official source exceeded redirect limit");
}

function assertMediaType(response: Response, expected: "xml" | "zip"): void {
  const actual = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!actual.includes(expected)) {
    throw new Error(
      `Expected ${expected}, received ${actual || "no content type"}`,
    );
  }
}

async function readResponse(
  response: Response,
  maximumBytes: number,
): Promise<Uint8Array> {
  if (!response.ok)
    throw new Error(`Official source returned HTTP ${response.status}`);
  assertOfficialResponse(response);
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new Error(`Official source exceeds ${maximumBytes} bytes`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maximumBytes)
    throw new Error(`Official source exceeds ${maximumBytes} bytes`);
  return bytes;
}

/** Fetches a CELEX work from CELLAR and atomically persists an immutable Earth snapshot. */
export async function acquireEarthCellarSource(
  celex: string,
  options: EarthAcquisitionOptions = {},
): Promise<EarthAcquisitionResult> {
  if (!celexPattern.test(celex)) {
    throw new Error(`Invalid Earth CELEX identifier: ${celex}`);
  }
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const retrievedAt = (options.now ?? (() => new Date()))().toISOString();
  const treeNoticeUrl = cellarTreeNoticeUrl(celex);
  const treeResponse = await fetchOfficial(
    treeNoticeUrl,
    "application/xml;notice=tree",
    fetchImplementation,
  );
  assertMediaType(treeResponse, "xml");
  const treeBytes = await readResponse(treeResponse, MAX_TREE_NOTICE_BYTES);
  const discovery = discoverEnglishFmx(
    new TextDecoder().decode(treeBytes),
    celex,
  );
  const contentResponses = await Promise.all(
    discovery.contentItems.map(async (item) => {
      const xml = item.streamName.toLowerCase().endsWith(".xml");
      const response = await fetchOfficial(
        item.contentUrl,
        xml ? "application/xml;type=fmx4" : "application/zip",
        fetchImplementation,
      );
      assertMediaType(response, xml ? "xml" : "zip");
      return {
        item,
        response,
        bytes: await readResponse(response, MAX_CONTENT_ITEM_BYTES),
      };
    }),
  );
  const upstreamBytes = contentResponses.reduce(
    (total, item) => total + item.bytes.byteLength,
    0,
  );
  if (upstreamBytes > MAX_PACKAGE_BYTES)
    throw new Error(
      `Formex manifestation items exceed ${MAX_PACKAGE_BYTES} bytes`,
    );
  const multiItem = contentResponses.length > 1;
  const contentBytes = multiItem
    ? zipSync(
        Object.fromEntries(
          contentResponses.map(({ item, bytes }) => [item.streamName, bytes]),
        ),
        { level: 0 },
      )
    : contentResponses[0].bytes;
  if (contentBytes.byteLength > MAX_PACKAGE_BYTES)
    throw new Error(`Formex package exceeds ${MAX_PACKAGE_BYTES} bytes`);

  const contentHash = sha256(contentBytes);
  const contentIsXml =
    !multiItem && discovery.streamName.toLowerCase().endsWith(".xml");
  const contentFile = contentIsXml ? "source.fmx4.xml" : "source.fmx4.zip";
  const snapshot = earthOfficialSnapshotSchema.parse({
    schemaVersion: "2.0.0",
    snapshotId: `earth:cellar:${celex}:${contentHash}`,
    provenance: "official",
    sourceSystem: "cellar",
    celex,
    language: "en",
    retrievedAt,
    treeNoticeUrl,
    workUri: discovery.workUri,
    expressionUri: discovery.expressionUri,
    manifestationUri: discovery.manifestationUri,
    treeNotice: {
      url: treeNoticeUrl,
      mediaType: treeResponse.headers.get("content-type"),
      etag: treeResponse.headers.get("etag"),
      lastModified: treeResponse.headers.get("last-modified"),
      sha256: `sha256:${sha256(treeBytes)}`,
      bytes: treeBytes.byteLength,
      file: "tree-notice.xml",
    },
    content: {
      url: multiItem ? discovery.manifestationUri : discovery.contentUrl,
      mediaType: multiItem
        ? "application/zip"
        : contentResponses[0].response.headers.get("content-type"),
      etag: multiItem ? null : contentResponses[0].response.headers.get("etag"),
      lastModified: multiItem
        ? null
        : contentResponses[0].response.headers.get("last-modified"),
      sha256: `sha256:${contentHash}`,
      bytes: contentBytes.byteLength,
      upstreamStreamName: multiItem
        ? `${celex}.fmx4.zip`
        : discovery.streamName,
      file: contentFile,
      ...(multiItem
        ? {
            assembly: "cellar-manifestation-items" as const,
            upstreamItems: contentResponses.map(
              ({ item, response, bytes }) => ({
                url: item.contentUrl,
                mediaType: response.headers.get("content-type"),
                etag: response.headers.get("etag"),
                lastModified: response.headers.get("last-modified"),
                sha256: `sha256:${sha256(bytes)}`,
                bytes: bytes.byteLength,
                file: item.streamName,
                upstreamStreamName: item.streamName,
              }),
            ),
          }
        : {}),
    },
  });

  const outputRoot = resolve(
    process.cwd(),
    options.outputRoot ?? "data/raw/earth",
  );
  const parent = resolve(outputRoot, "cellar", celex);
  const directoryName = `${retrievedAt.replaceAll(/[:.]/g, "-")}-${contentHash.slice(0, 12)}`;
  const outputDirectory = resolve(parent, directoryName);
  if (!outputDirectory.startsWith(`${parent}/`))
    throw new Error("Invalid Earth snapshot directory");
  const pendingDirectory = resolve(
    parent,
    `.${directoryName}.pending-${process.pid}-${randomUUID()}`,
  );
  await mkdir(parent, { recursive: true });
  await mkdir(pendingDirectory);
  await Promise.all([
    writeFile(resolve(pendingDirectory, "tree-notice.xml"), treeBytes),
    writeFile(resolve(pendingDirectory, contentFile), contentBytes),
    writeFile(
      resolve(pendingDirectory, "snapshot.json"),
      `${JSON.stringify(snapshot, null, 2)}\n`,
      "utf8",
    ),
  ]);
  // Directory rename publishes all files together; published snapshot directories are never overwritten.
  await rename(pendingDirectory, outputDirectory);
  return { celex, directory: outputDirectory, snapshot };
}

export async function acquireEarthUniverse(
  universe: EarthUniverse,
  options: EarthAcquisitionOptions = {},
): Promise<EarthAcquisitionResult[]> {
  const results: EarthAcquisitionResult[] = [];
  for (const { celex } of universe.members) {
    results.push(await acquireEarthCellarSource(celex, options));
  }
  return results;
}
