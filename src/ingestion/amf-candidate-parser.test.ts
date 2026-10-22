import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { sha256 } from "../canonical/validate";
import { writeAmfCandidate } from "./amf-candidate-cli";
import {
  type AmfCandidateContent,
  inspectAmfCandidate,
} from "./amf-candidate-parser";

// Synthetic DOM and text, never presented as an official legal source.
const note = (text: string) =>
  `<div class="note-amf bk-info"><div class="bg-lightgrey bk-padding shadow"><p>${text}</p></div></div>`;
const article = (label: string, suffix: string, body: string, extra = "") =>
  `<div class="art"><div class="art-titre"><a href="/fr/eli/fr/aai/amf/rg/article/212-19/20191122/${suffix}">${label}</a></div>${extra}<div class="art-content">${body}</div></div>`;
function fixture() {
  return `<!DOCTYPE html><html lang="fr"><head><link rel="canonical" href="https://www.amf-france.org/fr/eli/fr/aai/amf/rg/20260911/notes"></head><body><div class="content-with-padding-r"><h1 class="rg-title" about="/eli/fr/aai/amf/rg/20260911"> Règlement général de l'AMF en vigueur au 11/09/2026 </h1>${note('Global <a href="http://data.europa.eu/eli/reg/2014/596/oj">reference</a>')}<div class="rg-content"><div class="rg-part" data-eli-content="/fr/eli/fr/aai/amf/rg/livre/1/notes"><h2><a class="js-eli-nav" href="/fr/eli/fr/aai/amf/rg/livre/1/notes"><span class="title-type">Livre I</span> - <span class="title-label">Fixture</span></a></h2>${note("Group information")}${article("Article 212-19", "notes", '<p> A&nbsp;<span data-type="noteRefleg">B</span> &amp;nbsp;<i lang="la"> C</i></p><ol><li>Item</li></ol>', note('Article <a href="https://www.legifrance.gouv.fr/">information</a>'))}${article("Article 212-19\u00a0bis", "notes-0", "<p>[Fixture removal marker]</p>")}</div></div></div></body></html>`;
}
function textForRole(
  nodes: AmfCandidateContent[],
  role: string,
  inherited = "structure",
): string {
  return nodes
    .map((node) =>
      node.type === "text"
        ? inherited === role
          ? node.text
          : ""
        : textForRole(node.children, role, node.role),
    )
    .join("");
}

describe("AMF candidate source inspection", () => {
  it("preserves inline text, three note scopes, and both source identities", () => {
    const result = inspectAmfCandidate(fixture());
    expect(result.status).toBe("candidate");
    expect(result.baseline.source.versionDate).toBe("2026-09-11");
    expect(result.baseline.articles.map((n) => [n.label, n.rawHref])).toEqual([
      ["Article 212-19", "/fr/eli/fr/aai/amf/rg/article/212-19/20191122/notes"],
      [
        "Article 212-19\u00a0bis",
        "/fr/eli/fr/aai/amf/rg/article/212-19/20191122/notes-0",
      ],
    ]);
    const operative = textForRole(result.legalContentAst, "operative-text");
    expect(operative).toBe(" A\u00a0B &nbsp; CItem[Fixture removal marker]");
    expect(result.baseline.articles[0].contentSha256).toBe(
      sha256(" A\u00a0B &nbsp; CItem"),
    );
    expect(result.roleTextHashes["operative-text"]).toBe(sha256(operative));
    expect(result.baseline.notes.map((n) => [n.scope, n.position])).toEqual([
      ["document", 1],
      ["group", 1],
      ["article", 1],
    ]);
    expect(textForRole(result.legalContentAst, "source-note")).toBe(
      "Global referenceGroup informationArticle information",
    );
    expect(JSON.stringify(result.legalContentAst)).toContain(
      "http://data.europa.eu/eli/reg/2014/596/oj",
    );
  });

  it("hashes link-target changes separately from unchanged text", () => {
    const a = inspectAmfCandidate(fixture());
    const b = inspectAmfCandidate(
      fixture().replace(
        "https://www.legifrance.gouv.fr/",
        "https://www.legifrance.gouv.fr/codes/",
      ),
    );
    expect(a.roleTextHashes).toEqual(b.roleTextHashes);
    expect(a.legalContentAstHash).not.toBe(b.legalContentAstHash);
    expect(inspectAmfCandidate(fixture())).toEqual(a);
  });

  it("keeps nested like-h7/8 headings and source group order", () => {
    const group = (path: string, level: number, body: string) =>
      `<div class="rg-part" data-eli-content="${path}"><div class="like-h${level}"><a class="js-eli-nav" href="${path}"><span class="title-type">Nested</span> - <span class="title-label">Fixture</span></a></div>${body}</div>`;
    const child = "/fr/eli/fr/aai/amf/rg/livre/1/titre/1/notes";
    const grandchild = "/fr/eli/fr/aai/amf/rg/livre/1/titre/1/chapitre/1/notes";
    const nested = group(child, 7, group(grandchild, 8, note("Nested note")));
    const result = inspectAmfCandidate(
      fixture().replace('<div class="art">', `${nested}<div class="art">`),
    );
    expect(
      result.baseline.groups.map((n) => [n.sourceUrl, n.parentSourceUrl]),
    ).toEqual([
      ["https://www.amf-france.org/fr/eli/fr/aai/amf/rg/livre/1/notes", null],
      [
        `https://www.amf-france.org${child}`,
        "https://www.amf-france.org/fr/eli/fr/aai/amf/rg/livre/1/notes",
      ],
      [
        `https://www.amf-france.org${grandchild}`,
        `https://www.amf-france.org${child}`,
      ],
    ]);
    expect(result.baseline.notes[2].ownerSourceUrl).toBe(
      `https://www.amf-france.org${grandchild}`,
    );
    expect(textForRole(result.legalContentAst, "operative-text")).not.toContain(
      "Nested",
    );
  });

  it.each([
    [
      "unknown legal element",
      (s: string) => s.replace("<p> A", "<p><img src='x'> A"),
    ],
    [
      "unknown body attribute",
      (s: string) => s.replace("<p> A", "<p data-unknown='x'> A"),
    ],
    [
      "operative wrapper inside a note",
      (s: string) =>
        s.replace("Group information", '<div class="art-content">fake</div>'),
    ],
    [
      "missing article body",
      (s: string) => s.replace('class="art-content"', 'class="missing"'),
    ],
    [
      "missing title",
      (s: string) => s.replace('class="rg-title"', 'class="missing"'),
    ],
    [
      "duplicate canonical",
      (s: string) =>
        s.replace(
          "</head>",
          '<link rel="canonical" href="https://www.amf-france.org/fr/eli/fr/aai/amf/rg/20260911/notes"></head>',
        ),
    ],
    [
      "duplicate complete label",
      (s: string) => s.replace("Article 212-19\u00a0bis", "Article 212-19"),
    ],
    ["duplicate source URL", (s: string) => s.replace("/notes-0", "/notes")],
    [
      "missing group identity",
      (s: string) =>
        s.replace('data-eli-content="/fr/eli/fr/aai/amf/rg/livre/1/notes"', ""),
    ],
    [
      "foreign identity",
      (s: string) =>
        s.replace("https://www.amf-france.org", "https://example.test"),
    ],
    [
      "explicit identity port",
      (s: string) =>
        s.replace(
          "https://www.amf-france.org",
          "https://www.amf-france.org:443",
        ),
    ],
    [
      "active content link",
      (s: string) =>
        s.replace(
          "http://data.europa.eu/eli/reg/2014/596/oj",
          "javascript:alert(1)",
        ),
    ],
    ["title mismatch", (s: string) => s.replace("11/09/2026", "10/09/2026")],
    [
      "title prefix",
      (s: string) =>
        s.replace(" Règlement général", " PREFIX Règlement général"),
    ],
    [
      "title suffix",
      (s: string) => s.replace("11/09/2026 </h1>", "11/09/2026 SUFFIX </h1>"),
    ],
    [
      "about mismatch",
      (s: string) =>
        s.replace(
          'about="/eli/fr/aai/amf/rg/20260911"',
          'about="/eli/fr/aai/amf/rg/20260910"',
        ),
    ],
    [
      "invalid date",
      (s: string) =>
        s
          .replaceAll("20260911", "20260230")
          .replace("11/09/2026", "30/02/2026"),
    ],
    [
      "entity declaration",
      (s: string) =>
        s.replace("<!DOCTYPE html>", '<!DOCTYPE html [<!ENTITY x "bad">]>'),
    ],
    ["unknown HTML entity", (s: string) => s.replace("&nbsp;", "&unknown;")],
    [
      "heading URL mismatch",
      (s: string) =>
        s.replace(
          'href="/fr/eli/fr/aai/amf/rg/livre/1/notes"',
          'href="/fr/eli/fr/aai/amf/rg/livre/2/notes"',
        ),
    ],
  ])("rejects %s", (_name, mutate) => {
    expect(() => inspectAmfCandidate(mutate(fixture()))).toThrow();
  });

  it("writes an ignored candidate and refuses an overwrite", async () => {
    const directory = await mkdtemp(
      resolve("data/artifacts/amf-candidate-test-"),
    );
    const input = resolve(directory, "source.html");
    const output = resolve(directory, "candidate.json");
    try {
      await writeFile(input, fixture());
      await writeAmfCandidate(input, output);
      const before = await readFile(output, "utf8");
      await expect(writeAmfCandidate(input, output)).rejects.toThrow();
      expect(await readFile(output, "utf8")).toBe(before);
      await expect(
        writeAmfCandidate(input, "data/not-an-artifact.json"),
      ).rejects.toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
