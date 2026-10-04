import { describe, expect, it } from "vitest";
import { loadDocumentViews } from "../data/document-repository";
import { buildEbaQa } from "../qa/eba-qa";
import { buildExplicitReferences } from "../relationships/explicit-reference";
import {
  buildRegulatoryDossiers,
  loadRegulatoryDossierDataset,
} from "./regulatory-dossier";

describe("Regulatory Dossier build", () => {
  const documents = loadDocumentViews();

  it("publishes three reviewed Dossiers with source-backed sections", () => {
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
    expect(dossiers.map((dossier) => dossier.presentation.kind)).toEqual([
      "incident-flow",
      "service-chain",
      "register-duty-board",
    ]);
    expect(dossiers[0].sources).toContainEqual(
      expect.objectContaining({
        targetId: "eu:32024R1772:article:7",
        targetLabel: "DORA RTS Incident Classification Article 7",
      }),
    );
  });

  it("omits profile-incompatible Dossiers instead of weakening source gates", () => {
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

  it("does not silently drop an unresolved optional source used by a section", () => {
    const relationships = buildExplicitReferences(documents);
    const dataset = structuredClone(loadRegulatoryDossierDataset());
    const source = dataset.dossiers[0]?.sources[0];
    if (!source) throw new Error("Dossier source fixture is unavailable");
    source.required = false;
    source.targetId = "eu:unknown";

    const dossiers = buildRegulatoryDossiers(
      documents,
      relationships.entities,
      buildEbaQa(documents, relationships.entities),
      dataset,
    );

    expect(dossiers.map((dossier) => dossier.slug)).not.toContain(
      "major-ict-incident-reporting",
    );
  });
});
