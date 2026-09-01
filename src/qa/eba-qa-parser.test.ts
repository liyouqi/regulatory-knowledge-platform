import { describe, expect, it } from "vitest";
import {
  htmlToSourceText,
  lastCatalogPage,
  parseEbaQaCatalogPage,
  parseEbaQaDetailPage,
} from "./eba-qa-parser";

const catalogFixture = `
<article class="teaser-qa">
  <h3 class="h6 teaser-qa__subject"><a href="/single-rule-book-qa/qna/view/publicId/2025_7613" rel="bookmark">
    Classification of phishing-attacks
  </a></h3>
  <p class="teaser-qa__question">Can it be reported?&amp;nbsp;</p>
  <ul><li><b>Legal act: </b> Regulation (EU) No 2022/2554 (DORA Reg)</li>
  <li><b>COM Delegated or Implementing Acts/RTS/ITS/GLs: </b> Regulation (EU) 2024/1772</li></ul>
  <footer><ul><li><b>ID: </b>2025_7613</li>
  <li><b>Topic: </b> ICT-related incidents</li>
  <li><b>Date of submission: </b><time>04/11/2025</time></li>
  <li><b>Published as final Q&amp;A: </b>06/02/2026</li></ul></footer>
</article>
<a href="?page=135" class="pager__link" title="Go to last page">Last</a>`;

const detailFixture = `
<dl class="metadata metadata--large">
  <dt class="metadata__term">Question ID</dt><dd class="metadata__definition"><div>2025_7613</div></dd>
  <dt class="metadata__term">Article</dt><dd class="metadata__definition"><div>3</div></dd>
  <dt class="metadata__term">Subparagraph</dt><dd class="metadata__definition"><div>No. 8</div></dd>
  <dt class="metadata__term">Question</dt><dd class="metadata__definition"><p>Can it be reported?</p></dd>
  <dt class="metadata__term">Background on the question</dt><dd class="metadata__definition"><p>Customer phishing.</p></dd>
  <dt class="metadata__term">Final answer</dt><dd class="metadata__definition"><p>No, when services are unaffected.</p><p>It may qualify when services are affected.</p></dd>
  <dt class="metadata__term">Status</dt><dd class="metadata__definition"><div>Final Q&amp;A</div></dd>
  <dt class="metadata__term">Answer prepared by</dt><dd class="metadata__definition"><div>Answer prepared by the Joint ESAs Q&amp;A</div></dd>
</dl>
<div class="alert alert-info"><h3 class="h6">Disclaimer</h3><p>Check the publication date.</p></div>`;

describe("EBA Q&A HTML parser", () => {
  it("decodes nested source entities without inventing text", () => {
    expect(htmlToSourceText("Question&amp;nbsp;text &amp;amp; evidence")).toBe(
      "Question text & evidence",
    );
  });

  it("parses Final catalogue records and the last page", () => {
    expect(parseEbaQaCatalogPage(catalogFixture)).toEqual([
      expect.objectContaining({
        id: "qa:eba:2025_7613",
        publicId: "2025_7613",
        title: "Classification of phishing-attacks",
        submittedAt: "2025-11-04",
        publishedAt: "2026-02-06",
        statusAtImport: "Final",
      }),
    ]);
    expect(lastCatalogPage(catalogFixture)).toBe(135);
  });

  it("extracts official detail wording and disclaimer", () => {
    expect(parseEbaQaDetailPage(detailFixture)).toEqual(
      expect.objectContaining({
        id: "qa:eba:2025_7613",
        articleLabel: "3",
        subparagraphLabel: "No. 8",
        background: "Customer phishing.",
        finalAnswer:
          "No, when services are unaffected.\nIt may qualify when services are affected.",
        finalStatusLabel: "Final Q&A",
        nonBindingNotice: "Check the publication date.",
      }),
    );
  });

  it("normalizes markup without paraphrasing source words", () => {
    expect(
      htmlToSourceText("<p>One&nbsp;two.</p><p>Three &amp; four.</p>"),
    ).toBe("One two.\nThree & four.");
  });
});
