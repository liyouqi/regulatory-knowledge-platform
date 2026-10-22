import { expect, test } from "@playwright/test";

test("France opens the AMF Reader with honest dates and separate publisher context", async ({
  page,
  request,
}) => {
  const country = await request.get("http://localhost:3000/api/countries/fr");
  expect(country.ok()).toBe(true);
  expect((await country.json()).entry.localDocumentCount).toBe(1);
  await page.goto("/countries/fr");
  await expect(
    page.getByRole("heading", { name: "France", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: /AMF RG/u }).click();
  await expect(
    page.getByRole("heading", { name: "AMF RG", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".structured-legal-content[lang=fr]").first(),
  ).toBeVisible();
  await expect(page.locator(".source-status-notice")).toContainText(
    "Publisher version date 2026-09-11",
  );
  await expect(page.locator(".source-status-notice")).toContainText(
    "aggregate publication date is not recorded",
  );
  await expect(page.locator(".publisher-context-note").first()).toContainText(
    "Publisher context:",
  );
  await expect(
    page.locator(".provision-body .publisher-context-note"),
  ).toHaveCount(0);
});

test("AMF keeps distinct deleted articles and normalized legal formatting", async ({
  page,
  request,
}) => {
  for (const number of ["212-19", "212-19-bis"]) {
    const lookup = await request.get(
      `http://localhost:3000/api/search/laws?q=${encodeURIComponent(`AMF RG article ${number}`)}`,
    );
    expect(lookup.ok()).toBe(true);
    const match = (await lookup.json()).bestMatch;
    expect(match.publicationDate).toBeNull();
    expect(match.target.number).toBe(number);
    await page.goto(match.target.path);
    await expect(page.locator(".provision-label")).toHaveText(
      number === "212-19" ? "Article 212-19" : "Article 212-19\u00a0bis",
    );
    await expect(page.locator(".provision-body")).toContainText(
      "Supprimé par l'arrêté du 7 novembre 2019",
    );
  }
  await page.goto("/read/amf-rg/articles/211-1");
  await expect(
    page.locator(".provision-body ol.source-list").first(),
  ).toBeVisible();
  await expect(
    page.locator(".provision-body ul.source-list").first(),
  ).toBeVisible();
  await page.goto("/read/amf-rg/articles/212-48");
  await expect(page.locator(".provision-body sup").first()).toBeVisible();
  await page.goto("/read/amf-rg/articles/223-2");
  await expect(page.locator(".provision-body a[href]").first()).toBeVisible();
  await page.goto("/read/amf-rg/articles/212-39");
  await expect(page.locator(".provision-body em").first()).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".provision-body")).toBeVisible();
});
