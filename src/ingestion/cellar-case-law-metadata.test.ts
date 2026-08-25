import { describe, expect, it } from "vitest";
import type { CellarCaseLawRecord } from "./cellar-case-law";
import {
  buildCellarCaseLawMetadataDataset,
  buildCellarCaseLawMetadataQuery,
  probeCellarCaseLawMetadata,
} from "./cellar-case-law-metadata";

const records: CellarCaseLawRecord[] = [
  {
    caseCelex: "62017CJ0496",
    caseWorkUri: "https://publications.europa.eu/resource/cellar/case-one",
    predicate:
      "http://publications.europa.eu/ontology/cdm#case-law_interpretes_resource_legal",
    targetCelex: "32016R0679",
    targetWorkUri: "https://publications.europa.eu/resource/cellar/gdpr-work",
  },
  {
    caseCelex: "62021CJ0340_1",
    caseWorkUri: "https://publications.europa.eu/resource/cellar/case-two",
    predicate:
      "http://publications.europa.eu/ontology/cdm#case-law_interpretes_resource_legal",
    targetCelex: "32016R0679",
    targetWorkUri: "https://publications.europa.eu/resource/cellar/gdpr-work",
  },
];

describe("CELLAR CJEU metadata completeness probe", () => {
  it("queries only English Expression title plus official Work metadata", () => {
    const query = buildCellarCaseLawMetadataQuery([...records, ...records]);

    expect(query).toContain("resource/celex/62017CJ0496");
    expect(query).toContain("resource/celex/62021CJ0340_1");
    expect(query).toContain("authority/language/ENG");
    expect(query).toContain("case-law_ecli");
    expect(query).toContain("work_date_document");
  });

  it("marks absent or incomplete official metadata unavailable without filling it", () => {
    const raw = {
      results: {
        bindings: [
          {
            caseCelexUri: {
              type: "uri",
              value: "http://publications.europa.eu/resource/celex/62017CJ0496",
            },
            case: {
              type: "uri",
              value: "http://publications.europa.eu/resource/cellar/case-one",
            },
            ecli: { type: "literal", value: "ECLI:EU:C:2019:26" },
            date: { type: "literal", value: "2019-01-16" },
            title: { type: "literal", value: "Case C-496/17" },
          },
        ],
      },
    };

    expect(probeCellarCaseLawMetadata(records, raw)).toEqual([
      {
        caseCelex: "62017CJ0496",
        caseWorkUri: "https://publications.europa.eu/resource/cellar/case-one",
        availability: "complete",
        ecli: "ECLI:EU:C:2019:26",
        decisionDate: "2019-01-16",
        englishTitle: "Case C-496/17",
      },
      {
        caseCelex: "62021CJ0340_1",
        caseWorkUri: "https://publications.europa.eu/resource/cellar/case-two",
        availability: "unavailable",
      },
    ]);

    expect(
      buildCellarCaseLawMetadataDataset(
        records,
        raw,
        "2026-08-25T08:00:00.000Z",
        `sha256:${"a".repeat(64)}`,
      ),
    ).toMatchObject({
      records: [
        {
          caseCelex: "62017CJ0496",
          targetCelex: "32016R0679",
          englishTitle: "Case C-496/17",
        },
      ],
      unavailableCaseCelexes: ["62021CJ0340_1"],
    });
  });
});
