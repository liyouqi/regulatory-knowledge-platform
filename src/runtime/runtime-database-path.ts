import { resolve } from "node:path";
import { DEFAULT_RUNTIME_DATABASE_PATH } from "../search/sqlite-search-index";

export function runtimeDatabasePath(
  environment: Record<string, string | undefined> = process.env,
): string {
  const configured = environment.REGULATORY_RUNTIME_DATABASE_PATH?.trim();
  return configured ? resolve(configured) : DEFAULT_RUNTIME_DATABASE_PATH;
}
