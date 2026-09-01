import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { LegalEntityRecord } from "../relationships/explicit-reference";
import type {
  EbaQaCatalogDataset,
  EbaQaDetailDataset,
  EbaQaLegalReference,
} from "../shared/eba-qa";
import {
  ebaQaCatalogDatasetSchema,
  ebaQaDetailDatasetSchema,
  ebaQaLegalReferenceSchema,
} from "../shared/eba-qa";
import type { DocumentView } from "../shared/legal";

export const EBA_QA_BUILDER = "eba-qa";
export const EBA_QA_BUILDER_VERSION = "1.0.0";
export const DEFAULT_EBA_QA_CATALOG_PATH = resolve(
  process.cwd(),
  "data/official-metadata/eba-qa/catalog.json",
);
export const DEFAULT_EBA_QA_DETAILS_PATH = resolve(
  process.cwd(),
  "data/official-metadata/eba-qa/dora-details.json",
);

export interface EbaQaBuild {
  catalog: EbaQaCatalogDataset;
  details: EbaQaDetailDataset;
  references: EbaQaLegalReference[];
}

function sha256Json(value: unknown): string {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")}`;
}

function assertContentHash(dataset: {
  records: unknown[];
  contentHash: string;
}): void {
  const received = sha256Json(dataset.records);
  if (received !== dataset.contentHash) {
    throw new Error(
      `EBA Q&A content hash mismatch: expected ${dataset.contentHash}, received ${received}`,
    );
  }
}

export function loadEbaQaCatalog(
  path = DEFAULT_EBA_QA_CATALOG_PATH,
): EbaQaCatalogDataset {
  const dataset = ebaQaCatalogDatasetSchema.parse(
    JSON.parse(readFileSync(path, "utf8")),
  );
  assertContentHash(dataset);
  return dataset;
}

export function loadEbaQaDetails(
  path = DEFAULT_EBA_QA_DETAILS_PATH,
): EbaQaDetailDataset {
  const dataset = ebaQaDetailDatasetSchema.parse(
    JSON.parse(readFileSync(path, "utf8")),
  );
  assertContentHash(dataset);
  return dataset;
}

function regulationCelex(label: string): string | null {
  const match = /Regulation\s*\(EU\)(?:\s+No)?\s+(\d{4})\/(\d+)/iu.exec(label);
  return match
    ? `3${match[1]}R${match[2].padStart(4, "0").toUpperCase()}`
    : null;
}

function declaredProvisionId(
  documentId: string,
  label: string | null,
): string | null {
  if (!label) return null;
  const recital = /\brecital\s+(\d+[a-z]?)\b/iu.exec(label);
  if (recital) return `${documentId}:recital:${recital[1].toLowerCase()}`;
  const article = /(?:\barticle\s+)?(\d+[a-z]?)/iu.exec(label);
  return article ? `${documentId}:article:${article[1].toLowerCase()}` : null;
}

export function buildEbaQa(
  documents: DocumentView[],
  entities: LegalEntityRecord[],
  catalog = loadEbaQaCatalog(),
  details = loadEbaQaDetails(),
): EbaQaBuild {
  const catalogById = new Map(
    catalog.records.map((record) => [record.id, record]),
  );
  const detailIds = new Set(details.records.map((detail) => detail.id));
  for (const detail of details.records) {
    const item = catalogById.get(detail.id);
    if (!item || !item.detailAvailable) {
      throw new Error(
        `EBA Q&A detail is not enabled in catalogue: ${detail.id}`,
      );
    }
  }
  for (const item of catalog.records) {
    if (item.detailAvailable !== detailIds.has(item.id)) {
      throw new Error(`EBA Q&A detail availability mismatch: ${item.id}`);
    }
  }

  const documentsByCelex = new Map(
    documents.flatMap((document) =>
      document.celex ? [[document.celex, document] as const] : [],
    ),
  );
  const entitiesById = new Map(entities.map((entity) => [entity.id, entity]));
  const references: EbaQaLegalReference[] = [];
  for (const detail of details.records) {
    const item = catalogById.get(detail.id);
    if (!item) continue;
    const actCelex = regulationCelex(item.legalActLabel);
    const actDocument = actCelex ? documentsByCelex.get(actCelex) : undefined;
    references.push(
      ebaQaLegalReferenceSchema.parse({
        qaId: item.id,
        role: "declared-legal-act",
        targetDocumentId: actDocument?.id ?? null,
        targetEntityId: actDocument?.id ?? null,
        citationLabel: item.legalActLabel,
        officialUrl: actDocument?.sourceUrl ?? null,
        provenance: "OFFICIAL_QA_METADATA",
        resolutionStatus: actDocument ? "resolved" : "external",
        evidenceLocator: `${item.officialUrl}#legal-act`,
      }),
    );
    const provisionId = actDocument
      ? declaredProvisionId(actDocument.id, detail.articleLabel)
      : null;
    const provision = provisionId ? entitiesById.get(provisionId) : undefined;
    if (detail.articleLabel) {
      references.push(
        ebaQaLegalReferenceSchema.parse({
          qaId: item.id,
          role: "declared-provision",
          targetDocumentId: provision?.documentId ?? null,
          targetEntityId: provision?.id ?? null,
          citationLabel: detail.articleLabel,
          officialUrl: actDocument?.sourceUrl ?? null,
          provenance: "OFFICIAL_QA_METADATA",
          resolutionStatus: provision ? "resolved" : "unresolved",
          evidenceLocator: `${item.officialUrl}#article`,
        }),
      );
    }
    if (item.associatedMeasureLabel !== "Not applicable") {
      const measureCelex = regulationCelex(item.associatedMeasureLabel);
      const measure = measureCelex
        ? documentsByCelex.get(measureCelex)
        : undefined;
      references.push(
        ebaQaLegalReferenceSchema.parse({
          qaId: item.id,
          role: "associated-measure",
          targetDocumentId: measure?.id ?? null,
          targetEntityId: measure?.id ?? null,
          citationLabel: item.associatedMeasureLabel,
          officialUrl: measure?.sourceUrl ?? null,
          provenance: "OFFICIAL_QA_METADATA",
          resolutionStatus: measure ? "resolved" : "external",
          evidenceLocator: `${item.officialUrl}#associated-measure`,
        }),
      );
    }
  }
  return {
    catalog,
    details,
    references,
  };
}
