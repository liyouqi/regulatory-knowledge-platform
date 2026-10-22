import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// GII archives selected for this adapter must contain exactly one XML member.
// Never extract paths to disk; cap both the archive and decompressed output.
export function extractNationalXml(
  archive: Uint8Array,
  expectedWorkId: string,
): Uint8Array {
  if (archive.byteLength > 10 * 1024 * 1024)
    throw new Error("National archive exceeds size limit");
  const directory = mkdtempSync(join(tmpdir(), "national-xml-"));
  const path = join(directory, "source.zip");
  try {
    writeFileSync(path, archive, { flag: "wx" });
    const options = { maxBuffer: 20 * 1024 * 1024, timeout: 30000 };
    const names = execFileSync("unzip", ["-Z", "-1", path], options)
      .toString("utf8")
      .trim()
      .split(/\r?\n/u);
    if (names.length !== 1 || names[0] !== `${expectedWorkId}.xml`)
      throw new Error(
        "National archive must contain exactly the expected XML member",
      );
    return new Uint8Array(
      execFileSync("unzip", ["-p", path, names[0]], options),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
