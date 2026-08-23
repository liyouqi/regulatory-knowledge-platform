import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { normalizeCelex } from "../canonical/ids";

export const sourceDefinitionSchema = z.object({
  familyId: z.string().regex(/^family:[a-z0-9-]+$/),
  shortName: z.string().min(1),
  celex: z.string().transform(normalizeCelex),
  language: z.literal("ENG"),
  documentType: z.enum(["regulation", "directive"]),
  publicationDate: z.string().date(),
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

export async function loadSourceRegistry(
  registryPath = resolve(process.cwd(), "data/source-registry.json"),
): Promise<SourceDefinition[]> {
  const raw = JSON.parse(await readFile(registryPath, "utf8"));
  const sources = z.array(sourceDefinitionSchema).min(1).parse(raw);
  const seenCelex = new Set<string>();
  const seenFamilies = new Set<string>();

  for (const source of sources) {
    if (seenCelex.has(source.celex)) {
      throw new Error(`Duplicate CELEX in source registry: ${source.celex}`);
    }
    if (seenFamilies.has(source.familyId)) {
      throw new Error(
        `Duplicate family ID in source registry: ${source.familyId}`,
      );
    }
    seenCelex.add(source.celex);
    seenFamilies.add(source.familyId);
  }

  return sources;
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
