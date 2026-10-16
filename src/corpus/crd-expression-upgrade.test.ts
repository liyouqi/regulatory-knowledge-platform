import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { XMLParser } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import { loadBankingGovernanceTasks } from "../agent/banking-governance-evaluation";
import { FORMEX_PARSER_VERSION } from "../canonical/versions";
import { extractFormexPackage } from "../ingestion/formex-package";
import { parseFormexAct } from "../ingestion/formex-parser";
import { readVerifiedSourceSnapshot } from "../ingestion/snapshot";
import { loadSourceRegistrySync } from "../ingestion/source-registry";
import { loadDocumentExpressionMetadataDataset } from "../versions/document-expression-metadata";
import { loadCorpusBuildManifest } from "./corpus-build";

const upgrade = JSON.parse(
  readFileSync("data/editorial/source-upgrades/crd-20260711.json", "utf8"),
);

async function verifiedSource(pin: {
  snapshotId: string;
  contentSha256: string;
}) {
  const root = resolve("data/raw/eur-lex/32013L0036");
  const directory = readdirSync(root)
    .filter((name) => name.endsWith(pin.contentSha256.slice(7, 19)))
    .sort()[0];
  if (!directory)
    throw new Error(`Retained CRD raw snapshot missing: ${pin.snapshotId}`);
  const verified = await readVerifiedSourceSnapshot(resolve(root, directory));
  expect(verified.snapshot.snapshotId).toBe(pin.snapshotId);
  return verified;
}

async function parsePinnedSource(release: typeof upgrade.before) {
  const verified = await verifiedSource(release.pin);
  const pkg = extractFormexPackage(
    verified.contentBytes,
    verified.snapshot.content.upstreamStreamName,
  );
  expect(pkg.resources).toEqual([]);
  return parseFormexAct(
    pkg.act.xml,
    release.source,
    verified.snapshot,
    pkg.annexes,
  ).document;
}

describe("reviewed CRD expression upgrade", () => {
  it("pins the reviewed source and keeps an exact prior source/baseline for rollback", () => {
    const source = loadSourceRegistrySync().find(
      (item) => item.celex === "32013L0036",
    );
    const pin = loadCorpusBuildManifest().sources.find(
      (item) => item.identifier === "32013L0036",
    );
    expect(source).toEqual(upgrade.after.source);
    expect(pin).toEqual(upgrade.after.pin);
    expect(
      loadDocumentExpressionMetadataDataset().records.find(
        (record) => record.documentId === "eu:32013L0036",
      ),
    ).toEqual(upgrade.after.expressionMetadata);
    expect(FORMEX_PARSER_VERSION).toBe(upgrade.parserVersion);
    expect(upgrade.before.source).toMatchObject({
      celex: "32013L0036",
      expressionCelex: "02013L0036-20250117",
      quality: { articleCount: 178, maximumWarnings: 0 },
      sourceStatus: { textAsOf: "2025-01-17" },
    });
    expect(source?.quality).toMatchObject({
      articleCount: 197,
      recitalCount: 0,
      annexCount: 2,
      paragraphCount: 773,
      pointCount: 979,
      structuralNodeCount: 46,
      maximumWarnings: 0,
    });
    expect(upgrade.comparison.removedArticleIds).toEqual([]);
    expect(upgrade.comparison.addedArticleIds).toHaveLength(19);
    // The established fidelity anchors are retained, not replaced to hide drift.
    expect(source?.quality?.textHashes).toMatchObject(
      upgrade.before.source.quality.textHashes,
    );
    expect(Object.keys(source?.quality?.textHashes ?? {})).toHaveLength(11);
  });

  it("preserves both frozen datasets byte-for-byte and rebases without changing questions or gold IDs", () => {
    for (const { path, sha256 } of upgrade.preservedBenchmarks) {
      expect(
        `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`,
      ).toBe(sha256);
      const before = loadBankingGovernanceTasks(path);
      const after = loadBankingGovernanceTasks(
        path.replace(".json", "-crd-20260711.json"),
      );
      expect(after.cases.map(({ expectedEvidence, ...item }) => item)).toEqual(
        before.cases.map(({ expectedEvidence, ...item }) => item),
      );
      expect(after.cases.map((item) => item.expectedEvidence.entityId)).toEqual(
        before.cases.map((item) => item.expectedEvidence.entityId),
      );
      expect(
        after.sources.filter((s) => s.documentId !== "eu:32013L0036"),
      ).toEqual(before.sources.filter((s) => s.documentId !== "eu:32013L0036"));
      expect(after.sources[0]).toMatchObject({
        sourceSnapshotId: upgrade.after.pin.snapshotId,
        textAsOf: "2026-07-11",
      });
      for (const item of after.cases) {
        const previous = before.cases.find((c) => c.id === item.id);
        if (item.documentId !== "eu:32013L0036") {
          expect(item).toEqual(previous);
          continue;
        }
        const reviewed = upgrade.comparison.governance.find(
          (p: { after: { entityId: string } }) =>
            p.after.entityId === item.expectedEvidence.entityId,
        );
        expect(item.expectedEvidence).toEqual({
          entityId: reviewed.after.entityId,
          sourceLocator: reviewed.after.sourceLocator,
          textSha256: reviewed.after.textSha256,
        });
        expect(item.expectedEvidence.textSha256).not.toBe(
          previous?.expectedEvidence.textSha256,
        );
      }
    }
  });

  it("keeps the workflow currency review aligned with the new task pins", () => {
    const review = JSON.parse(
      readFileSync(
        "data/editorial/banking-governance-currency-review-20261016.json",
        "utf8",
      ),
    );
    for (const source of loadBankingGovernanceTasks().sources) {
      expect(
        review.sources.find(
          (item: { documentId: string }) =>
            item.documentId === source.documentId,
        )?.loadedSnapshotId,
      ).toBe(source.sourceSnapshotId);
    }
    expect(review.sources[0]).toMatchObject({
      status: "reviewed-latest-observed-expression-pinned",
      loadedTextAsOf: "2026-07-11",
      latestObservedTextAsOf: "2026-07-11",
    });
  });

  it("matches all 197 Article bodies in official XML order, including the new governance lists", async () => {
    const source = loadSourceRegistrySync().find(
      (item) => item.celex === "32013L0036",
    );
    if (!source) throw new Error("CRD source missing");
    const verified = await verifiedSource(upgrade.after.pin);
    expect(verified.snapshot.expressionCelex).toBe("02013L0036-20260711");
    const pkg = extractFormexPackage(
      verified.contentBytes,
      verified.snapshot.content.upstreamStreamName,
    );
    expect(pkg.resources).toEqual([]);
    const { document, report } = parseFormexAct(
      pkg.act.xml,
      source,
      verified.snapshot,
      pkg.annexes,
    );
    expect(report).toEqual(upgrade.comparison.afterQuality);

    // Independent XML traversal: exclude only body-model omissions (notes,
    // numbering and Article headings), not parser-specific containers. Compare
    // non-whitespace characters so spacing at inline element boundaries is not
    // mistaken for a legal change. Punctuation and wording remain significant.
    type Node = Record<string, unknown>;
    const xml = new XMLParser({
      preserveOrder: true,
      ignoreAttributes: false,
      parseTagValue: false,
      processEntities: false,
      trimValues: false,
    }).parse(pkg.act.xml) as Node[];
    const ignored = new Set(["NOTE", "NO.P", "NO.PARAG", "TI.ART", "STI.ART"]);
    function text(nodes: Node[]): string {
      return nodes
        .map((node) => {
          if ("#text" in node) return String(node["#text"]);
          return Object.entries(node)
            .filter(([tag, value]) => !ignored.has(tag) && Array.isArray(value))
            .map(([, value]) => text(value as Node[]))
            .join("");
        })
        .join("");
    }
    function find(nodes: Node[], tag: string): Node[] {
      return nodes.flatMap((node) => [
        ...(tag in node ? [node] : []),
        ...Object.values(node)
          .filter(Array.isArray)
          .flatMap((value) => find(value, tag)),
      ]);
    }
    const byId = new Map(document.provisions.map((p) => [p.logicalId, p]));
    function render(id: string): string {
      const p = byId.get(id);
      if (!p) throw new Error(`Missing ordered child: ${id}`);
      if (p.orderedContent)
        return p.orderedContent
          .map((entry) => {
            if (entry.type === "text") return entry.text;
            if (entry.type === "child") return render(entry.childLogicalId);
            throw new Error("Unexpected CRD formula resource");
          })
          .join("");
      if (p.kind !== "article") return p.text;
      return document.provisions
        .filter((child) => child.parentLogicalId === id)
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map((child) => render(child.logicalId))
        .join("");
    }
    const compact = (value: string) => value.replace(/\s/gu, "");
    const articles = find(xml, "ARTICLE");
    expect(articles).toHaveLength(197);
    for (const article of articles) {
      const body = article.ARTICLE as Node[];
      const label = text(
        (body.find((node) => "TI.ART" in node)?.["TI.ART"] ?? []) as Node[],
      );
      const id = `eu:32013L0036:article:${label
        .replace(/^Article\s+/u, "")
        .trim()
        .toLowerCase()}`;
      expect(compact(render(id)), id).toBe(compact(text(body)));
    }
    const annexes = find(xml, "CONS.ANNEX");
    expect(annexes).toHaveLength(2);
    for (const [index, annex] of annexes.entries()) {
      const contents = find(annex["CONS.ANNEX"] as Node[], "CONTENTS")[0];
      const id = `eu:32013L0036:annex:${index === 0 ? "i" : "ii"}`;
      expect(compact(byId.get(id)?.text ?? ""), id).toBe(
        compact(text(contents.CONTENTS as Node[])),
      );
    }
  }, 60_000);

  it("preserves every prior Article parent and structural ID/title across both verified expressions", async () => {
    const before = await parsePinnedSource(upgrade.before);
    const after = await parsePinnedSource(upgrade.after);
    expect(
      after.provisions.find(
        (p) => p.logicalId === upgrade.mappingReview.entityId,
      )?.text,
    ).toBe(
      before.provisions.find(
        (p) => p.logicalId === upgrade.mappingReview.entityId,
      )?.text,
    );
    for (const node of before.structuralNodes) {
      const retained = after.structuralNodes.find(
        (n) => n.logicalId === node.logicalId,
      );
      expect(retained, node.logicalId).toMatchObject({
        title: node.title,
        parentLogicalId: node.parentLogicalId,
      });
    }
    const previous = before.provisions.filter((p) => p.kind === "article");
    expect(previous).toHaveLength(178);
    for (const article of previous) {
      expect(
        after.provisions.find((p) => p.logicalId === article.logicalId),
        article.logicalId,
      ).toMatchObject({ parentLogicalId: article.parentLogicalId });
    }
    expect(
      after.provisions
        .filter(
          (p) =>
            p.kind === "article" &&
            !previous.some((old) => old.logicalId === p.logicalId),
        )
        .map((p) => p.logicalId),
    ).toEqual(upgrade.comparison.addedArticleIds);
    const sectionId = "eu:32013L0036:title:vii:chapter:3:section:i";
    expect(
      after.structuralNodes.find((n) => n.logicalId === sectionId)?.title,
    ).toBe("Principles for conducting supervision on a consolidated basis");
    expect(
      after.structuralNodes.find(
        (n) => n.logicalId === `${sectionId}:occurrence:2`,
      )?.title,
    ).toBe("Application of this Chapter to investment firm groups");
    expect(
      after.provisions.find((p) => p.logicalId === "eu:32013L0036:article:110a")
        ?.parentLogicalId,
    ).toBe(`${sectionId}:occurrence:2`);
  }, 60_000);
});
