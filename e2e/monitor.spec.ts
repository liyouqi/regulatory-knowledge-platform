import { expect, test } from "@playwright/test";

test("Monitor baseline can be filtered, inspected, and printed as a monthly report", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(globalThis, "print", {
      configurable: true,
      value: () => {
        (
          globalThis as typeof globalThis & { monitorPrintCalled?: boolean }
        ).monitorPrintCalled = true;
      },
    });
  });
  await page.goto("/monitor");

  await expect(page.getByRole("heading", { name: "Updates" })).toBeVisible();
  await expect(page.getByText("Showing 3 of 3")).toBeVisible();
  await page.getByLabel("Topic").selectOption("Prudential & capital");
  await expect(page.getByText("Showing 2 of 2")).toBeVisible();
  await page.getByLabel("Topic").selectOption("All");

  await page
    .getByRole("button", {
      name: /Commission Implementing Regulation \(EU\) 2026\/2041/u,
    })
    .click();
  const details = page.getByRole("complementary", {
    name: "Regulatory event details",
  });
  await expect(details.getByRole("heading", { level: 2 })).toContainText(
    "2026/2041",
  );
  await expect(
    details.getByRole("link", { name: "Read the official publication" }),
  ).toHaveAttribute("href", /CELEX:32026R2041/u);
  await details.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Generate Monthly Report" }).click();
  const report = page.getByRole("dialog", {
    name: "Monthly regulatory report",
  });
  await expect(report).toBeVisible();
  await expect(
    report.getByRole("heading", {
      name: "September 2026 monthly report",
    }),
  ).toBeVisible();
  await expect(report.getByText("3", { exact: true }).first()).toBeVisible();
  await expect(
    report.getByRole("link", { name: "Official source" }),
  ).toHaveCount(3);
  await report.getByRole("button", { name: "Print / save PDF" }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        Boolean(
          (
            globalThis as typeof globalThis & {
              monitorPrintCalled?: boolean;
            }
          ).monitorPrintCalled,
        ),
      ),
    )
    .toBe(true);
});

test("Monthly report remains usable on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/monitor");
  await page.getByRole("button", { name: "Generate Monthly Report" }).click();
  const report = page.getByRole("dialog", {
    name: "Monthly regulatory report",
  });
  await expect(report).toBeVisible();
  const bounds = await report.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds?.width).toBeLessThanOrEqual(390);
  await expect(report.getByLabel("Report month")).toHaveValue("2026-09");
  await report.getByRole("button", { name: "Close report" }).click();
  await expect(report).toBeHidden();
});

test("A long annual timeline is revealed in bounded pages", async ({
  page,
}) => {
  const events = Array.from({ length: 45 }, (_, index) => ({
    id: `scale-${index}`,
    source: {
      authority: "EUR-Lex",
      title: `Official update ${index + 1}`,
      url: `https://eur-lex.europa.eu/example/${index + 1}`,
      publishedAt: "2026-09-01",
      reference: `TEST-${index + 1}`,
    },
    classification: {
      topic: "Prudential & capital",
      eventType: "Regulation",
      affectedEntities: ["Credit institutions"],
    },
    analysis: {
      summary: "Scale-test Monitor summary.",
      keyPoints: [],
      potentiallyAffectedFunctions: [],
    },
  }));
  await page.route("**/api/monitor/timeline?year=2026", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: {
        schemaVersion: "monitor-timeline@1.0.0",
        year: "2026",
        generatedAt: "2026-09-14T08:00:00.000Z",
        sources: [],
        events,
      },
    });
  });

  await page.goto("/monitor");
  await expect(page.getByText("Showing 20 of 45")).toBeVisible();
  await expect(page.getByRole("button", { name: /Load more/u })).toContainText(
    "25 remaining",
  );
  await page.getByRole("button", { name: /Load more/u }).click();
  await expect(page.getByText("Showing 40 of 45")).toBeVisible();
  await page.getByRole("button", { name: /Load more/u }).click();
  await expect(page.getByText("Showing 45 of 45")).toBeVisible();
  await expect(page.getByRole("button", { name: /Load more/u })).toHaveCount(0);
});
