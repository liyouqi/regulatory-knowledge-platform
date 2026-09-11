import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { earthUniverseSchema } from "../universe/earth-universe";
import {
  type FetchImplementation,
  acquireEarthCellarSource,
} from "./cellar-earth-source";
import { readVerifiedEarthSnapshot } from "./earth-snapshot";

const treeNotice = `<?xml version="1.0"?><NOTICE type="tree">
<WORK><URI><VALUE>http://publications.europa.eu/resource/cellar/work-id</VALUE></URI></WORK>
<EXPRESSION><URI><VALUE>http://publications.europa.eu/resource/cellar/expression-eng</VALUE></URI><SAMEAS><URI><VALUE>http://publications.europa.eu/resource/celex/32022R2554.ENG</VALUE></URI></SAMEAS><EXPRESSION_MANIFESTED_BY_MANIFESTATION><URI><VALUE>http://publications.europa.eu/resource/cellar/manifestation-fmx</VALUE></URI></EXPRESSION_MANIFESTED_BY_MANIFESTATION></EXPRESSION>
<MANIFESTATION manifestation-type="fmx4"><URI><VALUE>http://publications.europa.eu/resource/cellar/manifestation-fmx</VALUE></URI><MANIFESTATION_HAS_ITEM><URI><VALUE>http://publications.europa.eu/resource/cellar/manifestation-fmx/DOC_1</VALUE></URI><TECHMD><STREAM_NAME><VALUE>DORA_ENG.fmx4.zip</VALUE></STREAM_NAME></TECHMD></MANIFESTATION_HAS_ITEM></MANIFESTATION>
</NOTICE>`;

function response(
  url: string,
  bytes: Uint8Array,
  contentType: string,
): Response {
  return {
    ok: true,
    status: 200,
    url,
    headers: new Headers({
      "content-type": contentType,
      "content-length": String(bytes.byteLength),
    }),
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  } as unknown as Response;
}

describe("Earth official acquisition", () => {
  it("validates an editorial universe without treating it as legal data", () => {
    expect(
      earthUniverseSchema.parse({
        schemaVersion: "0.1.0",
        id: "eu-banking-10",
        version: "0.1.0",
        displayName: "EU Banking 10",
        description: "Editorial test scope",
        provenance: "EDITORIAL",
        language: "ENG",
        expressionPolicy: "english-celex-expression",
        relationshipPolicy: { includeOfficialOneHopBoundary: true },
        members: [{ celex: "32022R2554", label: "DORA" }],
      }),
    ).toMatchObject({ schemaVersion: "0.1.0", id: "eu-banking-10" });
    expect(() =>
      earthUniverseSchema.parse({ id: "EU Banking", members: [] }),
    ).toThrow();
  });

  it("persists a verified immutable CELLAR snapshot by atomically publishing a directory", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "earth-acquisition-"));
    const fetchImplementation: FetchImplementation = async (input) => {
      const url = String(input);
      if (url.includes("/resource/celex/")) {
        return response(
          url,
          new TextEncoder().encode(treeNotice),
          "application/xml",
        );
      }
      return response(url, new Uint8Array([80, 75, 3, 4]), "application/zip");
    };
    try {
      const result = await acquireEarthCellarSource("32022R2554", {
        outputRoot,
        fetchImplementation,
        now: () => new Date("2026-09-10T12:00:00.000Z"),
      });
      expect(result.directory).toContain("cellar/32022R2554/");
      const verified = await readVerifiedEarthSnapshot(result.directory);
      expect(verified.snapshot).toMatchObject({
        schemaVersion: "2.0.0",
        provenance: "official",
        sourceSystem: "cellar",
        celex: "32022R2554",
      });
      expect(verified.snapshot).not.toHaveProperty("universeId");
      expect(verified.contentBytes).toEqual(new Uint8Array([80, 75, 3, 4]));
      await expect(
        acquireEarthCellarSource("32022R2554", {
          outputRoot,
          fetchImplementation,
          now: () => new Date("2026-09-10T12:00:00.000Z"),
        }),
      ).rejects.toThrow();
      const snapshotText = await readFile(
        join(result.directory, "snapshot.json"),
        "utf8",
      );
      expect(snapshotText).toContain("earth:cellar:32022R2554:");
    } finally {
      await rm(outputRoot, { recursive: true, force: true });
    }
  });

  it("fails verification if persisted bytes are modified", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "earth-acquisition-"));
    const fetchImplementation: FetchImplementation = async (input) => {
      const url = String(input);
      return url.includes("/resource/celex/")
        ? response(url, new TextEncoder().encode(treeNotice), "application/xml")
        : response(url, new Uint8Array([80, 75, 3, 4]), "application/zip");
    };
    try {
      const result = await acquireEarthCellarSource("32022R2554", {
        outputRoot,
        fetchImplementation,
      });
      await writeFile(
        join(result.directory, "source.fmx4.zip"),
        new Uint8Array([1]),
      );
      await expect(readVerifiedEarthSnapshot(result.directory)).rejects.toThrow(
        "Byte count mismatch",
      );
    } finally {
      await rm(outputRoot, { recursive: true, force: true });
    }
  });

  it("refuses a redirect outside the Publications Office HTTPS allowlist", async () => {
    const fetchImplementation: FetchImplementation = async () =>
      ({
        ok: false,
        status: 302,
        url: "https://publications.europa.eu/resource/celex/32022R2554?language=en",
        headers: new Headers({ location: "https://example.invalid/not-legal" }),
      }) as unknown as Response;
    await expect(
      acquireEarthCellarSource("32022R2554", {
        fetchImplementation,
      }),
    ).rejects.toThrow("Refusing non-official Earth source URL");
  });
});
