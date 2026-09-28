import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { unzipSync } from "fflate";
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

export const officialSourceSnapshotSchema = z
  .object({
    schemaVersion: z.enum(["1.0.0", "1.1.0", "1.2.0"]),
    snapshotId: z
      .string()
      .regex(/^snapshot:cellar:[0-9A-Z()_-]+:[a-f0-9]{64}$/),
    provenance: z.literal("official"),
    sourceSystem: z.literal("cellar"),
    celex: z.string().min(5),
    expressionCelex: z.string().min(5).optional(),
    language: z.literal("en"),
    retrievedAt: z.string().datetime(),
    canonicalUrl: z.string().url(),
    workUri: z.string().url(),
    expressionUri: z.string().url(),
    manifestationUri: z.string().url(),
    treeNotice: responseArtifactSchema,
    content: responseArtifactSchema.extend({
      upstreamStreamName: z.string().min(1),
      assembly: z.literal("cellar-manifestation-items").optional(),
      upstreamItems: z
        .array(
          responseArtifactSchema.extend({
            upstreamStreamName: z.string().min(1),
          }),
        )
        .min(2)
        .optional(),
    }),
  })
  .superRefine((snapshot, context) => {
    const isMultiItem = Boolean(snapshot.content.upstreamItems);
    if (
      snapshot.schemaVersion !== "1.2.0" &&
      (snapshot.schemaVersion === "1.1.0") !== isMultiItem
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Snapshot schema 1.1.0 requires a multi-item Cellar manifestation",
        path: ["content", "upstreamItems"],
      });
    }
    if (
      isMultiItem &&
      snapshot.content.assembly !== "cellar-manifestation-items"
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Multi-item snapshot must declare its assembly method",
        path: ["content", "assembly"],
      });
    }
    if (!isMultiItem && snapshot.content.assembly !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Single-item snapshot cannot declare a package assembly",
        path: ["content", "assembly"],
      });
    }
    const itemFiles = snapshot.content.upstreamItems?.map(({ file }) => file);
    if (itemFiles && new Set(itemFiles).size !== itemFiles.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Multi-item snapshot contains duplicate package filenames",
        path: ["content", "upstreamItems"],
      });
    }
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

  if (snapshot.content.upstreamItems) {
    const packageFiles = unzipSync(contentBytes);
    const actualFiles = Object.keys(packageFiles).sort();
    const expectedFiles = snapshot.content.upstreamItems
      .map(({ file }) => file)
      .sort();
    if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
      throw new Error("Formex package contents do not match upstream items");
    }
    for (const item of snapshot.content.upstreamItems) {
      const bytes = packageFiles[item.file];
      if (!bytes) {
        throw new Error(
          `Formex package is missing upstream item: ${item.file}`,
        );
      }
      if (bytes.byteLength !== item.bytes) {
        throw new Error(`Byte count mismatch: ${item.file}`);
      }
      if (`sha256:${sha256(bytes)}` !== item.sha256) {
        throw new Error(`SHA-256 mismatch: ${item.file}`);
      }
    }
  }

  return { directory, snapshot, contentBytes };
}
