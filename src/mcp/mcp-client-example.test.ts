import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("MCP relationship client example", () => {
  it("resolves a citation and retrieves its evidence-bearing relationships", async () => {
    const { stdout } = await execFileAsync(
      process.execPath,
      ["examples/mcp-resolve-relationships.mjs", "DORA Article 28"],
      {
        cwd: process.cwd(),
        maxBuffer: 2 * 1024 * 1024,
      },
    );
    const output = JSON.parse(stdout);

    expect(output).toMatchObject({
      meta: { contractVersion: "1.3.0" },
      resolution: {
        documentId: "eu:32022R2554",
        entityId: "eu:32022R2554:article:28",
        matchReason: "exact-alias",
      },
      provision: {
        entityId: "eu:32022R2554:article:28",
        label: "Article 28",
      },
      relationshipGroup: "mandates",
    });
    expect(output.groupCounts.mandates).toBe(2);
    expect(output.relationships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provenance: "OFFICIAL_MAPPING",
          target: expect.objectContaining({ entityId: "eu:32024R2956" }),
          evidence: expect.objectContaining({ text: expect.any(String) }),
        }),
        expect.objectContaining({
          target: expect.objectContaining({ entityId: "eu:32024R1773" }),
        }),
      ]),
    );
  });
});
