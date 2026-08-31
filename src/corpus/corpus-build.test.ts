import { describe, expect, it } from "vitest";
import {
  assertCorpusSnapshotChecksum,
  corpusBuildManifestHash,
  corpusBuildManifestSchema,
  loadCorpusBuildManifest,
  resolveCorpusBuildSources,
  validateCorpusBuildManifestSources,
} from "./corpus-build";

describe("corpus build manifest", () => {
  it("pins every registered source to one reviewed parser definition", () => {
    const manifest = loadCorpusBuildManifest();
    const sources = validateCorpusBuildManifestSources(manifest);

    expect(sources).toHaveLength(manifest.sources.length);
    expect(sources).toHaveLength(28);
    expect(sources).toContainEqual(
      expect.objectContaining({
        manifest: expect.objectContaining({
          adapter: "eba",
          identifier: "eba-gl-2021-05",
        }),
        parserVersion: "eba-pdf-1.1.1",
      }),
    );
    expect(sources).toContainEqual(
      expect.objectContaining({
        manifest: expect.objectContaining({
          adapter: "eur-lex",
          identifier: "32015L0849",
          snapshotId:
            "snapshot:cellar:32015L0849:79255bbc45eb6e4109dbf756ff3c49aa885f191756d3f0515a934a7a22c2a0f6",
        }),
      }),
    );
    expect(sources).toContainEqual(
      expect.objectContaining({
        manifest: expect.objectContaining({
          adapter: "eur-lex",
          identifier: "32013L0036",
          snapshotId:
            "snapshot:cellar:32013L0036:5084ee4c2cd50794ed4e3ac789ff1cda44613e701cfdba35e2c89439110710af",
        }),
      }),
    );
    expect(sources.every((source) => source.parserVersion !== "pending")).toBe(
      true,
    );
    expect(
      new Set(
        sources.map(
          (source) =>
            `${source.manifest.adapter}:${source.manifest.identifier}`,
        ),
      ).size,
    ).toBe(sources.length);
  });

  it("derives a stable identity from the validated manifest", () => {
    const manifest = loadCorpusBuildManifest();

    expect(corpusBuildManifestHash(manifest)).toBe(
      corpusBuildManifestHash(structuredClone(manifest)),
    );
    expect(corpusBuildManifestHash(manifest)).toMatch(/^sha256:[a-f0-9]{64}$/u);
  });

  it("fails the release archive gate while snapshots remain local-only", async () => {
    await expect(
      resolveCorpusBuildSources(loadCorpusBuildManifest(), true),
    ).rejects.toThrow("Snapshot archive gate failed");
  });

  it("fails closed when a pinned checksum differs from the snapshot", () => {
    expect(() =>
      assertCorpusSnapshotChecksum(
        "fixture",
        `sha256:${"1".repeat(64)}`,
        `sha256:${"0".repeat(64)}`,
      ),
    ).toThrow("Snapshot checksum differs from corpus manifest");
  });

  it("rejects duplicate source identities and unsafe reviewed-input paths", () => {
    const manifest = structuredClone(loadCorpusBuildManifest());
    manifest.sources.push(structuredClone(manifest.sources[0]));
    manifest.requiredReviewedInputs.push("../outside.json");

    expect(() => corpusBuildManifestSchema.parse(manifest)).toThrow();
  });
});
