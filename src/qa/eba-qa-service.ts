import type { SqliteRuntimeRepository } from "../runtime/sqlite-runtime-repository";
import {
  type EbaQaCatalogResponse,
  type EbaQaDetailResponse,
  ebaQaCatalogResponseSchema,
  ebaQaDetailResponseSchema,
} from "../shared/eba-qa";

const EBA_QA_SOURCE_URL =
  "https://www.eba.europa.eu/single-rule-book-qa/search";

export class EbaQaService {
  constructor(private readonly repository: SqliteRuntimeRepository) {}

  private runtime() {
    return {
      buildId: this.repository.buildId,
      profileId: this.repository.profileId,
      profileVersion: this.repository.profileVersion,
      profileDisplayName: this.repository.profileDisplayName,
      profileHash: this.repository.profileHash,
    };
  }

  list(options: {
    page?: number;
    pageSize?: number;
    legalAct?: string;
    topic?: string;
  }): EbaQaCatalogResponse {
    const page = Math.max(1, Math.floor(options.page ?? 1));
    const pageSize = Math.min(
      100,
      Math.max(1, Math.floor(options.pageSize ?? 24)),
    );
    const result = this.repository.listEbaQaCatalog({
      page,
      pageSize,
      legalAct: options.legalAct,
      topic: options.topic,
    });
    return ebaQaCatalogResponseSchema.parse({
      schemaVersion: "1.0.0",
      runtime: this.runtime(),
      importedAt: result.importedAt,
      sourceUrl: EBA_QA_SOURCE_URL,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(result.total / pageSize)),
      total: result.total,
      filters: {
        legalActs: result.legalActs,
        topics: result.topics,
      },
      records: result.records.map((record) => ({
        ...record,
        internalPath: record.detailAvailable
          ? `/qa/eba/${encodeURIComponent(record.publicId)}`
          : null,
      })),
    });
  }

  find(publicId: string): EbaQaDetailResponse | null {
    const result = this.repository.findEbaQaDetail(publicId);
    return result
      ? ebaQaDetailResponseSchema.parse({
          schemaVersion: "1.0.0",
          runtime: this.runtime(),
          importedAt: result.importedAt,
          sourceUrl: EBA_QA_SOURCE_URL,
          catalog: result.catalog,
          detail: result.detail,
          references: result.references,
          dossiers: this.repository.listDossiersForQa(result.catalog.id),
        })
      : null;
  }
}
