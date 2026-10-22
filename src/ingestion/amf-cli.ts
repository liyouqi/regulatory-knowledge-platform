import { importAmfProbe, readVerifiedAmfSourceSnapshot } from "./amf-snapshot";

async function main(args: string[]) {
  const [command, ...rest] = args;
  if (command === "verify" && rest.length === 1) {
    const result = await readVerifiedAmfSourceSnapshot(rest[0]);
    console.log(
      JSON.stringify(
        { directory: result.directory, snapshot: result.snapshot },
        null,
        2,
      ),
    );
    return;
  }
  if (
    command === "import" &&
    rest.length === 6 &&
    rest[0] === "--input" &&
    rest[2] === "--report" &&
    rest[4] === "--captured-on"
  ) {
    console.log(
      JSON.stringify(
        await importAmfProbe({
          inputPath: rest[1],
          reportPath: rest[3],
          capturedOn: rest[5],
        }),
        null,
        2,
      ),
    );
    return;
  }
  throw new Error(
    "Usage: amf-cli import --input PATH --report PATH --captured-on 2026-10-20 | verify DIRECTORY; maintenance pages are rejected",
  );
}
main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
