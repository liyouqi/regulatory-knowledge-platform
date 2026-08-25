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

    expect(sources).toHaveLength(16);
    expect(sources.every((source) => source.parserVersion !== "pending")).toBe(
      true,
    );
    expect(new Set(sources.map((source) => source.snapshotPath)).size).toBe(16);
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
