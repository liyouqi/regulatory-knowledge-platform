import { expect, test } from "@playwright/test";

test("fund navigation opens the reviewed UCITS risk provision", async ({
  page,
}) => {
  await page.goto("/topics/fund-management-organisation-risk");
  await expect(
    page.getByRole("heading", {
      name: "Fund management organisation and risk",
    }),
  ).toBeVisible();
  await expect(page.locator(".topic-documents > article")).toHaveCount(2);
  await expect(page.locator(".topic-documents li")).toHaveCount(6);
  await page.locator('a[href="/read/ucits/articles/51"]').click();
  await expect(page).toHaveURL(/\/read\/ucits\/articles\/51$/u);
  await expect(page.locator(".provision-body")).toContainText(
    "risk-management process",
  );
});

test("Reader retains annex suffixes and quoted replacement identities", async ({
  page,
}) => {
  await page.goto("/read/ucits/annexes/iia");
  await expect(page.locator("#main-content .provision-label")).toHaveText(
    "ANNEX IIA",
  );
  await expect(page.locator("#main-content")).toContainText(
    "LIQUIDITY MANAGEMENT TOOLS",
  );
  await page.goto("/read/aifmd-ii/annexes/iv");
  await expect(page.locator("#main-content .provision-label")).toHaveText(
    "ANNEX IV",
  );
  await expect(page.locator(".provision-body")).toContainText("ANNEX IIA");
  await expect(page.locator(".provision-body")).toContainText(
    "LIQUIDITY MANAGEMENT TOOLS AVAILABLE TO UCITS",
  );
});
