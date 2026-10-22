import {
  type CountryDefinition,
  countryCatalogResponseSchema,
  countryDetailResponseSchema,
} from "../shared/country";
import type { DocumentSummary } from "../shared/legal";

export interface CountryRepository {
  readonly buildId: string;
  readonly profileId: string;
  readonly profileDisplayName: string;
  readonly countryDatasetVersion: string;
  listCountries(): CountryDefinition[];
  listCountryDocumentSummaries(): Array<
    DocumentSummary & { jurisdiction: string }
  >;
}

export class CountryService {
  constructor(private readonly repository: CountryRepository) {}

  private runtime() {
    return {
      buildId: this.repository.buildId,
      profileId: this.repository.profileId,
      profileDisplayName: this.repository.profileDisplayName,
      datasetVersion: this.repository.countryDatasetVersion,
    };
  }

  private entry(
    country: CountryDefinition,
    documents: Array<DocumentSummary & { jurisdiction: string }>,
  ) {
    const localDocumentCount = documents.filter(
      (document) => document.jurisdiction === country.code,
    ).length;
    return {
      country,
      localDocumentCount,
      readerAvailability:
        localDocumentCount > 0 ? ("available" as const) : ("none" as const),
      path: `/countries/${country.slug}`,
    };
  }

  list() {
    const documents = this.repository.listCountryDocumentSummaries();
    return countryCatalogResponseSchema.parse({
      schemaVersion: "1.0.0",
      runtime: this.runtime(),
      countries: this.repository
        .listCountries()
        .map((country) => this.entry(country, documents))
        .sort((left, right) =>
          left.country.name.localeCompare(right.country.name),
        ),
      euDocumentCount: documents.filter(
        (document) => document.jurisdiction === "EU",
      ).length,
    });
  }

  find(code: string) {
    const country = this.repository
      .listCountries()
      .find((entry) => entry.code.toLowerCase() === code.toLowerCase());
    if (!country) return null;
    const documents = this.repository.listCountryDocumentSummaries();
    return countryDetailResponseSchema.parse({
      schemaVersion: "1.0.0",
      runtime: this.runtime(),
      entry: this.entry(country, documents),
      localDocuments: documents.filter(
        (document) => document.jurisdiction === country.code,
      ),
      euFramework: {
        documentCount: documents.filter(
          (document) => document.jurisdiction === "EU",
        ).length,
        path: "/topics",
        applicabilityConclusion: false,
        relationshipStatus: "not-assessed",
      },
    });
  }
}
