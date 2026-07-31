import assert from "node:assert/strict";
import test from "node:test";

import { expandRecurrenceDates, recurrenceSummary } from "../src/lib/recurrence.ts";

test("expands bounded daily and interval recurrences", () => {
  assert.deepEqual(expandRecurrenceDates("2026-07-20", { kind: "daily", interval: 1, end: { mode: "count", count: 4 } }), ["2026-07-20", "2026-07-21", "2026-07-22", "2026-07-23"]);
  assert.deepEqual(expandRecurrenceDates("2026-07-20", { kind: "daily", interval: 3, end: { mode: "date", until: "2026-07-29" } }), ["2026-07-20", "2026-07-23", "2026-07-26", "2026-07-29"]);
});

test("expands selected weekly weekdays and caps generated records", () => {
  assert.deepEqual(expandRecurrenceDates("2026-07-20", { kind: "weekly", interval: 1, weekdays: [0, 2, 4], end: { mode: "count", count: 6 } }), ["2026-07-20", "2026-07-22", "2026-07-24", "2026-07-27", "2026-07-29", "2026-07-31"]);
  assert.equal(expandRecurrenceDates("2026-07-20", { kind: "daily", interval: 1, end: { mode: "count", count: 999 } }).length, 365);
  assert.equal(recurrenceSummary({ kind: "weekly", interval: 1, weekdays: [1, 3], end: { mode: "count", count: 8 } }), "每周 周二、周四 · 共 8 次");
});
