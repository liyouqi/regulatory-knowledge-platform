import { describe, expect, it } from "vitest";
import {
  earthEdgeSchema,
  earthNodeSchema,
  earthOfficialProvenanceSchema,
} from "./earth-contract";

describe("Earth read contract", () => {
  it("keeps boundary membership separate from entity kind", () => {
    expect(
      earthNodeSchema.parse({
        id: "work:eu:32013R0575",
        membership: "boundary",
        entityKind: "external-work",
        label: "32013R0575",
        officialIdentity: {
          celex: "32013R0575",
          workUri: "https://publications.europa.eu/resource/cellar/example",
        },
        sourceUrl:
          "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32013R0575",
      }).membership,
    ).toBe("boundary");
  });

  it("does not admit inferred or editorial provenance into the base layer", () => {
    expect(earthOfficialProvenanceSchema.safeParse("TFIDF").success).toBe(
      false,
    );
    expect(earthOfficialProvenanceSchema.safeParse("EDITORIAL").success).toBe(
      false,
    );
    expect(
      earthOfficialProvenanceSchema.safeParse("CELLAR_METADATA").success,
    ).toBe(true);
  });

  it("requires aggregate counts to remain auditable", () => {
    const edge = {
      projection: "aggregate",
      id: "earth-aggregate:dora:gdpr",
      source: "eu:32022R2554",
      target: "eu:32016R0679",
      relationTypes: ["REFERENCES"],
      provenances: ["LEGAL_TEXT"],
      relationshipIds: ["relationship:one", "relationship:two"],
      count: 1,
    };

    expect(earthEdgeSchema.safeParse(edge).success).toBe(false);
  });
});
