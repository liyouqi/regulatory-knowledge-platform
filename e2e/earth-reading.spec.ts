import { expect, test } from "@playwright/test";
import { earthArticleReadingSchema } from "../src/earth/contract/article-reading";
import type { EarthNode } from "../src/earth/contract/earth-contract";

test("all ten real laws expose complete bounded Article readings and evidence locations", async ({
  request,
}) => {
  test.setTimeout(120_000);
  const overviewResponse = await request.get(
    "/api/earth/universes/eu-banking-10/overview",
  );
  expect(overviewResponse.ok()).toBe(true);
  const overview = await overviewResponse.json();
  expect(overview.works).toHaveLength(10);
  expect(overview.relationshipCount).toBe(103);
  const articles: EarthNode[] = [];
  let queue: EarthNode[] = overview.works;
  while (queue.length) {
    const next: EarthNode[] = [];
    for (let offset = 0; offset < queue.length; offset += 6) {
      const groups = await Promise.all(
        queue.slice(offset, offset + 6).map(async (node) => {
          const response = await request.get(
            `/api/earth/nodes/${encodeURIComponent(node.id)}/children?limit=100`,
          );
          expect(response.ok()).toBe(true);
          return (await response.json()).children as EarthNode[];
        }),
      );
      for (const child of groups.flat())
        if (child.entityKind === "article") articles.push(child);
        else next.push(child);
    }
    queue = next;
  }
  expect(articles).toHaveLength(806);
  let blocks = 0;
  const laws = new Set<string>();
  for (let offset = 0; offset < articles.length; offset += 6) {
    const readings = await Promise.all(
      articles.slice(offset, offset + 6).map(async (article) => {
        const response = await request.get(
          `/api/earth/articles/${encodeURIComponent(article.id)}/reading`,
        );
        expect(response.ok()).toBe(true);
        const reading = earthArticleReadingSchema.parse(await response.json());
        expect(reading.articleId).toBe(article.id);
        expect(reading.source.officialSourceUrl).toMatch(/^https:/u);
        for (const block of reading.blocks)
          expect(block.sourcePath.startsWith(`${reading.sourcePath}/`)).toBe(
            true,
          );
        return reading;
      }),
    );
    for (const reading of readings) {
      blocks += reading.blocks.length;
      laws.add(reading.source.celex);
    }
  }
  expect(laws.size).toBe(10);
  expect(blocks).toBe(7016);
  expect(
    (
      await request.get(
        `/api/earth/articles/${encodeURIComponent(overview.works[0].id)}/reading`,
      )
    ).status(),
  ).toBe(404);
});

test("Article reading shows ordered body, source paths and honest scope in both views", async ({
  page,
}) => {
  await page.goto("/earth");
  await page.getByRole("button", { name: "Structured", exact: true }).click();
  await page
    .locator(".earth-law")
    .filter({ has: page.getByText("DORA", { exact: true }) })
    .click();
  const card = page.getByRole("complementary", {
    name: "Selected law details",
  });
  for (let depth = 0; depth < 6; depth++) {
    await expect(card.locator(".earth-children button").first()).toBeVisible();
    await card.locator(".earth-children button").first().click();
    if ((await card.locator(".earth-node-kind").textContent()) === "article")
      break;
  }
  const reading = card.getByRole("region", {
    name: "Official Article reading",
  });
  await expect(reading).toBeVisible();
  await expect(reading.locator(".earth-reading-body")).toContainText(
    "This Regulation",
  );
  await expect(reading).toContainText(
    "Footnotes and original formatting are not reproduced",
  );
  await expect(
    reading.getByRole("link", { name: "Read on EUR-Lex" }),
  ).toHaveAttribute("href", /^https:\/\/eur-lex.europa.eu\//u);
  await reading
    .getByText("Snapshot and evidence location", { exact: true })
    .click();
  await expect(reading).toContainText("ACT XML member");
  await expect(reading).toContainText("/ACT[1]/");
  await page.getByRole("button", { name: "Universe", exact: true }).click();
  await expect(reading).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(reading).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
});
