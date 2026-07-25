import assert from "node:assert/strict";
import test from "node:test";

import { summarizeWeekRouteDay } from "../lib/week-route-summary.ts";

test("an overdue incomplete plan keeps the day from being marked complete", () => {
  const summary = summarizeWeekRouteDay([
    ...Array.from({ length: 6 }, () => ({ completed: true, overdue: false })),
    { completed: false, overdue: true },
  ]);

  assert.deepEqual(summary, {
    completed: 6,
    total: 7,
    progress: 86,
    lit: false,
    label: "6/7 完成",
  });
});

test("a day is lit only when every scheduled plan is complete", () => {
  const summary = summarizeWeekRouteDay([
    { completed: true, overdue: false },
    { completed: true, overdue: false },
  ]);

  assert.deepEqual(summary, {
    completed: 2,
    total: 2,
    progress: 100,
    lit: true,
    label: "2/2 完成",
  });
});

test("uses the frozen daily settlement after current plans are rescheduled", () => {
  const summary = summarizeWeekRouteDay(
    Array.from({ length: 6 }, () => ({ completed: true })),
    { planIds: ["p1", "p2", "p3", "p4", "p5", "p6", "p7"], completedPlanIds: ["p1", "p2", "p3", "p4", "p5", "p6"] },
  );
  assert.equal(summary.total, 7);
  assert.equal(summary.completed, 6);
  assert.equal(summary.progress, 86);
  assert.equal(summary.lit, false);
});
