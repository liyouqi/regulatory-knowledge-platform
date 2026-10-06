import { describe, expect, it } from "vitest";
import {
  assertCorpusSnapshotChecksum,
  corpusBuildManifestHash,
  corpusBuildManifestSchema,
  loadCorpusBuildManifest,
  resolveCorpusBuildSources,
  selectManifestSnapshotPath,
  validateCorpusBuildManifestSources,
} from "./corpus-build";

describe("corpus build manifest", () => {
  it("pins every registered source to one reviewed parser definition", () => {
    const manifest = loadCorpusBuildManifest();
    const sources = validateCorpusBuildManifestSources(manifest);

    expect(sources).toHaveLength(manifest.sources.length);
    expect(sources).toHaveLength(76);
    expect(sources).toContainEqual(
      expect.objectContaining({
        manifest: expect.objectContaining({
          adapter: "eur-lex",
          identifier: "32017R2402",
          snapshotId:
            "snapshot:cellar:32017R2402:f22e1b40b70dccb7f538d515ca02fe92d946fcf212e76fcd92f296ce506ec99f",
        }),
      }),
    );
    expect(sources).toContainEqual(
      expect.objectContaining({
        manifest: expect.objectContaining({
          adapter: "eba",
          identifier: "eba-gl-2021-05",
        }),
        parserVersion: "eba-pdf-1.1.2",
      }),
    );
    expect(sources).toContainEqual(
      expect.objectContaining({
        manifest: expect.objectContaining({
          adapter: "eur-lex",
          identifier: "32024R1623",
          snapshotId:
            "snapshot:cellar:32024R1623:8c148d9e72b8a07a02873de155441e3ac47a2322feaa18fab17417ce211ebcf6",
        }),
      }),
    );
    expect(sources).toContainEqual(
      expect.objectContaining({
        manifest: expect.objectContaining({
          adapter: "eur-lex",
          identifier: "32024L1619",
          snapshotId:
            "snapshot:cellar:32024L1619:92f2689af5cf798320f07d5b869740c2c98528496a62f6b36dbfdd618979d6dd",
        }),
      }),
    );
    expect(sources).toContainEqual(
      expect.objectContaining({
        manifest: expect.objectContaining({
          adapter: "eur-lex",
          identifier: "32013R0575",
          snapshotId:
            "snapshot:cellar:32013R0575:6ef4a2094178a015456993cd3a17d625a6ee01154ce15dff056d6dc46e136089",
        }),
      }),
    );
    expect(sources).toContainEqual(
      expect.objectContaining({
        manifest: expect.objectContaining({
          adapter: "eur-lex",
          identifier: "32015L0849",
          snapshotId:
            "snapshot:cellar:32015L0849:bbb776089dc3ec8a4223467cc4c16f9272de3cbfb3dd1cc6032c35be10b10db8",
        }),
      }),
    );
    expect(sources).toContainEqual(
      expect.objectContaining({
        manifest: expect.objectContaining({
          adapter: "eur-lex",
          identifier: "32013L0036",
          snapshotId:
            "snapshot:cellar:32013L0036:264bba80caeba75e2a61ac1b3f53e54ceb16329c0b996ab3d4da47c92a6670a7",
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

  it("selects the earliest retrieval when identical content snapshots recur", () => {
    const source = loadCorpusBuildManifest().sources[0];
    expect(
      selectManifestSnapshotPath(source, [
        "/raw/2026-09-28-same-content",
        "/raw/2026-08-31-reviewed",
      ]),
    ).toBe("/raw/2026-08-31-reviewed");
  });

  it("rejects duplicate source identities and unsafe reviewed-input paths", () => {
    const manifest = structuredClone(loadCorpusBuildManifest());
    manifest.sources.push(structuredClone(manifest.sources[0]));
    manifest.requiredReviewedInputs.push("../outside.json");

    expect(() => corpusBuildManifestSchema.parse(manifest)).toThrow();
  });
});
