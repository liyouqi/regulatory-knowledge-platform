import { spawnSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  corpusBuildManifestHash,
  loadCorpusBuildManifest,
} from "../corpus/corpus-build";
import {
  type CleanupPlan,
  applyDataCleanup,
  dataStatus,
  planDataCleanup,
} from "./data-maintenance";

const manifest = loadCorpusBuildManifest();
const manifestHash = corpusBuildManifestHash(manifest);
let root: string;
const buildPath = (name: string) => `data/artifacts/corpus-builds/${name}`;
const documentPath = (name: string) =>
  `${buildPath(name)}/canonical/fixture/parser-fixture/document.json`;
function put(path: string, body: string, ageHours = 72) {
  const absolute = resolve(root, path);
  mkdirSync(resolve(absolute, ".."), { recursive: true });
  writeFileSync(absolute, body);
  const age = new Date(Date.now() - ageHours * 3_600_000);
  utimesSync(absolute, age, age);
}
function seedBuild(
  name: string,
  profileId: string,
  ageHours: number,
  hash = manifestHash,
) {
  const runtime = `Synthetic runtime fixture: ${name}`;
  put(`${buildPath(name)}/runtime.sqlite`, runtime, ageHours);
  put(documentPath(name), "Synthetic generated document fixture.", ageHours);
  put(
    `${buildPath(name)}/canonical/fixture/parser-fixture/build-report.json`,
    "{}",
    ageHours,
  );
  put(
    `${buildPath(name)}/build-report.json`,
    JSON.stringify({
      schemaVersion: "1.0.0",
      status: "succeeded",
      manifest: { hash },
      profile: { id: profileId },
      runtime: {
        buildId: `fixture-${name}`,
        profileId,
        profileHash: "fixture-profile-hash",
        documents: 1,
        bytes: Buffer.byteLength(runtime),
        artifact: "../../must-not-be-followed.sqlite",
      },
    }),
    ageHours,
  );
}
const preview = () => planDataCleanup({ root, environment: {} });
function hooks(plan: CleanupPlan) {
  return {
    assertIdle: () => {},
    verifyRuntime: (path: string) => {
      const retained = plan.retainedRuntimes.find(
        (r) => resolve(plan.root, r.path) === path,
      );
      if (!retained) throw new Error("Unexpected verification path");
      return retained;
    },
  };
}

beforeEach(() => {
  root = mkdtempSync(resolve(tmpdir(), "platform-maintenance-"));
  put(
    "package.json",
    JSON.stringify({ name: "regulatory-knowledge-platform" }),
  );
  put("data/corpus-build-manifest.json", JSON.stringify(manifest));
  for (const path of [
    "data/raw/fixture/source.json",
    "data/artifacts/canonical/fixture/document.json",
    "data/artifacts/runtime/regulatory.sqlite",
    "data/artifacts/earth/graph.json",
    "data/monitor/latest.json",
    "data/artifacts/onboarding/fixture/document.json",
  ])
    put(path, "Protected synthetic data fixture.");
  seedBuild("full-old", "full-corpus", 72);
  seedBuild("full-new", "full-corpus", 48);
  seedBuild("banking-new", "banking-default", 48);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("local data maintenance", () => {
  it("previews only historical bodies and older databases, preserving reports and latest Profiles", () => {
    const plan = preview();
    expect(plan.targets.map((f) => f.path)).toEqual(
      expect.arrayContaining([
        documentPath("full-old"),
        documentPath("full-new"),
        documentPath("banking-new"),
        `${buildPath("full-old")}/runtime.sqlite`,
      ]),
    );
    expect(plan.targets).toHaveLength(4);
    expect(plan.retainedRuntimes.map((r) => r.profileId).sort()).toEqual([
      "banking-default",
      "full-corpus",
    ]);
    expect(existsSync(resolve(root, "data/artifacts/maintenance"))).toBe(false);
    expect(existsSync(resolve(root, documentPath("full-old")))).toBe(true);
    expect(dataStatus(root).bytes).toBeGreaterThan(plan.reclaimableBytes);
  });

  it("applies the exact plan, records integrity evidence and becomes a no-op on repeat", () => {
    const plan = preview();
    const result = applyDataCleanup(plan, hooks(plan));
    expect(result.removedFiles).toBe(4);
    if (!("receiptPath" in result)) throw new Error("Missing receipt");
    const receipt = JSON.parse(readFileSync(result.receiptPath, "utf8"));
    expect(receipt.status).toBe("completed");
    expect(receipt.protectedHashBefore).toBe(receipt.protectedHashAfter);
    expect(existsSync(resolve(root, documentPath("full-old")))).toBe(false);
    expect(
      readFileSync(resolve(root, "data/raw/fixture/source.json"), "utf8"),
    ).toBe("Protected synthetic data fixture.");
    expect(
      existsSync(resolve(root, `${buildPath("full-old")}/build-report.json`)),
    ).toBe(true);
    expect(
      existsSync(
        resolve(
          root,
          `${buildPath("full-old")}/canonical/fixture/parser-fixture/build-report.json`,
        ),
      ),
    ).toBe(true);
    expect(
      existsSync(resolve(root, `${buildPath("full-new")}/runtime.sqlite`)),
    ).toBe(true);
    const next = preview();
    expect(applyDataCleanup(next, hooks(next))).toMatchObject({
      status: "no-op",
      removedFiles: 0,
    });
  });

  it("rejects a tampered plan targeting raw sources before deleting any file", () => {
    const plan = preview();
    plan.targets[0].path = "data/raw/fixture/source.json";
    expect(() => applyDataCleanup(plan, hooks(plan))).toThrow("plan changed");
    expect(existsSync(resolve(root, documentPath("full-old")))).toBe(true);
    expect(existsSync(resolve(root, "data/raw/fixture/source.json"))).toBe(
      true,
    );
  });

  it("rejects files changed since preview", () => {
    const plan = preview();
    put(documentPath("full-old"), "Changed synthetic fixture.");
    expect(() => applyDataCleanup(plan, hooks(plan))).toThrow("plan changed");
    expect(
      existsSync(resolve(root, `${buildPath("full-old")}/runtime.sqlite`)),
    ).toBe(true);
  });

  it("protects an active historical build configured through .env", () => {
    put(
      ".env",
      `REGULATORY_RUNTIME_DATABASE_PATH="${buildPath("full-old")}/runtime.sqlite" # active`,
    );
    const plan = preview();
    expect(
      plan.targets.some((f) => f.path.startsWith(`${buildPath("full-old")}/`)),
    ).toBe(false);
    expect(plan.skippedBuilds).toContainEqual({
      path: buildPath("full-old"),
      reason: "Configured active runtime",
    });
  });

  it("protects process-configured runtimes including paths containing spaces and hash characters", () => {
    seedBuild("active # fixture", "full-corpus", 96);
    const plan = planDataCleanup({
      root,
      environment: {
        REGULATORY_RUNTIME_DATABASE_PATH: `${buildPath("active # fixture")}/runtime.sqlite`,
      },
    });
    expect(
      plan.targets.some((f) =>
        f.path.startsWith(`${buildPath("active # fixture")}/`),
      ),
    ).toBe(false);
  });

  it("resolves configured runtime aliases before deciding which build is active", () => {
    put(
      ".env",
      `REGULATORY_RUNTIME_DATABASE_PATH="${resolve(root, `${buildPath("full-old")}/runtime.sqlite`)}"`,
    );
    const plan = preview();
    expect(
      plan.targets.some((f) => f.path.startsWith(`${buildPath("full-old")}/`)),
    ).toBe(false);
  });

  it("skips recent, incomplete and unrecognized builds", () => {
    seedBuild("recent", "full-corpus", 1);
    seedBuild("in-progress", "full-corpus", 72);
    put(`${buildPath("in-progress")}/runtime.sqlite.123.tmp`, "");
    seedBuild("broken-report", "full-corpus", 72);
    put(`${buildPath("broken-report")}/build-report.json`, "not JSON");
    const plan = preview();
    for (const name of ["recent", "in-progress", "broken-report"]) {
      expect(
        plan.targets.some((f) => f.path.startsWith(`${buildPath(name)}/`)),
      ).toBe(false);
      expect(plan.skippedBuilds.some((b) => b.path === buildPath(name))).toBe(
        true,
      );
    }
  });

  it("prefers a current-manifest database over a newer unrelated build", () => {
    seedBuild("unrelated-newer", "full-corpus", 25, `sha256:${"a".repeat(64)}`);
    const plan = preview();
    expect(
      plan.retainedRuntimes.find((r) => r.profileId === "full-corpus")?.path,
    ).toBe(`${buildPath("full-new")}/runtime.sqlite`);
    expect(
      plan.targets.some(
        (f) => f.path === `${buildPath("unrelated-newer")}/runtime.sqlite`,
      ),
    ).toBe(true);
  });

  it("refuses symlink escapes and broken symlinks", () => {
    symlinkSync(
      resolve(root, "data/raw"),
      resolve(root, `${buildPath("full-old")}/linked-source`),
      "dir",
    );
    expect(() => preview()).toThrow("symlink");
    unlinkSync(resolve(root, `${buildPath("full-old")}/linked-source`));
    symlinkSync(
      resolve(root, "missing"),
      resolve(root, `${buildPath("full-old")}/broken-link`),
      "dir",
    );
    expect(() => preview()).toThrow("symlink");
  });

  it("aborts when a retained database fails verification or a target is in use", () => {
    const plan = preview();
    expect(() =>
      applyDataCleanup(plan, {
        ...hooks(plan),
        verifyRuntime: () => {
          throw new Error("corrupt runtime");
        },
      }),
    ).toThrow("corrupt runtime");
    expect(() =>
      applyDataCleanup(plan, {
        ...hooks(plan),
        assertIdle: () => {
          throw new Error("target in use");
        },
      }),
    ).toThrow("target in use");
    expect(existsSync(resolve(root, documentPath("full-old")))).toBe(true);
    expect(
      existsSync(resolve(root, "data/artifacts/maintenance/cleanup.lock")),
    ).toBe(false);
  });

  it("blocks concurrent cleanup and unsafe retention settings", () => {
    const plan = preview();
    put(
      "data/artifacts/maintenance/cleanup.lock",
      "Existing cleanup fixture lock.",
    );
    expect(() => applyDataCleanup(plan, hooks(plan))).toThrow();
    expect(existsSync(resolve(root, documentPath("full-old")))).toBe(true);
    expect(() => planDataCleanup({ root, keepPerProfile: 0 })).toThrow(
      "keep-per-profile",
    );
    expect(() => planDataCleanup({ root, minAgeHours: 0 })).toThrow("24-hour");
  });

  it("rejects a retained database whose identity differs from its report", () => {
    const plan = preview();
    const actual = hooks(plan);
    expect(() =>
      applyDataCleanup(plan, {
        ...actual,
        verifyRuntime: (path) => ({
          ...actual.verifyRuntime(path),
          buildId: "wrong-build",
        }),
      }),
    ).toThrow("does not match its report");
    expect(existsSync(resolve(root, documentPath("full-old")))).toBe(true);
  });

  it.skipIf(
    spawnSync("lsof", ["-v"], { encoding: "utf8" }).error !== undefined,
  )("detects a genuinely open target before deleting anything", () => {
    const plan = preview();
    const descriptor = openSync(
      resolve(root, `${buildPath("full-old")}/runtime.sqlite`),
      "r",
    );
    try {
      expect(() =>
        applyDataCleanup(plan, { verifyRuntime: hooks(plan).verifyRuntime }),
      ).toThrow("target is open");
      expect(existsSync(resolve(root, documentPath("full-old")))).toBe(true);
    } finally {
      closeSync(descriptor);
    }
  });
});
