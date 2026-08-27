import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { CitationContextService } from "../agent/citation-context-service";
import { PublicApiService } from "../public-api/public-api-service";
import { SqliteRuntimeRepository } from "../runtime/sqlite-runtime-repository";
import { createLawSearchRecords } from "../search/law-search";
import { createRegulatoryMcpServer } from "./regulatory-mcp-server";

const runtimeRepository = new SqliteRuntimeRepository();
const documentViews = runtimeRepository.listDocumentViews();
const service = new PublicApiService(
  runtimeRepository,
  createLawSearchRecords(
    documentViews,
    runtimeRepository.listLawSearchSources(),
  ),
  new CitationContextService(runtimeRepository, documentViews),
);

const handle = serveStdio(() => createRegulatoryMcpServer(service), {
  onerror: (error) => console.error("Regulatory MCP stdio error", error),
});

let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await handle.close();
  runtimeRepository.close();
}

process.once("SIGINT", () => void close());
process.once("SIGTERM", () => void close());
process.once("exit", () => {
  if (!closing) runtimeRepository.close();
});
