import { describe, expect, it } from "vitest";
import { loadCssfSourceRegistrySync } from "../ingestion/cssf-source-registry";
import { loadEbaSourceRegistrySync } from "../ingestion/eba-source-registry";
import { loadSourceCatalogSync } from "../ingestion/source-registry";
import { renderCorpusStatus } from "./corpus-status";

describe("Reader corpus status", () => {
  it("renders the registries as one published, queued, and planned view", () => {
    const output = renderCorpusStatus(
      loadSourceCatalogSync(),
      loadCssfSourceRegistrySync(),
      loadEbaSourceRegistrySync(),
    );

    expect(output).toContain("## Published — 47");
    expect(output).toContain("## Queued — 0");
    expect(output).toContain("## Planned — 0");
    expect(output).toContain("DORA");
    expect(output).toContain("AMLR");
  });
});
