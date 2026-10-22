import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { importAmfProbe, readVerifiedAmfSourceSnapshot } from "./amf-snapshot";

const inputPath = "data/raw/national-probes/2026-10-20/fr-amf.bin";
const reportPath = "data/raw/national-probes/2026-10-20/report.json";
const root = await mkdtemp(join(tmpdir(), "amf-snapshot-"));
afterAll(async () => rm(root, { recursive: true, force: true }));
const options = {
  inputPath,
  reportPath,
  capturedOn: "2026-10-20",
  outputRoot: root,
};

describe.skipIf(
  !existsSync(inputPath) ||
    !existsSync(reportPath) ||
    !existsSync("data/raw/amf-probes/20261021T150504Z/content.html"),
)("AMF frozen probe", () => {
  it("imports and verifies the original report and content", async () => {
    const { directory, snapshot } = await importAmfProbe(options);
    const verified = await readVerifiedAmfSourceSnapshot(directory);
    expect(verified.snapshot).toEqual(snapshot);
    expect(snapshot.retrievedAt).toBeNull();
    expect(snapshot.captureDateBasis).toBe("archived-probe-directory");
    await expect(importAmfProbe(options)).rejects.toThrow();
    await writeFile(join(directory, "content.html"), "tampered");
    await expect(readVerifiedAmfSourceSnapshot(directory)).rejects.toThrow(
      /checksum/,
    );
  }, 60000);
  it("rejects unknown capture dates and foreign or modified reports", async () => {
    await expect(
      importAmfProbe({ ...options, capturedOn: "2026-10-21" }),
    ).rejects.toThrow(/date/);
    const report = (await readFile(reportPath, "utf8")).replace(
      "https://www.amf-france.org/fr/eli/fr/aai/amf/rg",
      "https://example.com/",
    );
    const path = join(root, "foreign.json");
    await writeFile(path, report);
    await expect(
      importAmfProbe({ ...options, reportPath: path }),
    ).rejects.toThrow(/report SHA/);
  });
  it("rejects maintenance content and altered report evidence", async () => {
    const path = "data/raw/amf-probes/20261021T150504Z/content.html";
    await expect(
      importAmfProbe({ ...options, inputPath: path }),
    ).rejects.toThrow(/evidence/);
  });
});
