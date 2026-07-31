import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  cleanupInstallResidue,
  publishRuntime,
  readProtectedReleaseIds,
} from "../scripts/runtime-release.mjs";

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

test("protects current and previous releases while removing stale versions and temporary builds", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "week-up-runtime-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const installRoot = join(root, "programs", "Week UP");
  const dataRoot = join(root, "user-data", "Week UP");
  const versionsRoot = join(installRoot, "versions");
  await Promise.all([
    mkdir(join(versionsRoot, "release-current"), { recursive: true }),
    mkdir(join(versionsRoot, "release-previous"), { recursive: true }),
    mkdir(join(versionsRoot, "release-stale"), { recursive: true }),
    mkdir(join(installRoot, ".staging-abandoned"), { recursive: true }),
    mkdir(join(installRoot, "build-abandoned"), { recursive: true }),
    mkdir(dataRoot, { recursive: true }),
  ]);
  await Promise.all([
    writeFile(join(installRoot, "current.json"), JSON.stringify({ releaseId: "release-current" })),
    writeFile(join(installRoot, "previous.json"), JSON.stringify({ releaseId: "release-previous" })),
    writeFile(join(dataRoot, "week-up.sqlite"), "protected-user-data"),
  ]);

  const protectedIds = await readProtectedReleaseIds(installRoot);
  assert.deepEqual([...protectedIds].sort(), ["release-current", "release-previous"]);
  const result = await cleanupInstallResidue({ installRoot, dataRoot });

  assert.equal(await exists(join(versionsRoot, "release-current")), true);
  assert.equal(await exists(join(versionsRoot, "release-previous")), true);
  assert.equal(await exists(join(versionsRoot, "release-stale")), false);
  assert.equal(await exists(join(installRoot, ".staging-abandoned")), false);
  assert.equal(await exists(join(installRoot, "build-abandoned")), false);
  assert.equal(await readFile(join(dataRoot, "week-up.sqlite"), "utf8"), "protected-user-data");
  assert.deepEqual(result.removedVersions, ["release-stale"]);
});

test("refuses cleanup when the user data directory overlaps a deletion candidate", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "week-up-runtime-overlap-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const installRoot = join(root, "Week UP");
  const dataRoot = join(installRoot, "versions", "release-stale");
  await mkdir(dataRoot, { recursive: true });
  await writeFile(join(dataRoot, "week-up.sqlite"), "must-survive");

  await assert.rejects(
    cleanupInstallResidue({ installRoot, dataRoot }),
    /runtime_data_root_overlaps_install_root/,
  );
  assert.equal(await readFile(join(dataRoot, "week-up.sqlite"), "utf8"), "must-survive");
});

test("publishes an allowlisted runtime and shifts the old current release to previous", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "week-up-runtime-publish-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const projectRoot = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
  const installRoot = join(root, "programs", "Week UP");
  const dataRoot = join(root, "user-data", "Week UP");
  await mkdir(join(installRoot, "versions", "release-old"), { recursive: true });
  await writeFile(join(installRoot, "current.json"), JSON.stringify({ releaseId: "release-old" }));

  const result = await publishRuntime({
    projectRoot,
    installRoot,
    dataRoot,
    releaseId: "release-next",
  });

  const releaseRoot = join(installRoot, "versions", "release-next");
  assert.equal(result.releaseId, "release-next");
  assert.equal(JSON.parse(await readFile(join(installRoot, "current.json"), "utf8")).releaseId, "release-next");
  assert.equal(JSON.parse(await readFile(join(installRoot, "previous.json"), "utf8")).releaseId, "release-old");
  assert.equal(await exists(join(releaseRoot, "demo-dist", "index.html")), true);
  assert.equal(await exists(join(releaseRoot, "server", "server.mjs")), true);
  assert.equal(await exists(join(releaseRoot, "src", "lib", "awareness.ts")), true);
  assert.equal(await exists(join(releaseRoot, "src", "lib", "awareness-analysis-client.ts")), true);
  assert.equal(await exists(join(releaseRoot, "tests")), false);
  assert.equal(await exists(join(releaseRoot, "node_modules")), false);
  assert.equal(await exists(join(releaseRoot, "app")), false);
  assert.equal((await readdir(join(installRoot))).some((name) => name.startsWith(".staging-")), false);
});

test("reuses identical current-release files without coupling changed files", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "week-up-runtime-reuse-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const projectRoot = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
  const installRoot = join(root, "programs", "Week UP");
  const dataRoot = join(root, "user-data", "Week UP");

  await publishRuntime({
    projectRoot,
    installRoot,
    dataRoot,
    releaseId: "release-one",
  });
  const firstRoot = join(installRoot, "versions", "release-one");
  await writeFile(join(firstRoot, "server", "server.mjs"), "previous release differs\n", "utf8");

  const result = await publishRuntime({
    projectRoot,
    installRoot,
    dataRoot,
    releaseId: "release-two",
  });
  const secondRoot = join(installRoot, "versions", "release-two");
  const [firstShared, secondShared, firstChanged, secondChanged] = await Promise.all([
    stat(join(firstRoot, "src", "lib", "awareness.ts")),
    stat(join(secondRoot, "src", "lib", "awareness.ts")),
    stat(join(firstRoot, "server", "server.mjs")),
    stat(join(secondRoot, "server", "server.mjs")),
  ]);

  assert.ok(result.reuse.reusedFiles > 0);
  assert.ok(result.reuse.reusedBytes > 0);
  assert.ok(firstShared.nlink >= 2);
  assert.equal(firstShared.ino, secondShared.ino);
  assert.notEqual(firstChanged.ino, secondChanged.ino);
  assert.equal(await readFile(join(secondRoot, "server", "server.mjs"), "utf8"), await readFile(join(projectRoot, "server", "server.mjs"), "utf8"));
});

test("derives the release version from runtime content", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "week-up-runtime-version-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const projectRoot = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
  const first = await publishRuntime({
    projectRoot,
    installRoot: join(root, "first-install"),
    dataRoot: join(root, "first-data"),
  });
  const second = await publishRuntime({
    projectRoot,
    installRoot: join(root, "second-install"),
    dataRoot: join(root, "second-data"),
  });

  assert.match(first.releaseId, /^0\.1\.0-[a-f0-9]{12}$/);
  assert.equal(second.releaseId, first.releaseId);
});
