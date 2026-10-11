import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, relative, resolve, sep } from "node:path";
import { z } from "zod";
import {
  corpusBuildManifestHash,
  loadCorpusBuildManifest,
} from "../corpus/corpus-build";
import { verifyRuntimeArtifact } from "../runtime/verify-runtime-artifact";

const CORPUS_ROOT = "data/artifacts/corpus-builds";
const AUDIT_ROOT = "data/artifacts/maintenance";
const reportSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  status: z.literal("succeeded"),
  manifest: z.object({ hash: z.string().regex(/^sha256:[a-f0-9]{64}$/u) }),
  profile: z.object({ id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/u) }),
  runtime: z.object({
    buildId: z.string().min(1),
    profileId: z.string().min(1),
    profileHash: z.string().min(1),
    documents: z.number().int().positive(),
    bytes: z.number().int().positive(),
  }),
});
const hash = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");

interface DataFile {
  path: string;
  bytes: number;
  modifiedAt: number;
  inode: number;
}
interface RetainedRuntime {
  path: string;
  profileId: string;
  buildId: string;
  profileHash: string;
  documents: number;
}
export interface CleanupOptions {
  root?: string;
  keepPerProfile?: number;
  minAgeHours?: number;
  environment?: NodeJS.ProcessEnv;
  now?: number;
}
export interface CleanupPlan {
  root: string;
  generatedAt: string;
  keepPerProfile: number;
  minAgeHours: number;
  planId: string;
  targets: Array<
    DataFile & { reason: "historical-canonical" | "historical-runtime" }
  >;
  reclaimableBytes: number;
  retainedRuntimes: RetainedRuntime[];
  protectedRuntimePaths: string[];
  skippedBuilds: Array<{ path: string; reason: string }>;
}

function projectRoot(provided = process.cwd()): string {
  const root = realpathSync(provided);
  const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  if (pkg.name !== "regulatory-knowledge-platform")
    throw new Error("Run maintenance from the Platform project root.");
  return root;
}

function safePath(root: string, path: string): string {
  const absolute = resolve(root, path);
  if (!absolute.startsWith(`${resolve(root, "data")}${sep}`))
    throw new Error(`Path escapes project data: ${path}`);
  let current = root;
  for (const part of relative(root, absolute).split(sep)) {
    current = resolve(current, part);
    if (lstatSync(current, { throwIfNoEntry: false })?.isSymbolicLink())
      throw new Error(`Refusing a symlink: ${path}`);
  }
  return absolute;
}

function filesUnder(root: string, path: string): DataFile[] {
  const directory = safePath(root, path);
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const child = `${path}/${entry.name}`;
      const absolute = safePath(root, child);
      const stat = lstatSync(absolute);
      if (stat.isDirectory()) return filesUnder(root, child);
      if (!stat.isFile()) throw new Error(`Unsupported data file: ${child}`);
      return [
        {
          path: child,
          bytes: stat.size,
          modifiedAt: stat.mtimeMs,
          inode: stat.ino,
        },
      ];
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

function runtimePaths(root: string, environment: NodeJS.ProcessEnv): string[] {
  const defaultPath = resolve(root, "data/artifacts/runtime/regulatory.sqlite");
  const paths = new Set([
    existsSync(defaultPath) ? realpathSync(defaultPath) : defaultPath,
  ]);
  const envFile = resolve(root, ".env");
  // Read only this setting, without loading or displaying model/API credentials.
  const localSetting = existsSync(envFile)
    ? readFileSync(envFile, "utf8")
        .match(
          /^\s*(?:export\s+)?REGULATORY_RUNTIME_DATABASE_PATH\s*=\s*(.*)$/mu,
        )?.[1]
        ?.trim()
    : undefined;
  let local = localSetting;
  if (localSetting && /^["']/u.test(localSetting)) {
    const quoted = localSetting.match(/^(["'])(.*?)\1(?:\s*#.*)?$/u);
    if (!quoted)
      throw new Error(
        "Invalid quoted REGULATORY_RUNTIME_DATABASE_PATH in .env.",
      );
    local = quoted[2];
  } else local = localSetting?.replace(/\s+#.*$/u, "").trim();
  for (const raw of [local, environment.REGULATORY_RUNTIME_DATABASE_PATH]) {
    if (!raw) continue;
    const value = raw.trim();
    if (value.includes("$"))
      throw new Error(
        "Resolve variables in REGULATORY_RUNTIME_DATABASE_PATH before cleanup.",
      );
    if (value) {
      const path = resolve(root, value);
      paths.add(existsSync(path) ? realpathSync(path) : path);
    }
  }
  return [...paths].sort();
}

export function dataStatus(providedRoot?: string) {
  const root = projectRoot(providedRoot);
  const files = filesUnder(root, "data/artifacts").concat(
    readdirSync(resolve(root, "data"), { withFileTypes: true })
      .filter((e) => e.name !== "artifacts")
      .flatMap((e) => {
        const path = `data/${e.name}`;
        if (e.isDirectory()) return filesUnder(root, path);
        const stat = lstatSync(safePath(root, path));
        return [
          { path, bytes: stat.size, modifiedAt: stat.mtimeMs, inode: stat.ino },
        ];
      }),
  );
  const categories = new Map<string, { files: number; bytes: number }>();
  for (const file of files) {
    const parts = file.path.split("/");
    const name =
      parts[1] === "artifacts"
        ? parts.slice(0, 3).join("/")
        : parts.slice(0, 2).join("/");
    const category = categories.get(name) ?? { files: 0, bytes: 0 };
    category.files++;
    category.bytes += file.bytes;
    categories.set(name, category);
  }
  return {
    root,
    files: files.length,
    bytes: files.reduce((sum, f) => sum + f.bytes, 0),
    categories: [...categories]
      .map(([path, counts]) => ({ path, ...counts }))
      .sort((a, b) => b.bytes - a.bytes),
  };
}

export function planDataCleanup(options: CleanupOptions = {}): CleanupPlan {
  const root = projectRoot(options.root);
  const keepPerProfile = options.keepPerProfile ?? 1;
  const minAgeHours = options.minAgeHours ?? 24;
  if (
    !Number.isInteger(keepPerProfile) ||
    keepPerProfile < 1 ||
    keepPerProfile > 10
  )
    throw new Error("keep-per-profile must be an integer from 1 to 10.");
  if (!Number.isFinite(minAgeHours) || minAgeHours < 24)
    throw new Error("Cleanup requires at least a 24-hour grace period.");
  const now = options.now ?? Date.now();
  const protectedRuntimePaths = runtimePaths(
    root,
    options.environment ?? process.env,
  );
  const manifestHash = corpusBuildManifestHash(
    loadCorpusBuildManifest(resolve(root, "data/corpus-build-manifest.json")),
  );
  const skippedBuilds: CleanupPlan["skippedBuilds"] = [];
  const builds: Array<{
    path: string;
    files: DataFile[];
    report: z.infer<typeof reportSchema>;
    runtime?: DataFile;
    recent: boolean;
  }> = [];
  const directory = safePath(root, CORPUS_ROOT);
  for (const entry of existsSync(directory)
    ? readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
        a.name.localeCompare(b.name),
      )
    : []) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const path = `${CORPUS_ROOT}/${entry.name}`;
    const files = filesUnder(root, path);
    const reportFile = files.find(
      (f) => f.path === `${path}/build-report.json`,
    );
    let parsed: ReturnType<typeof reportSchema.safeParse> | null = null;
    try {
      if (reportFile)
        parsed = reportSchema.safeParse(
          JSON.parse(readFileSync(safePath(root, reportFile.path), "utf8")),
        );
    } catch {
      skippedBuilds.push({ path, reason: "Unreadable build report" });
      continue;
    }
    if (
      !parsed?.success ||
      parsed.data.profile.id !== parsed.data.runtime.profileId
    ) {
      skippedBuilds.push({
        path,
        reason: "Missing, failed or unsupported build report",
      });
      continue;
    }
    const runtime = files.find((f) => f.path === `${path}/runtime.sqlite`);
    if (runtime && runtime.bytes !== parsed.data.runtime.bytes) {
      skippedBuilds.push({
        path,
        reason: "Runtime size differs from build report",
      });
      continue;
    }
    if (
      files.some((f) => /\.(?:tmp|pending)(?:[.-]|$)/u.test(basename(f.path)))
    ) {
      skippedBuilds.push({ path, reason: "Temporary build files present" });
      continue;
    }
    const recent = files.some(
      (f) => f.modifiedAt > now - minAgeHours * 3_600_000,
    );
    builds.push({ path, files, report: parsed.data, runtime, recent });
  }
  const retainedRuntimes: RetainedRuntime[] = [];
  const profiles = new Set(
    builds.filter((b) => b.runtime).map((b) => b.report.profile.id),
  );
  for (const profile of profiles) {
    const candidates = builds
      .filter((b) => b.runtime && b.report.profile.id === profile)
      .sort(
        (a, b) =>
          Number(b.report.manifest.hash === manifestHash) -
            Number(a.report.manifest.hash === manifestHash) ||
          (b.runtime?.modifiedAt ?? 0) - (a.runtime?.modifiedAt ?? 0) ||
          a.path.localeCompare(b.path),
      );
    for (const build of candidates.slice(0, keepPerProfile))
      retainedRuntimes.push({
        path: build.runtime?.path ?? "",
        profileId: profile,
        buildId: build.report.runtime.buildId,
        profileHash: build.report.runtime.profileHash,
        documents: build.report.runtime.documents,
      });
  }
  const retainedPaths = new Set(retainedRuntimes.map((r) => r.path));
  const targets: CleanupPlan["targets"] = [];
  for (const build of builds) {
    if (
      protectedRuntimePaths.some((p) =>
        p.startsWith(`${resolve(root, build.path)}${sep}`),
      )
    ) {
      skippedBuilds.push({
        path: build.path,
        reason: "Configured active runtime",
      });
      continue;
    }
    if (build.recent) {
      skippedBuilds.push({ path: build.path, reason: "Within grace period" });
      continue;
    }
    for (const file of build.files) {
      if (
        /^canonical\/[^/]+\/[^/]+\/document\.json$/u.test(
          file.path.slice(build.path.length + 1),
        )
      ) {
        targets.push({ ...file, reason: "historical-canonical" });
      } else if (
        file.path === `${build.path}/runtime.sqlite` &&
        !retainedPaths.has(file.path)
      ) {
        targets.push({ ...file, reason: "historical-runtime" });
      }
    }
  }
  targets.sort((a, b) => a.path.localeCompare(b.path));
  const planId = hash(
    JSON.stringify({
      keepPerProfile,
      minAgeHours,
      manifestHash,
      protectedRuntimePaths,
      targets,
      retainedRuntimes,
      reports: builds.map((b) =>
        hash(readFileSync(safePath(root, `${b.path}/build-report.json`))),
      ),
    }),
  );
  return {
    root,
    generatedAt: new Date(now).toISOString(),
    keepPerProfile,
    minAgeHours,
    planId,
    targets,
    reclaimableBytes: targets.reduce((sum, f) => sum + f.bytes, 0),
    retainedRuntimes,
    protectedRuntimePaths,
    skippedBuilds,
  };
}

function assertIdle(plan: CleanupPlan) {
  const result = spawnSync(
    "lsof",
    ["-nP", "-Fn", "+D", safePath(plan.root, CORPUS_ROOT)],
    { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
  );
  if (
    result.error ||
    ![0, 1].includes(result.status ?? -1) ||
    result.stderr.trim()
  ) {
    throw new Error(
      "Cannot check open files. Install/allow lsof before applying cleanup; preview remains available.",
    );
  }
  const targets = new Set(plan.targets.map((f) => resolve(plan.root, f.path)));
  if (
    result.stdout.split("\n").some((line) => {
      if (!line.startsWith("n")) return false;
      const path = line.slice(1);
      return targets.has(existsSync(path) ? realpathSync(path) : path);
    })
  ) {
    throw new Error(
      "A cleanup target is open in another process. Stop that process and preview again.",
    );
  }
}

function protectedDataHash(plan: CleanupPlan): string {
  const selected = new Set(plan.targets.map((f) => f.path));
  const digest = createHash("sha256");
  // Audit receipts are added by this command; Finder metadata can change independently.
  const status = dataStatus(plan.root);
  const protectedFiles = status.categories
    .flatMap((category) => {
      const absolute = safePath(plan.root, category.path);
      const files = lstatSync(absolute).isDirectory()
        ? filesUnder(plan.root, category.path)
        : [{ path: category.path, bytes: lstatSync(absolute).size }];
      return files;
    })
    .sort((a, b) => a.path.localeCompare(b.path));
  for (const file of protectedFiles) {
    if (
      selected.has(file.path) ||
      file.path.startsWith(`${AUDIT_ROOT}/`) ||
      basename(file.path) === ".DS_Store"
    )
      continue;
    digest.update(
      `${file.path}\0${hash(readFileSync(safePath(plan.root, file.path)))}\n`,
    );
  }
  return digest.digest("hex");
}

interface CleanupHooks {
  verifyRuntime?: (
    path: string,
  ) => Pick<
    ReturnType<typeof verifyRuntimeArtifact>,
    "buildId" | "profileId" | "profileHash" | "documents"
  >;
  assertIdle?: (plan: CleanupPlan) => void;
}

function unchangedPlan(plan: CleanupPlan) {
  const current = planDataCleanup({
    root: plan.root,
    keepPerProfile: plan.keepPerProfile,
    minAgeHours: plan.minAgeHours,
  });
  if (
    current.planId !== plan.planId ||
    JSON.stringify(current.targets) !== JSON.stringify(plan.targets) ||
    JSON.stringify(current.retainedRuntimes) !==
      JSON.stringify(plan.retainedRuntimes) ||
    JSON.stringify(current.protectedRuntimePaths) !==
      JSON.stringify(plan.protectedRuntimePaths)
  ) {
    throw new Error("Cleanup plan changed; preview again before applying.");
  }
}

export function applyDataCleanup(plan: CleanupPlan, hooks: CleanupHooks = {}) {
  unchangedPlan(plan);
  if (!plan.targets.length)
    return { status: "no-op" as const, removedFiles: 0, removedBytes: 0 };
  mkdirSync(safePath(plan.root, AUDIT_ROOT), { recursive: true });
  const lockPath = safePath(plan.root, `${AUDIT_ROOT}/cleanup.lock`);
  const lock = openSync(lockPath, "wx");
  try {
    writeFileSync(
      lock,
      JSON.stringify({ pid: process.pid, planId: plan.planId }),
    );
    return applyUnlocked(plan, hooks);
  } finally {
    closeSync(lock);
    unlinkSync(lockPath);
  }
}

function applyUnlocked(plan: CleanupPlan, hooks: CleanupHooks) {
  unchangedPlan(plan);
  for (const runtime of plan.retainedRuntimes) {
    const verification = (hooks.verifyRuntime ?? verifyRuntimeArtifact)(
      safePath(plan.root, runtime.path),
    );
    for (const field of [
      "buildId",
      "profileId",
      "profileHash",
      "documents",
    ] as const) {
      if (verification[field] !== runtime[field])
        throw new Error(
          `Retained runtime does not match its report: ${runtime.path}`,
        );
    }
  }
  (hooks.assertIdle ?? assertIdle)(plan);
  const beforeHash = protectedDataHash(plan);
  // Verification may take time: recheck the complete plan and all exact targets before deletion.
  unchangedPlan(plan);
  (hooks.assertIdle ?? assertIdle)(plan);
  const auditDirectory = safePath(plan.root, AUDIT_ROOT);
  mkdirSync(auditDirectory, { recursive: true });
  const receiptPath = resolve(
    auditDirectory,
    `cleanup-${Date.now()}-${plan.planId.slice(0, 12)}.json`,
  );
  const receipt = {
    schemaVersion: "data-cleanup@2.0.0",
    status: "started",
    plan,
    protectedHashBefore: beforeHash,
    protectedHashAfter: "",
    removedFiles: 0,
    removedBytes: 0,
    recovery:
      "Generated files have no individual backup; retain source snapshots, build reports and corresponding code for reconstruction.",
  };
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, {
    flag: "wx",
  });
  try {
    for (const file of plan.targets) {
      const absolute = safePath(plan.root, file.path);
      const stat = lstatSync(absolute);
      if (
        !stat.isFile() ||
        stat.ino !== file.inode ||
        stat.size !== file.bytes ||
        stat.mtimeMs !== file.modifiedAt
      ) {
        throw new Error(`Target changed before deletion: ${file.path}`);
      }
      unlinkSync(absolute);
      receipt.removedFiles++;
      receipt.removedBytes += file.bytes;
    }
    receipt.protectedHashAfter = protectedDataHash(plan);
    if (receipt.protectedHashAfter !== beforeHash)
      throw new Error("Protected data changed; inspect the cleanup receipt.");
    receipt.status = "completed";
  } catch (error) {
    receipt.status = "partial-or-failed";
    throw error;
  } finally {
    writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  }
  return {
    status: "completed" as const,
    removedFiles: receipt.removedFiles,
    removedBytes: receipt.removedBytes,
    receiptPath,
  };
}
