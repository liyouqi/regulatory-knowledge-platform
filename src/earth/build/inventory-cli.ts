import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import Database from "better-sqlite3";
import tags from "../../../data/earth/display-tags.json";
import { metadataGraphSchema } from "../contract/metadata-graph";

interface WorkRow {
  celex: string;
  label: string;
}
interface WorkTags {
  family: string;
  sectors: string[];
}

async function main() {
  if (
    existsSync("data/artifacts/earth/graph.json") &&
    !process.argv.includes("--artifact")
  ) {
    const graph = metadataGraphSchema.parse(
      JSON.parse(await readFile("data/artifacts/earth/graph.json", "utf8")),
    );
    const laws = graph.nodes
      .filter((node) => node.kind === "work" && node.included)
      .sort((a, b) => (a.celex ?? "").localeCompare(b.celex ?? ""));
    const families: Record<string, { label: string }> = tags.families;
    const cells = (value: string) =>
      value.replaceAll("|", "\\|").replaceAll(/\s+/g, " ");
    const header = `Installed metadata graph: **${laws.length} included files**, **${graph.report.boundaryWorks} related files outside directory scope**, **${graph.report.institutions} institutions**, **${graph.edges.length} displayed-category metadata relations**. Full text remains separate.\n\n[Complete included-file table](earth-inventory.md). [Family coverage and related files](earth-families.md).\n\n`;
    const row = (node: (typeof laws)[number]) =>
      `| [${node.celex}](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:${node.celex}) | ${cells(node.label)} | ${node.families.map((id) => families[id]?.label ?? id).join(", ") || "Unclassified"} | ${node.sectors.join(", ") || "Unclassified"} |`;
    const table =
      "| CELEX / English source | Display label | Editorial family | Editorial sectors |\n| --- | --- | --- | --- |\n";
    const works = graph.nodes.filter((node) => node.kind === "work");
    const rts = (node: (typeof works)[number]) =>
      /regulatory technical standards/iu.test(node.title);
    const its = (node: (typeof works)[number]) =>
      /implementing technical standards/iu.test(node.title);
    const coverage = Object.entries(families).map(([id, family]) => {
      const members = works.filter((node) => node.families.includes(id));
      const explicit = members.filter((node) =>
        Object.hasOwn(tags.works, node.celex ?? ""),
      ).length;
      return {
        id,
        label: family.label,
        files: members.length,
        includedFiles: members.filter((node) => node.included).length,
        relatedFiles: members.filter((node) => !node.included).length,
        rts: members.filter(rts).length,
        its: members.filter(its).length,
        explicit,
        inferred: members.length - explicit,
      };
    });
    const unclassified = works.filter((node) => !node.families.length);
    const unclassifiedIncluded = unclassified.filter((node) => node.included);
    const multiFamily = works.filter((node) => node.families.length > 1);
    const unclassifiedStandards = unclassified.filter(
      (node) => rts(node) || its(node),
    );
    await mkdir("data/artifacts/earth", { recursive: true });
    const completionPath = `${graph.source.rawDirectory}/completion.json`;
    const acquisition = existsSync(completionPath)
      ? JSON.parse(await readFile(completionPath, "utf8"))
      : null;
    await writeFile(
      "data/artifacts/earth/family-coverage.json",
      JSON.stringify(
        {
          snapshot: graph.source.snapshotHash,
          builtAt: graph.builtAt,
          families: coverage,
          unclassifiedFiles: unclassified.map((node) => node.celex),
          unclassifiedIncludedFiles: unclassifiedIncluded.map(
            (node) => node.celex,
          ),
          unclassifiedContextFiles: unclassified
            .filter((node) => !node.included)
            .map((node) => node.celex),
          multiFamilyFiles: multiFamily.map((node) => ({
            celex: node.celex,
            families: node.families,
          })),
          acquisition: acquisition
            ? {
                status: acquisition.status,
                definition: acquisition.definition,
                emptyFrontier: acquisition.emptyFrontier,
                scannedWorks: acquisition.scannedWorks,
                familyWorks: acquisition.familyWorks,
                unpublishedFamilyWorks: acquisition.unpublishedFamilyWorks,
                unpublishedWorks: acquisition.unpublishedWorks,
                waves: acquisition.waves,
                retrievalFrom: acquisition.retrievalFrom,
                retrievalTo: acquisition.retrievalTo,
              }
            : null,
          unclassifiedTechnicalStandards: unclassifiedStandards.map(
            (node) => node.celex,
          ),
          excludedPredicates: graph.report.excludedPredicates,
          missingEnglishEndpointRelations: graph.report.missingEnglishBoundary,
          completeness:
            "Observed official-relation coverage, not all European law or all regulator publications.",
        },
        null,
        2,
      ),
    );
    const related = works
      .filter((node) => !node.included && node.families.length)
      .sort((a, b) => (a.celex ?? "").localeCompare(b.celex ?? ""));
    await writeFile(
      "docs/earth/earth-families.md",
      `# Earth family coverage\n\nGenerated from installed graph snapshot ${graph.source.snapshotHash}.\n\nFamilies follow configured roots and exact official legal-basis/completion chains, never title similarity or citations. Counts include historical files and may overlap across families. RTS/ITS counts require those terms in official titles. These are observed counts, not a certification of completeness.\n\n| Family | Files | Included collection | Related outside collection | RTS | ITS |\n| --- | --- | --- | --- | --- | --- |\n${coverage.map((family) => `| ${family.label} | ${family.files} | ${family.includedFiles} | ${family.relatedFiles} | ${family.rts} | ${family.its} |`).join("\n")}\n\n## Related family files outside directory scope\n\nIncluded in family focus and filters; full-text ingestion is not implied.\n\n${table}${related.map(row).join("\n")}\n\n## Unclassified technical standards\n\n${unclassified.length} Work files have no configured family, including ${unclassifiedStandards.length} title-labelled technical standards. Unclassified is not necessarily an error: historical or unrelated files may lie outside the configured families. Add an evidenced root/override to the single display-tags configuration when needed; never manufacture links.\n\n${table}${unclassifiedStandards.map(row).join("\n")}\n\n## Source limits\n\n${Object.values(graph.report.excludedPredicates).reduce((sum, count) => sum + count, 0)} raw triples use unpublished predicates; ${graph.report.missingEnglishBoundary} supported triples have an unavailable English titled endpoint (absent English expression or title, combined). Raw evidence and predicate-specific counts remain in the snapshot and local coverage JSON. National sources and standalone agency publications are outside this pipeline's current source scope.\n`,
    );
    await writeFile(
      "docs/earth/earth-inventory.md",
      `# Earth included-file inventory\n\nGenerated from the installed metadata graph. Snapshot: ${graph.source.snapshotHash}.\n\n${header.replace("[Complete included-file table](earth-inventory.md). ", "")}${table}${laws.map(row).join("\n")}\n\n## Institutions\n\n| Authority code | Official English label | Official identity |\n| --- | --- | --- |\n${graph.nodes
        .filter((node) => node.kind === "institution")
        .map(
          (node) =>
            `| ${node.label} | ${cells(node.title)} | [Official concept](${node.uri.replace("http:", "https:")}) |`,
        )
        .join("\n")}\n`,
    );
    await appendFile(
      "docs/earth/earth-families.md",
      `\n## Refresh status and ambiguities\n\n${acquisition ? `Closure status: ${acquisition.status}; final frontier empty: ${acquisition.emptyFrontier}; ${acquisition.scannedWorks} Works scanned. Acquisition interval: ${acquisition.retrievalFrom} to ${acquisition.retrievalTo}. ${acquisition.unpublishedWorks?.length ?? 0} unique Works could not be published with an English title (absent English expression or title, combined); ${acquisition.unpublishedFamilyWorks?.length ?? 0} are family intermediaries/members. They remain in raw traversal evidence. This is a live acquisition interval, not a transactional legal snapshot.` : "This older snapshot has no recursive-closure completion manifest."}\n\n${unclassifiedIncluded.length} unclassified included files are distinguished from ${unclassified.length - unclassifiedIncluded.length} unclassified context files. ${multiFamily.length} files inherit multiple families; these assignments are retained. Explicit/inherited counts and exception IDs are recorded in local family-coverage JSON.\n\n${table}${multiFamily.map(row).join("\n")}\n`,
    );
    const path = "docs/earth/earth.md";
    const document = await readFile(path, "utf8");
    const start = "<!-- earth-inventory:start -->";
    const end = "<!-- earth-inventory:end -->";
    if (!document.includes(start) || !document.includes(end))
      throw new Error("Earth inventory markers are missing.");
    await writeFile(
      path,
      `${document.slice(0, document.indexOf(start) + start.length)}\n\n${header}${table}${laws
        .filter((node) => node.label !== node.celex)
        .map(row)
        .join("\n")}\n\n${document.slice(document.indexOf(end))}`,
    );
    console.log(
      `Updated Earth inventories: ${laws.length} included metadata files.`,
    );
    return;
  }
  const index = process.argv.indexOf("--artifact");
  const artifact =
    index >= 0 ? process.argv[index + 1] : "data/artifacts/earth/earth.sqlite";
  const database = new Database(artifact, {
    readonly: true,
    fileMustExist: true,
  });
  try {
    const works = database
      .prepare(`SELECT w.celex, n.label FROM works w
      JOIN nodes n ON n.work_id = w.id AND n.entity_kind = 'document' ORDER BY w.celex`)
      .all() as WorkRow[];
    const count = (table: string) =>
      (
        database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as {
          count: number;
        }
      ).count;
    const workTags: Record<string, WorkTags> = tags.works;
    const sectors: Record<string, string> = tags.sectors;
    const families: Record<string, { label: string }> = tags.families;
    const rows = works.map(({ celex, label }) => {
      const entry = workTags[celex];
      return `| ${label.replaceAll("|", "\\|")} | [${celex}](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:${celex}) | ${families[entry?.family ?? ""]?.label ?? "Unclassified"} | ${entry?.sectors.map((sector) => sectors[sector]).join(", ") ?? "Unclassified"} |`;
    });
    const table = [
      `Installed artifact: **${works.length} included laws**, **${count("boundary_works")} boundary Works**, **${count("official_relationships")} official relations**. Boundary Works are connected outside the included collection, not fully ingested laws.`,
      "",
      "| Included law | CELEX / English source | Display family | Display sectors |",
      "| --- | --- | --- | --- |",
      ...rows,
    ].join("\n");
    const path = "docs/earth/earth.md";
    const document = await readFile(path, "utf8");
    const start = "<!-- earth-inventory:start -->";
    const end = "<!-- earth-inventory:end -->";
    if (!document.includes(start) || !document.includes(end))
      throw new Error("Earth inventory markers are missing.");
    const before = document.slice(0, document.indexOf(start) + start.length);
    const after = document.slice(document.indexOf(end));
    await writeFile(path, `${before}\n\n${table}\n\n${after}`);
    console.log(
      `Updated ${path} from ${artifact}: ${works.length} included laws.`,
    );
  } finally {
    database.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
