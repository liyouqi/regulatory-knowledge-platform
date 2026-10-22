import { describe, expect, it } from "vitest";
import { countryDatasetSchema } from "../shared/country";
import type { DocumentSummary } from "../shared/legal";
import { countryPath, parseCountryPath } from "../shared/reader-route";
import { loadCountryDataset } from "./country-directory";
import { type CountryRepository, CountryService } from "./country-service";

const dataset = loadCountryDataset();
const summary = (
  id: string,
  jurisdiction: string,
): DocumentSummary & { jurisdiction: string } => ({
  id,
  jurisdiction,
  slug: id,
  shortName: id,
  officialTitle: id,
  defaultPath: `/read/${id}`,
  hasImplementationTimeline: false,
  hasSupervisoryDecisions: false,
  hasApplicabilityRules: false,
  hasTopicAssignments: false,
  provenance: "official",
  familyId: "family:test",
  regulatoryLevel: "level-1",
  measureType: "primary-act",
});
const documents = [summary("lu-visible", "LU"), summary("eu-law", "EU")];
const repository: CountryRepository = {
  buildId: "build",
  profileId: "limited",
  profileDisplayName: "Limited edition",
  countryDatasetVersion: dataset.datasetVersion,
  listCountries: () => dataset.countries,
  // This repository only returns documents visible in its compiled profile.
  listCountryDocumentSummaries: () => documents,
};
const service = new CountryService(repository);

describe("country directory", () => {
  it("covers 32 unique countries including the 27 EU members and preserves pending status", () => {
    expect(new Set(dataset.countries.map((item) => item.code)).size).toBe(32);
    expect(
      dataset.countries.filter((item) => item.group === "EU"),
    ).toHaveLength(27);
    expect(
      dataset.countries.filter((item) => item.group === "EEA-EFTA"),
    ).toHaveLength(3);
    const lu = dataset.countries.find((item) => item.code === "LU");
    expect(lu?.legislationPortal).toMatchObject({
      reviewStatus: "pending",
      checkedAt: null,
    });
    const duplicate = structuredClone(dataset);
    duplicate.countries[0] = duplicate.countries[1];
    expect(countryDatasetSchema.safeParse(duplicate).success).toBe(false);
  });

  it("counts EU documents separately and exposes only profile-visible local documents", () => {
    const catalog = service.list();
    expect(catalog.euDocumentCount).toBe(1);
    expect(
      catalog.countries.find((item) => item.country.code === "LU"),
    ).toMatchObject({
      localDocumentCount: 1,
      readerAvailability: "available",
      path: "/countries/lu",
    });
    const lu = service.find("lu");
    expect(lu?.localDocuments.map((item) => item.id)).toEqual(["lu-visible"]);
    expect(lu?.euFramework).toMatchObject({
      documentCount: 1,
      applicabilityConclusion: false,
      relationshipStatus: "not-assessed",
    });
    expect(service.find("DE")).toMatchObject({
      entry: { localDocumentCount: 0, readerAvailability: "none" },
      localDocuments: [],
    });
    expect(service.find("ZZ")).toBeNull();
  });

  it("constructs and parses country routes", () => {
    expect(countryPath()).toBe("/countries");
    expect(countryPath("LU")).toBe("/countries/lu");
    expect(parseCountryPath("/countries/LU/")).toEqual({ code: "lu" });
    expect(parseCountryPath("/countries/luxembourg")).toBeNull();
  });
});
