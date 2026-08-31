import { appendFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadDoraDocumentView } from "../data/document-repository";
import { buildRuntimeDatabase } from "../search/sqlite-search-index";
import { exportRagSnapshot, verifyRagSnapshot } from "./rag-snapshot";

const testDirectory = mkdtempSync(join(tmpdir(), "regulatory-rag-export-"));
const databasePath = join(testDirectory, "regulatory.sqlite");
const snapshotPath = join(testDirectory, "snapshot");

beforeAll(() => {
  buildRuntimeDatabase([loadDoraDocumentView()], [], databasePath);
  exportRagSnapshot({
    databasePath,
    outputPath: snapshotPath,
    snapshotId: "dora-en-test",
    asOfDate: "2026-08-31",
    createdAt: "2026-08-31T12:00:00.000Z",
  });
});

afterAll(() => {
  rmSync(testDirectory, { recursive: true, force: true });
});

describe("RAG snapshot export", () => {
  it("exports and verifies one immutable offline Profile snapshot", () => {
    const manifest = verifyRagSnapshot(snapshotPath);
    expect(manifest).toMatchObject({
      schema_version: "1.1.0",
      snapshot_id: "dora-en-test",
      profile_id: "full-corpus",
      document_count: 1,
      provision_count: expect.any(Number),
      relationship_count: expect.any(Number),
      review_status: "record_level",
      corpus_selection_policy: {
        selection_unit: "complete_legal_work",
        relationship_boundary: "metadata_stub",
        auto_include_relationship_targets: false,
      },
    });
    expect(manifest.provision_count).toBeGreaterThan(800);

    const document = JSON.parse(
      readFileSync(join(snapshotPath, "documents.jsonl"), "utf8").trim(),
    ) as Record<string, unknown>;
    expect(document).toMatchObject({
      document_id: "eu:32022R2554",
      issuers: ["European Parliament", "Council of the European Union"],
      expressions: [
        expect.objectContaining({
          text_kind: "original_oj",
          currency_status: "not_assessed",
          version_selection_policy:
            "prefer_reviewed_consolidated_else_reviewed_official_publication",
          fallback_reason: "no_reviewed_consolidated_expression_loaded",
        }),
      ],
    });

    const provisionLines = readFileSync(
      join(snapshotPath, "provisions.jsonl"),
      "utf8",
    )
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(
      provisionLines.filter(
        (record) => record.provision_id === "eu:32022R2554:recital:1",
      ),
    ).toHaveLength(1);
    expect(provisionLines).toContainEqual(
      expect.objectContaining({
        provision_id: "eu:32022R2554:article:28:paragraph:10",
        parent_provision_id: "eu:32022R2554:article:28",
        root_provision_id: "eu:32022R2554:article:28",
        unit_type: "paragraph",
        article_id: "28",
        paragraph_id: "10",
        document_order: expect.any(Number),
        ordered_content_blocks: expect.any(Array),
      }),
    );
    expect(
      provisionLines.some((record) =>
        (record.ordered_content_blocks as Array<{ type: string }>).some(
          (block) => block.type === "child",
        ),
      ),
    ).toBe(true);
  });

  it("refuses to overwrite a published snapshot directory", () => {
    expect(() =>
      exportRagSnapshot({
        databasePath,
        outputPath: snapshotPath,
        snapshotId: "dora-en-test",
        asOfDate: "2026-08-31",
      }),
    ).toThrow("will not be overwritten");
  });

  it("detects handoff file tampering", () => {
    const tamperedPath = join(testDirectory, "tampered");
    exportRagSnapshot({
      databasePath,
      outputPath: tamperedPath,
      snapshotId: "dora-en-tampered-test",
      asOfDate: "2026-08-31",
      createdAt: "2026-08-31T12:00:00.000Z",
    });
    appendFileSync(join(tamperedPath, "documents.jsonl"), " \n");
    expect(() => verifyRagSnapshot(tamperedPath)).toThrow();
  });
});
