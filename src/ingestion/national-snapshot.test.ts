import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extractNationalXml } from "./national-archive";
import {
  nationalSourceSnapshotSchema,
  readVerifiedNationalSourceSnapshot,
} from "./national-snapshot";
import { loadNationalSourceCatalogSync } from "./national-source-registry";
const sha = (x: Uint8Array) =>
  `sha256:${createHash("sha256").update(x).digest("hex")}`;
describe("national archive and snapshot", () => {
  it("verifies archive contents, sizes, hashes, and identity", async () => {
    const dir = mkdtempSync(join(tmpdir(), "national-test-"));
    try {
      const s = loadNationalSourceCatalogSync()[0];
      const xml = Buffer.from("<example/>");
      writeFileSync(join(dir, `${s.sourceWorkId}.xml`), xml);
      execFileSync("zip", ["-q", "archive.zip", `${s.sourceWorkId}.xml`], {
        cwd: dir,
      });
      const archive = await import("node:fs/promises").then((m) =>
        m.readFile(join(dir, "archive.zip")),
      );
      expect(Buffer.from(extractNationalXml(archive, s.sourceWorkId))).toEqual(
        xml,
      );
      const item = (bytes: Uint8Array, file: string) => ({
        url: s.contentUrl,
        mediaType: null,
        etag: null,
        lastModified: null,
        sha256: sha(bytes),
        bytes: bytes.length,
        file,
      });
      const snapshot = nationalSourceSnapshotSchema.parse({
        schemaVersion: "1.0.0",
        snapshotId: `snapshot:national:${s.localId}:${sha(xml).slice(7)}`,
        provenance: "official",
        sourceSystem: "gii",
        documentId: s.documentId,
        localId: s.localId,
        language: "de",
        retrievedAt: "2026-10-20T21:56:00Z",
        canonicalUrl: s.pageUrl,
        content: item(xml, `${s.sourceWorkId}.xml`),
        archive: item(archive, "archive.zip"),
      });
      writeFileSync(join(dir, "snapshot.json"), JSON.stringify(snapshot));
      expect(
        Buffer.from(
          (await readVerifiedNationalSourceSnapshot(dir)).contentBytes,
        ),
      ).toEqual(xml);
      writeFileSync(join(dir, `${s.sourceWorkId}.xml`), "altered");
      await expect(readVerifiedNationalSourceSnapshot(dir)).rejects.toThrow(
        "checksum",
      );
      expect(() => extractNationalXml(archive, "BJNR000")).toThrow(
        "expected XML",
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
