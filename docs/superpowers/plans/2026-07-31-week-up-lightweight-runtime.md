# Week UP Lightweight Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a dependency-free local runtime, protect only the current and previous releases during cleanup, and reduce backup storage without touching user data.

**Architecture:** A Node release publisher copies an explicit runtime allowlist into `%LOCALAPPDATA%\Programs\Week UP\versions/<release-id>`, maintains current/previous manifests, and cleans only validated children of the install root. SQLite maintenance keeps the newest daily backup directly restorable, compresses historical backups, limits migration backups, and checkpoints WAL after a verified backup.

**Tech Stack:** Node.js 24 built-ins, PowerShell scheduled tasks, SQLite through `node:sqlite`, Node test runner.

## Global Constraints

- Production runtime must not contain `node_modules`, tests, page source, package caches, docs, or user data.
- User data root defaults to `%LOCALAPPDATA%\Week UP`.
- Install root defaults to `%LOCALAPPDATA%\Programs\Week UP`.
- Cleanup may protect only the release ids read from `current.json` and `previous.json`.
- Cleanup must reject any target that equals, contains, or is contained by the user data root.
- Keep the newest daily SQLite backup uncompressed; compress older retained backups.
- Keep 14 recent daily backups, up to 8 older Monday backups, and 2 migration backups.

---

### Task 1: Runtime release policy and regression loop

**Files:**
- Create: `web/scripts/runtime-release.mjs`
- Create: `web/tests/runtime-release.test.mjs`

**Interfaces:**
- Produces: `publishRuntime(options)`, `cleanupInstallResidue(options)`, `readProtectedReleaseIds(installRoot)`, and `isSameOrInside(root, candidate)`.
- Consumes: explicit `projectRoot`, `installRoot`, `dataRoot`, and optional `releaseId`; default id uses Git revision or deterministic runtime content hash.

- [ ] **Step 1: Write the failing cleanup test**

Create a temporary install root containing `versions/current`, `versions/previous`, `versions/stale`, `.staging-old`, and a separate user data root. Write current/previous manifests and assert cleanup preserves the two protected versions and user data while deleting stale and staging directories.

- [ ] **Step 2: Run the focused test and verify red**

Run: `node --test tests/runtime-release.test.mjs`

Expected: FAIL because `runtime-release.mjs` does not exist.

- [ ] **Step 3: Implement bounded cleanup**

Normalize every path, require version candidates to be direct children of `versions`, require temporary candidates to be direct children of the install root with an approved prefix, and reject any relationship with the data root before removal.

- [ ] **Step 4: Add runtime packaging**

Copy only `demo-dist`, the four server modules, the six transitive domain modules, and `run-week-up-service.ps1` into a staging directory. Validate required entries, move staging to `versions/<release-id>`, shift current to previous, write current, then invoke cleanup.

- [ ] **Step 5: Verify the focused test**

Run: `node --test tests/runtime-release.test.mjs`

Expected: PASS for protection, stale cleanup, temp cleanup, data exclusion, and allowlisted package contents.

### Task 2: Stable launcher and autostart installation

**Files:**
- Create: `web/scripts/run-current-week-up.ps1`
- Modify: `web/scripts/install-week-up-autostart.ps1`
- Modify: `web/package.json`
- Modify: `web/tests/service-runner.test.mjs`

**Interfaces:**
- Consumes: `current.json` with `{ "releaseId": "..." }`.
- Produces: a stable scheduled-task action pointing to `<install-root>/run-current-week-up.ps1`.

- [ ] **Step 1: Extend the source regression test**

Assert the installer publishes the runtime before task registration, points the task to the stable launcher, and passes a data root outside the install root.

- [ ] **Step 2: Run the focused test and verify red**

Run: `node --test tests/service-runner.test.mjs`

Expected: FAIL on missing stable launcher and release publisher invocation.

- [ ] **Step 3: Implement launcher and installer**

The launcher reads `current.json`, validates the release directory under `versions`, and invokes that release's `scripts/run-week-up-service.ps1 -ProjectRoot <release-dir>`. The installer locates Node, publishes the already-built runtime, copies the stable launcher, and registers the task against it.

- [ ] **Step 4: Add package commands**

Add `runtime:publish` for the Node publisher and `deploy:local` for build plus autostart installation.

- [ ] **Step 5: Verify service tests**

Run: `node --test tests/service-runner.test.mjs tests/runtime-release.test.mjs`

Expected: PASS.

### Task 3: Compressed backup lifecycle

**Files:**
- Modify: `web/server/week-up-database.mjs`
- Modify: `web/tests/sqlite-persistence.test.mjs`

**Interfaces:**
- Extends store with `checkpoint()`.
- `maintainBackups(store, backupDirectory, now)` still returns the newest directly restorable `.sqlite` path.

- [ ] **Step 1: Write failing backup lifecycle tests**

Create dated daily and migration backups in a temporary backup directory. Assert newest daily remains `.sqlite`, older retained entries become `.sqlite.gz`, only two migration backups remain, and files outside the backup directory are unchanged.

- [ ] **Step 2: Run the focused test and verify red**

Run: `node --test --test-name-pattern="compresses historical backups" tests/sqlite-persistence.test.mjs`

Expected: FAIL because historical backups remain uncompressed and migrations are unlimited.

- [ ] **Step 3: Implement gzip and retention**

Use `node:zlib` with `pipeline` to write a temporary gzip file and atomically rename it. Deduplicate daily dates, apply the existing daily/weekly retention policy across `.sqlite` and `.sqlite.gz`, keep two newest migration backups by modification time, and compress all retained historical files except the newest daily and newest migration backup.

- [ ] **Step 4: Add WAL checkpoint**

After successful backup, invoke `store.checkpoint()` using `PRAGMA wal_checkpoint(TRUNCATE)`.

- [ ] **Step 5: Verify persistence tests**

Run: `node --test tests/sqlite-persistence.test.mjs`

Expected: PASS, including direct opening of the newest daily backup.

### Task 4: Local deployment, cleanup, and full verification

**Files:**
- Modify: `README.md`
- Runtime output: `%LOCALAPPDATA%\Programs\Week UP`

**Interfaces:**
- Consumes the built application and the current Git commit.
- Produces a current versioned runtime and one protected previous version when available.

- [ ] **Step 1: Document storage boundaries and commands**

Document development, production runtime, and user data roots, plus `npm run deploy:local`.

- [ ] **Step 2: Run full validation**

Run:

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

Expected: all checks pass.

- [ ] **Step 3: Publish locally**

Run the runtime publisher with the default install and data roots. Confirm current/previous manifests, package size, absence of tests and `node_modules`, and cleanup of stale versions and temporary directories.

- [ ] **Step 4: Apply backup maintenance**

Run one safe maintenance cycle against `%LOCALAPPDATA%\Week UP\backups`, verify database integrity first, and confirm the data directory still contains the active database.

- [ ] **Step 5: Smoke test the runtime**

Start the current release on an alternate port with a temporary data root, request `/api/state`, and stop it. Confirm HTTP success without a `node_modules` directory in the release.

- [ ] **Step 6: Commit and publish**

Commit the implementation, fast-forward remote `main`, and verify local/remote hashes match.
