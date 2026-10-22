import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { sha256, validateCanonicalDocument } from "../canonical/validate";
import { contentUnitsText } from "../shared/content-unit";
import {
  type AmfCandidateContent,
  inspectAmfCandidate,
} from "./amf-candidate-parser";
import { parseAmfHtml } from "./amf-canonical-parser";
import { importAmfProbe, readVerifiedAmfSourceSnapshot } from "./amf-snapshot";
import { loadAmfSourceRegistry } from "./amf-source-registry";
const input = "data/raw/national-probes/2026-10-20/fr-amf.bin";
const report = "data/raw/national-probes/2026-10-20/report.json";
const root = await mkdtemp(join(tmpdir(), "amf-canonical-"));
afterAll(async () => rm(root, { recursive: true, force: true }));
describe.skipIf(!existsSync(input) || !existsSync(report))(
  "AMF canonical frozen candidate",
  () => {
    it("preserves all groups, articles, and notes against the candidate baseline", async () => {
      const imported = await importAmfProbe({
        inputPath: input,
        reportPath: report,
        capturedOn: "2026-10-20",
        outputRoot: root,
      });
      const verified = await readVerifiedAmfSourceSnapshot(imported.directory);
      const [source] = await loadAmfSourceRegistry();
      const candidate = inspectAmfCandidate(verified.contentBytes);
      const baseline = candidate.baseline;
      const { document } = parseAmfHtml(
        verified.contentBytes,
        verified.snapshot,
        source,
      );
      if (document.schemaVersion !== "1.5.0") throw new Error("Wrong schema");
      expect(
        document.structuralNodes.map((g) => [g.officialSourceUrl, g.label]),
      ).toEqual(baseline.groups.map((g) => [g.sourceUrl, g.label]));
      expect(
        document.provisions.map((p) => [
          p.officialSourceUrl,
          p.rawHref,
          p.label,
          p.contentHash,
        ]),
      ).toEqual(
        baseline.articles.map((a) => [
          a.sourceUrl,
          a.rawHref,
          a.label,
          a.contentSha256,
        ]),
      );
      const expectedOrder: string[] = [];
      const traverse = (node: AmfCandidateContent) => {
        if (node.type !== "element") return;
        const classes = (node.attributes.class ?? "").split(/\s/u);
        if (classes.includes("rg-part"))
          expectedOrder.push(
            new URL(node.attributes["data-eli-content"], source.contentUrl)
              .href,
          );
        if (classes.includes("art")) {
          const heading = node.children.find(
            (n) =>
              n.type === "element" &&
              (n.attributes.class ?? "").split(/\s/u).includes("art-titre"),
          );
          if (!heading || heading.type !== "element")
            throw new Error("Missing title");
          const anchor = heading.children.find(
            (n) => n.type === "element" && n.tag === "a",
          );
          if (!anchor || anchor.type !== "element")
            throw new Error("Missing anchor");
          expectedOrder.push(
            new URL(anchor.attributes.href, source.contentUrl).href,
          );
        }
        node.children.forEach(traverse);
      };
      candidate.legalContentAst.forEach(traverse);
      const ordered = [
        ...document.structuralNodes,
        ...document.provisions,
      ].sort((a, b) => a.displayOrder - b.displayOrder);
      expect(ordered.map((n) => n.officialSourceUrl)).toEqual(expectedOrder);
      expect(ordered.map((n) => n.displayOrder)).toEqual(
        expectedOrder.map((_, i) => i),
      );
      const expectedKinds: Record<string, string> = {
        livre: "part",
        titre: "title",
        chapitre: "chapter",
        section: "section",
        "sous-section": "subsection",
        paragraphe: "division",
        "sous-paragraphe": "division",
      };
      for (const group of document.structuralNodes)
        expect(group.kind).toBe(
          expectedKinds[group.officialSourceUrl.split("/").at(-3) ?? ""],
        );
      const scoped = new Map(
        document.scopedSourceNotes.map((n) => [
          `${n.ownerSourceUrl}:${n.position}`,
          n.contentHash,
        ]),
      );
      for (const note of baseline.notes.filter((n) => n.scope !== "article"))
        expect(scoped.get(`${note.ownerSourceUrl}:${note.position}`)).toBe(
          note.textSha256,
        );
      for (const [index, article] of baseline.articles.entries()) {
        const p = document.provisions[index];
        const noteHashes = p.orderedUnits
          .filter((n) => n.contentRole === "source-note")
          .map((n) => sha256(contentUnitsText([n], "source-note")));
        expect(noteHashes).toEqual(article.notes.map((n) => n.textSha256));
      }
      const bis = document.provisions.find(
        (p) => p.label === "Article 212-19\u00a0bis",
      );
      expect(bis?.numberRaw).toBe("212-19\u00a0bis");
      expect(bis?.numberNormalized).toBe("212-19-bis");
      expect(
        document.provisions.find((p) => p.label === "Article 212-19")
          ?.numberNormalized,
      ).toBe("212-19");
      expect(document.source.sourceStatus.currentVersionUrl).toBe(
        source.contentUrl,
      );
      expect(document.source.sourceStatus.sourceNotes).toHaveLength(4);
      for (const publication of source.componentPublications)
        expect(document.source.sourceStatus.sourceNotes?.join(" ")).toContain(
          publication.url,
        );
      expect(document.source.retrievedAt).toBeNull();
      expect(document.publicationDate).toBeNull();
      for (const note of document.scopedSourceNotes)
        expect(note.contentHash).toBe(
          sha256(contentUnitsText(note.orderedUnits, "source-note")),
        );
      for (const mutate of [
        (copy: typeof document) => {
          copy.scopedSourceNotes[0].contentHash = `sha256:${"0".repeat(64)}`;
        },
        (copy: typeof document) => {
          const visit = (
            unit: (typeof copy.scopedSourceNotes)[0]["orderedUnits"][number],
          ): boolean => {
            if (unit.type === "text") {
              unit.text += "changed";
              return true;
            }
            return unit.children.some(visit);
          };
          copy.scopedSourceNotes[0].orderedUnits.some(visit);
        },
        (copy: typeof document) => {
          copy.provisions[0].officialSourceUrl += "?unreviewed=1";
        },
        (copy: typeof document) => {
          copy.provisions[0].structuralPath.reverse();
        },
        (copy: typeof document) => {
          copy.structuralNodes[0].parentLogicalId =
            copy.structuralNodes[0].logicalId;
        },
        (copy: typeof document) => {
          copy.scopedSourceNotes[0].scope = "structure";
        },
        (copy: typeof document) => {
          copy.scopedSourceNotes[1].position = 2;
        },
        (copy: typeof document) => {
          copy.scopedSourceNotes.reverse();
        },
        (copy: typeof document) => {
          copy.scopedSourceNotes[0].orderedUnits[0].contentRole =
            "operative-text";
        },
      ]) {
        const changed = structuredClone(document);
        mutate(changed);
        expect(() => validateCanonicalDocument(changed)).toThrow();
      }
      const altered = await readFile(input);
      altered[0] ^= 1;
      expect(() => parseAmfHtml(altered, verified.snapshot, source)).toThrow();
    }, 60000);
  },
);
