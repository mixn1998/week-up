import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { access, mkdir, readdir, rename, stat, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";

import { createEmptyWeekUpState, dispatchWeekUp, migrateWeekUpState, upgradeWeeklyReviewSettlements, WEEK_UP_SCHEMA_VERSION } from "../src/lib/week-up-domain.ts";
import { createLearningMoreDelta } from "../src/lib/learning-more-delta.ts";
import { createWeekUpStatePatch } from "../src/lib/state-patch.ts";

const SNAPSHOT_INTERVAL = 50;
const HYBRID_MODEL_VERSION = "2";

function parseState(value) {
  return migrateWeekUpState(JSON.parse(value));
}

function deterministicContext(eventId, occurredAt) {
  let sequence = 0;
  return {
    now: () => occurredAt,
    id: (prefix) => `${prefix}-${eventId}-${++sequence}`,
  };
}

function canSkipDeletedPlanReplayError(error, command) {
  if (!(error instanceof Error) || error.message !== "plan_not_found") return false;
  return [
    "plan.complete",
    "plan.undo",
    "plan.segment.complete",
    "plan.segment.undo",
    "plan.update",
    "plan.remove",
  ].includes(command?.type);
}

export async function createWeekUpDatabase(databasePath) {
  await mkdir(dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS week_up_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL UNIQUE,
      expected_revision INTEGER NOT NULL,
      result_revision INTEGER NOT NULL,
      occurred_at TEXT NOT NULL,
      command_json TEXT NOT NULL,
      changed INTEGER NOT NULL CHECK (changed IN (0, 1))
    );
    CREATE INDEX IF NOT EXISTS week_up_events_revision_idx
      ON week_up_events(result_revision);
    CREATE TABLE IF NOT EXISTS week_up_snapshots (
      revision INTEGER PRIMARY KEY,
      created_at TEXT NOT NULL,
      state_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS week_up_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS week_up_plan_archive (
      plan_id TEXT PRIMARY KEY,
      scheduled_date TEXT NOT NULL,
      archived_at TEXT NOT NULL,
      plan_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS week_up_plan_archive_date_idx
      ON week_up_plan_archive(scheduled_date);
    CREATE TABLE IF NOT EXISTS week_up_plan_read (
      plan_id TEXT PRIMARY KEY,
      scheduled_date TEXT NOT NULL,
      plan_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS week_up_plan_read_date_idx
      ON week_up_plan_read(scheduled_date);
  `);

  const snapshotCount = database.prepare("SELECT COUNT(*) AS count FROM week_up_snapshots").get().count;
  if (snapshotCount === 0) {
    const state = createEmptyWeekUpState();
    database.prepare("INSERT INTO week_up_snapshots(revision, created_at, state_json) VALUES (?, ?, ?)")
      .run(0, new Date().toISOString(), JSON.stringify(state));
  }

  function replayLoad() {
    const snapshot = database.prepare("SELECT revision, state_json FROM week_up_snapshots ORDER BY revision DESC LIMIT 1").get();
    let state = parseState(snapshot.state_json);
    const events = database.prepare(`
      SELECT event_id, result_revision, occurred_at, command_json
      FROM week_up_events
      WHERE changed = 1 AND result_revision > ?
      ORDER BY sequence ASC
    `).all(snapshot.revision);
    for (const event of events) {
      const command = JSON.parse(event.command_json);
      try {
        const outcome = dispatchWeekUp(state, command, deterministicContext(event.event_id, event.occurred_at));
        if (!outcome.changed) throw new Error(`event_replay_failed:${event.event_id}`);
        state = outcome.state;
      } catch (error) {
        if (!canSkipDeletedPlanReplayError(error, command)) throw error;
        state = { ...state, revision: event.result_revision };
      }
    }
    return state;
  }

  let currentState = replayLoad();

  function storeArchivedPlans(plans, archivedAt) {
    const insert = database.prepare(`
      INSERT OR REPLACE INTO week_up_plan_archive(plan_id, scheduled_date, archived_at, plan_json)
      VALUES (?, ?, ?, ?)
    `);
    for (const plan of plans) insert.run(plan.id, plan.startAt.slice(0, 10), archivedAt, JSON.stringify(plan));
  }

  function rebuildPlanReadModel(state) {
    database.prepare("DELETE FROM week_up_plan_read").run();
    const insert = database.prepare("INSERT INTO week_up_plan_read(plan_id, scheduled_date, plan_json) VALUES (?, ?, ?)");
    for (const plan of state.plans) insert.run(plan.id, plan.startAt.slice(0, 10), JSON.stringify(plan));
  }

  function updatePlanReadModel(previous, next, occurredAt) {
    if (previous.plans === next.plans) return next;
    const activePlans = next.plans.filter((plan) => plan.removedAt === undefined);
    const removedPlans = next.plans.filter((plan) => plan.removedAt !== undefined);
    const activeIds = new Set(activePlans.map((plan) => plan.id));
    const previousPlans = new Map(previous.plans.map((plan) => [plan.id, plan]));
    const remove = database.prepare("DELETE FROM week_up_plan_read WHERE plan_id = ?");
    const removeArchived = database.prepare("DELETE FROM week_up_plan_archive WHERE plan_id = ?");
    for (const id of previousPlans.keys()) if (!activeIds.has(id)) { remove.run(id); removeArchived.run(id); }
    const upsert = database.prepare(`
      INSERT INTO week_up_plan_read(plan_id, scheduled_date, plan_json) VALUES (?, ?, ?)
      ON CONFLICT(plan_id) DO UPDATE SET scheduled_date = excluded.scheduled_date, plan_json = excluded.plan_json
    `);
    for (const plan of activePlans) if (previousPlans.get(plan.id) !== plan) upsert.run(plan.id, plan.startAt.slice(0, 10), JSON.stringify(plan));
    return removedPlans.length ? { ...next, plans: activePlans } : next;
  }

  const hybridVersion = database.prepare("SELECT value FROM week_up_meta WHERE key = 'hybrid_model_version'").get()?.value;
  const persistedSchemaVersion = JSON.parse(database.prepare("SELECT state_json FROM week_up_snapshots ORDER BY revision DESC LIMIT 1").get().state_json).schemaVersion;
  let migrationBackupPath;
  if (hybridVersion !== HYBRID_MODEL_VERSION || persistedSchemaVersion !== WEEK_UP_SCHEMA_VERSION) {
    currentState = {
      ...currentState,
      schemaVersion: WEEK_UP_SCHEMA_VERSION,
      settlements: upgradeWeeklyReviewSettlements(currentState.settlements, persistedSchemaVersion, currentState),
    };
    const eventCount = database.prepare("SELECT COUNT(*) AS count FROM week_up_events").get().count;
    if (currentState.revision > 0 || eventCount > 0) {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const backupPrefix = hybridVersion !== HYBRID_MODEL_VERSION ? "pre-hybrid" : `pre-schema-${WEEK_UP_SCHEMA_VERSION}`;
      migrationBackupPath = join(dirname(dirname(databasePath)), "backups", `${backupPrefix}-${stamp}.sqlite`);
      await mkdir(dirname(migrationBackupPath), { recursive: true });
      await backup(database, migrationBackupPath);
    }
    const migratedAt = new Date().toISOString();
    database.exec("BEGIN IMMEDIATE");
    try {
      const removedPlans = currentState.plans.filter((plan) => plan.removedAt !== undefined);
      currentState = removedPlans.length ? { ...currentState, plans: currentState.plans.filter((plan) => plan.removedAt === undefined) } : currentState;
      database.prepare("DELETE FROM week_up_plan_archive").run();
      database.prepare("DELETE FROM week_up_snapshots").run();
      writeSnapshot(currentState, migratedAt);
      rebuildPlanReadModel(currentState);
      database.prepare("DELETE FROM week_up_events").run();
      database.prepare("INSERT OR REPLACE INTO week_up_meta(key, value) VALUES ('hybrid_model_version', ?)").run(HYBRID_MODEL_VERSION);
      database.prepare("INSERT OR REPLACE INTO week_up_meta(key, value) VALUES ('hybrid_migrated_at', ?)").run(migratedAt);
      if (migrationBackupPath) database.prepare("INSERT OR REPLACE INTO week_up_meta(key, value) VALUES ('hybrid_backup_path', ?)").run(migrationBackupPath);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
    if (eventCount > 100) {
      database.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      database.exec("VACUUM");
    }
  } else {
    database.exec("BEGIN IMMEDIATE");
    try {
      const replayRemoved = currentState.plans.filter((plan) => plan.removedAt !== undefined);
      if (replayRemoved.length) {
        currentState = { ...currentState, plans: currentState.plans.filter((plan) => plan.removedAt === undefined) };
      }
      database.prepare("DELETE FROM week_up_plan_archive").run();
      rebuildPlanReadModel(currentState);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  function load() {
    return currentState;
  }

  function writeSnapshot(state, createdAt) {
    database.prepare("INSERT OR REPLACE INTO week_up_snapshots(revision, created_at, state_json) VALUES (?, ?, ?)")
      .run(state.revision, createdAt, JSON.stringify(state));
    database.prepare("DELETE FROM week_up_snapshots WHERE revision < ? AND revision NOT IN (SELECT revision FROM week_up_snapshots ORDER BY revision DESC LIMIT 3)")
      .run(state.revision - SNAPSHOT_INTERVAL * 3);
  }

  function execute(command, { expectedRevision, commandId = randomUUID(), occurredAt = new Date().toISOString() }) {
    const duplicate = database.prepare("SELECT result_revision FROM week_up_events WHERE event_id = ?").get(commandId);
    if (duplicate) return { state: currentState, patch: { revision: currentState.revision }, changed: false };
    database.exec("BEGIN IMMEDIATE");
    try {
      const current = currentState;
      if (current.revision !== expectedRevision) {
        const error = new Error("revision_conflict");
        error.code = "REVISION_CONFLICT";
        error.currentState = current;
        throw error;
      }
      const resolvedCommand = command.type === "learning-more.import" && !command.incremental && Array.isArray(command.courses) && Array.isArray(command.lessons)
        ? createLearningMoreDelta(current, command)
        : command;
      if (resolvedCommand === undefined) {
        database.exec("COMMIT");
        return { state: current, patch: { revision: current.revision }, changed: false };
      }
      const commandToApply = resolvedCommand === command ? command : { type: "learning-more.import", ...resolvedCommand };
      const outcome = dispatchWeekUp(current, commandToApply, deterministicContext(commandId, occurredAt));
      if (!outcome.changed) {
        database.exec("COMMIT");
        return { state: current, patch: { revision: current.revision }, changed: false };
      }
      database.prepare(`
        INSERT INTO week_up_events(event_id, expected_revision, result_revision, occurred_at, command_json, changed)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(commandId, expectedRevision, outcome.state.revision, occurredAt, JSON.stringify(commandToApply), 1);
      const compactedState = outcome.changed ? updatePlanReadModel(current, outcome.state, occurredAt) : outcome.state;
      if (outcome.changed && compactedState.revision % SNAPSHOT_INTERVAL === 0) writeSnapshot(compactedState, occurredAt);
      database.exec("COMMIT");
      currentState = compactedState;
      return { state: currentState, patch: createWeekUpStatePatch(current, currentState), changed: outcome.changed };
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  function dispatch(command, options) {
    return execute(command, options).state;
  }

  function migrate(state) {
    const candidate = migrateWeekUpState(state);
    database.exec("BEGIN IMMEDIATE");
    try {
      const current = load();
      const eventCount = database.prepare("SELECT COUNT(*) AS count FROM week_up_events").get().count;
      if (current.revision !== 0 || eventCount !== 0) {
        const error = new Error("migration_target_not_empty");
        error.code = "MIGRATION_TARGET_NOT_EMPTY";
        error.currentState = current;
        throw error;
      }
      database.prepare("DELETE FROM week_up_snapshots").run();
      writeSnapshot(candidate, new Date().toISOString());
      database.prepare("INSERT OR REPLACE INTO week_up_meta(key, value) VALUES ('browser_migrated_at', ?)")
        .run(new Date().toISOString());
      database.exec("COMMIT");
      currentState = candidate;
      return candidate;
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  function replace(state) {
    const candidate = migrateWeekUpState(state);
    database.exec("BEGIN IMMEDIATE");
    try {
      database.prepare("DELETE FROM week_up_events").run();
      database.prepare("DELETE FROM week_up_snapshots").run();
      database.prepare("DELETE FROM week_up_plan_archive").run();
      database.prepare("DELETE FROM week_up_plan_read").run();
      writeSnapshot(candidate, new Date().toISOString());
      rebuildPlanReadModel(candidate);
      database.prepare("INSERT OR REPLACE INTO week_up_meta(key, value) VALUES ('restored_at', ?)")
        .run(new Date().toISOString());
      database.exec("COMMIT");
      currentState = candidate;
      return candidate;
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  function integrityCheck() {
    return database.prepare("PRAGMA integrity_check").get().integrity_check === "ok";
  }

  function loadPlansRange(from, to, includeArchived = false) {
    const active = database.prepare(`SELECT plan_json FROM week_up_plan_read WHERE scheduled_date >= ? AND scheduled_date <= ? ORDER BY scheduled_date, plan_id`).all(from, to).map((row) => JSON.parse(row.plan_json));
    if (!includeArchived) return active;
    const archived = database.prepare(`SELECT plan_json FROM week_up_plan_archive WHERE scheduled_date >= ? AND scheduled_date <= ? ORDER BY scheduled_date, plan_id`).all(from, to).map((row) => JSON.parse(row.plan_json));
    return [...active, ...archived].sort((left, right) => left.startAt.localeCompare(right.startAt) || left.id.localeCompare(right.id));
  }

  return {
    load,
    dispatch,
    dispatchChange: execute,
    loadPlansRange,
    migrate,
    replace,
    integrityCheck,
    async backupTo(path) { await mkdir(dirname(path), { recursive: true }); await backup(database, path); },
    checkpoint() { database.exec("PRAGMA wal_checkpoint(TRUNCATE)"); },
    close() { database.close(); },
    path: databasePath,
    migrationBackupPath,
  };
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function compressBackup(path) {
  const target = `${path}.gz`;
  if (await fileExists(target)) {
    await unlink(path);
    return target;
  }
  const temporary = `${target}.tmp-${randomUUID()}`;
  try {
    await pipeline(createReadStream(path), createGzip({ level: 9 }), createWriteStream(temporary, { flags: "wx" }));
    await rename(temporary, target);
    await unlink(path);
    return target;
  } catch (error) {
    if (await fileExists(temporary)) await unlink(temporary);
    throw error;
  }
}

function dailyBackupDate(name) {
  return /^week-up-(\d{4}-\d{2}-\d{2})\.sqlite(?:\.gz)?$/.exec(name)?.[1];
}

function migrationBackupBase(name) {
  return /^(pre-.+\.sqlite)(?:\.gz)?$/.exec(name)?.[1];
}

function migrationBackupCreatedAt(base) {
  const match = /-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z\.sqlite$/.exec(base);
  if (!match) return undefined;
  return Date.parse(`${match[1]}T${match[2]}:${match[3]}:${match[4]}.${match[5]}Z`);
}

export async function maintainBackups(store, backupDirectory, now = new Date()) {
  if (!store.integrityCheck()) throw new Error("sqlite_integrity_check_failed");
  await mkdir(backupDirectory, { recursive: true });
  const stamp = now.toISOString().slice(0, 10);
  const target = join(backupDirectory, `week-up-${stamp}.sqlite`);
  await store.backupTo(target);
  store.checkpoint();
  const entries = (await readdir(backupDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);
  const dailyGroups = new Map();
  for (const name of entries) {
    const date = dailyBackupDate(name);
    if (!date) continue;
    const group = dailyGroups.get(date) ?? [];
    group.push(name);
    dailyGroups.set(date, group);
  }
  const dailyDates = [...dailyGroups.keys()].sort().reverse();
  const recentDailyDates = dailyDates.slice(0, 7);
  const olderWeeklyDates = dailyDates
    .slice(7)
    .filter((date) => new Date(`${date}T00:00:00Z`).getUTCDay() === 1)
    .slice(0, 4);
  const keptDailyDates = new Set([...recentDailyDates, ...olderWeeklyDates]);
  for (const [date, names] of dailyGroups) {
    if (!keptDailyDates.has(date)) {
      for (const name of names) await unlink(join(backupDirectory, name));
      continue;
    }
    const sqliteName = `week-up-${date}.sqlite`;
    const gzipName = `${sqliteName}.gz`;
    if (date === stamp) {
      if (await fileExists(join(backupDirectory, gzipName))) await unlink(join(backupDirectory, gzipName));
    } else if (await fileExists(join(backupDirectory, sqliteName))) {
      await compressBackup(join(backupDirectory, sqliteName));
    }
  }

  const migrationGroups = new Map();
  for (const name of entries) {
    const base = migrationBackupBase(name);
    if (!base) continue;
    const group = migrationGroups.get(base) ?? [];
    group.push(name);
    migrationGroups.set(base, group);
  }
  const migrations = await Promise.all([...migrationGroups].map(async ([base, names]) => {
    const modifiedAt = Math.max(...await Promise.all(names.map(async (name) => (await stat(join(backupDirectory, name))).mtimeMs)));
    return { names, sortAt: migrationBackupCreatedAt(base) ?? modifiedAt };
  }));
  migrations.sort((left, right) => right.sortAt - left.sortAt);
  for (const [index, migration] of migrations.entries()) {
    if (index >= 1) {
      for (const name of migration.names) await unlink(join(backupDirectory, name));
    }
  }
  return target;
}
