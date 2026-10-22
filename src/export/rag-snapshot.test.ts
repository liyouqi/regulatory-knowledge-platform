import { createHash } from "node:crypto";
import {
  appendFileSync,
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadDoraDocumentView } from "../data/document-repository";
import { buildRuntimeDatabase } from "../search/sqlite-search-index";
import { exportRagSnapshot, verifyRagSnapshot } from "./rag-snapshot";

const testDirectory = mkdtempSync(join(tmpdir(), "regulatory-rag-export-"));
const databasePath = join(testDirectory, "regulatory.sqlite");
const snapshotPath = join(testDirectory, "snapshot");
let doraDocument: ReturnType<typeof loadDoraDocumentView>;

function rewriteJsonl(
  snapshotDirectory: string,
  filename: "documents.jsonl" | "provisions.jsonl",
  transform: (record: Record<string, unknown>) => void,
) {
  const path = join(snapshotDirectory, filename);
  const records = readFileSync(path, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  for (const record of records) transform(record);
  writeFileSync(
    path,
    `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
  );
  const manifestPath = join(snapshotDirectory, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    files: Record<string, { records: number; bytes: number; sha256: string }>;
  };
  const payload = readFileSync(path);
  manifest.files[filename] = {
    records: records.length,
    bytes: payload.byteLength,
    sha256: `sha256:${createHash("sha256").update(payload).digest("hex")}`,
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

beforeAll(() => {
  doraDocument = loadDoraDocumentView();
  buildRuntimeDatabase([doraDocument], [], databasePath);
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
      schema_version: "1.3.0",
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
      language: "en",
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
    expect(provisionLines.every((record) => record.language === "en")).toBe(
      true,
    );
    expect(
      provisionLines.every((record) =>
        ["operative-text", "source-note", "toc"].includes(
          String(record.content_role),
        ),
      ),
    ).toBe(true);
  });

  it("continues to verify immutable 1.1 English snapshots", () => {
    const legacyPath = join(testDirectory, "legacy-1.1-snapshot");
    cpSync(snapshotPath, legacyPath, { recursive: true });
    const manifestPath = join(legacyPath, "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      schema_version: string;
      generator_version: string;
      files: Record<string, { records: number; bytes: number; sha256: string }>;
    };
    manifest.schema_version = "1.1.0";
    manifest.generator_version = "platform-rag-export@1.1.0";
    for (const filename of ["documents.jsonl", "provisions.jsonl"]) {
      const path = join(legacyPath, filename);
      const records = readFileSync(path, "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as Record<string, unknown>);
      for (const record of records) {
        if (filename === "documents.jsonl") {
          record.source_status = undefined;
          const expressions = record.expressions as Array<
            Record<string, unknown>
          >;
          for (const expression of expressions)
            expression.source_status = undefined;
        } else {
          record.content_role = undefined;
          record.source_notes = undefined;
          for (const block of record.ordered_content_blocks as Array<
            Record<string, unknown>
          >) {
            block.content_role = undefined;
            block.source_locator = undefined;
          }
        }
      }
      writeFileSync(
        path,
        `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
      );
    }
    for (const filename of [
      "documents.jsonl",
      "provisions.jsonl",
      "relationships.jsonl",
    ]) {
      const payload = readFileSync(join(legacyPath, filename));
      manifest.files[filename] = {
        records: payload.toString("utf8").trim().split("\n").filter(Boolean)
          .length,
        bytes: payload.byteLength,
        sha256: `sha256:${createHash("sha256").update(payload).digest("hex")}`,
      };
    }
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    expect(verifyRagSnapshot(legacyPath).schema_version).toBe("1.1.0");

    const forgedRoleLegacyPath = join(testDirectory, "forged-role-legacy");
    cpSync(snapshotPath, forgedRoleLegacyPath, { recursive: true });
    const forgedManifestPath = join(forgedRoleLegacyPath, "manifest.json");
    const forgedManifest = JSON.parse(
      readFileSync(forgedManifestPath, "utf8"),
    ) as { schema_version: string; generator_version: string };
    forgedManifest.schema_version = "1.1.0";
    forgedManifest.generator_version = "platform-rag-export@1.1.0";
    writeFileSync(
      forgedManifestPath,
      `${JSON.stringify(forgedManifest, null, 2)}\n`,
    );
    expect(() => verifyRagSnapshot(forgedRoleLegacyPath)).toThrow();

    const forgedGermanLegacyPath = join(testDirectory, "forged-german-legacy");
    cpSync(legacyPath, forgedGermanLegacyPath, { recursive: true });
    rewriteJsonl(forgedGermanLegacyPath, "documents.jsonl", (record) => {
      record.jurisdiction = "DE";
      record.jurisdictions = ["DE"];
    });
    expect(() => verifyRagSnapshot(forgedGermanLegacyPath)).toThrow();
  });

  it("rejects 1.2 role and source metadata tampering after hash refresh", () => {
    const roleTamperedPath = join(testDirectory, "role-tampered");
    cpSync(snapshotPath, roleTamperedPath, { recursive: true });
    rewriteJsonl(roleTamperedPath, "provisions.jsonl", (record) => {
      record.content_role = "unreviewed-role";
    });
    expect(() => verifyRagSnapshot(roleTamperedPath)).toThrow();

    const metadataTamperedPath = join(testDirectory, "metadata-tampered");
    cpSync(snapshotPath, metadataTamperedPath, { recursive: true });
    rewriteJsonl(metadataTamperedPath, "documents.jsonl", (record) => {
      record.source_status = { text_authority_status: "authoritative" };
    });
    expect(() => verifyRagSnapshot(metadataTamperedPath)).toThrow();
  });

  it.each([
    ["source-note", "text"],
    ["toc", "text"],
    ["toc", "direct_text"],
  ] as const)(
    "rejects %s %s injection after refreshing file hash",
    (contentRole, field) => {
      const tamperedPath = join(
        testDirectory,
        `tampered-${contentRole}-${field}`,
      );
      cpSync(snapshotPath, tamperedPath, { recursive: true });
      rewriteJsonl(tamperedPath, "provisions.jsonl", (record) => {
        if (record.content_role !== "operative-text") return;
        record.content_role = contentRole;
        record.ordered_content_blocks = [];
        record.direct_text = "";
        record.text = "";
        record[field] = "Injected non-operative content.";
      });
      expect(() => verifyRagSnapshot(tamperedPath)).toThrow();
    },
  );

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

  it("keeps exported text order contiguous when Reader content includes a formula resource", () => {
    const document = structuredClone(doraDocument);
    const block = document.provisions[0]?.blocks[0];
    if (!block) throw new Error("DORA test block is unavailable");
    block.text = "Before formula. After formula.";
    block.orderedContent = [
      { type: "text", text: "Before formula." },
      {
        type: "resource",
        resource: {
          id: "eu:32022R2554:resource:test-formula",
          kind: "formula",
          mediaType: "image/png",
          dataUrl: "data:image/png;base64,AQID",
          sourceFileName: "test-formula.tif",
          sourceSha256: `sha256:${"a".repeat(64)}`,
          renditionSha256: `sha256:${"b".repeat(64)}`,
        },
      },
      { type: "text", text: "After formula." },
    ];
    const resourceDatabasePath = join(
      testDirectory,
      "resource-regulatory.sqlite",
    );
    const resourceSnapshotPath = join(testDirectory, "resource-snapshot");
    buildRuntimeDatabase([document], [], resourceDatabasePath);

    exportRagSnapshot({
      databasePath: resourceDatabasePath,
      outputPath: resourceSnapshotPath,
      snapshotId: "dora-resource-test",
      asOfDate: "2026-08-31",
      createdAt: "2026-08-31T12:00:00.000Z",
    });

    const provision = readFileSync(
      join(resourceSnapshotPath, "provisions.jsonl"),
      "utf8",
    )
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .find((record) => record.provision_id === block.id);
    expect(provision).toMatchObject({
      direct_text: "Before formula.\nAfter formula.",
      ordered_content_blocks: [
        { order: 0, type: "text", text: "Before formula." },
        { order: 1, type: "text", text: "After formula." },
      ],
    });
  });

  it("keeps source notes out of operative text and exports them separately", () => {
    const document = structuredClone(doraDocument);
    const block = document.provisions[0]?.blocks[0];
    if (!block) throw new Error("DORA test block is unavailable");
    block.text = "Operative clause. Source note.";
    block.orderedContent = [
      { type: "text", text: "Operative clause." },
      {
        type: "text",
        text: "Source note.",
        contentRole: "source-note",
        sourceLocator: block.sourceLocator,
      },
    ];
    const noteDatabasePath = join(testDirectory, "note-regulatory.sqlite");
    const noteSnapshotPath = join(testDirectory, "note-snapshot");
    buildRuntimeDatabase([document], [], noteDatabasePath);
    exportRagSnapshot({
      databasePath: noteDatabasePath,
      outputPath: noteSnapshotPath,
      snapshotId: "dora-note-test",
      asOfDate: "2026-08-31",
      createdAt: "2026-08-31T12:00:00.000Z",
    });
    const provision = readFileSync(
      join(noteSnapshotPath, "provisions.jsonl"),
      "utf8",
    )
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .find((record) => record.provision_id === block.id);
    expect(provision).toMatchObject({
      direct_text: "Operative clause.",
      text: "1. Operative clause.",
      source_notes: [
        {
          content_role: "source-note",
          text: "Source note.",
          source_locator: block.sourceLocator,
          content_index: 1,
        },
      ],
    });
  });

  it("concatenates German inline source runs using the document language policy", () => {
    const document = structuredClone(doraDocument);
    document.jurisdiction = "DE";
    document.language = "de";
    document.localId = "de:synthetic-inline-test";
    document.sourceStatus = {
      basis: "consolidated",
      textAsOf: "2026-08-31",
      currentVersionUrl: "https://www.gesetze-im-internet.de/gwg_2017/",
      corrections: [],
      textAuthorityStatus: "non-authoritative-consolidation",
      textAsOfBasis: "last-amendment-act-date",
      authorityNote: "Synthetic exporter fixture.",
      sourceNotes: ["Fixture only."],
    };
    const block = document.provisions[0]?.blocks[0];
    if (!block) throw new Error("DORA test block is unavailable");
    block.text = "Geldwäschegesetz";
    const inlineRuns = ["Geld", "wäsche", "gesetz"];
    block.orderedContent = inlineRuns.map((text) => ({
      type: "text" as const,
      text,
      contentRole: "operative-text" as const,
      sourceLocator: block.sourceLocator,
    }));
    const run = (contentIndex: number) => ({
      name: "run" as const,
      contentRole: "operative-text" as const,
      sourceLocator: block.sourceLocator,
      contentIndex,
      children: [],
    });
    block.contentLayout = [
      run(0),
      {
        name: "emphasis",
        contentRole: "operative-text",
        sourceLocator: block.sourceLocator,
        children: [run(1)],
      },
      run(2),
    ];

    const germanDatabasePath = join(testDirectory, "german-inline.sqlite");
    const germanSnapshotPath = join(testDirectory, "german-inline-snapshot");
    buildRuntimeDatabase([document], [], germanDatabasePath);
    const germanDatabase = new Database(germanDatabasePath);
    germanDatabase
      .prepare(
        "UPDATE document_expression_metadata SET language = 'de' WHERE document_id = ?",
      )
      .run(document.id);
    germanDatabase.close();
    exportRagSnapshot({
      databasePath: germanDatabasePath,
      outputPath: germanSnapshotPath,
      snapshotId: "de-inline-test",
      asOfDate: "2026-08-31",
      createdAt: "2026-08-31T12:00:00.000Z",
    });
    const manifest = verifyRagSnapshot(germanSnapshotPath);
    expect(manifest.languages).toEqual(["de"]);
    const exportedDocument = JSON.parse(
      readFileSync(join(germanSnapshotPath, "documents.jsonl"), "utf8").trim(),
    ) as { expressions: Array<{ expression_id: string; language: string }> };
    expect(exportedDocument.expressions[0]).toMatchObject({
      expression_id: `${document.id}@2026-08-31@de`,
      language: "de",
    });
    const provision = readFileSync(
      join(germanSnapshotPath, "provisions.jsonl"),
      "utf8",
    )
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .find((record) => record.provision_id === block.id);
    expect(provision?.direct_text).toBe(block.text);
    expect(provision?.direct_text).toBe("Geldwäschegesetz");
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
