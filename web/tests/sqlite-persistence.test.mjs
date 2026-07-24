import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { createWeekUpDatabase, maintainBackups } from "../server/week-up-database.mjs";

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "week-up-sqlite-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return { directory, path: join(directory, "week-up.sqlite") };
}

const attributeCommand = { type: "attribute.create", value: { name: "专注", icon: "◆", color: "cyan", note: "", category: "未分类", pinned: false } };

test("persists command results across SQLite restarts", async (t) => {
  const files = await fixture(t);
  let store = await createWeekUpDatabase(files.path);
  const saved = store.dispatch(attributeCommand, { expectedRevision: 0, commandId: "command-1", occurredAt: "2026-07-20T08:00:00.000Z" });
  assert.equal(saved.revision, 1);
  store.close();
  store = await createWeekUpDatabase(files.path);
  assert.equal(store.load().attributes[0].name, "专注");
  assert.equal(store.integrityCheck(), true);
  store.close();
});

test("makes command ids idempotent and rejects stale revisions", async (t) => {
  const files = await fixture(t);
  const store = await createWeekUpDatabase(files.path);
  store.dispatch(attributeCommand, { expectedRevision: 0, commandId: "command-1", occurredAt: "2026-07-20T08:00:00.000Z" });
  const duplicate = store.dispatch(attributeCommand, { expectedRevision: 0, commandId: "command-1", occurredAt: "2026-07-20T08:00:00.000Z" });
  assert.equal(duplicate.attributes.length, 1);
  assert.throws(() => store.dispatch(attributeCommand, { expectedRevision: 0, commandId: "command-2", occurredAt: "2026-07-20T08:01:00.000Z" }), /revision_conflict/);
  store.close();
});

test("replays past completion events for permanently removed plans as inert history", async (t) => {
  const files = await fixture(t);
  let store = await createWeekUpDatabase(files.path);
  store.dispatch(attributeCommand, { expectedRevision: 0, commandId: "command-1", occurredAt: "2026-07-20T08:00:00.000Z" });
  store.close();

  const database = new DatabaseSync(files.path);
  database.prepare(`
    INSERT INTO week_up_events(event_id, expected_revision, result_revision, occurred_at, command_json, changed)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run("legacy-complete-deleted-plan", 1, 2, "2026-07-20T09:00:00.000Z", JSON.stringify({ type: "plan.complete", id: "deleted-plan" }), 1);
  database.close();

  store = await createWeekUpDatabase(files.path);
  assert.equal(store.load().revision, 2);
  assert.equal(store.load().attributes.length, 1);
  store.close();
});

test("imports an existing browser archive only into an empty database", async (t) => {
  const files = await fixture(t);
  const store = await createWeekUpDatabase(files.path);
  const source = { ...store.load(), revision: 7, attributes: [{ id: "legacy", name: "耐力", icon: "◇", color: "mint", note: "", category: "未分类", pinned: false, createdAt: "2026-07-01T00:00:00.000Z" }] };
  const migrated = store.migrate(source);
  assert.equal(migrated.revision, 7);
  assert.equal(store.load().attributes[0].name, "耐力");
  assert.throws(() => store.migrate(source), /migration_target_not_empty/);
  store.close();
});

test("creates a verified daily backup", async (t) => {
  const files = await fixture(t);
  const store = await createWeekUpDatabase(files.path);
  const target = await maintainBackups(store, join(files.directory, "backups"), new Date("2026-07-20T00:00:00.000Z"));
  store.dispatch({ type: "weight.target", valueKg: 55 }, { expectedRevision: 0, commandId: "after-first-backup" });
  await maintainBackups(store, join(files.directory, "backups"), new Date("2026-07-20T06:00:00.000Z"));
  const backupStore = await createWeekUpDatabase(target);
  assert.equal(backupStore.integrityCheck(), true);
  assert.equal(backupStore.load().preferences.targetWeightKg, 55);
  backupStore.close();
  store.close();
});
