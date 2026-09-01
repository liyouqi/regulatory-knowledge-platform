import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { EbaQaBuild } from "../qa/eba-qa";
import type { LegalEntityRecord } from "../relationships/explicit-reference";
import type { DocumentView } from "../shared/legal";
import {
  type DossierDataset,
  type DossierSource,
  type RegulatoryDossier,
  dossierDatasetSchema,
  regulatoryDossierSchema,
} from "../shared/regulatory-dossier";

export const REGULATORY_DOSSIER_BUILDER = "regulatory-dossier";
export const REGULATORY_DOSSIER_BUILDER_VERSION = "1.0.0";
export const DEFAULT_REGULATORY_DOSSIERS_PATH = resolve(
  process.cwd(),
  "data/editorial/dossiers.json",
);

export function loadRegulatoryDossierDataset(
  path = DEFAULT_REGULATORY_DOSSIERS_PATH,
): DossierDataset {
  return dossierDatasetSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}

export function buildRegulatoryDossiers(
  documents: DocumentView[],
  entities: LegalEntityRecord[],
  ebaQa: EbaQaBuild,
  dataset = loadRegulatoryDossierDataset(),
): RegulatoryDossier[] {
  const documentById = new Map(
    documents.map((document) => [document.id, document]),
  );
  const entityById = new Map(entities.map((entity) => [entity.id, entity]));
  const qaCatalogById = new Map(
    ebaQa.catalog.records.map((record) => [record.id, record]),
  );
  const qaDetailIds = new Set(ebaQa.details.records.map((detail) => detail.id));

  return dataset.dossiers.flatMap((input) => {
    const resolvedSources: DossierSource[] = [];
    let missingRequiredSource = false;
    for (const source of input.sources) {
      if (source.kind === "legal-entity") {
        const entity = entityById.get(source.targetId);
        const document = entity ? documentById.get(entity.documentId) : null;
        if (!entity || !document) {
          missingRequiredSource ||= source.required;
          continue;
        }
        resolvedSources.push({
          ...source,
          targetLabel: entity.label,
          targetTitle: entity.title,
          targetPath: entity.path,
          officialUrl: document.sourceUrl,
          provenance: "OFFICIAL_TEXT",
        });
        continue;
      }
      const qa = qaCatalogById.get(source.targetId);
      if (!qa || !qaDetailIds.has(source.targetId)) {
        missingRequiredSource ||= source.required;
        continue;
      }
      resolvedSources.push({
        ...source,
        targetLabel: `EBA Q&A ${qa.publicId}`,
        targetTitle: qa.title,
        targetPath: `/qa/eba/${encodeURIComponent(qa.publicId)}`,
        officialUrl: qa.officialUrl,
        provenance: "OFFICIAL_QA",
      });
    }
    if (missingRequiredSource) return [];
    const availableSourceIds = new Set(
      resolvedSources.map((source) => source.id),
    );
    const sections = input.sections.map((section) => ({
      ...section,
      sourceIds: section.sourceIds.filter((sourceId) =>
        availableSourceIds.has(sourceId),
      ),
    }));
    if (sections.some((section) => section.sourceIds.length === 0)) return [];
    return [
      regulatoryDossierSchema.parse({
        ...input,
        provenance: dataset.provenance,
        reviewStatus: dataset.reviewStatus,
        sources: resolvedSources,
        sections,
      }),
    ];
  });
}
