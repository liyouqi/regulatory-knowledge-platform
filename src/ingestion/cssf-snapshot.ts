import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { officialCssfHttpsUrl } from "./cssf-source-registry";

const cssfArtifactSchema = z.object({
  url: z.string().url(),
  mediaType: z.string().nullable(),
  etag: z.string().nullable(),
  lastModified: z.string().nullable(),
  sha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  bytes: z.number().int().nonnegative(),
  file: z.string().regex(/^[a-zA-Z0-9._-]+$/),
});

export const cssfSourceSnapshotSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    snapshotId: z
      .string()
      .regex(/^snapshot:cssf:[a-z0-9][a-z0-9-]*:[a-f0-9]{64}$/),
    provenance: z.literal("official"),
    sourceSystem: z.literal("cssf"),
    documentId: z.string().regex(/^lu:cssf:[a-z0-9][a-z0-9-]*$/),
    localId: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    language: z.literal("en"),
    retrievedAt: z.string().datetime(),
    canonicalUrl: z.string().url(),
    page: cssfArtifactSchema,
    content: cssfArtifactSchema,
  })
  .superRefine((snapshot, context) => {
    if (snapshot.documentId !== `lu:cssf:${snapshot.localId}`) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "CSSF document ID does not match local ID",
        path: ["documentId"],
      });
    }
    if (!snapshot.snapshotId.startsWith(`snapshot:cssf:${snapshot.localId}:`)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "CSSF snapshot ID does not match local ID",
        path: ["snapshotId"],
      });
    }
    for (const [path, url] of [
      ["canonicalUrl", snapshot.canonicalUrl],
      ["page", snapshot.page.url],
      ["content", snapshot.content.url],
    ] as const) {
      try {
        officialCssfHttpsUrl(url);
      } catch {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Snapshot URL must use the official CSSF HTTPS host",
          path: [path],
        });
      }
    }
  });

export type CssfSourceSnapshot = z.infer<typeof cssfSourceSnapshotSchema>;

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

export async function readVerifiedCssfSourceSnapshot(
  providedPath: string,
): Promise<{
  directory: string;
  snapshot: CssfSourceSnapshot;
  contentBytes: Uint8Array;
}> {
  const directory = resolve(process.cwd(), providedPath);
  const snapshot = cssfSourceSnapshotSchema.parse(
    JSON.parse(await readFile(resolve(directory, "snapshot.json"), "utf8")),
  );
  let contentBytes: Uint8Array | undefined;

  for (const artifact of [snapshot.page, snapshot.content]) {
    const bytes = new Uint8Array(
      await readFile(artifactPath(directory, artifact.file)),
    );
    if (bytes.byteLength !== artifact.bytes) {
      throw new Error(`Byte count mismatch: ${artifact.file}`);
    }
    if (`sha256:${sha256(bytes)}` !== artifact.sha256) {
      throw new Error(`SHA-256 mismatch: ${artifact.file}`);
    }
    if (artifact === snapshot.content) contentBytes = bytes;
  }

  if (!snapshot.snapshotId.endsWith(snapshot.content.sha256.slice(7))) {
    throw new Error("Snapshot ID does not match the CSSF content hash");
  }
  if (!contentBytes) throw new Error("Snapshot contains no CSSF content");
  return { directory, snapshot, contentBytes };
}
