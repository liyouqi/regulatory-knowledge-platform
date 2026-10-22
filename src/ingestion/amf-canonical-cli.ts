import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { AMF_HTML_PARSER_VERSION, parseAmfHtml } from "./amf-canonical-parser";
import { readVerifiedAmfSourceSnapshot } from "./amf-snapshot";
import { loadAmfSourceRegistry } from "./amf-source-registry";

async function main(args: string[]) {
  const mode = args[0];
  if (
    (mode !== "inspect" && mode !== "build") ||
    args[1] !== "--snapshot" ||
    !args[2] ||
    (args.length !== 3 &&
      !(
        mode === "build" &&
        args.length === 5 &&
        args[3] === "--output" &&
        args[4]
      ))
  )
    throw new Error(
      "Usage: amf-canonical-cli inspect|build --snapshot DIRECTORY [--output DIRECTORY]",
    );
  const verified = await readVerifiedAmfSourceSnapshot(args[2]);
  const [source] = await loadAmfSourceRegistry();
  if (mode === "build" && (source.status !== "active" || !source.quality))
    throw new Error(
      "AMF source must be active with reviewed quality baseline before build",
    );
  const { document, report } = parseAmfHtml(
    verified.contentBytes,
    verified.snapshot,
    source,
  );
  if (mode === "inspect") {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  const token = verified.snapshot.importedAt.replaceAll(/[-:.]/gu, "");
  const directory = resolve(
    args[4] ??
      `data/artifacts/canonical/${source.localId}/${token}-${verified.snapshot.content.sha256.slice(7, 19)}-parser-amf-html-${AMF_HTML_PARSER_VERSION}`,
  );
  await mkdir(directory, { recursive: true });
  for (const [name, data] of [
    ["document.json", document],
    ["report.json", report],
  ] as const) {
    const path = resolve(directory, name);
    const value = `${JSON.stringify(data, null, 2)}\n`;
    try {
      await writeFile(path, value, { flag: "wx" });
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException).code !== "EEXIST" ||
        (await readFile(path, "utf8")) !== value
      )
        throw new Error(`Refusing to overwrite immutable artifact: ${path}`, {
          cause: error,
        });
    }
  }
  console.log(JSON.stringify({ directory, report }, null, 2));
}
main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
