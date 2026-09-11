import { type Page, expect, test } from "@playwright/test";

async function selectFirstLegalPhrase(page: Page) {
  const run = page.locator("p[data-copilot-entity-id]").first();
  await expect(run).toBeVisible();
  await run.evaluate((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (
      node &&
      (node.parentElement?.closest("[data-copilot-ignore-selection='true']") ||
        !(node.textContent ?? "").trim())
    ) {
      node = walker.nextNode();
    }
    if (!(node instanceof Text)) throw new Error("No selectable legal text");
    const start = Math.max(0, node.data.search(/\S/u));
    const end = Math.min(node.data.length, start + 28);
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, end);
    const selection = globalThis.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    element.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
  });
  await expect(
    page.getByRole("toolbar", { name: "Ask about selected legal text" }),
  ).toBeVisible();
}

async function selectFirstLegalPhraseFromSelectionChange(page: Page) {
  const run = page.locator("p[data-copilot-entity-id]").first();
  await expect(run).toBeVisible();
  await run.scrollIntoViewIfNeeded();
  await run.evaluate((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const node = walker.nextNode();
    if (!(node instanceof Text)) throw new Error("No selectable legal text");
    const start = Math.max(0, node.data.search(/\S/u));
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, Math.min(node.data.length, start + 20));
    const selection = globalThis.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await expect(
    page.getByRole("toolbar", { name: "Ask about selected legal text" }),
  ).toBeVisible();
}

test("quick explain promotes the completed turn without another request", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/api/copilot/respond", async (route) => {
    requests += 1;
    const body = route.request().postDataJSON() as {
      requestId: string;
      context: { entityId: string };
    };
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        schemaVersion: "0.1.0",
        requestId: body.requestId,
        status: "answered",
        answer: "This is a short explanation grounded in the selected text.",
        citations: [
          {
            entityId: body.context.entityId,
            label: "Paragraph 1",
            path: "/read/dora/articles/1#paragraph-1",
            sourceUrl: "https://eur-lex.europa.eu/",
          },
        ],
        evidenceScope: "current_context",
        runtime: {
          buildId: "test-build",
          profileId: "test-profile",
          profileHash: `sha256:${"a".repeat(64)}`,
        },
      }),
    });
  });

  await page.goto("/read/dora/articles/1");
  await selectFirstLegalPhrase(page);
  await page.getByRole("button", { name: "Explain", exact: true }).click();
  await expect(
    page.getByText("This is a short explanation grounded"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue in Copilot" }).click();
  await expect(
    page.getByRole("complementary", { name: "Regulatory Copilot" }),
  ).toBeVisible();
  await expect(
    page.getByText("This is a short explanation grounded"),
  ).toBeVisible();
  expect(requests).toBe(1);

  await page.reload();
  await page.getByRole("button", { name: /Copilot/u }).click();
  await expect(
    page.getByText("This is a short explanation grounded"),
  ).toBeVisible();
});

test("Ask Copilot answers immediately and sends bounded history on follow-up", async ({
  page,
}) => {
  const requests: unknown[] = [];
  await page.route("**/api/copilot/respond", async (route) => {
    const body = route.request().postDataJSON() as {
      requestId: string;
      context: { entityId?: string };
    };
    requests.push(body);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        schemaVersion: "0.1.0",
        requestId: body.requestId,
        status: "answered",
        answer:
          requests.length === 1
            ? "First contextual answer."
            : "Follow-up contextual answer.",
        citations: [
          {
            entityId:
              body.context.entityId ?? "eu:32022R2554:article:1:paragraph:1",
            label: "Paragraph 1",
            path: "/read/dora/articles/1#paragraph-1",
            sourceUrl: "https://eur-lex.europa.eu/",
          },
        ],
        evidenceScope: "current_context",
        runtime: {
          buildId: "test-build",
          profileId: "test-profile",
          profileHash: `sha256:${"b".repeat(64)}`,
        },
      }),
    });
  });

  await page.goto("/read/dora/articles/1");
  await selectFirstLegalPhrase(page);
  await page.getByRole("button", { name: "Ask Copilot", exact: true }).click();
  await expect(page.getByText("First contextual answer.")).toBeVisible();

  await page
    .getByRole("textbox", { name: "Ask Copilot" })
    .fill("Who must comply?");
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(page.getByText("Follow-up contextual answer.")).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(requests[1]).toMatchObject({
    mode: "chat",
    question: "Who must comply?",
    messages: [
      { role: "user" },
      { role: "assistant", content: "First contextual answer." },
    ],
  });
});

test("narrow Reader keeps keyboard-style selection and Copilot usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/read/dora/articles/1");
  await selectFirstLegalPhraseFromSelectionChange(page);

  await page.getByRole("button", { name: "Ask Copilot", exact: true }).click();
  const panel = page.getByRole("complementary", {
    name: "Regulatory Copilot",
  });
  await expect(panel).toBeVisible();
  const bounds = await panel.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds?.x).toBe(0);
  expect(bounds?.width).toBe(390);
  await expect(
    page.getByRole("textbox", { name: "Ask Copilot" }),
  ).toBeFocused();
});

test("insufficient answers show the evidence limitation explicitly", async ({
  page,
}) => {
  await page.route("**/api/copilot/respond", async (route) => {
    const body = route.request().postDataJSON() as { requestId: string };
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        schemaVersion: "0.1.0",
        requestId: body.requestId,
        status: "insufficient_context",
        answer: "The current Article does not contain that information.",
        citations: [],
        evidenceScope: "current_context",
        runtime: {
          buildId: "test-build",
          profileId: "test-profile",
          profileHash: `sha256:${"c".repeat(64)}`,
        },
      }),
    });
  });

  await page.goto("/read/dora/articles/1");
  await page.getByRole("button", { name: /Copilot/u }).click();
  await page
    .getByRole("textbox", { name: "Ask Copilot" })
    .fill("What is the reporting deadline?");
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(page.getByText("Insufficient current context")).toBeVisible();
});
