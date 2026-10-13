import { expect, test } from "@playwright/test";

test("a business question opens its exact CRD evidence and retains version cautions", async ({
  page,
}) => {
  await page.goto("/topics/banking-governance-internal-control");
  await expect(
    page.getByRole("heading", {
      name: "Banking governance and internal control",
    }),
  ).toBeVisible();
  await page.keyboard.press("Meta+k");
  const search = page.getByRole("dialog", { name: "Regulatory search" });
  await search.getByRole("tab", { name: "Full text" }).click();
  await search
    .getByRole("textbox", { name: "Search full text across loaded laws" })
    .fill("Who approves and periodically reviews a bank's risk strategy?");
  await expect(
    search.locator(".full-text-search-result").first(),
  ).toContainText("CRD IV");
  await expect(search.locator("output.search-status")).toContainText(
    "not legal answers",
  );
  await search.locator(".full-text-search-result").first().click();
  await expect(page).toHaveURL(/\/read\/crd-iv\/articles\/76/u);
  await expect(
    page.getByText(
      "A loaded text date is not a latest-version certification.",
      { exact: false },
    ),
  ).toBeVisible();
});

test("business-question scope is selectable and changes the actual request", async ({
  page,
}) => {
  await page.goto("/topics/banking-governance-internal-control");
  await expect(
    page.getByRole("heading", {
      name: "Banking governance and internal control",
    }),
  ).toBeVisible();
  await page.keyboard.press("Meta+k");
  const dialog = page.getByRole("dialog", { name: "Regulatory search" });
  await dialog.getByRole("tab", { name: "Full text" }).click();
  await expect(
    dialog
      .getByRole("combobox", { name: "Full-text evidence scope" })
      .locator('option[value="eu:eba:gl:2021:05"]'),
  ).toHaveCount(1);
  await dialog
    .getByRole("combobox", { name: "Full-text evidence scope" })
    .selectOption("eu:eba:gl:2021:05");
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/search/full-text") &&
      response.url().includes("documentId=eu%3Aeba%3Agl%3A2021%3A05"),
  );
  await dialog
    .getByRole("textbox", { name: "Search full text across loaded laws" })
    .fill(
      "What independence and resources should the internal audit function have?",
    );
  const response = await responsePromise;
  const payload = await response.json();
  expect(payload.scopeDocumentId).toBe("eu:eba:gl:2021:05");
  expect(payload.results.length).toBeGreaterThan(0);
  expect(
    payload.results.every(
      (result: { documentId: string }) =>
        result.documentId === "eu:eba:gl:2021:05",
    ),
  ).toBe(true);
});

test("governance Topic exposes editorial subjects and opens the exact Part II point", async ({
  page,
}) => {
  await page.goto("/topics/banking-governance-internal-control");
  await expect(
    page.getByRole("heading", {
      name: "Banking governance and internal control",
    }),
  ).toBeVisible();
  await expect(page.locator(".topic-documents > article")).toHaveCount(3);
  await expect(page.locator(".topic-documents li")).toHaveCount(20);
  await expect(
    page.getByText("Classification, not an applicability conclusion"),
  ).toBeVisible();
  await expect(
    page.getByText(/Topic membership does not establish that the text/u),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Editorial navigation: Navigation subject: Part II: supervisory body records.",
    ),
  ).toBeVisible();
  await page
    .locator(
      'a[href="/read/circular-cssf-12-552/provisions/part-ii-provision-point-25"]',
    )
    .click();
  await expect(page).toHaveURL(
    /\/read\/circular-cssf-12-552\/provisions\/part-ii-provision-point-25$/u,
  );
  await expect(page.locator("#main-content .provision-label")).toBeVisible();
  await expect(page.locator("#main-content .provision-label")).toHaveText(
    "Point 25",
  );
  await expect(
    page
      .locator("#main-content")
      .getByText(
        /The work of the supervisory body must be documented in writing/u,
      ),
  ).toBeVisible();
});

test("governance Topic keeps existing directed official mappings and edition identity", async ({
  request,
}) => {
  const response = await request.get(
    "http://localhost:3000/api/topics/banking-governance-internal-control",
  );
  expect(response.ok()).toBe(true);
  const body = await response.json();
  expect(body.scope).toEqual({
    classificationProvenance: "EDITORIAL",
    applicabilityConclusion: false,
  });
  expect(body.runtime.profileId).toBe("full-corpus");
  expect(
    body.documents.flatMap(
      (document: { assignments: unknown[] }) => document.assignments,
    ),
  ).toHaveLength(20);
  expect(body.relationships).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        relationType: "MANDATES",
        provenance: "OFFICIAL_MAPPING",
        source: expect.objectContaining({
          entityId: "eu:32013L0036:article:74",
        }),
        target: expect.objectContaining({ documentId: "eu:eba:gl:2021:05" }),
      }),
      expect.objectContaining({
        relationType: "IMPLEMENTS",
        provenance: "OFFICIAL_MAPPING",
        source: expect.objectContaining({
          entityId: "lu:cssf:circular-12-552:provision:introduction:block:7",
        }),
        target: expect.objectContaining({ documentId: "eu:eba:gl:2021:05" }),
      }),
    ]),
  );
});
