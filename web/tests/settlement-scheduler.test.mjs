import assert from "node:assert/strict";
import test from "node:test";

import { createEmptyWeekUpState } from "../lib/week-up-domain.ts";
import { dueDailySettlementCommands, dueSettlementCommands } from "../lib/settlement-scheduler.ts";

test("opens weekly settlement at the following Monday and monthly settlement after month end", () => {
  const state = { ...createEmptyWeekUpState(), plans: [{
    id: "p1", title: "计划", detail: "", category: "", startAt: "2026-07-20T09:00:00+08:00", endAt: "2026-07-20T10:00:00+08:00",
    goalIds: [], rewards: [], source: "week-up", createdAt: "2026-07-20T00:00:00Z", updatedAt: "2026-07-20T00:00:00Z",
  }] };
  assert.deepEqual(dueSettlementCommands(state, "2026-07-26T15:59:59Z"), []);
  assert.deepEqual(dueSettlementCommands(state, "2026-07-26T16:00:00Z"), [{ type: "settlement.generate", period: "week", startDate: "2026-07-20", endDate: "2026-07-26" }]);
  assert.deepEqual(dueSettlementCommands(state, "2026-07-31T16:00:00Z"), [
    { type: "settlement.generate", period: "month", startDate: "2026-07-01", endDate: "2026-07-31" },
    { type: "settlement.generate", period: "week", startDate: "2026-07-20", endDate: "2026-07-26" },
  ]);
});

test("does not schedule a frozen period again", () => {
  const state = { ...createEmptyWeekUpState(), plans: [{
    id: "p1", title: "计划", detail: "", category: "", startAt: "2026-07-20T09:00:00+08:00", endAt: "2026-07-20T10:00:00+08:00",
    goalIds: [], rewards: [], source: "week-up", createdAt: "2026-07-20T00:00:00Z", updatedAt: "2026-07-20T00:00:00Z",
  }], settlements: [{ id: "s1", period: "week", startDate: "2026-07-20", endDate: "2026-07-26", generatedAt: "2026-07-27T00:00:00+08:00", completedPlanIds: [], incompletePlanIds: ["p1"], attributeGains: {}, reflection: "" }] };
  assert.deepEqual(dueSettlementCommands(state, "2026-07-27T00:00:00+08:00"), []);
});

test("freezes each elapsed plan day once", () => {
  const state = { ...createEmptyWeekUpState(), plans: [{
    id: "p1", title: "计划", detail: "", category: "", startAt: "2026-07-24T09:00:00+08:00", endAt: "2026-07-24T10:00:00+08:00",
    goalIds: [], rewards: [], rewardMode: "none", source: "week-up", createdAt: "2026-07-24T00:00:00Z", updatedAt: "2026-07-24T00:00:00Z",
  }] };
  assert.deepEqual(dueDailySettlementCommands(state, "2026-07-24T15:59:59Z"), []);
  assert.deepEqual(dueDailySettlementCommands(state, "2026-07-24T16:00:00Z"), [
    { type: "daily-settlement.generate", localDate: "2026-07-24" },
  ]);
  assert.deepEqual(dueDailySettlementCommands({
    ...state,
    dailySettlements: [{ id: "d1", localDate: "2026-07-24", settledAt: "2026-07-25T00:00:00+08:00", planIds: ["p1"], completedPlanIds: [] }],
  }, "2026-07-25T08:00:00+08:00"), []);
});
