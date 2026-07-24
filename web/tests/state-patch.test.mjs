import assert from "node:assert/strict";
import test from "node:test";

import { applyWeekUpStatePatch, createWeekUpStatePatch } from "../lib/state-patch.ts";
import { createEmptyWeekUpState, dispatchWeekUp } from "../lib/week-up-domain.ts";

test("returns and applies only changed entities instead of the full state", () => {
  const context = { now: () => "2026-07-21T08:00:00.000Z", id: (prefix) => `${prefix}-1` };
  const current = createEmptyWeekUpState();
  const next = dispatchWeekUp(current, { type: "attribute.create", value: { name: "逻辑", icon: "node-link", color: "cyan", note: "", category: "智力", pinned: false } }, context).state;
  const patch = createWeekUpStatePatch(current, next);
  assert.equal(patch.revision, 1);
  assert.equal(patch.collections.attributes.upsert.length, 1);
  assert.equal(JSON.stringify(patch).includes('"plans"'), false);
  assert.deepEqual(applyWeekUpStatePatch(current, patch), next);
});

test("patches repeated Learning MORE lessons by schedule item instead of lesson id", () => {
  const context = { now: () => "2026-07-21T08:00:00.000Z", id: (prefix) => `${prefix}-1` };
  const current = createEmptyWeekUpState();
  const next = dispatchWeekUp(current, {
    type: "learning-more.import",
    courses: [{ courseId: "course-repeat", title: "Token", status: "active" }],
    lessons: [
      { courseId: "course-repeat", lessonId: "lesson-repeat", scheduleItemId: "schedule-a", scheduledDate: "2026-07-21", title: "Token 01", objective: "first", order: 0 },
      { courseId: "course-repeat", lessonId: "lesson-repeat", scheduleItemId: "schedule-b", scheduledDate: "2026-07-22", title: "Token 01", objective: "second", order: 1 },
    ],
    facts: [],
  }, context).state;

  const patch = createWeekUpStatePatch(current, next);
  const patched = applyWeekUpStatePatch(current, patch);

  assert.equal(patch.collections.learningMoreLessons.upsert.length, 2);
  assert.deepEqual(patched.learningMoreLessons.map((lesson) => [lesson.scheduleItemId, lesson.objective]), [["schedule-a", "first"], ["schedule-b", "second"]]);
});
