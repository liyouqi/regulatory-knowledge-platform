import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { officialEbaHttpsUrl } from "./eba-source-registry";

const artifactSchema = z
  .object({
    url: z.string().url(),
    mediaType: z.string().nullable(),
    etag: z.string().nullable(),
    lastModified: z.string().nullable(),
    sha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    bytes: z.number().int().nonnegative(),
    file: z.string().regex(/^[a-zA-Z0-9._-]+$/),
  })
  .strict();

export const ebaSourceSnapshotSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    snapshotId: z
      .string()
      .regex(/^snapshot:eba:eba-gl-\d{4}-\d{2}:[a-f0-9]{64}$/),
    provenance: z.literal("official"),
    sourceSystem: z.literal("eba"),
    documentId: z.string().regex(/^eu:eba:gl:\d{4}:\d{2}$/),
    localId: z.string().regex(/^eba-gl-\d{4}-\d{2}$/),
    language: z.literal("en"),
    retrievedAt: z.string().datetime(),
    canonicalUrl: z.string().url(),
    page: artifactSchema,
    content: artifactSchema,
  })
  .strict()
  .superRefine((snapshot, context) => {
    if (!snapshot.snapshotId.startsWith(`snapshot:eba:${snapshot.localId}:`)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "EBA snapshot ID does not match local ID",
        path: ["snapshotId"],
      });
    }
    for (const [path, url] of [
      ["canonicalUrl", snapshot.canonicalUrl],
      ["page", snapshot.page.url],
      ["content", snapshot.content.url],
    ] as const) {
      try {
        officialEbaHttpsUrl(url);
      } catch {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Snapshot URL must use an official EBA HTTPS host",
          path: [path],
        });
      }
    }
  });

export type EbaSourceSnapshot = z.infer<typeof ebaSourceSnapshotSchema>;

function artifactPath(directory: string, file: string): string {
  const candidate = resolve(directory, file);
  if (dirname(candidate) !== directory) {
    throw new Error(`Snapshot artifact escapes its directory: ${file}`);
  }
  return candidate;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function readVerifiedEbaSourceSnapshot(path: string): Promise<{
  directory: string;
  snapshot: EbaSourceSnapshot;
  contentBytes: Uint8Array;
}> {
  const directory = resolve(process.cwd(), path);
  const snapshot = ebaSourceSnapshotSchema.parse(
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
    throw new Error("Snapshot ID does not match EBA content hash");
  }
  if (!contentBytes) throw new Error("Snapshot contains no EBA content");
  return { directory, snapshot, contentBytes };
}
