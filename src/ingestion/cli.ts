import { createHash } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  cellarTreeNoticeUrl,
  discoverEnglishFmx,
  officialCellarHttpsUrl,
} from "./cellar";
import {
  type OfficialSourceSnapshot,
  officialSourceSnapshotSchema,
  readVerifiedSourceSnapshot,
} from "./snapshot";
import { findSource, loadSourceRegistry } from "./source-registry";

const MAX_TREE_NOTICE_BYTES = 10 * 1024 * 1024;
const MAX_FMX_CONTENT_BYTES = 50 * 1024 * 1024;

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hash(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function assertOfficialResponse(response: Response): void {
  const resolvedUrl = new URL(response.url);
  if (
    resolvedUrl.protocol !== "https:" ||
    resolvedUrl.hostname !== "publications.europa.eu"
  ) {
    throw new Error(
      `Official source redirected outside its HTTPS host: ${response.url}`,
    );
  }
}

function assertMediaType(response: Response, expected: string): void {
  const mediaType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!mediaType.includes(expected)) {
    throw new Error(
      `Expected ${expected}, received ${mediaType || "no content type"}`,
    );
  }
}

async function readResponse(
  response: Response,
  maximumBytes: number,
): Promise<Uint8Array> {
  if (!response.ok) {
    throw new Error(`Official source returned HTTP ${response.status}`);
  }
  assertOfficialResponse(response);
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (declaredLength > maximumBytes) {
    throw new Error(`Official source exceeds ${maximumBytes} bytes`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maximumBytes) {
    throw new Error(`Official source exceeds ${maximumBytes} bytes`);
  }
  return bytes;
}

async function fetchOfficial(url: string, accept: string): Promise<Response> {
  let currentUrl: string;
  try {
    currentUrl = officialCellarHttpsUrl(url);
  } catch {
    throw new Error(`Refusing non-official source URL: ${url}`);
  }

  for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
    const response = await fetch(currentUrl, {
      headers: {
        Accept: accept,
        "User-Agent":
          "regulatory-knowledge-platform/0.1 (personal research project)",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(60_000),
    });
    if (response.status < 300 || response.status >= 400) return response;

    const location = response.headers.get("location");
    if (!location) {
      throw new Error("Official source returned redirect without location");
    }
    if (redirectCount === 5) {
      throw new Error("Official source exceeded redirect limit");
    }
    const resolved = new URL(location, currentUrl).toString();
    try {
      currentUrl = officialCellarHttpsUrl(resolved);
    } catch {
      throw new Error(
        `Official source redirected outside its host: ${resolved}`,
      );
    }
  }

  throw new Error("Official source exceeded redirect limit");
}

async function listSources(): Promise<void> {
  const sources = await loadSourceRegistry();
  console.table(
    sources.map(({ shortName, celex, documentType, language, quality }) => ({
      shortName,
      celex,
      documentType,
      language,
      canonicalBaseline: quality ? "ready" : "missing",
    })),
  );
}

async function fetchSource(): Promise<void> {
  const celex = argument("--celex");
  if (!celex) throw new Error("Usage: npm run source:fetch -- --celex <CELEX>");
  const source = await findSource(celex);
  const treeUrl = cellarTreeNoticeUrl(source.celex);
  const retrievedAt = new Date().toISOString();
  const treeResponse = await fetchOfficial(
    treeUrl,
    "application/xml;notice=tree",
  );
  assertMediaType(treeResponse, "xml");
  const treeBytes = await readResponse(treeResponse, MAX_TREE_NOTICE_BYTES);
  const treeXml = new TextDecoder().decode(treeBytes);
  const discovery = discoverEnglishFmx(treeXml, source.celex);
  const contentIsXml = discovery.streamName.toLowerCase().endsWith(".xml");
  const contentResponse = await fetchOfficial(
    discovery.contentUrl,
    contentIsXml ? "application/xml;type=fmx4" : "application/zip",
  );
  assertMediaType(contentResponse, contentIsXml ? "xml" : "application/zip");
  const contentBytes = await readResponse(
    contentResponse,
    MAX_FMX_CONTENT_BYTES,
  );
  const contentSha256 = hash(contentBytes);
  const treeSha256 = hash(treeBytes);
  const snapshotId = `snapshot:cellar:${source.celex}:${contentSha256}`;
  const directoryName = `${retrievedAt.replaceAll(/[:.]/g, "-")}-${contentSha256.slice(0, 12)}`;
  const outputDirectory = resolve(
    process.cwd(),
    "data/raw/eur-lex",
    source.celex,
    directoryName,
  );
  const contentFile = contentIsXml ? "source.fmx4.xml" : "source.fmx4.zip";
  await mkdir(outputDirectory, { recursive: true });

  const snapshot: OfficialSourceSnapshot = officialSourceSnapshotSchema.parse({
    schemaVersion: "1.0.0",
    snapshotId,
    provenance: "official",
    sourceSystem: "cellar",
    celex: source.celex,
    language: "en",
    retrievedAt,
    canonicalUrl: source.eliUrl,
    workUri: discovery.workUri,
    expressionUri: discovery.expressionUri,
    manifestationUri: discovery.manifestationUri,
    treeNotice: {
      url: treeUrl,
      mediaType: treeResponse.headers.get("content-type"),
      etag: treeResponse.headers.get("etag"),
      lastModified: treeResponse.headers.get("last-modified"),
      sha256: `sha256:${treeSha256}`,
      bytes: treeBytes.byteLength,
      file: "tree-notice.xml",
    },
    content: {
      url: discovery.contentUrl,
      mediaType: contentResponse.headers.get("content-type"),
      etag: contentResponse.headers.get("etag"),
      lastModified: contentResponse.headers.get("last-modified"),
      sha256: `sha256:${contentSha256}`,
      bytes: contentBytes.byteLength,
      upstreamStreamName: discovery.streamName,
      file: contentFile,
    },
  });

  const pendingSuffix = `.pending-${process.pid}`;
  await Promise.all([
    writeFile(`${outputDirectory}/tree-notice.xml${pendingSuffix}`, treeBytes),
    writeFile(
      `${outputDirectory}/${contentFile}${pendingSuffix}`,
      contentBytes,
    ),
    writeFile(
      `${outputDirectory}/snapshot.json${pendingSuffix}`,
      `${JSON.stringify(snapshot, null, 2)}\n`,
      "utf8",
    ),
  ]);
  await Promise.all([
    rename(
      `${outputDirectory}/tree-notice.xml${pendingSuffix}`,
      `${outputDirectory}/tree-notice.xml`,
    ),
    rename(
      `${outputDirectory}/${contentFile}${pendingSuffix}`,
      `${outputDirectory}/${contentFile}`,
    ),
    rename(
      `${outputDirectory}/snapshot.json${pendingSuffix}`,
      `${outputDirectory}/snapshot.json`,
    ),
  ]);

  console.log(`Saved immutable source snapshot: ${outputDirectory}`);
  console.log(`Snapshot ID: ${snapshotId}`);
}

async function verifySource(): Promise<void> {
  const providedPath = argument("--snapshot");
  if (!providedPath) {
    throw new Error(
      "Usage: npm run source:verify -- --snapshot <snapshot-directory>",
    );
  }
  const { snapshot } = await readVerifiedSourceSnapshot(providedPath);
  console.log(`Verified source snapshot: ${snapshot.snapshotId}`);
}

const command = process.argv[2];

try {
  if (command === "list") await listSources();
  else if (command === "fetch") await fetchSource();
  else if (command === "verify") await verifySource();
  else throw new Error("Usage: ingestion CLI <list|fetch|verify>");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
