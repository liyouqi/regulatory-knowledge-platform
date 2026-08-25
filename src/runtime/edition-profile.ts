import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import type { SourceDefinition } from "../ingestion/source-registry";
import type { DocumentView } from "../shared/legal";

export const EDITION_PROFILE_SCHEMA_VERSION = "1.0.0";
export const DEFAULT_EDITION_PROFILE_PATH = resolve(
  process.cwd(),
  "data/edition-profiles.json",
);

const profileIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]*$/u);
const versionSchema = z.string().regex(/^\d+\.\d+\.\d+$/u);
const familyIdSchema = z.string().regex(/^family:[a-z0-9-]+$/u);
const documentIdSchema = z
  .string()
  .regex(/^(?:eu:3[0-9]{4}[A-Z][0-9]{4}|lu:cssf:[a-z0-9][a-z0-9-]*)$/u);

export const editionProfileSchema = z
  .object({
    id: profileIdSchema,
    version: versionSchema,
    displayName: z.string().min(1),
    description: z.string().min(1),
    selection: z
      .discriminatedUnion("mode", [
        z.object({ mode: z.literal("all") }).strict(),
        z
          .object({
            mode: z.literal("allowlist"),
            familyIds: z.array(familyIdSchema),
            documentIds: z.array(documentIdSchema),
          })
          .strict(),
      ])
      .superRefine((selection, context) => {
        if (selection.mode === "allowlist") {
          if (
            selection.familyIds.length === 0 &&
            selection.documentIds.length === 0
          ) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              message: "An allowlist Profile must select a family or document",
            });
          }
          for (const [field, values] of [
            ["familyIds", selection.familyIds],
            ["documentIds", selection.documentIds],
          ] as const) {
            if (new Set(values).size !== values.length) {
              context.addIssue({
                code: z.ZodIssueCode.custom,
                message: `Profile ${field} must not contain duplicates`,
                path: [field],
              });
            }
          }
        }
      }),
  })
  .strict();

export type EditionProfile = z.infer<typeof editionProfileSchema>;

export const editionProfileRegistrySchema = z
  .object({
    schemaVersion: z.literal(EDITION_PROFILE_SCHEMA_VERSION),
    defaultProfileId: profileIdSchema,
    profiles: z.array(editionProfileSchema).min(1),
  })
  .strict()
  .superRefine((registry, context) => {
    const ids = new Set<string>();
    for (const [index, profile] of registry.profiles.entries()) {
      if (ids.has(profile.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate Edition/Profile ID: ${profile.id}`,
          path: ["profiles", index, "id"],
        });
      }
      ids.add(profile.id);
    }
    if (!ids.has(registry.defaultProfileId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Default Edition/Profile does not exist",
        path: ["defaultProfileId"],
      });
    }
  });

export type EditionProfileRegistry = z.infer<
  typeof editionProfileRegistrySchema
>;

export type RuntimeSourceDefinition = Pick<
  SourceDefinition,
  "familyId" | "aliases" | "regulatoryLevel" | "measureType"
> & { celex?: string; localId?: string };

export interface CompiledEditionProfile {
  profile: EditionProfile;
  profileHash: string;
  documents: DocumentView[];
  sources: RuntimeSourceDefinition[];
  excludedCelexes: Set<string>;
}

export const DEFAULT_EDITION_PROFILE: EditionProfile = {
  id: "full-corpus",
  version: "1.0.0",
  displayName: "Full Regulatory Corpus",
  description: "All documents supplied to the runtime builder.",
  selection: { mode: "all" },
};

function sourceDocumentId(source: RuntimeSourceDefinition): string | null {
  if (source.celex) return `eu:${source.celex}`;
  if (source.localId) return `lu:cssf:${source.localId}`;
  return null;
}

export function editionProfileHash(profile: EditionProfile): string {
  return `sha256:${createHash("sha256")
    .update(
      JSON.stringify({
        schemaVersion: EDITION_PROFILE_SCHEMA_VERSION,
        id: profile.id,
        version: profile.version,
        selection: profile.selection,
      }),
    )
    .digest("hex")}`;
}

export function loadEditionProfileRegistrySync(
  registryPath = DEFAULT_EDITION_PROFILE_PATH,
): EditionProfileRegistry {
  return editionProfileRegistrySchema.parse(
    JSON.parse(readFileSync(registryPath, "utf8")),
  );
}

export function findEditionProfile(
  profileId: string | undefined,
  registry = loadEditionProfileRegistrySync(),
): EditionProfile {
  const resolvedId = profileId?.trim() || registry.defaultProfileId;
  const profile = registry.profiles.find(
    (candidate) => candidate.id === resolvedId,
  );
  if (!profile) {
    throw new Error(
      `Unknown Edition/Profile ${resolvedId}; available profiles: ${registry.profiles
        .map((candidate) => candidate.id)
        .join(", ")}`,
    );
  }
  return profile;
}

export function compileEditionProfile(
  profile: EditionProfile,
  inputDocuments: DocumentView[],
  inputSources: RuntimeSourceDefinition[],
): CompiledEditionProfile {
  const parsedProfile = editionProfileSchema.parse(profile);
  const sourceByDocumentId = new Map<string, RuntimeSourceDefinition>();
  const knownFamilies = new Set<string>();

  for (const source of inputSources) {
    const documentId = sourceDocumentId(source);
    if (!documentId) continue;
    if (sourceByDocumentId.has(documentId)) {
      throw new Error(`Duplicate runtime source document ID: ${documentId}`);
    }
    sourceByDocumentId.set(documentId, source);
    knownFamilies.add(source.familyId);
  }

  let allowedSourceIds: Set<string> | null = null;
  if (parsedProfile.selection.mode === "allowlist") {
    for (const familyId of parsedProfile.selection.familyIds) {
      if (!knownFamilies.has(familyId)) {
        throw new Error(
          `Edition/Profile ${parsedProfile.id} references unknown family ${familyId}`,
        );
      }
    }
    for (const documentId of parsedProfile.selection.documentIds) {
      if (!sourceByDocumentId.has(documentId)) {
        throw new Error(
          `Edition/Profile ${parsedProfile.id} references unknown document ${documentId}`,
        );
      }
    }
    const allowedFamilies = new Set(parsedProfile.selection.familyIds);
    allowedSourceIds = new Set(parsedProfile.selection.documentIds);
    for (const [documentId, source] of sourceByDocumentId) {
      if (allowedFamilies.has(source.familyId))
        allowedSourceIds.add(documentId);
    }
  }

  const documents = inputDocuments.filter((document) => {
    if (allowedSourceIds === null) return true;
    if (!sourceByDocumentId.has(document.id)) {
      throw new Error(
        `Edition/Profile ${parsedProfile.id} cannot classify unregistered document ${document.id}`,
      );
    }
    return allowedSourceIds.has(document.id);
  });
  if (documents.length === 0) {
    throw new Error(
      `Edition/Profile ${parsedProfile.id} selected no loaded documents`,
    );
  }

  const loadedDocumentIds = new Set(documents.map((document) => document.id));
  const sources = inputSources.filter((source) => {
    const documentId = sourceDocumentId(source);
    return documentId ? loadedDocumentIds.has(documentId) : false;
  });
  const excludedCelexes = new Set(
    inputSources.flatMap((source) => {
      const documentId = sourceDocumentId(source);
      return source.celex &&
        allowedSourceIds !== null &&
        documentId &&
        !allowedSourceIds.has(documentId)
        ? [source.celex]
        : [];
    }),
  );

  return {
    profile: parsedProfile,
    profileHash: editionProfileHash(parsedProfile),
    documents,
    sources,
    excludedCelexes,
  };
}
