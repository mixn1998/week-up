import assert from "node:assert/strict";
import { access, mkdtemp, rm, stat, utimes } from "node:fs/promises";
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

test("applies the completed-only weekly review migration after replaying old harvest events", async (t) => {
  const files = await fixture(t);
  let store = await createWeekUpDatabase(files.path);
  let state = store.dispatch(attributeCommand, { expectedRevision: 0, commandId: "attribute", occurredAt: "2026-07-20T08:00:00.000Z" });
  state = store.dispatch({
    type: "plan.create",
    value: {
      title: "完成行动",
      detail: "",
      category: "学习",
      startAt: "2026-07-20T09:00:00+08:00",
      endAt: "2026-07-20T10:00:00+08:00",
      goalIds: [],
      rewards: [{ attributeId: state.attributes[0].id, amount: 1 }],
    },
  }, { expectedRevision: state.revision, commandId: "plan", occurredAt: "2026-07-20T08:01:00.000Z" });
  state = store.dispatch({ type: "plan.complete", id: state.plans[0].id }, { expectedRevision: state.revision, commandId: "complete", occurredAt: "2026-07-20T10:00:00.000Z" });
  state = store.dispatch({ type: "settlement.generate", period: "week", startDate: "2026-07-20", endDate: "2026-07-26" }, { expectedRevision: state.revision, commandId: "settle", occurredAt: "2026-07-27T00:00:00.000Z" });
  state = store.dispatch({ type: "settlement.harvest.succeeded", id: state.settlements[0].id, text: "旧周报" }, { expectedRevision: state.revision, commandId: "harvest", occurredAt: "2026-07-27T00:01:00.000Z" });
  store.close();

  const database = new DatabaseSync(files.path);
  const snapshot = database.prepare("SELECT revision, state_json FROM week_up_snapshots ORDER BY revision DESC LIMIT 1").get();
  const oldState = { ...JSON.parse(snapshot.state_json), schemaVersion: 19 };
  database.prepare("UPDATE week_up_snapshots SET state_json = ? WHERE revision = ?").run(JSON.stringify(oldState), snapshot.revision);
  database.close();

  store = await createWeekUpDatabase(files.path);
  assert.equal(store.load().schemaVersion, 22);
  assert.equal(store.load().settlements[0].harvest.status, "stale");
  assert.equal(store.load().settlements[0].harvest.text, "旧周报");
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

test("compresses historical backups and limits migration residues without touching user data", async (t) => {
  const files = await fixture(t);
  const store = await createWeekUpDatabase(files.path);
  const backupDirectory = join(files.directory, "backups");
  const protectedData = join(files.directory, "user-data.sqlite");
  await store.backupTo(protectedData);

  await maintainBackups(store, backupDirectory, new Date("2026-07-20T00:00:00.000Z"));
  await maintainBackups(store, backupDirectory, new Date("2026-07-21T00:00:00.000Z"));
  await Promise.all([
    store.backupTo(join(backupDirectory, "pre-schema-20-old.sqlite")),
    store.backupTo(join(backupDirectory, "pre-schema-21-middle.sqlite")),
    store.backupTo(join(backupDirectory, "pre-schema-22-new.sqlite")),
  ]);
  await Promise.all([
    utimes(join(backupDirectory, "pre-schema-20-old.sqlite"), new Date("2026-07-18"), new Date("2026-07-18")),
    utimes(join(backupDirectory, "pre-schema-21-middle.sqlite"), new Date("2026-07-19"), new Date("2026-07-19")),
    utimes(join(backupDirectory, "pre-schema-22-new.sqlite"), new Date("2026-07-20"), new Date("2026-07-20")),
  ]);

  await maintainBackups(store, backupDirectory, new Date("2026-07-22T00:00:00.000Z"));

  assert.equal((await stat(join(backupDirectory, "week-up-2026-07-22.sqlite"))).isFile(), true);
  assert.equal((await stat(join(backupDirectory, "week-up-2026-07-21.sqlite.gz"))).isFile(), true);
  await assert.rejects(access(join(backupDirectory, "week-up-2026-07-21.sqlite")));
  await assert.rejects(access(join(backupDirectory, "pre-schema-20-old.sqlite")));
  assert.equal((await stat(join(backupDirectory, "pre-schema-21-middle.sqlite.gz"))).isFile(), true);
  assert.equal((await stat(join(backupDirectory, "pre-schema-22-new.sqlite"))).isFile(), true);
  assert.equal((await stat(protectedData)).isFile(), true);
  store.close();
});
