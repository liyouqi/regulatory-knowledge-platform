import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { normalizeCelex } from "../canonical/ids";
import { sourceStatusSchema } from "../shared/source-status";

export const sourceDefinitionSchema = z.object({
  familyId: z.string().regex(/^family:[a-z0-9-]+$/),
  shortName: z.string().min(1),
  aliases: z.array(z.string().min(1)).min(1),
  celex: z.string().transform(normalizeCelex),
  language: z.literal("ENG"),
  documentType: z.enum(["regulation", "directive"]),
  regulatoryLevel: z.enum(["level-1", "level-2", "level-3"]),
  measureType: z.enum([
    "primary-act",
    "rts",
    "its",
    "guideline",
    "qa",
    "other",
  ]),
  publicationDate: z.string().date(),
  sourceStatus: sourceStatusSchema.optional(),
  quality: z
    .object({
      articleCount: z.number().int().positive(),
      recitalCount: z.number().int().nonnegative(),
      annexCount: z.number().int().nonnegative(),
      paragraphCount: z.number().int().nonnegative(),
      pointCount: z.number().int().nonnegative(),
      structuralNodeCount: z.number().int().nonnegative(),
      maximumWarnings: z.number().int().nonnegative(),
      textHashes: z.record(
        z.string().min(1),
        z.string().regex(/^sha256:[a-f0-9]{64}$/),
      ),
    })
    .optional(),
  eliUrl: z.string().url(),
});

export type SourceDefinition = z.infer<typeof sourceDefinitionSchema>;

function parseSourceRegistry(raw: unknown): SourceDefinition[] {
  const sources = z.array(sourceDefinitionSchema).min(1).parse(raw);
  const seenCelex = new Set<string>();
  const aliasOwners = new Map<string, string>();

  for (const source of sources) {
    if (seenCelex.has(source.celex)) {
      throw new Error(`Duplicate CELEX in source registry: ${source.celex}`);
    }
    seenCelex.add(source.celex);
    for (const alias of [source.shortName, ...source.aliases]) {
      const normalizedAlias = alias.normalize("NFKC").trim().toLowerCase();
      const owner = aliasOwners.get(normalizedAlias);
      if (owner && owner !== source.celex) {
        throw new Error(
          `Ambiguous source alias ${alias}: used by ${owner} and ${source.celex}`,
        );
      }
      aliasOwners.set(normalizedAlias, source.celex);
    }
  }

  return sources;
}

export function loadSourceRegistrySync(
  registryPath = resolve(process.cwd(), "data/source-registry.json"),
): SourceDefinition[] {
  return parseSourceRegistry(JSON.parse(readFileSync(registryPath, "utf8")));
}

export async function loadSourceRegistry(
  registryPath = resolve(process.cwd(), "data/source-registry.json"),
): Promise<SourceDefinition[]> {
  return parseSourceRegistry(JSON.parse(await readFile(registryPath, "utf8")));
}

export async function findSource(celex: string): Promise<SourceDefinition> {
  const normalized = normalizeCelex(celex);
  const source = (await loadSourceRegistry()).find(
    (candidate) => candidate.celex === normalized,
  );

  if (!source) {
    throw new Error(
      `CELEX ${normalized} is not registered in data/source-registry.json`,
    );
  }

  return source;
}
