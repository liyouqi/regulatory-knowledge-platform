import { describe, expect, it } from "vitest";
import type { DocumentSummary } from "../shared/legal";
import { groupLawPickerCatalog } from "./LawPicker";

const documents: DocumentSummary[] = [
  {
    id: "eu:dora-rts",
    slug: "dora-rts",
    shortName: "DORA RTS Incident Reporting",
    officialTitle: "DORA delegated regulation on incident reporting",
    defaultPath: "/read/dora-rts/articles/1",
    provenance: "official",
    familyId: "family:dora",
    regulatoryLevel: "level-2",
    measureType: "rts",
    hasImplementationTimeline: false,
    hasSupervisoryDecisions: false,
    hasApplicabilityRules: false,
    hasTopicAssignments: false,
  },
  {
    id: "eu:dora",
    slug: "dora",
    shortName: "DORA",
    officialTitle: "Digital Operational Resilience Act",
    defaultPath: "/read/dora/articles/1",
    provenance: "official",
    familyId: "family:dora",
    regulatoryLevel: "level-1",
    measureType: "primary-act",
    hasImplementationTimeline: false,
    hasSupervisoryDecisions: false,
    hasApplicabilityRules: false,
    hasTopicAssignments: false,
  },
  {
    id: "eu:amld4",
    slug: "amld-iv",
    shortName: "AMLD IV",
    officialTitle: "Anti-money laundering directive",
    defaultPath: "/read/amld-iv/articles/1",
    provenance: "official",
    familyId: "family:aml",
    regulatoryLevel: "level-1",
    measureType: "primary-act",
    hasImplementationTimeline: false,
    hasSupervisoryDecisions: false,
    hasApplicabilityRules: false,
    hasTopicAssignments: false,
  },
];

describe("LawPicker catalog grouping", () => {
  it("groups documents by family and prioritizes primary acts", () => {
    expect(groupLawPickerCatalog(documents)).toEqual([
      expect.objectContaining({
        familyId: "family:dora",
        label: "DORA",
        documents: [
          expect.objectContaining({ slug: "dora" }),
          expect.objectContaining({ slug: "dora-rts" }),
        ],
      }),
      expect.objectContaining({
        familyId: "family:aml",
        label: "AML / CFT",
      }),
    ]);
  });

  it("filters by a document, measure, or family name", () => {
    expect(groupLawPickerCatalog(documents, "RTS")[0]?.documents).toEqual([
      expect.objectContaining({ slug: "dora-rts" }),
    ]);
    expect(groupLawPickerCatalog(documents, "aml")).toEqual([
      expect.objectContaining({ familyId: "family:aml" }),
    ]);
  });

  it("keeps legal families separate from business-domain labels", () => {
    expect(
      groupLawPickerCatalog([
        {
          ...documents[0],
          id: "eu:crd",
          slug: "crd-iv",
          shortName: "CRD IV",
          familyId: "family:crd",
        },
      ])[0],
    ).toMatchObject({ familyId: "family:crd", label: "CRD" });
  });
});
