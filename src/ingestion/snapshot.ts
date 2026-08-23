import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";

const responseArtifactSchema = z.object({
  url: z.string().url(),
  mediaType: z.string().nullable(),
  etag: z.string().nullable(),
  lastModified: z.string().nullable(),
  sha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  bytes: z.number().int().nonnegative(),
  file: z.string().regex(/^[a-zA-Z0-9._-]+$/),
});

export const officialSourceSnapshotSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  snapshotId: z.string().regex(/^snapshot:cellar:[0-9A-Z()_-]+:[a-f0-9]{64}$/),
  provenance: z.literal("official"),
  sourceSystem: z.literal("cellar"),
  celex: z.string().min(5),
  language: z.literal("en"),
  retrievedAt: z.string().datetime(),
  canonicalUrl: z.string().url(),
  workUri: z.string().url(),
  expressionUri: z.string().url(),
  manifestationUri: z.string().url(),
  treeNotice: responseArtifactSchema,
  content: responseArtifactSchema.extend({
    upstreamStreamName: z.string().min(1),
  }),
});

export type OfficialSourceSnapshot = z.infer<
  typeof officialSourceSnapshotSchema
>;

function artifactPath(snapshotDirectory: string, file: string): string {
  const candidate = resolve(snapshotDirectory, file);
  if (dirname(candidate) !== snapshotDirectory) {
    throw new Error(`Snapshot artifact escapes its directory: ${file}`);
  }
  return candidate;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function readVerifiedSourceSnapshot(
  providedPath: string,
): Promise<{
  directory: string;
  snapshot: OfficialSourceSnapshot;
  contentBytes: Uint8Array;
}> {
  const directory = resolve(process.cwd(), providedPath);
  const snapshot = officialSourceSnapshotSchema.parse(
    JSON.parse(await readFile(resolve(directory, "snapshot.json"), "utf8")),
  );
  let contentBytes: Uint8Array | undefined;

  for (const artifact of [snapshot.treeNotice, snapshot.content]) {
    const bytes = new Uint8Array(
      await readFile(artifactPath(directory, artifact.file)),
    );
    const actualHash = `sha256:${sha256(bytes)}`;
    if (bytes.byteLength !== artifact.bytes) {
      throw new Error(`Byte count mismatch: ${artifact.file}`);
    }
    if (actualHash !== artifact.sha256) {
      throw new Error(`SHA-256 mismatch: ${artifact.file}`);
    }
    if (artifact === snapshot.content) contentBytes = bytes;
  }

  if (!snapshot.snapshotId.endsWith(snapshot.content.sha256.slice(7))) {
    throw new Error("Snapshot ID does not match the Formex content hash");
  }
  if (!contentBytes) throw new Error("Snapshot contains no Formex content");

  return { directory, snapshot, contentBytes };
}
