import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { extractNationalXml } from "./national-archive";
import {
  nationalSourceSnapshotSchema,
  readVerifiedNationalSourceSnapshot,
} from "./national-snapshot";
import {
  findNationalSource,
  officialNationalHttpsUrl,
} from "./national-source-registry";
const argument = (name: string) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? undefined : process.argv[i + 1];
};
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
async function acquire() {
  const id = argument("--id");
  if (!id) throw new Error("Expected --id");
  const source = await findNationalSource(id);
  const imported = argument("--archive");
  let archive: Uint8Array;
  let retrievedAt: string;
  let etag: string | null = null;
  let lastModified: string | null = null;
  if (imported) {
    const supplied = argument("--retrieved-at");
    if (!supplied)
      throw new Error("Import requires the actual --retrieved-at timestamp");
    retrievedAt = supplied;
    archive = new Uint8Array(await readFile(imported));
  } else {
    let url = source.contentUrl;
    let response: Response | undefined;
    for (let i = 0; i < 6; i++) {
      response = await fetch(officialNationalHttpsUrl(url), {
        redirect: "manual",
        signal: AbortSignal.timeout(60000),
      });
      if (response.status < 300 || response.status >= 400) break;
      const location = response.headers.get("location");
      if (!location || i === 5)
        throw new Error("Invalid national source redirect");
      url = officialNationalHttpsUrl(new URL(location, url).toString());
    }
    if (!response?.ok)
      throw new Error(`National source HTTP ${response?.status}`);
    if (Number(response.headers.get("content-length") ?? 0) > 10 * 1024 * 1024)
      throw new Error("Archive exceeds size limit");
    archive = new Uint8Array(await response.arrayBuffer());
    retrievedAt = new Date().toISOString();
    etag = response.headers.get("etag");
    lastModified = response.headers.get("last-modified");
  }
  const content = extractNationalXml(archive, source.sourceWorkId);
  const contentHash = sha(content);
  const directory = resolve(
    "data/raw/national",
    id,
    `${retrievedAt.replaceAll(/[-:.]/gu, "")}-${contentHash.slice(0, 12)}`,
  );
  await mkdir(directory, { recursive: true });
  const make = (bytes: Uint8Array, file: string, mediaType: string) => ({
    url: source.contentUrl,
    mediaType,
    etag,
    lastModified,
    sha256: `sha256:${sha(bytes)}`,
    bytes: bytes.length,
    file,
  });
  const snapshot = nationalSourceSnapshotSchema.parse({
    schemaVersion: "1.0.0",
    snapshotId: `snapshot:national:${id}:${contentHash}`,
    provenance: "official",
    sourceSystem: "gii",
    documentId: source.documentId,
    localId: id,
    language: "de",
    retrievedAt,
    canonicalUrl: source.pageUrl,
    content: make(content, "content.xml", "application/xml"),
    archive: make(archive, "archive.zip", "application/zip"),
  });
  await writeFile(`${directory}/archive.zip`, archive, { flag: "wx" });
  await writeFile(`${directory}/content.xml`, content, { flag: "wx" });
  await writeFile(
    `${directory}/snapshot.json`,
    `${JSON.stringify(snapshot, null, 2)}\n`,
    { flag: "wx" },
  );
  console.log(directory);
}
try {
  const command = process.argv[2];
  if (command === "fetch" || command === "import") await acquire();
  else if (command === "verify") {
    const path = argument("--snapshot");
    if (!path) throw new Error("Expected --snapshot");
    console.log(
      (await readVerifiedNationalSourceSnapshot(path)).snapshot.snapshotId,
    );
  } else throw new Error("Usage: national-cli.ts fetch|import|verify");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
