import { type Page, expect, test } from "@playwright/test";

interface EarthRenderProbe {
  draws: number;
  contexts: number;
  losses: number;
}

async function probe(page: Page): Promise<EarthRenderProbe> {
  return page.evaluate(() => ({
    ...(window as unknown as { earthRenderProbe: EarthRenderProbe })
      .earthRenderProbe,
  }));
}

async function settled(page: Page) {
  await expect
    .poll(
      async () => {
        const before = await probe(page);
        await page.waitForTimeout(250);
        return (await probe(page)).draws === before.draws;
      },
      { timeout: 10_000 },
    )
    .toBe(true);
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    const state: EarthRenderProbe = { draws: 0, contexts: 0, losses: 0 };
    (
      window as unknown as { earthRenderProbe: EarthRenderProbe }
    ).earthRenderProbe = state;
    const contexts = new WeakSet<object>();
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      const context = original.call(this, type, ...args);
      if (
        context &&
        (type === "webgl2" || type === "webgl") &&
        !contexts.has(context)
      ) {
        contexts.add(context);
        state.contexts++;
        this.addEventListener("webglcontextlost", () => state.losses++);
      }
      return context;
    } as typeof original;
    // Count both ordinary and batched WebGL draws, without production debug hooks.
    for (const prototype of [
      WebGLRenderingContext.prototype,
      WebGL2RenderingContext.prototype,
    ]) {
      const methods = prototype as unknown as Record<
        string,
        (...args: unknown[]) => unknown
      >;
      for (const name of [
        "drawElements",
        "drawArrays",
        "drawElementsInstanced",
        "drawArraysInstanced",
      ]) {
        const originalDraw = methods[name];
        if (!originalDraw) continue;
        methods[name] = function (...args) {
          state.draws++;
          return originalDraw.apply(this, args);
        };
      }
    }
  });
});

test("Earth stops drawing when idle and reuses its context through hierarchy navigation", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/earth");
  await expect(page.locator(".earth-nebula canvas")).toBeVisible();
  await settled(page);
  const initial = await probe(page);
  expect(initial.draws).toBeGreaterThan(0);
  await page.waitForTimeout(500);
  expect((await probe(page)).draws).toBe(initial.draws);
  for (let index = 0; index < 3; index++) {
    await page
      .locator(".earth-nebula-label")
      .getByText("DORA", { exact: true })
      .click();
    await expect
      .poll(async () =>
        Number(
          await page
            .locator(".earth-nebula")
            .getAttribute("data-earth-hierarchy-count"),
        ),
      )
      .toBeGreaterThan(0);
    const child = page.locator(".earth-nebula-label.hierarchy:visible").first();
    await expect(child).toBeVisible();
    const name = await child.innerText();
    await child.click();
    const card = page.getByRole("complementary", {
      name: "Selected law details",
    });
    await expect(
      card.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
    await card
      .getByRole("button", { name: "Parent level", exact: true })
      .click();
    await expect(
      card.getByRole("heading", { name: "DORA", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Close law details" }).click();
  }
  await settled(page);
  expect((await probe(page)).contexts).toBe(initial.contexts);
  expect(await page.locator(".earth-nebula canvas").count()).toBe(1);
  const beforeZoom = await probe(page);
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await settled(page);
  expect((await probe(page)).draws).toBeGreaterThan(beforeZoom.draws);
  await page.getByRole("button", { name: "Structured", exact: true }).click();
  await expect(page.locator(".earth-nebula canvas")).toHaveCount(0);
  const structured = await probe(page);
  await page.waitForTimeout(500);
  expect((await probe(page)).draws).toBe(structured.draws);
  expect(errors).toEqual([]);
});

test("Earth caps its drawing buffer and falls back after context loss", async ({
  page,
}) => {
  await page.setViewportSize({ width: 2560, height: 1600 });
  await page.goto("/earth");
  const canvas = page.locator(".earth-nebula canvas");
  await expect(canvas).toBeVisible();
  await settled(page);
  const pixels = await canvas.evaluate((element) =>
    element instanceof HTMLCanvasElement ? element.width * element.height : 0,
  );
  expect(pixels).toBeLessThanOrEqual(2_000_000);
  expect(pixels).toBeGreaterThan(0);
  await canvas.evaluate((element) => {
    if (element instanceof HTMLCanvasElement)
      element
        .getContext("webgl2")
        ?.getExtension("WEBGL_lose_context")
        ?.loseContext();
  });
  await expect(
    page.getByText("3D is unavailable on this device.", { exact: false }),
  ).toBeVisible();
  await expect(canvas).toHaveCount(0);
  const law = page.locator(".earth-law").first();
  await law.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("complementary", { name: "Selected law details" }),
  ).toBeVisible();
});

test("Earth releases contexts on repeated view switches", async ({ page }) => {
  await page.goto("/earth");
  for (let index = 0; index < 5; index++) {
    await expect(page.locator(".earth-nebula canvas")).toBeVisible();
    await settled(page);
    await page.getByRole("button", { name: "Structured", exact: true }).click();
    await expect(page.locator(".earth-nebula canvas")).toHaveCount(0);
    // Each support probe and mounted renderer explicitly releases its context.
    await expect
      .poll(async () => {
        const current = await probe(page);
        return current.losses === current.contexts;
      })
      .toBe(true);
    const current = await probe(page);
    await page.waitForTimeout(100);
    expect((await probe(page)).draws).toBe(current.draws);
    if (index < 4)
      await page.getByRole("button", { name: "Universe", exact: true }).click();
  }
  await expect(
    page.getByRole("button", { name: "Universe", exact: true }),
  ).toBeEnabled();
});

test("Earth suspends drawing while hidden and refreshes after becoming visible", async ({
  page,
}) => {
  await page.goto("/earth");
  await expect(page.locator(".earth-nebula canvas")).toBeVisible();
  await settled(page);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const hidden = await probe(page);
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.waitForTimeout(300);
  expect((await probe(page)).draws).toBe(hidden.draws);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await settled(page);
  expect((await probe(page)).draws).toBeGreaterThan(hidden.draws);
});
