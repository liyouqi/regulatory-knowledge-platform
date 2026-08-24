import { expect, test } from "@playwright/test";

test("opens DORA Article 28 from Explorer and its Level 2 library", async ({
  page,
}) => {
  await page.goto("/explore/dora");

  await expect(page.getByRole("heading", { name: "DORA" })).toBeVisible();
  await page.getByRole("link", { name: /^Article 28\b/ }).click();

  await expect(page).toHaveURL(/\/read\/dora\/articles\/28$/);
  await expect(
    page.locator("#main-content").getByText("Article 28", { exact: true }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Explore" }).click();
  await expect(page).toHaveURL(/\/explore\/dora#.+/);
  await expect(page.getByRole("heading", { name: "DORA" })).toBeVisible();

  await page.getByRole("link", { name: /View library/ }).click();
  await expect(page).toHaveURL("/library/dora");
  await expect(
    page.getByRole("heading", { name: "Level 2 library" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /^RTS\s+\d+/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /^ITS\s+\d+/ })).toBeVisible();
});

test("global law search opens DORA Article 28", async ({ page }) => {
  await page.goto("/explore/dora");
  await expect(page.getByRole("heading", { name: "DORA" })).toBeVisible();

  await page.keyboard.press("Meta+k");
  const search = page.getByRole("dialog", { name: "Regulatory search" });
  await expect(search).toBeVisible();

  const input = search.getByRole("textbox", {
    name: "Find laws by name, CELEX, or citation",
  });
  await input.pressSequentially("DORA article");
  await expect(input).toHaveValue("DORA article");
  await expect(
    search.getByText("Add a provision number", { exact: false }),
  ).toBeVisible();
  await expect(
    search.getByRole("button", { name: /DORA/ }).first(),
  ).toBeVisible();

  await input.pressSequentially(" 28");
  await expect(input).toHaveValue("DORA article 28");
  await search.getByRole("button", { name: /DORA · Article 28/ }).click();

  await expect(page).toHaveURL(/\/read\/dora\/articles\/28$/);
  await expect(
    page.locator("#main-content").getByText("Article 28", { exact: true }),
  ).toBeVisible();
});

test("global search opens an official definition in Reader", async ({
  page,
}) => {
  await page.goto("/explore/dora");
  await expect(page.getByRole("heading", { name: "DORA" })).toBeVisible();
  await page.keyboard.press("Meta+k");

  const search = page.getByRole("dialog", { name: "Regulatory search" });
  await search.getByRole("tab", { name: "Definitions" }).click();
  const input = search.getByRole("textbox", {
    name: "Search legal definitions",
  });
  await input.fill("digital operational resilience");
  await expect(
    search.locator(".definition-search-result").first(),
  ).toBeVisible();
  await search.locator(".definition-search-result").first().click();

  await expect(page).toHaveURL(/\/read\/dora\/articles\/\d+(?:#.+)?$/);
  await expect(page.locator("#main-content")).toBeVisible();
});

test("full-text search opens the matching paragraph anchor", async ({
  page,
}) => {
  await page.goto("/explore/dora");
  await expect(page.getByRole("heading", { name: "DORA" })).toBeVisible();
  await page.keyboard.press("Meta+k");

  const search = page.getByRole("dialog", { name: "Regulatory search" });
  await search.getByRole("tab", { name: "Full text" }).click();
  const input = search.getByRole("textbox", {
    name: "Search full text across loaded laws",
  });
  await input.fill("operational risk");
  await expect(
    search.locator(".full-text-search-result").first(),
  ).toBeVisible();
  await search.locator(".full-text-search-result").first().click();

  await expect(page).toHaveURL(/\/read\/.+#.+/);
  await expect(page.locator(".deep-link-target")).toBeVisible();
});

test("an inline legal reference opens its Side Peek", async ({ page }) => {
  await page.goto("/read/dora/articles/1");
  await expect(page.getByRole("heading", { name: "DORA" })).toBeVisible();

  await page.getByRole("button", { name: "Preview NIS2 Article 3" }).click();
  const preview = page.getByRole("dialog", { name: "Reference preview" });
  await expect(preview).toBeVisible();
  await expect(
    preview.getByRole("heading", { name: "Article 3" }),
  ).toBeVisible();
  await expect(
    preview.getByText("Cited here as", { exact: false }),
  ).toBeVisible();
});

test("DORA Article 28 opens a mapped RTS measure", async ({ page }) => {
  await page.goto("/read/dora/articles/28");
  await expect(page.getByRole("heading", { name: "DORA" })).toBeVisible();

  const relationships = page.locator(".context-panel .relationships-panel");
  await expect(relationships.getByText("Level 2 measures")).toBeVisible();
  await relationships
    .getByRole("link", { name: /DORA RTS ICT Third-Party Policy/ })
    .click();

  await expect(page).toHaveURL("/explore/dora-rts-ict-third-party-policy");
  await expect(
    page.getByRole("heading", { name: "DORA RTS ICT Third-Party Policy" }),
  ).toBeVisible();
});
