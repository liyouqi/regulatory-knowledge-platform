import { createHash } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  type CssfSourceSnapshot,
  cssfSourceSnapshotSchema,
  readVerifiedCssfSourceSnapshot,
} from "./cssf-snapshot";
import {
  cssfDocumentLogicalId,
  findCssfSource,
  loadCssfSourceRegistry,
  officialCssfHttpsUrl,
} from "./cssf-source-registry";

const MAX_HTML_BYTES = 5 * 1024 * 1024;
const MAX_PDF_BYTES = 30 * 1024 * 1024;

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hash(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function assertOfficialResponse(response: Response): void {
  officialCssfHttpsUrl(response.url);
}

function assertMediaType(response: Response, expected: string): void {
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
  if (!response.ok) {
    throw new Error(`Official CSSF source returned HTTP ${response.status}`);
  }
  assertOfficialResponse(response);
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (declaredLength > maximumBytes) {
    throw new Error(`Official CSSF source exceeds ${maximumBytes} bytes`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maximumBytes) {
    throw new Error(`Official CSSF source exceeds ${maximumBytes} bytes`);
  }
  return bytes;
}

async function fetchOfficial(url: string, accept: string): Promise<Response> {
  let currentUrl = officialCssfHttpsUrl(url);
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
    if (!location) throw new Error("CSSF source redirected without location");
    if (redirectCount === 5) {
      throw new Error("CSSF source exceeded redirect limit");
    }
    currentUrl = officialCssfHttpsUrl(new URL(location, currentUrl).toString());
  }
  throw new Error("CSSF source exceeded redirect limit");
}

function artifact(response: Response, bytes: Uint8Array, file: string) {
  return {
    url: response.url,
    mediaType: response.headers.get("content-type"),
    etag: response.headers.get("etag"),
    lastModified: response.headers.get("last-modified"),
    sha256: `sha256:${hash(bytes)}`,
    bytes: bytes.byteLength,
    file,
  };
}

async function listSources(): Promise<void> {
  console.table(
    (await loadCssfSourceRegistry()).map((source) => ({
      localId: source.localId,
      shortName: source.shortName,
      documentType: source.documentType,
      mediaType: source.contentMediaType,
      publicationDate: source.publicationDate,
    })),
  );
}

async function fetchSource(): Promise<void> {
  const localId = argument("--id");
  if (!localId)
    throw new Error("Usage: npm run cssf:source:fetch -- --id <ID>");
  const source = await findCssfSource(localId);
  const retrievedAt = new Date().toISOString();
  const pageResponse = await fetchOfficial(source.pageUrl, "text/html");
  assertMediaType(pageResponse, "text/html");
  const pageBytes = await readResponse(pageResponse, MAX_HTML_BYTES);
  const sameContent = source.pageUrl === source.contentUrl;
  const contentResponse = sameContent
    ? pageResponse
    : await fetchOfficial(source.contentUrl, source.contentMediaType);
  if (!sameContent) assertMediaType(contentResponse, source.contentMediaType);
  const contentBytes = sameContent
    ? pageBytes
    : await readResponse(
        contentResponse,
        source.contentMediaType === "application/pdf"
          ? MAX_PDF_BYTES
          : MAX_HTML_BYTES,
      );
  const contentHash = hash(contentBytes);
  const snapshotId = `snapshot:cssf:${source.localId}:${contentHash}`;
  const outputDirectory = resolve(
    process.cwd(),
    "data/raw/cssf",
    source.localId,
    `${retrievedAt.replaceAll(/[:.]/g, "-")}-${contentHash.slice(0, 12)}`,
  );
  const contentFile =
    source.contentMediaType === "application/pdf"
      ? "source.pdf"
      : "source.html";
  await mkdir(outputDirectory, { recursive: true });

  const snapshot: CssfSourceSnapshot = cssfSourceSnapshotSchema.parse({
    schemaVersion: "1.0.0",
    snapshotId,
    provenance: "official",
    sourceSystem: "cssf",
    documentId: cssfDocumentLogicalId(source.localId),
    localId: source.localId,
    language: source.language,
    retrievedAt,
    canonicalUrl: source.pageUrl,
    page: artifact(pageResponse, pageBytes, "page.html"),
    content: artifact(contentResponse, contentBytes, contentFile),
  });
  const suffix = `.pending-${process.pid}`;
  await Promise.all([
    writeFile(`${outputDirectory}/page.html${suffix}`, pageBytes),
    writeFile(`${outputDirectory}/${contentFile}${suffix}`, contentBytes),
    writeFile(
      `${outputDirectory}/snapshot.json${suffix}`,
      `${JSON.stringify(snapshot, null, 2)}\n`,
      "utf8",
    ),
  ]);
  await Promise.all([
    rename(
      `${outputDirectory}/page.html${suffix}`,
      `${outputDirectory}/page.html`,
    ),
    rename(
      `${outputDirectory}/${contentFile}${suffix}`,
      `${outputDirectory}/${contentFile}`,
    ),
    rename(
      `${outputDirectory}/snapshot.json${suffix}`,
      `${outputDirectory}/snapshot.json`,
    ),
  ]);
  console.log(`Saved immutable CSSF source snapshot: ${outputDirectory}`);
  console.log(`Snapshot ID: ${snapshotId}`);
}

async function verifySource(): Promise<void> {
  const snapshotPath = argument("--snapshot");
  if (!snapshotPath) {
    throw new Error(
      "Usage: npm run cssf:source:verify -- --snapshot <snapshot-directory>",
    );
  }
  const { snapshot } = await readVerifiedCssfSourceSnapshot(snapshotPath);
  console.log(`Verified CSSF source snapshot: ${snapshot.snapshotId}`);
}

const command = process.argv[2];
try {
  if (command === "list") await listSources();
  else if (command === "fetch") await fetchSource();
  else if (command === "verify") await verifySource();
  else throw new Error("Usage: CSSF ingestion CLI <list|fetch|verify>");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
