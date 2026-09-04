import type { SqliteRuntimeRepository } from "../runtime/sqlite-runtime-repository";
import {
  type DossierCatalogResponse,
  type DossierDetailResponse,
  dossierCatalogResponseSchema,
  dossierDetailResponseSchema,
} from "../shared/regulatory-dossier";

export class RegulatoryDossierService {
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

  list(): DossierCatalogResponse {
    return dossierCatalogResponseSchema.parse({
      schemaVersion: "1.0.0",
      runtime: this.runtime(),
      provenance: "EDITORIAL",
      records: this.repository.listRegulatoryDossiers(),
    });
  }

  find(slug: string): DossierDetailResponse | null {
    const dossier = this.repository.findRegulatoryDossier(slug);
    return dossier
      ? dossierDetailResponseSchema.parse({
          schemaVersion: "1.1.0",
          runtime: this.runtime(),
          dossier,
          qaEvidence: dossier.sources.flatMap((source) => {
            if (source.kind !== "eba-qa") return [];
            const publicId = source.targetId.replace(/^qa:eba:/u, "");
            const qa = this.repository.findEbaQaDetail(publicId);
            return qa
              ? [
                  {
                    sourceId: source.id,
                    qaId: qa.catalog.id,
                    publicId: qa.catalog.publicId,
                    title: qa.catalog.title,
                    question: qa.catalog.question,
                    finalAnswer: qa.detail.finalAnswer,
                    publishedAt: qa.catalog.publishedAt,
                    officialUrl: qa.catalog.officialUrl,
                    nonBindingNotice: qa.detail.nonBindingNotice,
                  },
                ]
              : [];
          }),
        })
      : null;
  }
}
