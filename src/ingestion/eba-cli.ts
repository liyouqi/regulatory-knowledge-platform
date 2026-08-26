import { createHash } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  type EbaSourceSnapshot,
  ebaSourceSnapshotSchema,
  readVerifiedEbaSourceSnapshot,
} from "./eba-snapshot";
import {
  findEbaSource,
  loadEbaSourceRegistry,
  officialEbaHttpsUrl,
} from "./eba-source-registry";

const MAX_HTML_BYTES = 5 * 1024 * 1024;
const MAX_PDF_BYTES = 30 * 1024 * 1024;

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hash(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

async function fetchOfficial(url: string, accept: string): Promise<Response> {
  let currentUrl = officialEbaHttpsUrl(url);
  for (let redirects = 0; redirects <= 5; redirects += 1) {
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
    if (!location) throw new Error("EBA source redirected without location");
    if (redirects === 5) throw new Error("EBA source exceeded redirect limit");
    currentUrl = officialEbaHttpsUrl(new URL(location, currentUrl).toString());
  }
  throw new Error("EBA source exceeded redirect limit");
}

async function readResponse(
  response: Response,
  expectedMediaType: string,
  maximumBytes: number,
): Promise<Uint8Array> {
  if (!response.ok) {
    throw new Error(`Official EBA source returned HTTP ${response.status}`);
  }
  officialEbaHttpsUrl(response.url);
  const mediaType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!mediaType.includes(expectedMediaType)) {
    throw new Error(
      `Expected ${expectedMediaType}, received ${mediaType || "no content type"}`,
    );
  }
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > maximumBytes) {
    throw new Error(`Official EBA source exceeds ${maximumBytes} bytes`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maximumBytes) {
    throw new Error(`Official EBA source exceeds ${maximumBytes} bytes`);
  }
  return bytes;
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
    (await loadEbaSourceRegistry()).map((source) => ({
      localId: source.localId,
      documentId: source.documentId,
      shortName: source.shortName,
      publicationDate: source.publicationDate,
    })),
  );
}

async function fetchSource(): Promise<void> {
  const localId = argument("--id");
  if (!localId) {
    throw new Error("Usage: npm run eba:source:fetch -- --id <local-id>");
  }
  const source = await findEbaSource(localId);
  const [pageResponse, contentResponse] = await Promise.all([
    fetchOfficial(source.pageUrl, "text/html"),
    fetchOfficial(source.contentUrl, "application/pdf"),
  ]);
  const [pageBytes, contentBytes] = await Promise.all([
    readResponse(pageResponse, "text/html", MAX_HTML_BYTES),
    readResponse(contentResponse, "application/pdf", MAX_PDF_BYTES),
  ]);
  const retrievedAt = new Date().toISOString();
  const contentHash = hash(contentBytes);
  const directory = resolve(
    process.cwd(),
    "data/raw/eba",
    source.localId,
    `${retrievedAt.replaceAll(/[-:.]/gu, "")}-${contentHash.slice(0, 12)}`,
  );
  await mkdir(directory, { recursive: true });
  const snapshot: EbaSourceSnapshot = ebaSourceSnapshotSchema.parse({
    schemaVersion: "1.0.0",
    snapshotId: `snapshot:eba:${source.localId}:${contentHash}`,
    provenance: "official",
    sourceSystem: "eba",
    documentId: source.documentId,
    localId: source.localId,
    language: source.language,
    retrievedAt,
    canonicalUrl: source.pageUrl,
    page: artifact(pageResponse, pageBytes, "page.html"),
    content: artifact(contentResponse, contentBytes, "content.pdf"),
  });
  const pending = `${directory}/snapshot.json.pending-${process.pid}`;
  await Promise.all([
    writeFile(`${directory}/page.html`, pageBytes, { flag: "wx" }),
    writeFile(`${directory}/content.pdf`, contentBytes, { flag: "wx" }),
    writeFile(pending, `${JSON.stringify(snapshot, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    }),
  ]);
  await rename(pending, `${directory}/snapshot.json`);
  console.log(`Fetched immutable EBA snapshot: ${directory}`);
}

async function verifySource(): Promise<void> {
  const snapshot = argument("--snapshot");
  if (!snapshot) {
    throw new Error(
      "Usage: npm run eba:source:verify -- --snapshot <snapshot-directory>",
    );
  }
  const verified = await readVerifiedEbaSourceSnapshot(snapshot);
  console.table({
    snapshotId: verified.snapshot.snapshotId,
    documentId: verified.snapshot.documentId,
    bytes: verified.snapshot.content.bytes,
    sha256: verified.snapshot.content.sha256,
  });
}

try {
  const command = process.argv[2];
  if (command === "list") await listSources();
  else if (command === "fetch") await fetchSource();
  else if (command === "verify") await verifySource();
  else throw new Error("Usage: eba-cli.ts <list|fetch|verify>");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
