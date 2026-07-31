import assert from "node:assert/strict";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { stagePortableApplication } from "../scripts/runtime-release.mjs";

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

test("stages a self-contained local runtime without development or user data", async (t) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "week-up-portable-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const projectRoot = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
  const targetRoot = join(temporaryRoot, "app");

  await stagePortableApplication({ projectRoot, targetRoot });

  for (const required of [
    "package.json",
    "demo-dist/index.html",
    "server/server.mjs",
    "src/lib/week-up-domain.ts",
    "scripts/runtime-release.mjs",
    "scripts/install-week-up-autostart.ps1",
    "scripts/run-current-week-up.ps1",
  ]) {
    assert.equal(await exists(join(targetRoot, required)), true, required);
  }
  for (const excluded of ["node_modules", "tests", ".git", "data", "backups", ".env"]) {
    assert.equal(await exists(join(targetRoot, excluded)), false, excluded);
  }
});

test("refuses to stage over the project or an existing target", async (t) => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "week-up-portable-guard-"));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  const projectRoot = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

  await assert.rejects(
    stagePortableApplication({ projectRoot, targetRoot: join(projectRoot, "nested-output") }),
    /portable_target_overlaps_project_root/,
  );
  await assert.rejects(
    stagePortableApplication({ projectRoot, targetRoot: temporaryRoot }),
    /portable_target_already_exists/,
  );
});
