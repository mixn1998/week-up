import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function findRepositoryRoot(start) {
  let candidate = resolve(start);
  while (dirname(candidate) !== candidate) {
    if (await exists(join(candidate, ".git"))) return candidate;
    candidate = dirname(candidate);
  }
  throw new Error("repository_root_not_found");
}

test("repository groups the web application, durable docs, and generated artifacts", async () => {
  const repositoryRoot = await findRepositoryRoot(dirname(fileURLToPath(import.meta.url)));
  const appRoot = join(repositoryRoot, "apps", "web");

  assert.equal(await exists(join(appRoot, "package.json")), true);
  assert.equal(await exists(join(appRoot, "index.html")), true);
  assert.equal(await exists(join(appRoot, "src", "main.tsx")), true);
  assert.equal(await exists(join(appRoot, "src", "app", "page.tsx")), true);
  assert.equal(await exists(join(appRoot, "src", "lib", "week-up-domain.ts")), true);
  assert.equal(await exists(join(appRoot, "server", "server.mjs")), true);
  assert.equal(await exists(join(appRoot, "tests", "week-up-domain.test.mjs")), true);
  assert.equal(await exists(join(repositoryRoot, "web")), false);
  assert.equal(await exists(join(repositoryRoot, "SANITIZATION_REPORT.md")), false);
  assert.equal(await exists(join(repositoryRoot, "SECURITY_AND_PRIVACY.md")), false);
  assert.equal(await exists(join(repositoryRoot, "docs", "governance", "sanitization-report.md")), true);
  assert.equal(await exists(join(repositoryRoot, "docs", "governance", "security-and-privacy.md")), true);
  assert.equal(await exists(join(repositoryRoot, "docs", "product", "screenshots", "today-planning.png")), true);
});

test("automatic tooling follows the organized application root", async () => {
  const repositoryRoot = await findRepositoryRoot(dirname(fileURLToPath(import.meta.url)));
  const [workflow, readme] = await Promise.all([
    readFile(join(repositoryRoot, ".github", "workflows", "ci.yml"), "utf8"),
    readFile(join(repositoryRoot, "README.md"), "utf8"),
  ]);

  assert.match(workflow, /working-directory: apps\/web/);
  assert.match(workflow, /cache-dependency-path: apps\/web\/package-lock\.json/);
  assert.match(readme, /apps\/web\/src\/app/);
  assert.match(readme, /docs\/product\/screenshots/);
  assert.doesNotMatch(readme, /\.\/docs\/screenshots/);
});
