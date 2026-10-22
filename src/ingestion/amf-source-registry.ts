import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";

const hash = z.string().regex(/^sha256:[a-f0-9]{64}$/);
export const amfSourceDefinitionSchema = z
  .object({
    status: z.enum(["candidate", "active"]),
    shortName: z.string().min(1),
    officialTitle: z.string().min(1),
    aliases: z.array(z.string().min(1)).min(1),
    topics: z.array(z.string().min(1)).min(1),
    localId: z.literal("fr-amf-rg"),
    documentId: z.literal("fr:amf:rg"),
    familyId: z.literal("family:national-fr"),
    authority: z.literal("AMF"),
    jurisdiction: z.literal("FR"),
    language: z.literal("fr"),
    documentType: z.literal("regulation"),
    regulatoryLevel: z.literal("level-2"),
    measureType: z.literal("other"),
    publicationDate: z.null(),
    sourceVersionDate: z.literal("2026-09-11"),
    checkedAt: z.string().datetime(),
    pageUrl: z.literal(
      "https://www.amf-france.org/fr/eli/fr/aai/amf/rg/20260911/notes",
    ),
    contentUrl: z.literal("https://www.amf-france.org/fr/eli/fr/aai/amf/rg"),
    versionUrl: z.literal(
      "https://www.amf-france.org/fr/eli/fr/aai/amf/rg/20260911/notes",
    ),
    componentPublications: z.tuple([
      z
        .object({
          component: z.literal("Book I"),
          date: z.literal("2004-10-29"),
          url: z.literal(
            "https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000000254713",
          ),
        })
        .strict(),
      z
        .object({
          component: z.literal("Books II–VI"),
          date: z.literal("2004-11-24"),
          url: z.literal(
            "https://www.legifrance.gouv.fr/jorf/jo/2004/11/24/0273",
          ),
        })
        .strict(),
    ]),
    quality: z
      .object({
        inputSha256: hash,
        astSha256: hash,
        baselineSha256: hash,
        groups: z.number().int().positive(),
        articles: z.number().int().positive(),
        notes: z.number().int().positive(),
        documentNotes: z.number().int().nonnegative(),
        groupNotes: z.number().int().nonnegative(),
        articleNotes: z.number().int().nonnegative(),
        maximumWarnings: z.literal(0),
      })
      .strict(),
  })
  .strict();
export type AmfSourceDefinition = z.infer<typeof amfSourceDefinitionSchema>;
export async function loadAmfSourceRegistry(
  path = resolve(process.cwd(), "data/amf-source-registry.json"),
): Promise<AmfSourceDefinition[]> {
  return z
    .tuple([amfSourceDefinitionSchema])
    .parse(JSON.parse(await readFile(path, "utf8")));
}
export function loadAmfSourceRegistrySync(
  path = resolve(process.cwd(), "data/amf-source-registry.json"),
): AmfSourceDefinition[] {
  return z
    .tuple([amfSourceDefinitionSchema])
    .parse(JSON.parse(readFileSync(path, "utf8")));
}
