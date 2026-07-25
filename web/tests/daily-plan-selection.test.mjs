import assert from "node:assert/strict";
import test from "node:test";

import { selectDailyPlans } from "../lib/daily-plan-selection.ts";

const plan = (overrides = {}) => ({
  id: "plan",
  scheduledDate: "2026-07-22",
  title: "行动",
  detail: "",
  start: "09:00",
  end: "10:00",
  category: "默认",
  categoryColor: "#fff",
  categoryTextColor: "#000",
  completed: false,
  rewards: [],
  ...overrides,
});

test("selects today's plans by exact local date instead of matching historical weekday", () => {
  const current = plan({ id: "today", scheduledDate: "2026-07-22", dayIndex: 2 });
  const historical = plan({ id: "history", scheduledDate: "2026-07-15", dayIndex: 2, overdue: true });

  const result = selectDailyPlans([current, historical], "2026-07-22", 2);

  assert.deepEqual(result.todayPlans.map((item) => item.id), ["today"]);
  assert.deepEqual(result.overduePlans.map((item) => item.id), ["history"]);
});

test("only exposes unresolved overdue plans for daily rescheduling", () => {
  const unresolved = plan({ id: "unresolved", scheduledDate: "2026-07-20", overdue: true });
  const carried = plan({ id: "carried", scheduledDate: "2026-07-19", overdue: true, overdueRescheduled: true });
  const completed = plan({ id: "completed", scheduledDate: "2026-07-18", overdue: true, completed: true });

  const result = selectDailyPlans([unresolved, carried, completed], "2026-07-22", 2);

  assert.deepEqual(result.overduePlans.map((item) => item.id), ["unresolved"]);
});

test("daily recurrence misses stay on their original day and never enter the overdue queue", () => {
  const dailyMiss = plan({
    id: "daily-miss",
    scheduledDate: "2026-07-20",
    overdue: true,
    recurrenceGroupId: "daily-series",
    recurrenceSummary: "每天 · 共 30 次",
  });
  const intervalMiss = plan({
    id: "interval-miss",
    scheduledDate: "2026-07-20",
    overdue: true,
    recurrenceGroupId: "interval-series",
    recurrenceSummary: "每 2 天 · 共 15 次",
  });

  const result = selectDailyPlans([dailyMiss, intervalMiss], "2026-07-22", 2);

  assert.deepEqual(result.overduePlans.map((item) => item.id), ["interval-miss"]);
});
