import assert from "node:assert/strict";
import test from "node:test";

import { createLearningMoreDelta } from "../lib/learning-more-delta.ts";
import { createEmptyWeekUpState, dispatchWeekUp } from "../lib/week-up-domain.ts";

function context() {
  let sequence = 0;
  return { now: () => "2026-07-21T08:00:00.000Z", id: (prefix) => `${prefix}-${++sequence}` };
}

const course = { courseId: "course-1", title: "概率论", status: "active" };
const lesson = { courseId: "course-1", lessonId: "lesson-1", scheduleItemId: "schedule-1", scheduledDate: "2026-07-21", title: "条件概率", objective: "完成例题", order: 0 };

test("does not create an import command when Learning MORE content is unchanged", () => {
  const imported = dispatchWeekUp(createEmptyWeekUpState(), { type: "learning-more.import", courses: [course], lessons: [lesson], facts: [], nextCursor: "cursor-1" }, context()).state;
  assert.equal(createLearningMoreDelta(imported, { courses: [course], lessons: [lesson], facts: [], nextCursor: "cursor-1" }), undefined);
});

test("emits only changed and removed Learning MORE records", () => {
  const imported = dispatchWeekUp(createEmptyWeekUpState(), { type: "learning-more.import", courses: [course], lessons: [lesson], facts: [], nextCursor: "cursor-1" }, context()).state;
  const changedCourse = { ...course, title: "概率论进阶" };
  const delta = createLearningMoreDelta(imported, { courses: [changedCourse], lessons: [], facts: [], nextCursor: "cursor-2" });
  assert.deepEqual(delta?.courses, [changedCourse]);
  assert.deepEqual(delta?.removedLessonIds, ["lesson-1"]);
  assert.equal(delta?.lessons, undefined);
  assert.equal(delta?.incremental, true);
});

test("ignores a repeated completion fact once the lesson is already completed", () => {
  const imported = dispatchWeekUp(createEmptyWeekUpState(), { type: "learning-more.import", courses: [course], lessons: [lesson], facts: [], nextCursor: "cursor-1" }, context()).state;
  const completed = {
    ...imported,
    learningMoreLessons: imported.learningMoreLessons.map((item) => item.lessonId === lesson.lessonId
      ? { ...item, completedAt: "2026-07-21T09:00:00.000Z" }
      : item),
  };
  const fact = {
    type: "lesson-completed",
    factId: "calendar-completed:2026-07-21:lesson-1",
    courseId: course.courseId,
    lessonId: lesson.lessonId,
    occurredAt: "2026-07-21T09:00:00.000Z",
  };

  assert.equal(createLearningMoreDelta(completed, { courses: [course], lessons: [lesson], facts: [fact], nextCursor: "cursor-1" }), undefined);
});
