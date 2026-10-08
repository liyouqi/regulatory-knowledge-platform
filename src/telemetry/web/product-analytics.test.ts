import { describe, expect, it } from "vitest";
import { surfaceForPath } from "./product-analytics";

describe("product analytics routing", () => {
  it("assigns stable product surfaces without page-specific tables", () => {
    expect(surfaceForPath("/read/crr/articles/4")).toBe("reader");
    expect(surfaceForPath("/monitor")).toBe("monitor");
    expect(surfaceForPath("/earth")).toBe("galaxy");
    expect(surfaceForPath("/topics")).toBe("other");
  });
});
