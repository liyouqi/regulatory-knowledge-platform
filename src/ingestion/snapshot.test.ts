import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { readVerifiedSourceSnapshot } from "./snapshot";

function digest(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

describe("official source snapshot verification", () => {
  it("verifies every byte-exact item in an assembled Cellar manifestation", async () => {
    const directory = await mkdtemp(join(tmpdir(), "regulatory-snapshot-"));
    const treeNotice = strToU8("<NOTICE />");
    const act = strToU8("<ACT />");
    const annex = strToU8("<ANNEX />");
    const metadata = strToU8("<DOC />");
    const content = zipSync(
      {
        "LEGACY.xml": act,
        "LEGACY.annex.xml": annex,
        "LEGACY.doc.xml": metadata,
      },
      { level: 0 },
    );
    const contentHash = digest(content);

    try {
      await Promise.all([
        writeFile(join(directory, "tree-notice.xml"), treeNotice),
        writeFile(join(directory, "source.fmx4.zip"), content),
        writeFile(
          join(directory, "snapshot.json"),
          `${JSON.stringify(
            {
              schemaVersion: "1.1.0",
              snapshotId: `snapshot:cellar:32013L0036:${contentHash.slice(7)}`,
              provenance: "official",
              sourceSystem: "cellar",
              celex: "32013L0036",
              language: "en",
              retrievedAt: "2026-08-25T18:00:00.000Z",
              canonicalUrl: "https://eur-lex.europa.eu/eli/dir/2013/36/oj/eng",
              workUri: "https://publications.europa.eu/resource/cellar/work",
              expressionUri:
                "https://publications.europa.eu/resource/cellar/expression",
              manifestationUri:
                "https://publications.europa.eu/resource/cellar/manifestation",
              treeNotice: {
                url: "https://publications.europa.eu/resource/celex/32013L0036",
                mediaType: "application/xml",
                etag: null,
                lastModified: null,
                sha256: digest(treeNotice),
                bytes: treeNotice.byteLength,
                file: "tree-notice.xml",
              },
              content: {
                url: "https://publications.europa.eu/resource/cellar/manifestation",
                mediaType: "application/zip",
                etag: null,
                lastModified: null,
                sha256: contentHash,
                bytes: content.byteLength,
                file: "source.fmx4.zip",
                upstreamStreamName: "32013L0036.fmx4.zip",
                assembly: "cellar-manifestation-items",
                upstreamItems: [
                  ["LEGACY.xml", act],
                  ["LEGACY.annex.xml", annex],
                  ["LEGACY.doc.xml", metadata],
                ].map(([file, bytes]) => ({
                  url: `https://publications.europa.eu/resource/cellar/manifestation/${file}`,
                  mediaType: "application/xml",
                  etag: null,
                  lastModified: null,
                  sha256: digest(bytes as Uint8Array),
                  bytes: (bytes as Uint8Array).byteLength,
                  file,
                  upstreamStreamName: file,
                })),
              },
            },
            null,
            2,
          )}\n`,
        ),
      ]);

      const verified = await readVerifiedSourceSnapshot(directory);
      expect(verified.snapshot.schemaVersion).toBe("1.1.0");
      expect(verified.snapshot.content.upstreamItems).toHaveLength(3);
      expect(verified.contentBytes).toEqual(content);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
