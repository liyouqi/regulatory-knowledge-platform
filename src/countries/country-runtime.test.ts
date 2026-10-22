import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadDoraDocumentView } from "../data/document-repository";
import { DEFAULT_EDITION_PROFILE } from "../runtime/edition-profile";
import { SqliteRuntimeRepository } from "../runtime/sqlite-runtime-repository";
import { buildRuntimeDatabase } from "../search/sqlite-search-index";
import { countryDatasetHash, loadCountryDataset } from "./country-directory";

const dir = mkdtempSync(join(tmpdir(), "country-runtime-"));
const path = join(dir, "base.sqlite");
const changedPath = join(dir, "changed.sqlite");
const dataset = loadCountryDataset();
let baseBuildId = "";
let changedBuildId = "";

beforeAll(() => {
  const document = loadDoraDocumentView();
  const changed = structuredClone(dataset);
  changed.datasetVersion += "-test";
  baseBuildId = buildRuntimeDatabase(
    [document],
    [],
    path,
    DEFAULT_EDITION_PROFILE,
    { countryDataset: dataset },
  ).buildId;
  changedBuildId = buildRuntimeDatabase(
    [document],
    [],
    changedPath,
    DEFAULT_EDITION_PROFILE,
    { countryDataset: changed },
  ).buildId;
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("country runtime artifact", () => {
  it("binds country count, version and hash to the build identity", () => {
    const repository = new SqliteRuntimeRepository(path);
    try {
      expect(repository.countryCount).toBe(32);
      expect(repository.countryDatasetVersion).toBe(dataset.datasetVersion);
      expect(repository.countryDatasetHash).toBe(countryDatasetHash(dataset));
      expect(repository.listCountries()).toEqual(dataset.countries);
      expect(changedBuildId).not.toBe(baseBuildId);
    } finally {
      repository.close();
    }
  });

  it("rejects altered country data and manifest counts", () => {
    for (const kind of ["payload", "count"] as const) {
      const tampered = join(dir, `${kind}.sqlite`);
      copyFileSync(path, tampered);
      const db = new Database(tampered);
      if (kind === "payload") {
        const row = db
          .prepare(
            "SELECT payload_json FROM country_directory WHERE code = 'LU'",
          )
          .get() as { payload_json: string };
        const payload = JSON.parse(row.payload_json);
        payload.name = "Altered";
        db.prepare(
          "UPDATE country_directory SET payload_json = ? WHERE code = 'LU'",
        ).run(JSON.stringify(payload));
      } else {
        db.prepare(
          "UPDATE build_manifest SET value = '31' WHERE key = 'countryCount'",
        ).run();
      }
      db.close();
      expect(() => new SqliteRuntimeRepository(tampered)).toThrow();
    }
  });
});
