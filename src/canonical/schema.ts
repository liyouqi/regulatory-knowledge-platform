import { z } from "zod";
import { sourceLocatorSchema } from "../shared/source-locator";
import { sourceStatusSchema } from "../shared/source-status";

export { sourceLocatorSchema } from "../shared/source-locator";

export const CANONICAL_SCHEMA_VERSION = "1.2.0" as const;

const logicalIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9][a-zA-Z0-9:._-]*$/);
const sha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export const structuralPathEntrySchema = z.object({
  logicalId: logicalIdSchema,
  kind: z.enum([
    "title",
    "part",
    "chapter",
    "section",
    "subsection",
    "division",
  ]),
  label: z.string().min(1),
});

const versionedEntitySchema = z.object({
  logicalId: logicalIdSchema,
  sourceVersionId: z.string().min(3),
  sourceSnapshotId: z.string().min(1),
  displayOrder: z.number().int().nonnegative(),
  sourceLocator: sourceLocatorSchema,
  parserWarnings: z.array(z.string()),
});

export const structuralNodeSchema = versionedEntitySchema.extend({
  kind: z.enum([
    "title",
    "part",
    "chapter",
    "section",
    "subsection",
    "division",
  ]),
  numberRaw: z.string().optional(),
  numberNormalized: z.string().optional(),
  label: z.string().min(1),
  title: z.string().optional(),
  parentLogicalId: logicalIdSchema.optional(),
});

export const provisionKindSchema = z.enum([
  "article",
  "paragraph",
  "subparagraph",
  "point",
  "subpoint",
  "recital",
  "annex",
  "annex-part",
  "table",
  "other",
]);

export const orderedProvisionContentEntrySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string().min(1) }),
  z.object({ type: z.literal("child"), childLogicalId: logicalIdSchema }),
  z.object({ type: z.literal("resource"), resourceId: logicalIdSchema }),
]);

export const canonicalResourceSchema = z.object({
  id: logicalIdSchema,
  kind: z.literal("formula"),
  sourceFileName: z.string().min(1),
  sourceMediaType: z.literal("image/tiff"),
  sourceSha256: sha256Schema,
  mediaType: z.literal("image/png"),
  renditionSha256: sha256Schema,
  dataBase64: z.string().min(1),
});

export const provisionSchema = versionedEntitySchema.extend({
  kind: provisionKindSchema,
  numberRaw: z.string().optional(),
  numberNormalized: z.string().optional(),
  label: z.string().min(1),
  title: z.string().optional(),
  text: z.string(),
  leadText: z.string().optional(),
  orderedContent: z.array(orderedProvisionContentEntrySchema).optional(),
  contentHash: sha256Schema,
  parentLogicalId: logicalIdSchema.optional(),
  structuralPath: z.array(structuralPathEntrySchema),
});

export const sourceSnapshotSchema = z.object({
  id: z.string().min(1),
  provenance: z.enum(["official", "fixture"]),
  sourceSystem: z.enum(["cellar", "eur-lex", "cssf", "eba", "fixture"]),
  retrievedAt: z.string().datetime(),
  canonicalUrl: z.string().url(),
  contentUrl: z.string().url(),
  mediaType: z.string().min(1),
  sha256: sha256Schema,
  bytes: z.number().int().nonnegative(),
  sourceVersion: z.string().min(1),
  sourceStatus: sourceStatusSchema.optional(),
  workUri: z.string().url().optional(),
  expressionUri: z.string().url().optional(),
  manifestationUri: z.string().url().optional(),
});

export const canonicalDocumentSchema = versionedEntitySchema.extend({
  schemaVersion: z.literal(CANONICAL_SCHEMA_VERSION),
  jurisdiction: z.enum(["EU", "LU"]),
  language: z.string().regex(/^[a-z]{2,3}$/),
  documentType: z.enum([
    "regulation",
    "directive",
    "law",
    "circular",
    "guidance",
    "other",
  ]),
  identifiers: z.object({
    celex: z.string().optional(),
    eli: z.string().url().optional(),
    localId: z.string().optional(),
  }),
  familyIds: z.array(logicalIdSchema).min(1),
  shortName: z.string().min(1),
  officialTitle: z.string().min(1),
  publicationDate: z.string().date(),
  source: sourceSnapshotSchema,
  resources: z.array(canonicalResourceSchema).optional(),
  structuralNodes: z.array(structuralNodeSchema),
  provisions: z.array(provisionSchema),
});

export type CanonicalDocument = z.infer<typeof canonicalDocumentSchema>;
export type CanonicalResource = z.infer<typeof canonicalResourceSchema>;
export type Provision = z.infer<typeof provisionSchema>;
export type SourceSnapshot = z.infer<typeof sourceSnapshotSchema>;
