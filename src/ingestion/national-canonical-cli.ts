import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateCanonicalDocument } from "../canonical/validate";
import { readVerifiedNationalSourceSnapshot } from "./national-snapshot";
import { findNationalSource } from "./national-source-registry";
import {
  NATIONAL_XML_PARSER_VERSION,
  parseNationalXml,
} from "./national-xml-parser";
const argument = (name: string) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? undefined : process.argv[i + 1];
};
async function immutable(path: string, content: string) {
  try {
    const old = await readFile(path, "utf8");
    if (old === content) return;
    throw new Error(`Refusing to overwrite different artifact ${path}`);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  await writeFile(path, content, { flag: "wx" });
}
async function build() {
  const path = argument("--snapshot");
  if (!path) throw new Error("Expected --snapshot");
  const verified = await readVerifiedNationalSourceSnapshot(path);
  const source = await findNationalSource(verified.snapshot.localId);
  const inspect = process.argv.includes("--inspect");
  const allowDrift = process.argv.includes("--allow-drift");
  if (
    !inspect &&
    (!source.publicationDate || !source.quality || source.status !== "active")
  )
    throw new Error(
      "National source must be active with reviewed publication date and quality baseline",
    );
  const { document, report } = parseNationalXml(
    verified.contentBytes,
    verified.snapshot,
    source,
  );
  const hashes = Object.fromEntries(
    (
      document.provisions as {
        logicalId: string;
        contentHash: string;
        roleHashes: Record<string, string>;
      }[]
    ).flatMap((p) => [
      [p.logicalId, p.contentHash],
      ...Object.entries(p.roleHashes).map(([role, hash]) => [
        `${p.logicalId}#${role}`,
        hash,
      ]),
    ]),
  );
  const drift: string[] = [];
  if (source.quality) {
    for (const [key, expected] of Object.entries(source.quality)) {
      if (key === "normIds" || key === "metadataHashes") {
        if (
          JSON.stringify(expected) !==
          JSON.stringify(
            key === "normIds" ? report.normIds : report.metadataHashes,
          )
        )
          drift.push(`${key} changed; review required`);
      } else if (key === "textHashes") {
        for (const [id, hash] of Object.entries(
          expected as Record<string, string>,
        ))
          if (hashes[id] !== hash) drift.push(`Text hash mismatch: ${id}`);
      } else if (key === "maximumWarnings") {
        if (report.warningCount > (expected as number))
          drift.push("Warning limit exceeded");
      } else if (
        (report as unknown as Record<string, number>)[key] !== expected
      )
        drift.push(`Count mismatch: ${key}`);
    }
  }
  const buildReport = {
    ...report,
    parserVersion: NATIONAL_XML_PARSER_VERSION,
    documentId: source.documentId,
    sourceSnapshotId: verified.snapshot.snapshotId,
    qualityStatus: source.quality
      ? drift.length
        ? "drifted"
        : "matched"
      : "unreviewed",
    qualityDrift: drift,
  };
  if (inspect) {
    console.log(
      JSON.stringify({ ...buildReport, textHashes: hashes }, null, 2),
    );
    return;
  }
  if (drift.length && !allowDrift)
    throw new Error(`National source quality drift: ${drift.join(", ")}`);
  const checked = validateCanonicalDocument(document);
  const output = resolve(
    argument("--output") ??
      `data/artifacts/canonical/${source.localId}/${verified.snapshot.retrievedAt.replaceAll(/[-:.]/gu, "")}-${verified.snapshot.content.sha256.slice(7, 19)}-parser-national-xml-${NATIONAL_XML_PARSER_VERSION}`,
  );
  await mkdir(output, { recursive: true });
  await immutable(
    `${output}/document.json`,
    `${JSON.stringify(checked, null, 2)}\n`,
  );
  await immutable(
    `${output}/build-report.json`,
    `${JSON.stringify(buildReport, null, 2)}\n`,
  );
  console.log(output);
}
try {
  await build();
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
}
