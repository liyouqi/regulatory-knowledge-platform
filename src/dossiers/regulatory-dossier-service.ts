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
          schemaVersion: "1.0.0",
          runtime: this.runtime(),
          dossier,
        })
      : null;
  }
}
