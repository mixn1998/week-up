import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  access,
  copyFile,
  cp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const RUNTIME_DIRECTORIES = ["demo-dist"];
const RUNTIME_FILES = [
  "server/server.mjs",
  "server/week-up-database.mjs",
  "server/ai-review-service.mjs",
  "server/learning-more-sync.mjs",
  "lib/week-up-domain.ts",
  "lib/learning-more-client.ts",
  "lib/learning-more-delta.ts",
  "lib/state-patch.ts",
  "lib/category-palette.ts",
  "lib/overdue-policy.ts",
  "scripts/run-week-up-service.ps1",
];
const REQUIRED_RUNTIME_FILES = [
  "demo-dist/index.html",
  "server/server.mjs",
  "server/week-up-database.mjs",
  "scripts/run-week-up-service.ps1",
];
const TEMPORARY_DIRECTORY = /^(?:\.staging-|\.tmp-|tmp-|build-)/;
const RELEASE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function isSameOrInside(root, candidate) {
  const relation = relative(resolve(root), resolve(candidate));
  return relation === "" || (!relation.startsWith(`..${sep}`) && relation !== ".." && !isAbsolute(relation));
}

function rootsOverlap(left, right) {
  return isSameOrInside(left, right) || isSameOrInside(right, left);
}

function assertSeparatedRoots(installRoot, dataRoot) {
  if (rootsOverlap(installRoot, dataRoot)) throw new Error("runtime_data_root_overlaps_install_root");
}

function assertReleaseId(releaseId) {
  if (!RELEASE_ID.test(releaseId)) throw new Error("runtime_release_id_invalid");
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readReleasePointer(path) {
  if (!(await exists(path))) return undefined;
  const value = JSON.parse(await readFile(path, "utf8"));
  if (typeof value?.releaseId !== "string") throw new Error("runtime_release_pointer_invalid");
  assertReleaseId(value.releaseId);
  return value.releaseId;
}

async function writeJsonAtomic(path, value) {
  const temporary = `${path}.tmp-${randomUUID()}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  if (await exists(path)) await rm(path, { force: true });
  await rename(temporary, path);
}

export async function readProtectedReleaseIds(installRoot) {
  const root = resolve(installRoot);
  const [current, previous] = await Promise.all([
    readReleasePointer(join(root, "current.json")),
    readReleasePointer(join(root, "previous.json")),
  ]);
  return new Set([current, previous].filter(Boolean));
}

function assertDeletionCandidate({ candidate, expectedParent, installRoot, dataRoot }) {
  const resolvedCandidate = resolve(candidate);
  if (dirname(resolvedCandidate) !== resolve(expectedParent)) throw new Error("runtime_cleanup_target_not_direct_child");
  if (!isSameOrInside(installRoot, resolvedCandidate)) throw new Error("runtime_cleanup_target_outside_install_root");
  if (rootsOverlap(resolvedCandidate, dataRoot)) throw new Error("runtime_cleanup_target_overlaps_user_data");
}

export async function cleanupInstallResidue({ installRoot, dataRoot }) {
  const root = resolve(installRoot);
  const userDataRoot = resolve(dataRoot);
  assertSeparatedRoots(root, userDataRoot);
  const versionsRoot = join(root, "versions");
  await mkdir(versionsRoot, { recursive: true });
  const protectedReleaseIds = await readProtectedReleaseIds(root);
  const versionEntries = await readdir(versionsRoot, { withFileTypes: true });
  const rootEntries = await readdir(root, { withFileTypes: true });
  const staleVersions = versionEntries
    .filter((entry) => entry.isDirectory() && !protectedReleaseIds.has(entry.name))
    .map((entry) => ({ name: entry.name, path: join(versionsRoot, entry.name), parent: versionsRoot }));
  const temporaryBuilds = rootEntries
    .filter((entry) => entry.isDirectory() && TEMPORARY_DIRECTORY.test(entry.name))
    .map((entry) => ({ name: entry.name, path: join(root, entry.name), parent: root }));
  const candidates = [...staleVersions, ...temporaryBuilds];
  for (const candidate of candidates) {
    assertDeletionCandidate({
      candidate: candidate.path,
      expectedParent: candidate.parent,
      installRoot: root,
      dataRoot: userDataRoot,
    });
  }
  for (const candidate of candidates) await rm(candidate.path, { recursive: true, force: true });
  return {
    protectedReleaseIds: [...protectedReleaseIds],
    removedVersions: staleVersions.map(({ name }) => name).sort(),
    removedTemporaryBuilds: temporaryBuilds.map(({ name }) => name).sort(),
  };
}

async function deriveReleaseId(projectRoot) {
  const packageJson = JSON.parse(await readFile(join(projectRoot, "package.json"), "utf8"));
  let revision;
  try {
    revision = execFileSync("git", ["rev-parse", "--short=12", "HEAD"], {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    revision = "local";
  }
  const releaseId = `${packageJson.version}-${revision}`;
  assertReleaseId(releaseId);
  return releaseId;
}

async function copyRuntime(projectRoot, stagingRoot) {
  for (const directory of RUNTIME_DIRECTORIES) {
    await cp(join(projectRoot, directory), join(stagingRoot, directory), { recursive: true });
  }
  for (const file of RUNTIME_FILES) {
    const target = join(stagingRoot, file);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(projectRoot, file), target);
  }
}

async function validateRuntime(releaseRoot) {
  for (const file of REQUIRED_RUNTIME_FILES) {
    const details = await stat(join(releaseRoot, file));
    if (!details.isFile()) throw new Error(`runtime_required_file_missing:${file}`);
  }
}

export async function publishRuntime(options = {}) {
  const projectRoot = resolve(options.projectRoot ?? fileURLToPath(new URL("..", import.meta.url)));
  const localAppData = process.env.LOCALAPPDATA ?? projectRoot;
  const installRoot = resolve(options.installRoot ?? join(localAppData, "Programs", "Week UP"));
  const dataRoot = resolve(options.dataRoot ?? join(localAppData, "Week UP"));
  assertSeparatedRoots(installRoot, dataRoot);
  const releaseId = options.releaseId ?? await deriveReleaseId(projectRoot);
  assertReleaseId(releaseId);
  await stat(join(projectRoot, "demo-dist", "index.html"));
  await mkdir(join(installRoot, "versions"), { recursive: true });
  const releaseRoot = join(installRoot, "versions", releaseId);
  const stagingRoot = join(installRoot, `.staging-${releaseId}-${randomUUID()}`);
  const oldCurrent = await readReleasePointer(join(installRoot, "current.json"));
  try {
    if (!(await exists(releaseRoot))) {
      await mkdir(stagingRoot, { recursive: true });
      await copyRuntime(projectRoot, stagingRoot);
      await writeJsonAtomic(join(stagingRoot, "release.json"), {
        releaseId,
        createdAt: new Date().toISOString(),
      });
      await validateRuntime(stagingRoot);
      await rename(stagingRoot, releaseRoot);
    } else {
      await validateRuntime(releaseRoot);
    }
    await copyFile(
      join(projectRoot, "scripts", "run-current-week-up.ps1"),
      join(installRoot, "run-current-week-up.ps1"),
    );
    if (oldCurrent && oldCurrent !== releaseId) {
      await writeJsonAtomic(join(installRoot, "previous.json"), { releaseId: oldCurrent });
    }
    await writeJsonAtomic(join(installRoot, "current.json"), { releaseId });
    const cleanup = await cleanupInstallResidue({ installRoot, dataRoot });
    return { releaseId, releaseRoot, installRoot, dataRoot, cleanup };
  } catch (error) {
    await rm(stagingRoot, { recursive: true, force: true });
    throw error;
  }
}

function parseArguments(arguments_) {
  const values = {};
  for (let index = 0; index < arguments_.length; index += 1) {
    const token = arguments_[index];
    if (!token.startsWith("--")) continue;
    values[token.slice(2)] = arguments_[index + 1];
    index += 1;
  }
  return values;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const command = process.argv[2] ?? "publish";
  if (command !== "publish") throw new Error(`runtime_command_unsupported:${command}`);
  const values = parseArguments(process.argv.slice(3));
  const result = await publishRuntime({
    ...(values["project-root"] ? { projectRoot: values["project-root"] } : {}),
    ...(values["install-root"] ? { installRoot: values["install-root"] } : {}),
    ...(values["data-root"] ? { dataRoot: values["data-root"] } : {}),
    ...(values["release-id"] ? { releaseId: values["release-id"] } : {}),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
