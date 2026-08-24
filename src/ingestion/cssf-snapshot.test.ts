import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  cssfSourceSnapshotSchema,
  readVerifiedCssfSourceSnapshot,
} from "./cssf-snapshot";

const directories: string[] = [];

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function fixtureSnapshot() {
  const directory = await mkdtemp(join(tmpdir(), "cssf-snapshot-"));
  directories.push(directory);
  const pageBytes = new TextEncoder().encode("<html><main>CSSF</main></html>");
  const contentBytes = new TextEncoder().encode("%PDF-1.7 fixture");
  const contentHash = sha256(contentBytes);
  const snapshot = {
    schemaVersion: "1.0.0",
    snapshotId: `snapshot:cssf:circular-25-893:${contentHash}`,
    provenance: "official",
    sourceSystem: "cssf",
    documentId: "lu:cssf:circular-25-893",
    localId: "circular-25-893",
    language: "en",
    retrievedAt: "2026-08-24T00:00:00.000Z",
    canonicalUrl: "https://www.cssf.lu/en/Document/circular-cssf-25-893/",
    page: {
      url: "https://www.cssf.lu/en/Document/circular-cssf-25-893/",
      mediaType: "text/html",
      etag: null,
      lastModified: null,
      sha256: `sha256:${sha256(pageBytes)}`,
      bytes: pageBytes.byteLength,
      file: "page.html",
    },
    content: {
      url: "https://www.cssf.lu/wp-content/uploads/cssf25_893eng.pdf",
      mediaType: "application/pdf",
      etag: null,
      lastModified: null,
      sha256: `sha256:${contentHash}`,
      bytes: contentBytes.byteLength,
      file: "source.pdf",
    },
  };
  await Promise.all([
    writeFile(join(directory, "page.html"), pageBytes),
    writeFile(join(directory, "source.pdf"), contentBytes),
    writeFile(
      join(directory, "snapshot.json"),
      `${JSON.stringify(snapshot, null, 2)}\n`,
    ),
  ]);
  return { contentBytes, directory, snapshot };
}

describe("CSSF source snapshot", () => {
  it("verifies immutable official HTML/PDF artifacts", async () => {
    const fixture = await fixtureSnapshot();
    const verified = await readVerifiedCssfSourceSnapshot(fixture.directory);

    expect(verified.snapshot.snapshotId).toBe(fixture.snapshot.snapshotId);
    expect(verified.contentBytes).toEqual(fixture.contentBytes);
  });

  it("rejects content changed after snapshot creation", async () => {
    const fixture = await fixtureSnapshot();
    await writeFile(join(fixture.directory, "source.pdf"), "changed");

    await expect(
      readVerifiedCssfSourceSnapshot(fixture.directory),
    ).rejects.toThrow(/Byte count mismatch|SHA-256 mismatch/u);
  });

  it("rejects mismatched stable identity fields", async () => {
    const fixture = await fixtureSnapshot();

    expect(() =>
      cssfSourceSnapshotSchema.parse({
        ...fixture.snapshot,
        documentId: "lu:cssf:circular-12-552",
      }),
    ).toThrow("CSSF document ID does not match local ID");
  });
});
