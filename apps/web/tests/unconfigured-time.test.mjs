import assert from "node:assert/strict";
import test from "node:test";

import { selectUnconfiguredPlansForDate } from "../src/lib/unconfigured-time.ts";

function plan(id, overrides = {}) {
  return {
    id,
    title: id,
    detail: "",
    start: "时间未配置",
    end: "",
    scheduledDate: "2026-07-25",
    timeStatus: "unscheduled",
    category: "学习",
    categoryColor: "#fff",
    categoryTextColor: "#000",
    completed: false,
    rewards: [],
    ...overrides,
  };
}

test("counts only untimed completed work for a settled date", () => {
  const scheduled = [
    plan("unfinished"),
    plan("overdue", { overdue: true }),
    plan("completed-schedule", { completed: true }),
  ];
  const completions = [
    plan("untimed-completion", { completed: true }),
    plan("timed-completion", { completed: true, timeStatus: "scheduled", start: "09:00", end: "10:00" }),
  ];

  assert.deepEqual(
    selectUnconfiguredPlansForDate("2026-07-25", scheduled, completions, new Set(["2026-07-25"])).map((item) => item.id),
    ["untimed-completion"],
  );
});

test("counts every unconfigured plan for an unsettled date", () => {
  const scheduled = [
    plan("unfinished", { scheduledDate: "2026-07-26" }),
    plan("completed", { scheduledDate: "2026-07-26", completed: true }),
    plan("timed", { scheduledDate: "2026-07-26", timeStatus: "scheduled", start: "09:00", end: "10:00" }),
  ];

  assert.deepEqual(
    selectUnconfiguredPlansForDate("2026-07-26", scheduled, [], new Set()).map((item) => item.id),
    ["unfinished", "completed"],
  );
});
