import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { type CountryDataset, countryDatasetSchema } from "../shared/country";

export function normalizeCountryDataset(input: unknown): CountryDataset {
  const dataset = countryDatasetSchema.parse(input);
  dataset.countries.sort((left, right) => left.code.localeCompare(right.code));
  return dataset;
}

export function loadCountryDataset(
  path = resolve(process.cwd(), "data/editorial/countries.json"),
): CountryDataset {
  return normalizeCountryDataset(JSON.parse(readFileSync(path, "utf8")));
}

export function countryDatasetHash(dataset: CountryDataset): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(dataset)).digest("hex")}`;
}
