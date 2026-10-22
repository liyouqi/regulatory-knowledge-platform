import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { extractNationalXml } from "./national-archive";
import { officialNationalHttpsUrl } from "./national-source-registry";
const artifact = z
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
export const nationalSourceSnapshotSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    snapshotId: z
      .string()
      .regex(/^snapshot:national:de-[a-z0-9-]+:[a-f0-9]{64}$/),
    provenance: z.literal("official"),
    sourceSystem: z.literal("gii"),
    documentId: z.string().regex(/^de:gii:bjnr[0-9]+$/),
    localId: z.string().regex(/^de-[a-z0-9-]+$/),
    language: z.literal("de"),
    retrievedAt: z.string().datetime(),
    canonicalUrl: z.string().url(),
    content: artifact,
    archive: artifact,
  })
  .strict()
  .superRefine((s, c) => {
    if (
      s.snapshotId !==
      `snapshot:national:${s.localId}:${s.content.sha256.slice(7)}`
    )
      c.addIssue({
        code: "custom",
        path: ["snapshotId"],
        message: "Snapshot ID must match local ID and XML content hash",
      });
    for (const [path, url] of [
      ["canonicalUrl", s.canonicalUrl],
      ["content", s.content.url],
      ["archive", s.archive.url],
    ] as const)
      try {
        officialNationalHttpsUrl(url);
      } catch {
        c.addIssue({
          code: "custom",
          path: [path],
          message: "URL must be official",
        });
      }
  });
export type NationalSourceSnapshot = z.infer<
  typeof nationalSourceSnapshotSchema
>;
export async function readVerifiedNationalSourceSnapshot(
  path: string,
): Promise<{
  directory: string;
  snapshot: NationalSourceSnapshot;
  contentBytes: Uint8Array;
}> {
  const directory = resolve(process.cwd(), path);
  const snapshot = nationalSourceSnapshotSchema.parse(
    JSON.parse(await readFile(resolve(directory, "snapshot.json"), "utf8")),
  );
  let contentBytes: Uint8Array | undefined;
  let archiveBytes: Uint8Array | undefined;
  for (const item of [snapshot.content, snapshot.archive]) {
    const file = resolve(directory, item.file);
    if (dirname(file) !== directory)
      throw new Error("Snapshot artifact escapes its directory");
    const bytes = new Uint8Array(await readFile(file));
    if (
      bytes.length !== item.bytes ||
      `sha256:${createHash("sha256").update(bytes).digest("hex")}` !==
        item.sha256
    )
      throw new Error(`Snapshot checksum or byte count mismatch: ${item.file}`);
    if (item === snapshot.content) contentBytes = bytes;
    if (item === snapshot.archive) archiveBytes = bytes;
  }
  if (!contentBytes || !archiveBytes)
    throw new Error("Snapshot has no content");
  const extracted = extractNationalXml(
    archiveBytes,
    snapshot.documentId.split(":")[2].toUpperCase(),
  );
  if (!Buffer.from(extracted).equals(Buffer.from(contentBytes)))
    throw new Error("Snapshot XML differs from its archive");
  return { directory, snapshot, contentBytes };
}
