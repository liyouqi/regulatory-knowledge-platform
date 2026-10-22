import { spawnSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium, expect } from "@playwright/test";

// Run against a local app with the full corpus. No legal data is changed.
const baseURL = process.env.README_DEMO_BASE_URL ?? "http://localhost:5173";
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(baseURL).hostname)) {
  throw new Error("README_DEMO_BASE_URL must point to a local server.");
}
const root = resolve(import.meta.dirname, "..");
const media = join(root, "docs/media");
const captures = join(root, "data/artifacts/readme-demos");
await mkdir(captures, { recursive: true });
await mkdir(media, { recursive: true });
const run = await mkdtemp(join(captures, "capture-"));
const viewport = { width: 1280, height: 820 };
const errors = [];
const report = [];

function ffmpeg(args) {
  const result = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-loglevel", "error", "-y", ...args],
    {
      encoding: "utf8",
      timeout: 120_000,
    },
  );
  if (result.error || result.status !== 0) {
    throw result.error ?? new Error(result.stderr);
  }
}

async function click(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error("Demo target is not visible.");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
    steps: 18,
  });
  await sleep(180);
  await locator.click();
}

const browser = await chromium.launch({
  channel: process.env.README_DEMO_BROWSER_CHANNEL ?? "chrome",
  headless: true,
});

async function record(name, path, heading, actions) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    locale: "en-GB",
  });
  const directory = join(run, name);
  await mkdir(directory);
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    page.on("pageerror", (error) => errors.push(`${name}: ${error.message}`));
    page.on("response", (response) => {
      if (response.url().startsWith(baseURL) && response.status() >= 400) {
        errors.push(`${name}: HTTP ${response.status()} ${response.url()}`);
      }
    });
    await page.goto(`${baseURL}${path}`);
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    // Browser screenshots omit the OS pointer; show its real position while recording.
    await page.evaluate(() => {
      const cursor = document.createElement("div");
      cursor.style.cssText =
        "position:fixed;left:1220px;top:780px;width:20px;height:26px;z-index:2147483647;pointer-events:none";
      cursor.innerHTML =
        '<svg viewBox="0 0 20 26" xmlns="http://www.w3.org/2000/svg"><path d="M2 1L2 21L7 16L11 24L15 22L11 14L18 14Z" fill="white" stroke="#111" stroke-width="1.5" stroke-linejoin="round"/></svg>';
      document.body.append(cursor);
      document.addEventListener("pointermove", (event) => {
        cursor.style.left = `${event.clientX}px`;
        cursor.style.top = `${event.clientY}px`;
      });
    });
    const frames = [];
    let recording = true;
    const start = performance.now();
    const capture = (async () => {
      while (recording) {
        const tick = performance.now();
        const file = `frame-${String(frames.length).padStart(5, "0")}.png`;
        await page.screenshot({ path: join(directory, file) });
        frames.push({ file, time: (tick - start) / 1000 });
        await sleep(Math.max(0, 125 - (performance.now() - tick)));
        if (performance.now() - start > 45_000)
          throw new Error(`${name}: capture exceeded 45 seconds.`);
      }
    })();
    // Handle capture failures immediately, then surface them after actions finish.
    let captureError;
    capture.catch((error) => {
      captureError = error;
      recording = false;
    });
    try {
      await sleep(1300);
      await actions(page);
      await sleep(2400);
    } finally {
      recording = false;
      await capture;
    }
    if (captureError) throw captureError;
    const end = (performance.now() - start) / 1000;
    const timeline = frames.flatMap((frame, index) => [
      `file '${frame.file}'`,
      `duration ${((frames[index + 1]?.time ?? end) - frame.time).toFixed(6)}`,
    ]);
    timeline.push(`file '${frames.at(-1).file}'`);
    await writeFile(
      join(directory, "frames.ffconcat"),
      `ffconcat version 1.0\n${timeline.join("\n")}\n`,
    );
    const video = join(directory, `${name}.mp4`);
    ffmpeg([
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      join(directory, "frames.ffconcat"),
      "-an",
      "-vf",
      "fps=10",
      "-c:v",
      "libx264",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      video,
    ]);
    const gif = join(directory, `${name}.gif`);
    ffmpeg([
      "-i",
      video,
      "-filter_complex",
      "[0:v]split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle",
      "-loop",
      "0",
      gif,
    ]);
    const bytes = (await stat(gif)).size;
    if (bytes > 5 * 1024 * 1024)
      throw new Error(`${name}: GIF exceeds 5 MiB (${bytes} bytes).`);
    await page.screenshot({ path: join(directory, "last-frame.png") });
    report.push({
      name,
      path,
      seconds: Number(end.toFixed(2)),
      frames: frames.length,
      bytes,
      finalPath: new URL(page.url()).pathname,
      gif,
      video,
    });
    console.log(
      `${name}: ${end.toFixed(1)}s, ${(bytes / 1024 / 1024).toFixed(2)} MiB`,
    );
  } finally {
    await context.close();
  }
}

try {
  await record(
    "search-reader",
    "/read/dora/articles/1",
    "DORA",
    async (page) => {
      await click(page, page.getByRole("button", { name: /Find laws/ }));
      const dialog = page.getByRole("dialog", { name: "Regulatory search" });
      const input = dialog.getByRole("textbox", {
        name: "Find laws by name, CELEX, or citation",
      });
      await input.pressSequentially("DORA article 28", { delay: 95 });
      const match = dialog.getByRole("button", { name: /DORA · Article 28/ });
      await expect(match).toBeVisible();
      await sleep(1500);
      await click(page, match);
      await expect(page.locator(".provision-label")).toHaveText("Article 28");
      await sleep(2000);
      await click(
        page,
        page.getByRole("button", { name: /^Preview DORA Article 6\b/ }).first(),
      );
      await expect(
        page.getByRole("dialog", { name: "Reference preview" }),
      ).toBeVisible();
    },
  );

  await record(
    "countries",
    "/countries",
    "Financial regulation by country",
    async (page) => {
      await page.mouse.move(680, 650, { steps: 12 });
      await page.mouse.wheel(0, 340);
      await sleep(1100);
      const input = page.getByRole("searchbox", {
        name: "Country",
        exact: true,
      });
      await click(page, input);
      await input.pressSequentially("France", { delay: 160 });
      await expect(page.locator(".country-card")).toHaveCount(1);
      await sleep(1000);
      await click(page, page.getByRole("link", { name: /France/ }));
      await expect(
        page.getByRole("heading", { name: "France", exact: true }),
      ).toBeVisible();
      await sleep(1500);
      await click(page, page.getByRole("link", { name: /AMF RG/ }));
      await expect(
        page.getByRole("heading", { name: "AMF RG", exact: true }),
      ).toBeVisible();
      await expect(
        page.locator(".structured-legal-content[lang=fr]").first(),
      ).toBeVisible();
      await sleep(900);
      await page.locator(".provision-body").scrollIntoViewIfNeeded();
      await page.mouse.move(800, 530, { steps: 12 });
    },
  );

  await record(
    "relationships",
    "/read/dora/articles/20",
    "DORA",
    async (page) => {
      await click(
        page,
        page
          .locator(".context-panel")
          .getByRole("link", { name: "View relationship graph" }),
      );
      await expect(
        page.getByRole("heading", {
          name: "Article 20 relationships",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.locator(".relationship-graph-node").first(),
      ).toBeVisible();
      await sleep(1800);
      await click(
        page,
        page.getByRole("button", { name: "Related recital", exact: true }),
      );
      await expect(
        page.locator(".relationship-graph-node", { hasText: "Recital 53" }),
      ).toHaveCount(0);
      await sleep(1300);
      await click(page, page.locator(".react-flow__controls-zoomin"));
      await click(page, page.locator(".react-flow__controls-zoomin"));
      await sleep(1000);
      const node = page
        .locator(".relationship-graph-node", {
          hasText: "DORA RTS Incident Reporting",
        })
        .first();
      await click(page, node);
      const details = page.getByRole("complementary", {
        name: "Relationship details",
      });
      await expect(details).toBeVisible();
      await expect(
        details.getByRole("link", { name: "Open in Explorer" }),
      ).toBeVisible();
    },
  );
  if (errors.length) throw new Error(errors.join("\n"));
  // Publish only after every scene succeeds. Captures and MP4 originals stay ignored.
  for (const entry of report) {
    const destination = join(media, `${entry.name}.gif`);
    const temporary = `${destination}.tmp`;
    await writeFile(temporary, await readFile(entry.gif));
    await rename(temporary, destination);
  }
  await writeFile(
    join(run, "report.json"),
    `${JSON.stringify({ baseURL, viewport, report, errors }, null, 2)}\n`,
  );
  console.log(`Capture report and originals: ${run}`);
} finally {
  await browser.close();
}
