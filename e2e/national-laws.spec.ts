import { expect, test } from "@playwright/test";

test("Germany lists four local laws and opens their German Reader views", async ({
  page,
  request,
}) => {
  const response = await request.get("http://localhost:3000/api/countries/de");
  expect(response.ok()).toBe(true);
  const detail = await response.json();
  expect(detail.entry.localDocumentCount).toBe(4);
  expect(
    detail.localDocuments
      .map((document: { shortName: string }) => document.shortName)
      .sort(),
  ).toEqual(["GwG", "KAGB", "KWG", "WpIG"]);

  await page.goto("/countries/de");
  await expect(page.getByRole("heading", { name: "Germany" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Local Reader material" }),
  ).toBeVisible();
  for (const shortName of ["GwG", "KAGB", "KWG", "WpIG"] as const) {
    await page.getByRole("link", { name: new RegExp(shortName) }).click();
    await expect(
      page.getByRole("heading", { name: shortName, exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("tab", { name: /Articles/u })).toBeVisible();
    await expect(
      page.locator(".structured-legal-content[lang=de]").first(),
    ).toBeVisible();
    await expect(
      page.locator(".structured-legal-content").first(),
    ).toContainText(
      {
        GwG: "Geldwäsche",
        WpIG: "Wertpapierinstitut",
        KAGB: "Investmentvermögen",
        KWG: "Kreditinstitute",
      }[shortName] ?? shortName,
    );
    await expect(page.locator(".toc-scroll .toc-item").first()).toBeVisible();
    await expect(page.locator(".source-status-notice")).toContainText(
      "Non-authoritative consolidation",
    );
    await expect(page.locator(".source-status-notice")).toContainText(
      "Last amendment act date",
    );
    await expect(
      page.getByRole("link", { name: "View current source text" }),
    ).toHaveAttribute("href", /gesetze-im-internet\.de/u);
    await page.goto("/countries/de");
  }
});

test("KWG retains Annex I column spans and KAGB repeated chapter ancestry", async ({
  page,
}) => {
  await page.goto("/read/kwg/annexes/bjne030101128");
  await expect(page.locator("#main-content .source-table")).toHaveCount(1);
  await expect(page.locator("#main-content .source-table tr")).toHaveCount(10);
  await expect(
    page.locator('#main-content .source-table td[colspan="2"]'),
  ).toHaveCount(1);
  await expect(
    page.locator('#main-content .source-table td[colspan="2"]'),
  ).toContainText("Zusätzliche Informationen");
  for (const [number, chapter] of [
    ["338b", "Geldmarktfonds"],
    ["338c", "Paneuropäisches Privates Pensionsprodukt (PEPP)"],
  ]) {
    await page.goto(`/read/kagb/articles/${number}`);
    await expect(page.locator("#main-content .provision-label")).toContainText(
      `§ ${number}`,
    );
    await expect(page.locator(".breadcrumb")).toContainText(chapter);
  }
});
