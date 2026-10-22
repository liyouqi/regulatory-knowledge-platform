import { z } from "zod";
import {
  contentRoleSchema,
  contentUnitSchema,
  contentUnitV14Schema,
  legacyContentUnitSchema,
} from "../shared/content-unit";
import { sourceLocatorSchema } from "../shared/source-locator";
import {
  legacySourceStatusSchema,
  sourceCorrectionSchema,
  sourceStatusSchema,
} from "../shared/source-status";

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
  sourceStatus: legacySourceStatusSchema.optional(),
  workUri: z.string().url().optional(),
  expressionUri: z.string().url().optional(),
  manifestationUri: z.string().url().optional(),
});

export const canonicalDocumentV12Schema = versionedEntitySchema.extend({
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

export const NATIONAL_CANONICAL_SCHEMA_VERSION = "1.3.0" as const;
const roleHashesSchema = z
  .object({
    "operative-text": sha256Schema,
    "source-note": sha256Schema,
    toc: sha256Schema,
  })
  .strict();
export const nationalProvisionSchema = provisionSchema.extend({
  contentRole: contentRoleSchema,
  orderedUnits: z.array(legacyContentUnitSchema),
  roleHashes: roleHashesSchema,
});
export const canonicalDocumentV13Schema = canonicalDocumentV12Schema.extend({
  schemaVersion: z.literal(NATIONAL_CANONICAL_SCHEMA_VERSION),
  jurisdiction: z.literal("DE"),
  language: z.literal("de"),
  documentType: z.literal("law"),
  identifiers: z.object({
    localId: z.string().min(1),
    nationalId: z.string().regex(/^BJNR[0-9]+$/u),
    celex: z.never().optional(),
    eli: z.string().url().optional(),
  }),
  source: sourceSnapshotSchema.extend({ sourceSystem: z.literal("gii") }),
  provisions: z.array(nationalProvisionSchema),
});
export const nationalProvisionV14Schema = nationalProvisionSchema
  .extend({
    orderedUnits: z.array(contentUnitV14Schema),
    structuralPath: z.array(structuralPathEntrySchema.strict()),
    orderedContent: z
      .array(
        z.discriminatedUnion("type", [
          z
            .object({ type: z.literal("text"), text: z.string().min(1) })
            .strict(),
          z
            .object({
              type: z.literal("child"),
              childLogicalId: logicalIdSchema,
            })
            .strict(),
          z
            .object({
              type: z.literal("resource"),
              resourceId: logicalIdSchema,
            })
            .strict(),
        ]),
      )
      .optional(),
  })
  .strict();
export const canonicalDocumentV14Schema = canonicalDocumentV13Schema
  .extend({
    schemaVersion: z.literal("1.4.0"),
    provisions: z.array(nationalProvisionV14Schema),
    identifiers: canonicalDocumentV13Schema.shape.identifiers.strict(),
    source: canonicalDocumentV13Schema.shape.source
      .extend({
        sourceStatus: legacySourceStatusSchema
          .extend({ corrections: z.array(sourceCorrectionSchema.strict()) })
          .strict()
          .optional(),
      })
      .strict(),
    resources: z.array(canonicalResourceSchema.strict()).optional(),
    structuralNodes: z.array(structuralNodeSchema.strict()),
  })
  .strict();

export const amfProvisionSchema = nationalProvisionV14Schema
  .extend({
    orderedUnits: z.array(contentUnitSchema),
    officialSourceUrl: z.string().url(),
    rawHref: z.string().min(1),
  })
  .strict();
export const scopedSourceNoteSchema = z
  .object({
    scope: z.enum(["document", "structure"]),
    ownerId: logicalIdSchema,
    ownerSourceUrl: z.string().url(),
    position: z.number().int().nonnegative(),
    sourceLocator: sourceLocatorSchema,
    orderedUnits: z.array(contentUnitSchema),
    contentHash: sha256Schema,
  })
  .strict();
export const canonicalDocumentV15Schema = canonicalDocumentV12Schema
  .extend({
    schemaVersion: z.literal("1.5.0"),
    logicalId: z.literal("fr:amf:rg"),
    jurisdiction: z.literal("FR"),
    language: z.literal("fr"),
    documentType: z.literal("regulation"),
    publicationDate: z.null(),
    publicationDateBasis: z.literal(
      "aggregate-with-multiple-component-publications",
    ),
    identifiers: z
      .object({
        localId: z.literal("fr-amf-rg"),
        eli: z.literal("https://www.amf-france.org/fr/eli/fr/aai/amf/rg"),
        celex: z.never().optional(),
      })
      .strict(),
    source: sourceSnapshotSchema
      .extend({
        sourceSystem: z.literal("amf"),
        retrievedAt: z.null(),
        importedAt: z.string().datetime(),
        capturedOn: z.literal("2026-10-20"),
        captureDateBasis: z.literal("archived-probe-directory"),
        retrievalTimestampBasis: z.literal("date-only-official-probe"),
        sourceStatus: sourceStatusSchema
          .extend({
            basis: z.literal("consolidated"),
            checkedAt: z.string().datetime(),
            textAuthorityStatus: z.literal("publisher-consolidation"),
            textAsOfBasis: z.literal("publisher-version-date"),
            corrections: z.array(sourceCorrectionSchema.strict()),
          })
          .strict(),
      })
      .strict(),
    structuralNodes: z.array(
      structuralNodeSchema
        .extend({ officialSourceUrl: z.string().url() })
        .strict(),
    ),
    provisions: z.array(amfProvisionSchema),
    scopedSourceNotes: z.array(scopedSourceNoteSchema),
    resources: z.never().optional(),
  })
  .strict();
export const canonicalDocumentSchema = z.discriminatedUnion("schemaVersion", [
  canonicalDocumentV12Schema,
  canonicalDocumentV13Schema,
  canonicalDocumentV14Schema,
  canonicalDocumentV15Schema,
]);

export type CanonicalDocument = z.infer<typeof canonicalDocumentSchema>;
export type LegacyCanonicalDocument = z.infer<
  typeof canonicalDocumentV12Schema
>;
export type CanonicalResource = z.infer<typeof canonicalResourceSchema>;
export type Provision = z.infer<typeof provisionSchema> &
  Partial<
    Pick<
      z.infer<typeof nationalProvisionSchema>,
      "contentRole" | "orderedUnits" | "roleHashes"
    >
  >;
export type SourceSnapshot = CanonicalDocument["source"];
