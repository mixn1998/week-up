import assert from "node:assert/strict";
import test from "node:test";

import { buildDailyAwarenessSnapshot } from "../lib/awareness.ts";
import { createEmptyWeekUpState, dispatchWeekUp, migrateWeekUpState } from "../lib/week-up-domain.ts";
import { dueDailySettlementCommands, dueSettlementCommands } from "../lib/settlement-scheduler.ts";

function context(now = "2026-08-01T04:00:00.000Z") {
  let sequence = 0;
  return { now: () => now, id: (prefix) => `${prefix}-${++sequence}` };
}

function thought(id, occurredAt, content = id) {
  return {
    id, kind: "thought", localDate: occurredAt.slice(0, 10), occurredAt, content,
    createdAt: occurredAt, updatedAt: occurredAt, settlementState: "open",
  };
}

test("daily awareness snapshot preserves sparse same-day event order without inventing averages", () => {
  const snapshot = buildDailyAwarenessSnapshot([
    thought("b", "2026-07-31T13:00:00.000Z"),
    thought("a", "2026-07-31T09:00:00.000Z"),
    {
      id: "e", kind: "emotion", localDate: "2026-07-31", occurredAt: "2026-07-31T10:00:00.000Z",
      level: 5, reason: "灵感爆发", createdAt: "2026-07-31T10:00:00.000Z",
      updatedAt: "2026-07-31T10:00:00.000Z", settlementState: "open",
    },
  ], "2026-07-31", "snapshot-1", "2026-08-01T00:00:00.000Z");
  assert.deepEqual(snapshot.thoughtEntryIds, ["a", "b"]);
  assert.deepEqual(snapshot.emotionEntryIds, ["e"]);
  assert.equal(snapshot.emotionSummary.recordedEventCount, 1);
  assert.equal("averageLevel" in snapshot.emotionSummary, false);
  assert.equal(buildDailyAwarenessSnapshot([], "2026-07-31", "empty", "2026-08-01T00:00:00.000Z"), undefined);
});

test("awareness-only past dates receive one daily settlement and freeze their original events", () => {
  let state = createEmptyWeekUpState();
  state = dispatchWeekUp(state, {
    type: "awareness.thought.record",
    content: "值得留下的想法",
    occurredAt: "2026-07-30T08:00:00.000Z",
  }, context("2026-07-30T08:00:00.000Z")).state;
  assert.deepEqual(dueDailySettlementCommands(state, "2026-07-31T04:00:00.000Z"), [
    { type: "daily-settlement.generate", localDate: "2026-07-30" },
  ]);
  state = dispatchWeekUp(state, { type: "daily-settlement.generate", localDate: "2026-07-30" }, context("2026-07-31T04:00:00.000Z")).state;
  assert.equal(state.dailyAwarenessSnapshots.length, 1);
  assert.equal(state.awarenessEntries[0].settlementState, "frozen");
  assert.throws(() => dispatchWeekUp(state, { type: "awareness.entry.remove", id: state.awarenessEntries[0].id }, context()), /awareness_entry_locked/);
});

test("same-day bursts remain separate while missing dates create no synthetic records", () => {
  let state = createEmptyWeekUpState();
  const ctx = context("2026-07-31T08:00:00.000Z");
  state = dispatchWeekUp(state, { type: "awareness.thought.record", content: "第一条", occurredAt: "2026-07-31T06:00:00.000Z" }, ctx).state;
  state = dispatchWeekUp(state, { type: "awareness.thought.record", content: "第二条", occurredAt: "2026-07-31T07:00:00.000Z" }, ctx).state;
  assert.equal(state.awarenessEntries.length, 2);
  assert.equal(state.dailyAwarenessSnapshots.length, 0);
  state = dispatchWeekUp(state, { type: "daily-settlement.generate", localDate: "2026-07-31" }, context("2026-08-01T04:00:00.000Z")).state;
  assert.deepEqual(state.dailyAwarenessSnapshots[0].thoughtDisplayBlocks.map((block) => block.content), ["第一条", "第二条"]);
  assert.equal(state.dailyAwarenessSnapshots.some((snapshot) => snapshot.localDate === "2026-07-30"), false);
});

test("historical analysis stores only a frozen mental baseline and never imports thought records", () => {
  const command = {
    type: "awareness.historical-baseline.record",
    source: {
      sourceKey: "thought-history:sha256:test",
      sourceName: "思想复盘历史数据.xlsx",
      recordCount: 110,
      recordedDateCount: 55,
      rangeStart: "2025-07-21",
      rangeEnd: "2026-07-31",
    },
    models: [{
      stableKey: "attention-control",
      name: "注意力主权",
      summary: "将注意力配置视为主体性实践。",
      triggers: ["失控"],
      assumptions: ["回应比控制结果更重要"],
      defaultResponses: ["先收束注意力"],
      currentStrategies: ["执行最小可行步骤"],
      supportingEntryIds: ["legacy-row-1"],
      counterEvidenceEntryIds: [],
      confidence: "high",
      changeType: "new",
    }],
    provider: "codex-cli",
    preferredProvider: "codex-cli",
    fallbackUsed: false,
  };
  let state = dispatchWeekUp(createEmptyWeekUpState(), command, context()).state;
  assert.equal(state.awarenessEntries.length, 0);
  assert.equal(state.mentalModelVersions.length, 1);
  assert.equal(state.mentalModelVersions[0].scope, "historical-baseline");
  assert.equal(state.mentalModelVersions[0].analysis.status, "ready");
  assert.equal(state.mentalModelVersions[0].historicalSource.recordCount, 110);
  assert.deepEqual(dueDailySettlementCommands(state, "2026-08-01T04:00:00.000Z"), []);
  assert.deepEqual(dueSettlementCommands(state, "2026-08-01T04:00:00.000Z"), []);
  state = dispatchWeekUp(state, command, context()).state;
  assert.equal(state.awarenessEntries.length, 0);
  assert.equal(state.mentalModelVersions.length, 1);
});

test("awareness-only elapsed periods schedule weekly and monthly settlement", () => {
  const state = {
    ...createEmptyWeekUpState(),
    awarenessEntries: [thought("t", "2026-06-15T09:00:00.000Z")],
  };
  const commands = dueSettlementCommands(state, "2026-08-01T04:00:00.000Z");
  assert.ok(commands.some((command) => command.type === "settlement.generate" && command.period === "week"));
  assert.ok(commands.some((command) => command.type === "settlement.generate" && command.period === "month"));
});

test("schema 22 migration adds empty awareness collections", () => {
  const legacy = { ...createEmptyWeekUpState(), schemaVersion: 22 };
  delete legacy.awarenessEntries;
  delete legacy.dailyAwarenessSnapshots;
  delete legacy.weeklyEmotionReviews;
  delete legacy.monthlyThoughtReviews;
  delete legacy.mentalModelVersions;
  const migrated = migrateWeekUpState(legacy);
  assert.equal(migrated.schemaVersion, 23);
  assert.deepEqual(migrated.awarenessEntries, []);
  assert.deepEqual(migrated.mentalModelVersions, []);
});
