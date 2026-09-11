import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { unzipSync } from "fflate";
import { z } from "zod";

const officialCellarUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === "https:" && url.hostname === "publications.europa.eu"
    );
  }, "Earth snapshots may only contain HTTPS Publications Office source URLs");

const artifactSchema = z.object({
  url: officialCellarUrlSchema,
  mediaType: z.string().nullable(),
  etag: z.string().nullable(),
  lastModified: z.string().nullable(),
  sha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  bytes: z.number().int().nonnegative(),
  file: z.string().regex(/^[a-zA-Z0-9._-]+$/),
});

const snapshotFields = {
  snapshotId: z.string().regex(/^earth:cellar:[0-9A-Z()_-]+:[a-f0-9]{64}$/),
  provenance: z.literal("official"),
  sourceSystem: z.literal("cellar"),
  celex: z.string().min(5),
  language: z.literal("en"),
  retrievedAt: z.string().datetime(),
  treeNoticeUrl: officialCellarUrlSchema,
  workUri: officialCellarUrlSchema,
  expressionUri: officialCellarUrlSchema,
  manifestationUri: officialCellarUrlSchema,
  treeNotice: artifactSchema,
  content: artifactSchema.extend({
    upstreamStreamName: z.string().min(1),
    assembly: z.literal("cellar-manifestation-items").optional(),
    upstreamItems: z
      .array(artifactSchema.extend({ upstreamStreamName: z.string().min(1) }))
      .min(2)
      .optional(),
  }),
};

const legacyEarthOfficialSnapshotSchema = z
  .object({
    ...snapshotFields,
    schemaVersion: z.enum(["1.0.0", "1.1.0"]),
    universeId: z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}$/),
  })
  .strict();

const reusableEarthOfficialSnapshotSchema = z
  .object({
    ...snapshotFields,
    schemaVersion: z.literal("2.0.0"),
  })
  .strict();

export const earthOfficialSnapshotSchema = z
  .union([
    legacyEarthOfficialSnapshotSchema,
    reusableEarthOfficialSnapshotSchema,
  ])
  .superRefine((snapshot, context) => {
    const multiItem = Boolean(snapshot.content.upstreamItems);
    if (snapshot.schemaVersion === "1.0.0" && multiItem) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["content", "upstreamItems"],
        message: "Legacy single-item snapshot cannot contain upstream items",
      });
    }
    if (snapshot.schemaVersion === "1.1.0" && !multiItem) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["content", "upstreamItems"],
        message: "Legacy multi-item snapshot requires upstream items",
      });
    }
    if (
      multiItem &&
      snapshot.content.assembly !== "cellar-manifestation-items"
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["content", "assembly"],
        message: "Multi-item snapshot requires Cellar item assembly",
      });
    }
  });

export type EarthOfficialSnapshot = z.infer<typeof earthOfficialSnapshotSchema>;

function hash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function artifactPath(directory: string, file: string): string {
  const candidate = resolve(directory, file);
  if (dirname(candidate) !== directory) {
    throw new Error(`Earth snapshot artifact escapes its directory: ${file}`);
  }
  return candidate;
}

/** Validates both snapshot metadata and every persisted byte. */
export async function readVerifiedEarthSnapshot(
  snapshotDirectory: string,
): Promise<{ snapshot: EarthOfficialSnapshot; contentBytes: Uint8Array }> {
  const directory = resolve(process.cwd(), snapshotDirectory);
  const snapshot = earthOfficialSnapshotSchema.parse(
    JSON.parse(await readFile(resolve(directory, "snapshot.json"), "utf8")),
  );
  const artifacts = [snapshot.treeNotice, snapshot.content];
  let contentBytes: Uint8Array | undefined;
  for (const artifact of artifacts) {
    const bytes = new Uint8Array(
      await readFile(artifactPath(directory, artifact.file)),
    );
    if (bytes.byteLength !== artifact.bytes) {
      throw new Error(`Byte count mismatch: ${artifact.file}`);
    }
    if (`sha256:${hash(bytes)}` !== artifact.sha256) {
      throw new Error(`SHA-256 mismatch: ${artifact.file}`);
    }
    if (artifact === snapshot.content) contentBytes = bytes;
  }
  if (!snapshot.snapshotId.endsWith(snapshot.content.sha256.slice(7))) {
    throw new Error("Earth snapshot ID does not match its content hash");
  }
  if (!contentBytes) throw new Error("Earth snapshot contains no content");
  if (snapshot.content.upstreamItems) {
    const packageFiles = unzipSync(contentBytes);
    const actualFiles = Object.keys(packageFiles).sort();
    const expectedFiles = snapshot.content.upstreamItems
      .map(({ file }) => file)
      .sort();
    if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
      throw new Error("Earth package contents do not match upstream items");
    }
    for (const item of snapshot.content.upstreamItems) {
      const bytes = packageFiles[item.file];
      if (
        !bytes ||
        bytes.byteLength !== item.bytes ||
        `sha256:${hash(bytes)}` !== item.sha256
      ) {
        throw new Error(`Earth package item failed verification: ${item.file}`);
      }
    }
  }
  return { snapshot, contentBytes };
}
