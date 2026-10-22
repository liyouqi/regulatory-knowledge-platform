import { expect, test } from "@playwright/test";

test("country directory filters and distinguishes local and EU evidence", async ({
  page,
  request,
}) => {
  await page.goto("/countries");
  await expect(
    page.getByRole("heading", { name: "Financial regulation by country" }),
  ).toBeVisible();
  await page.getByRole("searchbox", { name: "Country" }).fill("Luxembourg");
  await expect(page.locator(".country-card")).toHaveCount(1);
  await page.getByRole("link", { name: /Luxembourg/u }).click();
  await expect(page).toHaveURL(/\/countries\/lu$/u);
  await expect(page.getByRole("heading", { name: "Luxembourg" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Local Reader material" }),
  ).toBeVisible();
  await expect(
    page.locator(".country-detail").first().locator(".country-card").first(),
  ).toBeVisible();
  await expect(
    page.getByText("Candidate source link — verification pending."),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /Legilux/u })).toHaveAttribute(
    "href",
    "https://legilux.public.lu/",
  );
  await expect(
    page.getByText(/does not establish their applicability/u),
  ).toBeVisible();

  await page.goto("/countries/fr");
  await expect(page.getByRole("link", { name: /AMF RG/u })).toBeVisible();
  const unknown = await request.get("http://localhost:3000/api/countries/zz");
  expect(unknown.status()).toBe(404);
  await page.goto("/countries/zz");
  await expect(page.getByRole("alert")).toContainText("Country not found");
});

test("country pages fit a narrow mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const url of ["/countries", "/countries/lu", "/countries/de"]) {
    await page.goto(url);
    await expect(page.locator(".topic-hero")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
});
