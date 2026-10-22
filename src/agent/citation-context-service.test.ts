import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { XMLParser } from "fast-xml-parser";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { extractFormexPackage } from "../ingestion/formex-package";
import { readVerifiedSourceSnapshot } from "../ingestion/snapshot";
import { SqliteRuntimeRepository } from "../runtime/sqlite-runtime-repository";
import type { DocumentView } from "../shared/legal";
import { CitationContextService } from "./citation-context-service";
import { CitationRetrievalService } from "./citation-retrieval-service";
import { projectCitationText } from "./citation-text-projection";

let repository: SqliteRuntimeRepository;
let document: DocumentView;
let service: CitationContextService;
beforeAll(() => {
  repository = new SqliteRuntimeRepository();
  const crd = repository.findDocument("eu:32013L0036");
  if (!crd) throw new Error("Pinned CRD missing");
  document = crd;
  service = new CitationContextService(repository, [document]);
});
afterAll(() => repository?.close());

describe("ordered citation context", () => {
  it("places Article 74's trailing sentence after its five points, retaining run lineage", () => {
    const context = service.findByEntityId("eu:32013L0036:article:74");
    expect(context).toMatchObject({
      schemaVersion: "1.1.0",
      retrieval: { version: "1.1.0" },
      textProjection: {
        scope: "text-only",
        order: "reader-ordered-content",
        markerInsertion: "none",
        omittedResourceCount: 0,
      },
    });
    const prefix = "eu:32013L0036:article:74:paragraph:";
    expect(
      context?.textSegments.map((s) => [s.entityId, s.contentIndex]),
    ).toEqual([
      [`${prefix}1`, 0],
      ...["a", "b", "c", "d", "e"].map((p) => [`${prefix}1:point:${p}`, 0]),
      [`${prefix}1`, 6],
      [`${prefix}2`, 0],
      [`${prefix}3`, 0],
    ]);
    expect(context?.textSegments[6].text).toContain("shall be gender neutral");
    for (const segment of context?.textSegments ?? []) {
      const block = findBlock(segment.entityId, document);
      expect(block?.orderedContent[segment.contentIndex]).toEqual({
        type: "text",
        text: segment.text,
      });
      expect(segment.sourceLocator).toEqual(block?.sourceLocator);
    }
  });

  it("keeps exact Block lookups scoped to that subtree, with repeated IDs only for its text runs", () => {
    const id = "eu:32013L0036:article:76:paragraph:6";
    const context = service.findByEntityId(id);
    expect(context?.target.entityId).toBe(id);
    expect(
      context?.textSegments.every(
        (s) => s.entityId === id || s.entityId.startsWith(`${id}:`),
      ),
    ).toBe(true);
    expect(
      context?.textSegments.filter((s) => s.entityId === id).length,
    ).toBeGreaterThan(1);
    expect(service.findByEntityId("eu:unknown:article:1")).toBeNull();
  });

  it("matches all 197 CRD Article bodies against independent official XML traversal", async () => {
    const manifest = JSON.parse(
      readFileSync("data/corpus-build-manifest.json", "utf8"),
    );
    const pin = manifest.sources.find(
      (p: { identifier: string }) => p.identifier === "32013L0036",
    );
    const root = resolve("data/raw/eur-lex/32013L0036");
    const directory = readdirSync(root)
      .filter((name) => name.endsWith(pin.contentSha256.slice(7, 19)))
      .sort()[0];
    if (!directory) throw new Error("Pinned CRD raw snapshot missing");
    const verified = await readVerifiedSourceSnapshot(resolve(root, directory));
    expect(verified.snapshot.snapshotId).toBe(document.sourceSnapshotId);
    const pkg = extractFormexPackage(
      verified.contentBytes,
      verified.snapshot.content.upstreamStreamName,
    );
    type Node = Record<string, unknown>;
    const xml = new XMLParser({
      preserveOrder: true,
      ignoreAttributes: false,
      parseTagValue: false,
      processEntities: false,
      trimValues: false,
    }).parse(pkg.act.xml) as Node[];
    const omitted = new Set(["NOTE", "NO.P", "NO.PARAG", "TI.ART", "STI.ART"]);
    const text = (nodes: Node[]): string =>
      nodes
        .map((node) => {
          if ("#text" in node) return String(node["#text"]);
          return Object.entries(node)
            .filter(([tag, value]) => !omitted.has(tag) && Array.isArray(value))
            .map(([, value]) => text(value as Node[]))
            .join("");
        })
        .join("");
    const articles: Node[] = [];
    const visit = (nodes: Node[]) => {
      for (const node of nodes) {
        if ("ARTICLE" in node) articles.push(node);
        Object.values(node).filter(Array.isArray).forEach(visit);
      }
    };
    visit(xml);
    expect(articles).toHaveLength(197);
    for (const article of articles) {
      const body = article.ARTICLE as Node[];
      const label = body.find((n) => "TI.ART" in n)?.["TI.ART"] as Node[];
      const id = `eu:32013L0036:article:${text(label)
        .replace(/^Article\s+/u, "")
        .trim()
        .toLowerCase()}`;
      const context = service.findByEntityId(id);
      expect(context, id).not.toBeNull();
      expect(
        context?.textSegments
          .map((s) => s.text)
          .join("")
          .replace(/\s/gu, ""),
        id,
      ).toBe(text(body).replace(/\s/gu, ""));
    }
  }, 60_000);

  it("projects every loaded root and accepts legitimate owning-provision leaf aliases", () => {
    const documents = repository.listDocumentViews();
    const all = new CitationContextService(repository, documents);
    let count = 0;
    let alias: { document: DocumentView; id: string } | undefined;
    for (const d of documents)
      for (const p of d.provisions) {
        const projection = projectCitationText(p.blocks);
        expect(
          new Set(
            projection.textSegments.map(
              (s) => `${s.entityId}@${s.contentIndex}`,
            ),
          ).size,
        ).toBe(projection.textSegments.length);
        count++;
        if (
          (p.contentRole === undefined || p.contentRole === "operative-text") &&
          p.blocks.length === 1 &&
          p.blocks[0].id === p.id &&
          !p.blocks[0].children.length &&
          p.blocks[0].orderedContent.some((e) => e.type === "text")
        )
          alias = { document: d, id: p.id };
      }
    expect(count).toBe(
      documents.reduce((sum, d) => sum + d.provisions.length, 0),
    );
    expect(alias).toBeDefined();
    if (!alias) throw new Error("Expected an owning provision leaf alias");
    const context = all.findByEntityId(alias.id);
    expect(context?.target.entityId).toBe(alias.id);
    expect(context?.textSegments[0].entityId).toBe(alias.id);
  }, 60_000);

  it("rejects duplicate documents/entities but allows the unique top-level leaf self block", () => {
    expect(
      () => new CitationContextService(repository, [document, document]),
    ).toThrow(/Duplicate/iu);
    const copy = structuredClone(document);
    copy.provisions = [copy.provisions[0], copy.provisions[0]];
    expect(() => new CitationContextService(repository, [copy])).toThrow(
      /Duplicate/iu,
    );
    const self = structuredClone(document);
    const p = self.provisions[0];
    p.blocks = [{ ...p.blocks[0], id: p.id, children: [] }];
    self.provisions = [p];
    expect(() => new CitationContextService(repository, [self])).not.toThrow();
    p.blocks[0].children = [{ ...p.blocks[0], children: [] }];
    expect(() => new CitationContextService(repository, [self])).toThrow(
      /self block/iu,
    );
  });

  it("validates empty and formula-only text projections through the full context schema", () => {
    // Synthetic layout fixtures, not purported changes to the pinned legal text.
    const copy = structuredClone(document);
    const target = copy.provisions[0].blocks[0];
    target.children = [];
    target.text = "";
    target.orderedContent = [];
    const empty = new CitationContextService(repository, [copy]).findByEntityId(
      target.id,
    );
    expect(empty?.textSegments).toEqual([]);
    expect(empty?.textProjection.omittedResourceCount).toBe(0);
    target.orderedContent = [
      {
        type: "resource",
        resource: {
          id: "fixture:formula",
          kind: "formula",
          mediaType: "image/png",
          dataUrl: "data:image/png;base64,AQ==",
          sourceFileName: "formula.tif",
          sourceSha256: `sha256:${"a".repeat(64)}`,
          renditionSha256: `sha256:${"b".repeat(64)}`,
        },
      },
    ];
    const formula = new CitationContextService(repository, [
      copy,
    ]).findByEntityId(target.id);
    expect(formula?.schemaVersion).toBe("1.1.0");
    expect(formula?.textSegments).toEqual([]);
    expect(formula?.textProjection.omittedResourceCount).toBe(1);
  });

  it("throws on corrupted loaded exact evidence instead of silently falling back to its root", () => {
    const copy = structuredClone(document);
    const root = copy.provisions.find(
      (p) => p.id === "eu:32013L0036:article:74",
    );
    if (!root) throw new Error("CRD Article 74 missing");
    const target = root.blocks[0];
    target.orderedContent[1] = { type: "child", childId: "missing" };
    const corrupted = new CitationContextService(repository, [copy]);
    const find = vi.spyOn(corrupted, "findByEntityId");
    const retrieval = new CitationRetrievalService(
      {
        ...corrupted.runtimeIdentity,
        search: (query) => ({
          query,
          normalizedQuery: query,
          indexBuildId: repository.buildId,
          results: [
            {
              id: target.id,
              documentId: document.id,
              slug: document.slug,
              shortName: document.shortName,
              provisionId: root.id,
              kind: "article",
              label: root.label,
              path: root.path,
              snippet: [{ text: "test", highlighted: false }],
            },
          ],
        }),
      },
      corrupted,
    );
    expect(() => retrieval.search("test")).toThrow(/child/iu);
    expect(find.mock.calls).toEqual([[target.id]]);
    const missing = vi
      .spyOn(repository, "findDocumentRegulatoryContext")
      .mockReturnValueOnce(null);
    try {
      expect(() => service.findByEntityId(root.id)).toThrow(
        /missing for loaded entity/iu,
      );
    } finally {
      missing.mockRestore();
    }
  });
});

function findBlock(id: string, d: DocumentView) {
  const all = d.provisions.flatMap((p) => p.blocks);
  while (all.length) {
    const b = all.pop();
    if (!b) break;
    if (b.id === id) return b;
    all.push(...b.children);
  }
}
