import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadBankingGovernanceTasks } from "./banking-governance-evaluation";

const review = JSON.parse(
  readFileSync("data/editorial/citation-text-projection-review.json", "utf8"),
);
describe("ordered projection benchmark migration", () => {
  it("preserves the previous inputs byte-for-byte and changes only projection hashes/version/date", () => {
    let changed = 0;
    for (const frozen of review.preservedBenchmarks) {
      expect(
        `sha256:${createHash("sha256").update(readFileSync(frozen.path)).digest("hex")}`,
      ).toBe(frozen.sha256);
      const before = loadBankingGovernanceTasks(frozen.path);
      const after = loadBankingGovernanceTasks(
        frozen.path.replace("-crd-20260711.json", "-ordered-1.1.json"),
      );
      const comparable = (dataset: typeof before) => ({
        ...dataset,
        version: "",
        reviewedAt: "",
        cases: dataset.cases.map((item) => ({
          ...item,
          expectedEvidence: { ...item.expectedEvidence, textSha256: "" },
        })),
      });
      expect(comparable(after)).toEqual(comparable(before));
      for (const [index, item] of after.cases.entries()) {
        const previous = before.cases[index];
        if (
          item.expectedEvidence.textSha256 ===
          previous.expectedEvidence.textSha256
        )
          continue;
        expect(review.projectionHashChanges).toContainEqual({
          caseId: item.id,
          entityId: item.expectedEvidence.entityId,
          before: previous.expectedEvidence.textSha256,
          after: item.expectedEvidence.textSha256,
        });
        changed++;
      }
    }
    expect(changed).toBe(review.projectionHashChanges.length);
    expect(changed).toBeGreaterThan(0);
    expect(review).toMatchObject({
      sourcePinsChanged: false,
      canonicalChanged: false,
      questionsChanged: false,
      goldEntityIdsChanged: false,
    });
  });
});
