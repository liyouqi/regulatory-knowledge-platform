import { expect, test } from "@playwright/test";

test("Earth selection keeps the canvas fixed and moves through intermediate focus frames", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/earth");
  const law = page
    .locator(".earth-nebula-label.included")
    .getByText("DORA", { exact: true });
  await expect(law).toBeVisible();
  const result = await page.evaluate(async () => {
    const canvas = document.querySelector(".earth-nebula canvas");
    const bounds = () => {
      const box = canvas?.getBoundingClientRect();
      return box ? [box.x, box.y, box.width, box.height] : [];
    };
    const label = () =>
      [
        ...document.querySelectorAll<HTMLButtonElement>(".earth-nebula-label"),
      ].find((node) => node.textContent === "DORA");
    const position = () => {
      const box = label()?.getBoundingClientRect();
      return box ? [box.x + box.width / 2, box.y + box.height / 2] : null;
    };
    const before = position();
    const initialBounds = bounds();
    const frames: { time: number; position: number[] }[] = [];
    const started = performance.now();
    label()?.click();
    await new Promise<void>((resolve) => {
      const sample = () => {
        const current = position();
        if (current)
          frames.push({ time: performance.now() - started, position: current });
        if (performance.now() - started < 1400) requestAnimationFrame(sample);
        else resolve();
      };
      requestAnimationFrame(sample);
    });
    return {
      before,
      frames,
      initialBounds,
      finalBounds: bounds(),
      sameCanvas: canvas === document.querySelector(".earth-nebula canvas"),
    };
  });
  expect(result.sameCanvas).toBe(true);
  expect(result.finalBounds).toEqual(result.initialBounds);
  expect(result.frames.length).toBeGreaterThan(15);
  const start = result.before;
  const finish = result.frames.at(-1)?.position;
  if (!start || !finish) throw new Error("Missing focus sample");
  const distance = (a: number[], b: number[]) =>
    Math.hypot((a[0] ?? 0) - (b[0] ?? 0), (a[1] ?? 0) - (b[1] ?? 0));
  const total = distance(start, finish);
  expect(total).toBeGreaterThan(30);
  const early = result.frames.find(
    (frame) => frame.time >= 70 && frame.time < 250,
  );
  const middle = result.frames.find(
    (frame) => frame.time >= 350 && frame.time < 700,
  );
  if (!early || !middle)
    throw new Error("Missing intermediate animation frames");
  expect(distance(start, early.position)).toBeLessThan(total * 0.35);
  expect(distance(start, middle.position)).toBeGreaterThan(
    distance(start, early.position),
  );
  expect(distance(middle.position, finish)).toBeGreaterThan(5);
});

// Real artifact checks exercise the product surface, separate from scale fixtures.
test("Earth nebula rotates, zooms, focuses a law and keeps its official evidence", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/earth");
  await expect(page.locator(".earth-nebula canvas")).toBeVisible();
  await expect(page.locator(".earth-inspector")).toHaveCount(0);
  const label = page.locator(".earth-nebula-label.included:visible").first();
  const id = await label.innerText();
  const initialLeft = await label.evaluate(
    (element) => element.style.transform,
  );
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect
    .poll(() => label.evaluate((element) => element.style.transform))
    .not.toBe(initialLeft);
  await page.getByRole("button", { name: "Reset universe view" }).click();
  const canvas = page.locator(".earth-nebula canvas");
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Nebula has no viewport");
  const beforeRotation = await label.evaluate(
    (element) => element.style.transform,
  );
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width / 2 + 110,
    bounds.y + bounds.height / 2 + 30,
    { steps: 12 },
  );
  await page.mouse.up();
  await expect
    .poll(() => label.evaluate((element) => element.style.transform))
    .not.toBe(beforeRotation);
  await page.getByRole("button", { name: "Reset universe view" }).click();
  const beforeKeyboard = await label.evaluate(
    (element) => element.style.transform,
  );
  await canvas.focus();
  await page.keyboard.press("ArrowLeft");
  await expect
    .poll(() => label.evaluate((element) => element.style.transform))
    .not.toBe(beforeKeyboard);
  await page.getByRole("button", { name: "Reset universe view" }).click();
  await page.getByRole("button", { name: id, exact: true }).click();
  const card = page.getByRole("complementary", {
    name: "Selected law details",
  });
  await expect(
    card.getByRole("heading", { name: id, exact: true }),
  ).toBeVisible();
  await expect(
    card.getByRole("link", { name: "Official Work record" }),
  ).toBeVisible();
  await expect(
    card.getByRole("button", { name: "Show exact loaded neighbourhood" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close law details" }).click();
  await expect(card).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("Earth fits a phone and preserves selection in Structured view", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/earth");
  await expect(page.locator(".earth-nebula canvas")).toBeVisible();
  await page.locator(".earth-nebula-label.included:visible").first().click();
  const card = page.getByRole("complementary", {
    name: "Selected law details",
  });
  await expect(card).toBeVisible();
  await page.getByRole("button", { name: "Structured", exact: true }).click();
  await expect(page.locator(".earth-law.active")).toHaveCount(1);
  const dimensions = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
  }));
  expect(dimensions).toEqual({ width: 390, height: 844 });
});

test("Earth expands only the loaded legal hierarchy as a constellation", async ({
  page,
}) => {
  await page.goto("/earth");
  const stage = page.locator(".earth-graph-stage");
  await expect(page.locator(".earth-nebula canvas")).toBeVisible();
  const overviewCount = await stage.getAttribute("data-earth-node-count");
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
  await expect(stage).toHaveAttribute(
    "data-earth-node-count",
    overviewCount ?? "",
  );
  const child = page.locator(".earth-nebula-label.hierarchy:visible").first();
  await expect(child).toBeVisible();
  const name = await child.innerText();
  await child.click();
  const card = page.getByRole("complementary", {
    name: "Selected law details",
  });
  await expect(card.getByRole("heading", { name, exact: true })).toBeVisible();
  await card.getByRole("button", { name: "Parent level", exact: true }).click();
  await expect(
    card.getByRole("heading", { name: "DORA", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close law details" }).click();
  await expect(page.locator(".earth-nebula")).toHaveAttribute(
    "data-earth-hierarchy-count",
    "0",
  );
  await expect(stage).toHaveAttribute(
    "data-earth-node-count",
    overviewCount ?? "",
  );
});

test("Earth automatically provides keyboard navigation when WebGL is unavailable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (type === "webgl" || type === "webgl2") return null;
      return original.call(this, type, ...args);
    } as typeof original;
  });
  await page.goto("/earth");
  await expect(
    page.getByText("3D is unavailable on this device.", { exact: false }),
  ).toBeVisible();
  const law = page.locator(".earth-law").first();
  await law.focus();
  await page.keyboard.press("Enter");
  const card = page.getByRole("complementary", {
    name: "Selected law details",
  });
  await expect(
    card.getByRole("link", { name: "Official Work record" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Universe", exact: true }),
  ).toBeDisabled();
});
