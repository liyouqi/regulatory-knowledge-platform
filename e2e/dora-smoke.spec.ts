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
  await input.pressSequentially("DORA Article 28");
  await expect(input).toHaveValue("DORA Article 28");
  await search.getByRole("button", { name: /DORA · Article 28/ }).click();

  await expect(page).toHaveURL(/\/read\/dora\/articles\/28$/);
  await expect(
    page.locator("#main-content").getByText("Article 28", { exact: true }),
  ).toBeVisible();
});
