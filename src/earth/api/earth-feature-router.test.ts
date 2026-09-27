import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import express from "express";
import { expect, it } from "vitest";
import { createEarthFeatureRouter } from "./earth-feature-router";

function request(app: express.Express, path: string) {
  return new Promise<{ status: number; body: unknown }>((resolve, reject) => {
    const response = {
      statusCode: 200,
      setHeader() {},
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(body: unknown) {
        resolve({ status: this.statusCode, body });
      },
    };
    (app as unknown as { handle: (...args: unknown[]) => void }).handle(
      { method: "GET", url: path, headers: {} },
      response,
      reject,
    );
  });
}
it("isolates missing, old, incomplete and corrupt Earth artifacts from Platform routes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "earth-feature-"));
  try {
    const old = join(directory, "old.sqlite");
    const db = new Database(old);
    db.exec(
      "CREATE TABLE build_manifest (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
    );
    const manifest = {
      schemaVersion: "0.2.0",
      compilerVersion: "0.2.0",
      universeId: "fixture",
      universeVersion: "0.1.0",
      buildId: "fixture",
      builtAt: "2026-09-26T00:00:00.000Z",
      sourceSnapshotIds: [],
    };
    db.prepare("INSERT INTO build_manifest VALUES ('manifest_json', ?)").run(
      JSON.stringify(manifest),
    );
    db.close();
    const partial = join(directory, "partial.sqlite");
    const current = new Database(partial);
    current.exec(
      "CREATE TABLE build_manifest (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
    );
    current
      .prepare("INSERT INTO build_manifest VALUES ('manifest_json', ?)")
      .run(JSON.stringify({ ...manifest, schemaVersion: "0.3.0" }));
    current.close();
    const corrupt = join(directory, "corrupt.sqlite");
    await writeFile(corrupt, "Test-only corrupt SQLite");
    for (const path of [
      join(directory, "missing.sqlite"),
      old,
      partial,
      corrupt,
    ]) {
      const app = express();
      app.use("/api/earth", createEarthFeatureRouter(path));
      app.get("/api/platform", (_req, res) => res.json({ healthy: true }));
      expect(await request(app, "/api/earth/universes")).toMatchObject({
        status: 503,
        body: { error: { code: "earth_artifact_unavailable" } },
      });
      expect(await request(app, "/api/platform")).toEqual({
        status: 200,
        body: { healthy: true },
      });
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
