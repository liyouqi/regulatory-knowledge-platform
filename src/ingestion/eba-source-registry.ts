import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";

const EBA_HOSTS = new Set(["eba.europa.eu", "www.eba.europa.eu"]);

export function officialEbaHttpsUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || !EBA_HOSTS.has(url.hostname)) {
    throw new Error(`Unexpected EBA official URL: ${value}`);
  }
  return url.toString();
}

const qualitySchema = z
  .object({
    pageCount: z.number().int().positive(),
    structuralNodeCount: z.number().int().nonnegative(),
    provisionCount: z.number().int().positive(),
    blockCount: z.number().int().nonnegative(),
    maximumWarnings: z.number().int().nonnegative(),
    textHashes: z.record(
      z.string().min(1),
      z.string().regex(/^sha256:[a-f0-9]{64}$/),
    ),
  })
  .strict();

export const ebaSourceDefinitionSchema = z
  .object({
    localId: z.string().regex(/^eba-gl-\d{4}-\d{2}$/),
    documentId: z.string().regex(/^eu:eba:gl:\d{4}:\d{2}$/),
    familyId: z.string().startsWith("family:"),
    authority: z.literal("EBA"),
    jurisdiction: z.literal("EU"),
    shortName: z.string().min(1),
    officialTitle: z.string().min(1),
    aliases: z.array(z.string().min(1)).min(1),
    language: z.literal("en"),
    documentType: z.literal("guidance"),
    regulatoryLevel: z.literal("level-3"),
    measureType: z.literal("guideline"),
    publicationDate: z.string().date(),
    checkedAt: z.string().datetime(),
    pageUrl: z.string().url(),
    contentUrl: z.string().url(),
    contentMediaType: z.literal("application/pdf"),
    topics: z.array(z.string().min(1)).min(1),
    quality: qualitySchema.optional(),
  })
  .strict()
  .superRefine((source, context) => {
    const [, , , year, sequence] = source.documentId.split(":");
    if (source.localId !== `eba-gl-${year}-${sequence}`) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "EBA document ID does not match local ID",
        path: ["documentId"],
      });
    }
    for (const [field, value] of [
      ["pageUrl", source.pageUrl],
      ["contentUrl", source.contentUrl],
    ] as const) {
      try {
        officialEbaHttpsUrl(value);
      } catch {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${field} must use an official EBA HTTPS host`,
          path: [field],
        });
      }
    }
  });

export type EbaSourceDefinition = z.infer<typeof ebaSourceDefinitionSchema>;

function parseRegistry(raw: unknown): EbaSourceDefinition[] {
  const sources = z.array(ebaSourceDefinitionSchema).min(1).parse(raw);
  const ids = sources.flatMap((source) => [source.localId, source.documentId]);
  if (new Set(ids).size !== ids.length) {
    throw new Error("EBA source identifiers must be unique");
  }
  return sources;
}

export function loadEbaSourceRegistrySync(
  path = resolve(process.cwd(), "data/eba-source-registry.json"),
): EbaSourceDefinition[] {
  return parseRegistry(JSON.parse(readFileSync(path, "utf8")));
}

export async function loadEbaSourceRegistry(
  path = resolve(process.cwd(), "data/eba-source-registry.json"),
): Promise<EbaSourceDefinition[]> {
  return parseRegistry(JSON.parse(await readFile(path, "utf8")));
}

export async function findEbaSource(
  localId: string,
): Promise<EbaSourceDefinition> {
  const source = (await loadEbaSourceRegistry()).find(
    (candidate) => candidate.localId === localId,
  );
  if (!source) throw new Error(`EBA source is not registered: ${localId}`);
  return source;
}
