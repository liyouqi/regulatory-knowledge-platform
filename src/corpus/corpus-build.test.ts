import { describe, expect, it } from "vitest";
import {
  corpusBuildManifestHash,
  corpusBuildManifestSchema,
  loadCorpusBuildManifest,
  resolveCorpusBuildSources,
} from "./corpus-build";

describe("corpus build manifest", () => {
  it("pins every registered source to one locally verified snapshot", async () => {
    const manifest = loadCorpusBuildManifest();
    const sources = await resolveCorpusBuildSources(manifest);

    expect(sources).toHaveLength(manifest.sources.length);
    expect(sources).toHaveLength(17);
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
    expect(new Set(sources.map((source) => source.snapshotPath)).size).toBe(
      sources.length,
    );
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

  it("fails closed when a pinned checksum differs from the snapshot", async () => {
    const manifest = structuredClone(loadCorpusBuildManifest());
    manifest.sources[0].contentSha256 = `sha256:${"0".repeat(64)}`;

    await expect(resolveCorpusBuildSources(manifest)).rejects.toThrow(
      "Snapshot checksum differs from corpus manifest",
    );
  });

  it("rejects duplicate source identities and unsafe reviewed-input paths", () => {
    const manifest = structuredClone(loadCorpusBuildManifest());
    manifest.sources.push(structuredClone(manifest.sources[0]));
    manifest.requiredReviewedInputs.push("../outside.json");

    expect(() => corpusBuildManifestSchema.parse(manifest)).toThrow();
  });
});
