import assert from "node:assert/strict";
import test from "node:test";

import { isLearningMoreCourseBundlePlan, isLearningMoreCourseComplete, isLearningMoreCoursePlan, isWeeklyRepeatDayLocked, takeVisibleGroupedRows } from "../src/lib/weekly-action-visibility.ts";

test("locks only exact-daily recurrence cells after that date is frozen", () => {
  const frozenDates = new Set(["2026-07-29"]);
  const daily = { source: "week-up", recurrenceGroupId: "daily", recurrenceSummary: "每天 · 共 30 次" };
  const interval = { source: "week-up", recurrenceGroupId: "interval", recurrenceSummary: "每 2 天 · 共 15 次" };

  assert.equal(isWeeklyRepeatDayLocked(daily, "2026-07-29", frozenDates, false), true);
  assert.equal(isWeeklyRepeatDayLocked(daily, "2026-07-30", frozenDates, false), false);
  assert.equal(isWeeklyRepeatDayLocked(interval, "2026-07-29", frozenDates, false), false);
  assert.equal(isWeeklyRepeatDayLocked(daily, "2026-07-30", frozenDates, true), true);
});

test("merges completed, unscheduled, and overdue Learning MORE lessons into course bundles", () => {
  assert.equal(isLearningMoreCourseBundlePlan({ source: "learning-more", completed: true, overdue: false, timeStatus: "scheduled" }), true);
  assert.equal(isLearningMoreCourseBundlePlan({ source: "learning-more", completed: false, overdue: false, timeStatus: "unscheduled" }), true);
  assert.equal(isLearningMoreCourseBundlePlan({ source: "learning-more", completed: false, overdue: true, timeStatus: "scheduled" }), true);
});

test("keeps ordinary overdue plans and scheduled pending lessons out of course bundles", () => {
  assert.equal(isLearningMoreCourseBundlePlan({ source: "manual", completed: false, overdue: true, timeStatus: "scheduled" }), false);
  assert.equal(isLearningMoreCourseBundlePlan({ source: "learning-more", completed: false, overdue: false, timeStatus: "scheduled" }), false);
  assert.equal(isLearningMoreCoursePlan({ source: "learning-more", completed: false, overdue: false, timeStatus: "scheduled" }), true);
});

test("course completion is recalculated when Learning MORE adds another scheduled lesson", () => {
  const completedLesson = { source: "learning-more", completed: true, overdue: false, timeStatus: "scheduled" };
  const newlyScheduledLesson = { source: "learning-more", completed: false, overdue: false, timeStatus: "scheduled" };

  assert.equal(isLearningMoreCourseComplete([completedLesson]), true);
  assert.equal(isLearningMoreCourseComplete([completedLesson, newlyScheduledLesson]), false);
});

test("fills the second column when the same card group still has hidden entries", () => {
  const entries = [
    { id: "repeat-1", group: "open:recurring" },
    { id: "single-1", group: "open:single" },
    { id: "single-2", group: "open:single" },
    { id: "single-3", group: "open:single" },
    { id: "single-4", group: "open:single" },
    { id: "course-1", group: "open:course" },
    { id: "course-2", group: "open:course" },
    { id: "course-3", group: "open:course" },
    { id: "course-4", group: "open:course" },
    { id: "course-5", group: "open:course" },
  ];

  const visible = takeVisibleGroupedRows(entries, 8, 2, (entry) => entry.group);

  assert.deepEqual(visible.map((entry) => entry.id), [
    "repeat-1",
    "single-1", "single-2", "single-3", "single-4",
    "course-1", "course-2", "course-3", "course-4",
  ]);
});

test("does not borrow a card from a different group to fill a row", () => {
  const entries = [
    { id: "single-1", group: "open:single" },
    { id: "course-1", group: "open:course" },
  ];

  const visible = takeVisibleGroupedRows(entries, 1, 2, (entry) => entry.group);

  assert.deepEqual(visible.map((entry) => entry.id), ["single-1"]);
});
