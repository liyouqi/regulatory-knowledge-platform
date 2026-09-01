import { describe, expect, it } from "vitest";
import { loadDocumentViews } from "../data/document-repository";
import { buildEbaQa } from "../qa/eba-qa";
import { buildExplicitReferences } from "../relationships/explicit-reference";
import {
  buildRegulatoryDossiers,
  loadRegulatoryDossierDataset,
} from "./regulatory-dossier";

describe("Regulatory Dossier build", () => {
  it("publishes three reviewed Dossiers with source-backed sections", () => {
    const documents = loadDocumentViews();
    const relationships = buildExplicitReferences(documents);
    const dossiers = buildRegulatoryDossiers(
      documents,
      relationships.entities,
      buildEbaQa(documents, relationships.entities),
    );

    expect(loadRegulatoryDossierDataset().dossiers).toHaveLength(3);
    expect(dossiers).toHaveLength(3);
    expect(dossiers.map((dossier) => dossier.slug)).toEqual([
      "major-ict-incident-reporting",
      "ict-third-party-service-scope",
      "register-of-information",
    ]);
    expect(
      dossiers.every((dossier) =>
        dossier.sections.every((section) => section.sourceIds.length > 0),
      ),
    ).toBe(true);
    expect(
      dossiers
        .flatMap((dossier) => dossier.sources)
        .every((source) =>
          ["OFFICIAL_TEXT", "OFFICIAL_QA"].includes(source.provenance),
        ),
    ).toBe(true);
  });

  it("omits profile-incompatible Dossiers instead of weakening source gates", () => {
    const documents = loadDocumentViews();
    const relationships = buildExplicitReferences(documents);
    const ebaQa = buildEbaQa(documents, relationships.entities);
    const doraOnly = documents.filter(
      (document) => document.id === "eu:32022R2554",
    );
    const doraRelationships = buildExplicitReferences(doraOnly);
    const dossiers = buildRegulatoryDossiers(
      doraOnly,
      doraRelationships.entities,
      ebaQa,
    );

    expect(dossiers.map((dossier) => dossier.slug)).toEqual([
      "ict-third-party-service-scope",
    ]);
  });
});
