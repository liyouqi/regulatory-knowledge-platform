import {
  applyDataCleanup,
  dataStatus,
  planDataCleanup,
} from "./data-maintenance";

function size(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(3)} GiB`;
}

try {
  const [command, ...args] = process.argv.slice(2);
  const allowed =
    command === "status"
      ? ["--json"]
      : ["--json", "--apply", "--dry-run", "--keep-per-profile", "--plan-id"];
  let keepPerProfile = 1;
  let expectedPlan: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (!allowed.includes(flag))
      throw new Error(`Unknown maintenance argument: ${flag}`);
    if (flag === "--keep-per-profile" || flag === "--plan-id") {
      const value = args[++i];
      if (!value || value.startsWith("--"))
        throw new Error(`${flag} requires a value.`);
      if (flag === "--keep-per-profile") {
        if (!/^\d+$/u.test(value))
          throw new Error("--keep-per-profile requires an integer.");
        keepPerProfile = Number(value);
      } else expectedPlan = value;
    }
  }
  if (command === "status") {
    const status = dataStatus();
    if (args.includes("--json")) console.log(JSON.stringify(status, null, 2));
    else {
      console.log(
        `Project: ${status.root}\nData file bytes: ${size(status.bytes)} (${status.files} files)`,
      );
      console.table(
        status.categories.map((c) => ({
          path: c.path,
          files: c.files,
          size: size(c.bytes),
        })),
      );
      console.log(
        "File-byte totals may differ from Finder/APFS allocated-space statistics.",
      );
    }
  } else if (command === "cleanup") {
    if (args.includes("--apply") && args.includes("--dry-run"))
      throw new Error("Choose --apply or --dry-run, not both.");
    const plan = planDataCleanup({ keepPerProfile });
    if (expectedPlan && expectedPlan !== plan.planId)
      throw new Error("Plan ID changed; inspect a fresh preview.");
    if (args.includes("--json")) {
      const output = args.includes("--apply")
        ? { plan, result: applyDataCleanup(plan) }
        : plan;
      console.log(JSON.stringify(output, null, 2));
    } else {
      console.log(
        `Cleanup ${args.includes("--apply") ? "apply" : "preview"}: ${plan.targets.length} files, ${size(plan.reclaimableBytes)}`,
      );
      console.log(`Plan ID: ${plan.planId}`);
      console.table(
        plan.retainedRuntimes.map((r) => ({
          profile: r.profileId,
          documents: r.documents,
          retained: r.path,
        })),
      );
      console.table(
        plan.targets
          .slice(0, 20)
          .map((f) => ({ path: f.path, reason: f.reason, bytes: f.bytes })),
      );
      if (plan.targets.length > 20)
        console.log("Use --json for the complete deletion list.");
      if (plan.skippedBuilds.length) console.table(plan.skippedBuilds);
      console.log(
        "Raw sources, master Canonical, active runtime, Galaxy, Monitor, onboarding evidence and build reports are preserved.",
      );
    }
    if (args.includes("--apply") && !args.includes("--json"))
      console.log(JSON.stringify(applyDataCleanup(plan), null, 2));
    else if (!args.includes("--json"))
      console.log(
        "Preview only. Use --apply to execute this policy; generated files have no individual backup.",
      );
  } else
    throw new Error(
      "Usage: npm run data:status -- [--json]; npm run data:cleanup -- [--dry-run|--apply] [--keep-per-profile 1-10] [--plan-id <id>] [--json]",
    );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
