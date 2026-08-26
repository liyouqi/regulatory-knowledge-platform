import { describe, expect, it } from "vitest";
import { loadDocumentViews } from "../data/document-repository";
import { buildExplicitReferences } from "../relationships/explicit-reference";
import {
  buildRegulatoryContext,
  loadAuthorityDataset,
  loadRegulatoryDomainDataset,
} from "./regulatory-context";

const documents = loadDocumentViews();
const knownDocumentIds = new Set(documents.map((document) => document.id));

describe("regulatory context", () => {
  it("publishes reviewed editorial Domain assignments separately from official Authority metadata", () => {
    const entities = buildExplicitReferences(documents).entities;
    const context = buildRegulatoryContext(
      documents,
      entities,
      knownDocumentIds,
    );

    expect(context).toMatchObject({
      taxonomyId: "taxonomy:regulatory-domain",
      taxonomyVersion: "1.0.0",
    });
    expect(context.domains).toHaveLength(3);
    expect(context.assignments).toHaveLength(8);
    expect(context.assignments).toContainEqual(
      expect.objectContaining({
        domainId: "domain:banking-governance-internal-control",
        targetEntityId: "eu:32013L0036:article:74",
        targetKind: "provision",
        role: "primary",
        provenance: "EDITORIAL",
        assignmentVersion: "1.0.0",
        reviewStatus: "reviewed",
      }),
    );
    expect(context.authorities).toHaveLength(3);
    expect(context.authorityRelationships).toContainEqual(
      expect.objectContaining({
        sourceDocumentId: "lu:cssf:circular-12-552",
        relationType: "ISSUED_BY",
        targetAuthorityId: "authority:lu:cssf",
        provenance: "OFFICIAL_METADATA",
        builderMethod: "regulatory-context",
        builderVersion: "1.0.0",
      }),
    );
  });

  it("filters reviewed assignments and issuers at the Edition Profile boundary", () => {
    const selectedDocuments = documents.filter(
      (document) => document.id !== "lu:cssf:circular-12-552",
    );
    const entities = buildExplicitReferences(selectedDocuments).entities;
    const context = buildRegulatoryContext(
      selectedDocuments,
      entities,
      knownDocumentIds,
    );
    const serialized = JSON.stringify(context);

    expect(serialized).not.toContain("lu:cssf:circular-12-552");
    expect(serialized).not.toContain("authority:lu:cssf");
    expect(context.assignments).toHaveLength(4);
    expect(context.authorityRelationships).toHaveLength(2);
  });

  it("fails closed when an editorial assignment does not resolve to its declared endpoint kind", () => {
    const entities = buildExplicitReferences(documents).entities;
    const domainDataset = loadRegulatoryDomainDataset();
    const authorityDataset = loadAuthorityDataset();
    const invalidDataset = structuredClone(domainDataset);
    const firstAssignment = invalidDataset.assignments[0];
    if (!firstAssignment) throw new Error("Missing test Domain assignment");
    invalidDataset.assignments[0] = {
      ...firstAssignment,
      targetEntityId: "eu:32013L0036:article:74:paragraph:1",
      targetKind: "provision",
    };

    expect(() =>
      buildRegulatoryContext(
        documents,
        entities,
        knownDocumentIds,
        invalidDataset,
        authorityDataset,
      ),
    ).toThrow(/invalid endpoint/u);
  });
});
