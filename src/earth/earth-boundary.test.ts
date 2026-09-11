import { readFile, readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const EARTH_ROOT = resolve(process.cwd(), "src/earth");
const EARTH_WEB_ROOT = resolve(EARTH_ROOT, "web");
const BOUNDARY_TEST = resolve(EARTH_ROOT, "earth-boundary.test.ts");

const forbiddenPlatformImports = [
  "runtime/sqlite-runtime-repository",
  "data/document-repository",
  "canonical/to-document-view",
  "shared/legal",
];

async function typescriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return typescriptFiles(path);
      return path.endsWith(".ts") || path.endsWith(".tsx") ? [path] : [];
    }),
  );
  return files.flat();
}

describe("Earth module boundary", () => {
  it("does not import Platform runtime or view contracts", async () => {
    const violations: string[] = [];
    for (const path of await typescriptFiles(EARTH_ROOT)) {
      if (path === BOUNDARY_TEST) continue;
      const source = await readFile(path, "utf8");
      for (const forbiddenImport of forbiddenPlatformImports) {
        if (source.includes(forbiddenImport)) {
          violations.push(
            `${relative(EARTH_ROOT, path)} -> ${forbiddenImport}`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps Earth web and renderers above acquisition and runtime layers", async () => {
    const violations: string[] = [];
    const forbiddenLayer = /(^|\/)(acquisition|api|build|runtime)(\/|$)/u;
    for (const path of await typescriptFiles(EARTH_WEB_ROOT)) {
      const source = await readFile(path, "utf8");
      const imports = source.matchAll(
        /(?:from\s+|import\()\s*["']([^"']+)["']/gu,
      );
      for (const match of imports) {
        const specifier = match[1] ?? "";
        if (forbiddenLayer.test(specifier)) {
          violations.push(`${relative(EARTH_WEB_ROOT, path)} -> ${specifier}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
