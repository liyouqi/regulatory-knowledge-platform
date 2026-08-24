import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_RUNTIME_DATABASE_PATH } from "../search/sqlite-search-index";
import { runtimeDatabasePath } from "./runtime-database-path";

describe("runtime database path", () => {
  it("uses the project runtime artifact by default", () => {
    expect(runtimeDatabasePath({})).toBe(DEFAULT_RUNTIME_DATABASE_PATH);
  });

  it("resolves an explicit deployment artifact path", () => {
    expect(
      runtimeDatabasePath({
        REGULATORY_RUNTIME_DATABASE_PATH:
          "./releases/current/regulatory.sqlite",
      }),
    ).toBe(resolve("./releases/current/regulatory.sqlite"));
  });
});
