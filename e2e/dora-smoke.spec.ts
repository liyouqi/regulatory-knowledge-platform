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

test("theme selection persists between Reader and Explorer", async ({
  page,
}) => {
  await page.goto("/read/dora/articles/1");
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator(".topbar")).toHaveCSS(
    "background-color",
    "rgb(255, 254, 249)",
  );

  await page.reload();
  await expect(
    page.getByRole("button", { name: "Switch to dark theme" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Explore" }).click();
  await expect(page).toHaveURL(/\/explore\/dora#.+/);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
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

test("an exact defined term opens its official definition Side Peek", async ({
  page,
}) => {
  await page.goto("/read/dora/articles/1");
  await expect(page.getByRole("heading", { name: "DORA" })).toBeVisible();

  const term = page
    .getByRole("button", {
      name: "View definition of digital operational resilience",
    })
    .first();
  await expect(term).toBeVisible();
  await term.hover();
  await expect(page.getByRole("tooltip").first()).toContainText(
    "digital operational resilience means",
  );

  await term.click();
  const preview = page.getByRole("dialog", { name: "Definition preview" });
  await expect(preview).toBeVisible();
  await expect(
    preview.getByRole("button", { name: "Close definition preview" }),
  ).toBeFocused();
  await expect(
    preview.getByRole("heading", {
      name: "“digital operational resilience”",
    }),
  ).toBeVisible();
  await expect(preview.locator("blockquote")).toContainText(
    "digital operational resilience means",
  );
  await preview.getByRole("link", { name: /Open source provision/ }).click();
  await expect(page).toHaveURL(
    /\/read\/dora\/articles\/3#subparagraph-1-point-1$/,
  );
});

test("a paragraph marker copies and restores its stable permalink", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/read/dora/articles/1");

  const firstParagraph = page.locator("#paragraph-1");
  await firstParagraph.getByRole("button", { name: "Copy link to 1." }).click();
  await expect(
    firstParagraph.getByRole("button", { name: "Copied link to 1." }),
  ).toBeVisible();
  const permalink = await page.evaluate(() => navigator.clipboard.readText());
  expect(permalink).toBe(
    "http://localhost:5173/read/dora/articles/1#paragraph-1",
  );

  await page.goto(permalink);
  await expect(page.locator("#paragraph-1")).toHaveClass(/deep-link-target/);
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

test("Reader distinguishes the loaded OJ snapshot from external version records", async ({
  page,
}) => {
  await page.goto("/read/dora-its-register-of-information/articles/1");
  await expect(
    page.getByRole("heading", { name: "DORA ITS Register of Information" }),
  ).toBeVisible();

  const history = page.getByRole("region", {
    name: "Document version history",
  });
  await expect(history).toBeVisible();
  await expect(
    history.getByText("Loaded original Official Journal text"),
  ).toBeVisible();
  await expect(history.getByText("2024-12-02 · Loaded")).toBeVisible();
  await expect(history.getByText("Current EUR-Lex version")).toBeVisible();
  await expect(
    history.getByText("Official corrigendum 2025-09-19"),
  ).toBeVisible();
  await expect(
    history.getByText("amending acts are not yet mapped", { exact: false }),
  ).toBeVisible();
});

test("Reader, Explorer, and search remain usable on a narrow viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/read/dora/articles/28");

  await expect(page.getByRole("heading", { name: "DORA" })).toBeVisible();
  await expect(page.locator(".toc")).toBeVisible();
  await expect(page.locator(".context-panel")).toBeHidden();
  await expect(
    page
      .locator("html")
      .evaluate((element) => element.scrollWidth <= globalThis.innerWidth),
  ).resolves.toBe(true);

  await page.getByRole("button", { name: /Find laws/ }).click();
  const search = page.getByRole("dialog", { name: "Regulatory search" });
  await expect(search).toBeVisible();
  await expect(
    search.getByRole("textbox", {
      name: "Find laws by name, CELEX, or citation",
    }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Close search" }).click();
  await page.goto("/explore/dora");
  await expect(page.getByRole("heading", { name: "DORA" })).toBeVisible();
  await expect(
    page
      .locator("html")
      .evaluate((element) => element.scrollWidth <= globalThis.innerWidth),
  ).resolves.toBe(true);
});

test("search shortcut focuses the query and Escape closes it", async ({
  page,
}) => {
  await page.goto("/explore/dora");
  await expect(page.getByRole("heading", { name: "DORA" })).toBeVisible();

  await page.keyboard.press("Meta+k");
  const search = page.getByRole("dialog", { name: "Regulatory search" });
  const input = search.getByRole("textbox", {
    name: "Find laws by name, CELEX, or citation",
  });
  await expect(
    search.evaluate((dialog) => dialog.matches(":modal")),
  ).resolves.toBe(true);
  await expect(input).toBeFocused();

  const lawsTab = search.getByRole("tab", { name: "Find laws" });
  await lawsTab.focus();
  await lawsTab.press("ArrowRight");
  const openedTab = search.getByRole("tab", { name: "Opened laws" });
  await expect(openedTab).toBeFocused();
  await expect(openedTab).toHaveAttribute("aria-selected", "true");
  await openedTab.press("End");
  await expect(search.getByRole("tab", { name: "Full text" })).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(search).toBeHidden();
});

test("opened laws returns to the most recently read provision", async ({
  page,
}) => {
  await page.goto("/read/dora/articles/28");
  await expect(page.getByRole("heading", { name: "DORA" })).toBeVisible();

  await page.keyboard.press("Meta+k");
  const search = page.getByRole("dialog", { name: "Regulatory search" });
  await search.getByRole("tab", { name: "Opened laws" }).click();
  await expect(
    search.getByRole("textbox", { name: "Filter recently opened laws" }),
  ).toBeFocused();
  await search.getByRole("button", { name: /DORA.*Recently opened/ }).click();

  await expect(page).toHaveURL(/\/read\/dora\/articles\/28$/);
});
