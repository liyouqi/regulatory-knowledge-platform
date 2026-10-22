import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { inspectAmfCandidate } from "./amf-candidate-parser";
import { loadAmfSourceRegistry } from "./amf-source-registry";

const digest = (value: Uint8Array | string) =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;
const reportHash =
  "sha256:bff026a095f1ea3c5d60dc82bbde6eda7c83a5d2e90159c5dc7e79df5113d278";
const artifact = z
  .object({
    file: z.string(),
    bytes: z.number().int().nonnegative(),
    sha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  })
  .strict();
export const amfSourceSnapshotSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    snapshotId: z.string().regex(/^snapshot:amf:fr-amf-rg:[a-f0-9]{64}$/),
    provenance: z.literal("official"),
    sourceSystem: z.literal("amf"),
    documentId: z.literal("fr:amf:rg"),
    localId: z.literal("fr-amf-rg"),
    language: z.literal("fr"),
    retrievedAt: z.null(),
    capturedOn: z.literal("2026-10-20"),
    captureDateBasis: z.literal("archived-probe-directory"),
    importedAt: z.string().datetime(),
    retrievalTimestampBasis: z.literal("date-only-official-probe"),
    canonicalUrl: z.literal(
      "https://www.amf-france.org/fr/eli/fr/aai/amf/rg/20260911/notes",
    ),
    contentUrl: z.literal("https://www.amf-france.org/fr/eli/fr/aai/amf/rg"),
    content: artifact,
    report: artifact,
  })
  .strict();
export type AmfSourceSnapshot = z.infer<typeof amfSourceSnapshotSchema>;

async function verifyEvidence(content: Uint8Array, report: Uint8Array) {
  const [source] = await loadAmfSourceRegistry();
  if (digest(report) !== reportHash)
    throw new Error("Original probe report SHA-256 mismatch");
  const parsed: unknown = JSON.parse(Buffer.from(report).toString("utf8"));
  if (!Array.isArray(parsed)) throw new Error("Invalid probe report");
  const entries = parsed.filter((entry) => entry && entry.key === "fr-amf");
  if (entries.length !== 1) throw new Error("Expected one AMF probe entry");
  const entry = entries[0];
  if (
    entry.url !== source.contentUrl ||
    entry.finalUrl !== source.contentUrl ||
    entry.status !== 200 ||
    entry.contentType !== "text/html; charset=UTF-8" ||
    entry.bytes !== content.byteLength ||
    entry.sha256 !== digest(content)
  )
    throw new Error("AMF probe evidence mismatch");
  const candidate = inspectAmfCandidate(content);
  const b = candidate.baseline;
  const q = source.quality;
  const count = (scope: "document" | "group" | "article") =>
    b.notes.filter((n) => n.scope === scope).length;
  if (
    b.input.sha256 !== q.inputSha256 ||
    candidate.legalContentAstHash !== q.astSha256 ||
    digest(JSON.stringify(b)) !== q.baselineSha256 ||
    b.source.canonicalUrl !== source.versionUrl ||
    b.source.versionDate !== source.sourceVersionDate ||
    b.groups.length !== q.groups ||
    b.articles.length !== q.articles ||
    b.notes.length !== q.notes ||
    count("document") !== q.documentNotes ||
    count("group") !== q.groupNotes ||
    count("article") !== q.articleNotes
  )
    throw new Error("AMF candidate quality mismatch");
  return source;
}

export async function importAmfProbe(options: {
  inputPath: string;
  reportPath: string;
  capturedOn: string;
  outputRoot?: string;
}) {
  if (options.capturedOn !== "2026-10-20")
    throw new Error("Unknown AMF probe capture date");
  const [content, report] = await Promise.all([
    readFile(options.inputPath),
    readFile(options.reportPath),
  ]);
  const source = await verifyEvidence(content, report);
  const snapshot: AmfSourceSnapshot = amfSourceSnapshotSchema.parse({
    schemaVersion: "1.0.0",
    snapshotId: `snapshot:amf:fr-amf-rg:${digest(content).slice(7)}`,
    provenance: "official",
    sourceSystem: "amf",
    documentId: source.documentId,
    localId: source.localId,
    language: source.language,
    retrievedAt: null,
    capturedOn: options.capturedOn,
    captureDateBasis: "archived-probe-directory",
    importedAt: new Date().toISOString(),
    retrievalTimestampBasis: "date-only-official-probe",
    canonicalUrl: source.versionUrl,
    contentUrl: source.contentUrl,
    content: {
      file: "content.html",
      bytes: content.length,
      sha256: digest(content),
    },
    report: {
      file: "report.json",
      bytes: report.length,
      sha256: digest(report),
    },
  });
  const root = resolve(options.outputRoot ?? "data/raw/amf-snapshots");
  const directory = resolve(root, snapshot.snapshotId.replaceAll(":", "-"));
  await mkdir(root, { recursive: true });
  await mkdir(directory);
  try {
    await writeFile(resolve(directory, "content.html"), content, {
      flag: "wx",
    });
    await writeFile(resolve(directory, "report.json"), report, { flag: "wx" });
    await writeFile(
      resolve(directory, "snapshot.json"),
      `${JSON.stringify(snapshot, null, 2)}\n`,
      { flag: "wx" },
    );
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
  return { directory, snapshot };
}
export async function readVerifiedAmfSourceSnapshot(path: string) {
  const directory = resolve(path);
  const snapshot = amfSourceSnapshotSchema.parse(
    JSON.parse(await readFile(resolve(directory, "snapshot.json"), "utf8")),
  );
  if (
    snapshot.content.file !== "content.html" ||
    snapshot.report.file !== "report.json"
  )
    throw new Error("Unexpected AMF artifact filename");
  const [contentBytes, report] = await Promise.all([
    readFile(resolve(directory, snapshot.content.file)),
    readFile(resolve(directory, snapshot.report.file)),
  ]);
  for (const [bytes, meta] of [
    [contentBytes, snapshot.content],
    [report, snapshot.report],
  ] as const) {
    if (bytes.length !== meta.bytes || digest(bytes) !== meta.sha256)
      throw new Error(`AMF artifact checksum mismatch: ${meta.file}`);
  }
  if (
    snapshot.snapshotId !==
    `snapshot:amf:fr-amf-rg:${digest(contentBytes).slice(7)}`
  )
    throw new Error("AMF snapshot ID mismatch");
  await verifyEvidence(contentBytes, report);
  return { directory, snapshot, contentBytes };
}
