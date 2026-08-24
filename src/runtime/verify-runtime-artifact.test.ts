import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadDoraDocumentView } from "../data/document-repository";
import { buildRuntimeDatabase } from "../search/sqlite-search-index";
import { verifyRuntimeArtifact } from "./verify-runtime-artifact";

const testDirectory = mkdtempSync(join(tmpdir(), "regulatory-runtime-verify-"));
const databasePath = join(testDirectory, "regulatory.sqlite");

beforeAll(() => {
  buildRuntimeDatabase([loadDoraDocumentView()], [], databasePath);
});

afterAll(() => {
  rmSync(testDirectory, { recursive: true, force: true });
});

describe("runtime artifact verification", () => {
  it("validates the read-only runtime services against one manifest", () => {
    expect(verifyRuntimeArtifact(databasePath)).toMatchObject({
      documents: 1,
      records: expect.any(Number),
      definitions: 65,
      relationships: expect.any(Number),
      lifecycleRelationships: 14,
      externalWorks: 14,
      bytes: expect.any(Number),
      input: databasePath,
    });
  });
});
