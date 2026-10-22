import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  verifyAmfRagDocument,
  verifyAmfRagProvisions,
} from "./amf-rag-validation";
import { projectRagOrderedDirectText } from "./rag-snapshot";
import type { RagDocument, RagProvision } from "./rag-snapshot-contract";
import {
  ragDocumentSchema,
  v12RagDocumentSchema,
} from "./rag-snapshot-contract";

const status = {
  text_authority_status: "publisher-consolidation",
  text_as_of_basis: "publisher-version-date",
  checked_at: "2026-10-20T00:00:00.000Z",
};
const expression = {
  expression_id: "fr:amf:rg@2026-09-11@fr",
  document_id: "fr:amf:rg",
  language: "fr",
  expression_date: "2026-09-11",
  text_kind: "consolidated",
  currency_status: "not_assessed",
  version_selection_policy:
    "prefer_reviewed_consolidated_else_reviewed_official_publication",
  fallback_reason: null,
  official_status: "official",
  official_source_url: "https://example.org/rg",
  retrieved_at: null,
  imported_at: "2026-10-20T00:00:00.000Z",
  captured_on: "2026-10-20",
  capture_date_basis: "archived-probe-directory",
  retrieval_timestamp_basis: "date-only-official-probe",
  source_snapshot_id: "snapshot",
  source_version: "2026-09-11",
  review_status: "validated",
  source_status: status,
};
const french = {
  document_id: "fr:amf:rg",
  official_identifier: "fr-amf-rg",
  celex: null,
  local_id: "fr-amf-rg",
  family_ids: ["family:amf"],
  aliases: [],
  issuers: ["AMF"],
  short_title: "RG",
  title: "RG",
  jurisdiction: "FR",
  jurisdictions: ["FR"],
  language: "fr",
  source_status: status,
  document_type: "regulation",
  regulatory_level: "level_1",
  measure_type: "primary_act",
  document_stage: "published",
  lifecycle_status: null,
  version_status: null,
  legal_effect: null,
  date_document: null,
  publication_date_basis: "aggregate-with-multiple-component-publications",
  date_entry_into_force: null,
  date_application: null,
  date_repeal: null,
  official_page_url: "https://example.org/rg",
  current_version_url: null,
  source_snapshot_id: "snapshot",
  source_version: "2026-09-11",
  text_as_of: "2026-09-11",
  canonical_build_id: "build",
  review_status: "validated",
  structure_owner_ids: [],
  scoped_source_notes: [],
  expressions: [expression],
};

describe("RAG versioned AMF provenance", () => {
  it("preserves 1.2 unknown-key stripping for legacy documents", () => {
    const legacy = {
      ...french,
      document_id: "de:gii:bjnr1",
      jurisdiction: "DE",
      jurisdictions: ["DE"],
      language: "de",
      date_document: "2020-01-01",
      source_status: {
        text_authority_status: "non-authoritative-consolidation",
      },
      expressions: [
        {
          ...expression,
          document_id: "de:gii:bjnr1",
          language: "de",
          retrieved_at: "2026-10-20T00:00:00.000Z",
          source_status: {
            text_authority_status: "non-authoritative-consolidation",
          },
        },
      ],
    };
    const parsed = v12RagDocumentSchema.parse(legacy);
    expect(parsed).not.toHaveProperty("scoped_source_notes");
    expect(parsed.expressions[0]).not.toHaveProperty("imported_at");
  });
  it("accepts explicit missing dates only in 1.3 and requires provenance", () => {
    expect(ragDocumentSchema.safeParse(french).success).toBe(true);
    expect(v12RagDocumentSchema.safeParse(french).success).toBe(false);
    expect(
      ragDocumentSchema.safeParse({
        ...french,
        publication_date_basis: undefined,
      }).success,
    ).toBe(false);
    expect(
      ragDocumentSchema.safeParse({
        ...french,
        expressions: [
          { ...expression, retrieved_at: "2026-10-20T00:00:00.000Z" },
        ],
      }).success,
    ).toBe(false);
    expect(
      ragDocumentSchema.safeParse({
        ...french,
        expressions: [{ ...expression, currency_status: "current" }],
      }).success,
    ).toBe(false);
  });
});

describe("AMF snapshot tampering", () => {
  const digest = (value: string) =>
    createHash("sha256").update(value).digest("hex");
  const versionUrl =
    "https://www.amf-france.org/fr/eli/fr/aai/amf/rg/20260911/notes";
  const urls = Array.from(
    { length: 693 },
    (_, i) =>
      `https://www.amf-france.org/fr/eli/fr/aai/amf/rg/livre/1/titre/${i + 1}/notes`,
  );
  const owners = urls.map((url) => `fr:amf:rg:structure:${digest(url)}`);
  const block = {
    id: "note",
    kind: "other",
    text: "note",
    anchor: "note",
    contentRole: "source-note",
    sourceLocator: { kind: "xpath", value: "/note" },
    orderedContent: [
      { type: "text", text: "note", contentRole: "source-note" },
    ],
    children: [],
  };
  const notes = [
    {
      scope: "document",
      owner_id: "fr:amf:rg",
      owner_source_url: versionUrl,
      owner_label: "RG",
      position: 2,
      content_hash: `sha256:${digest("note")}`,
      block,
    },
    ...urls.slice(0, 63).map((url, i) => ({
      scope: "structure",
      owner_id: owners[i],
      owner_source_url: url,
      owner_label: "Titre",
      position: 1,
      content_hash: `sha256:${digest("note")}`,
      block,
    })),
  ];
  const fixture = () =>
    ({
      ...french,
      official_page_url: versionUrl,
      structure_owner_ids: owners,
      scoped_source_notes: structuredClone(notes),
      expressions: [
        {
          ...expression,
          source_status: { ...status },
          official_source_url: versionUrl,
        },
      ],
    }) as unknown as RagDocument;
  const requireNotes = (document: RagDocument) => {
    const notes = document.scoped_source_notes;
    if (!notes || !notes[1] || !notes[2])
      throw new Error("Fixture requires two structural notes");
    return notes;
  };
  it("rejects changed scopes, duplicate owners, out-of-order owners, and changed status", () => {
    expect(() => verifyAmfRagDocument(fixture())).not.toThrow();
    for (const tamper of [
      (d: RagDocument) => {
        requireNotes(d)[1].scope = "document";
      },
      (d: RagDocument) => {
        requireNotes(d)[2] = { ...requireNotes(d)[1] };
      },
      (d: RagDocument) => {
        [requireNotes(d)[1], requireNotes(d)[2]] = [
          requireNotes(d)[2],
          requireNotes(d)[1],
        ];
      },
      (d: RagDocument) => {
        const status = d.expressions[0].source_status;
        if (!status) throw new Error("Fixture requires source status");
        status.authority_note = "changed";
      },
      (d: RagDocument) => {
        requireNotes(d)[1].owner_source_url += "?changed=1";
      },
      (d: RagDocument) => {
        requireNotes(d)[1].content_hash = `sha256:${"0".repeat(64)}`;
      },
      (d: RagDocument) => {
        requireNotes(d)[1].block.text = "altered";
      },
    ]) {
      const doc = fixture();
      tamper(doc);
      expect(() => verifyAmfRagDocument(doc)).toThrow();
    }
  });
  it("checks article count and complete URL hashes", () => {
    const provisions = Array.from({ length: 1821 }, (_, i) => {
      const url = `https://www.amf-france.org/fr/eli/fr/aai/amf/rg/article/100-${i + 1}/20200101/notes`;
      return {
        document_id: "fr:amf:rg",
        parent_provision_id: null,
        unit_type: "article",
        official_source_url: url,
        provision_id: `fr:amf:rg:article:${digest(url)}`,
      } as RagProvision;
    });
    expect(() => verifyAmfRagProvisions(provisions)).not.toThrow();
    expect(() => verifyAmfRagProvisions(provisions.slice(1))).toThrow();
    provisions[0].official_source_url += "?changed=1";
    expect(() => verifyAmfRagProvisions(provisions)).toThrow();
  });
});

describe("RAG ordered direct text version policy", () => {
  it("concatenates French 1.3 inline runs while preserving old policies", () => {
    const blocks = [
      { order: 0, type: "text" as const, text: "Bonjour " },
      { order: 1, type: "text" as const, text: "monde" },
    ];
    expect(projectRagOrderedDirectText(blocks, "fr", "1.3.0")).toBe(
      "Bonjour monde",
    );
    expect(projectRagOrderedDirectText(blocks, "de", "1.2.0")).toBe(
      "Bonjour monde",
    );
    expect(projectRagOrderedDirectText(blocks, "en", "1.3.0")).toBe(
      "Bonjour \nmonde",
    );
    expect(projectRagOrderedDirectText(blocks, "en", "1.1.0")).toBe(
      "Bonjour \nmonde",
    );
  });
});
