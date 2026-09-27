import { describe, expect, it } from "vitest";
import { motionProgress } from "./motion";

describe("nebula motion", () => {
  it("starts continuously and reaches its exact destination", () => {
    expect(motionProgress(-10, 900)).toBe(0);
    expect(motionProgress(0, 900)).toBe(0);
    expect(motionProgress(450, 900)).toBe(0.5);
    expect(motionProgress(900, 900)).toBe(1);
    expect(motionProgress(1500, 900)).toBe(1);
  });
  it("is monotone with a slow entrance and exit", () => {
    const values = [0, 16, 33, 100, 300, 450, 600, 800, 900].map((time) =>
      motionProgress(time, 900),
    );
    expect(values).toEqual([...values].sort((a, b) => a - b));
    expect(motionProgress(100, 900)).toBeLessThan(0.03);
    expect(motionProgress(800, 900)).toBeGreaterThan(0.97);
  });
});
