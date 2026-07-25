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

test("diffs Learning MORE lessons by schedule item so repeated lesson ids can be rescheduled", () => {
  const imported = dispatchWeekUp(createEmptyWeekUpState(), {
    type: "learning-more.import",
    courses: [course],
    lessons: [
      { ...lesson, lessonId: "same-lesson", scheduleItemId: "schedule-old", objective: "old" },
      { ...lesson, lessonId: "same-lesson", scheduleItemId: "schedule-keep", objective: "keep", order: 1 },
    ],
    facts: [],
    nextCursor: "cursor-1",
  }, context()).state;
  const delta = createLearningMoreDelta(imported, {
    courses: [course],
    lessons: [
      { ...lesson, lessonId: "same-lesson", scheduleItemId: "schedule-keep", objective: "keep updated", order: 0 },
      { ...lesson, lessonId: "same-lesson", scheduleItemId: "schedule-new", objective: "new", order: 1 },
    ],
    facts: [],
    nextCursor: "cursor-1",
  });

  assert.deepEqual(delta?.removedScheduleItemIds, ["schedule-old"]);
  assert.deepEqual(delta?.removedLessonIds, ["same-lesson"]);
  assert.deepEqual(delta?.lessons?.map((item) => [item.scheduleItemId, item.objective]), [["schedule-keep", "keep updated"], ["schedule-new", "new"]]);
});

test("emits a lesson when the cached Learning MORE row is current but its Week UP plan mirror is stale", () => {
  const imported = dispatchWeekUp(createEmptyWeekUpState(), { type: "learning-more.import", courses: [course], lessons: [lesson], facts: [], nextCursor: "cursor-1" }, context()).state;
  const changedLesson = { ...lesson, title: "新课节标题", objective: "新课节目标" };
  const staleMirror = {
    ...imported,
    learningMoreLessons: imported.learningMoreLessons.map((item) => item.scheduleItemId === lesson.scheduleItemId
      ? { ...item, title: changedLesson.title, objective: changedLesson.objective }
      : item),
  };

  const delta = createLearningMoreDelta(staleMirror, { courses: [course], lessons: [changedLesson], facts: [], nextCursor: "cursor-1" });

  assert.deepEqual(delta?.lessons, [changedLesson]);
});

test("does not ignore an authoritative completion fact just because the lesson cache already has completedAt", () => {
  const imported = dispatchWeekUp(createEmptyWeekUpState(), { type: "learning-more.import", courses: [course], lessons: [lesson], facts: [], nextCursor: "cursor-1" }, context()).state;
  const cacheOnlyCompleted = {
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

  assert.deepEqual(createLearningMoreDelta(cacheOnlyCompleted, { courses: [course], lessons: [lesson], facts: [fact], nextCursor: "cursor-1" })?.facts, [fact]);
});

test("re-emits a known Learning MORE fact when its schedule item points to a different plan mirror", () => {
  const scheduleA = { ...lesson, lessonId: "same-lesson", scheduleItemId: "schedule-a", order: 0 };
  const scheduleB = { ...lesson, lessonId: "same-lesson", scheduleItemId: "schedule-b", order: 1 };
  const imported = dispatchWeekUp(createEmptyWeekUpState(), {
    type: "learning-more.import",
    courses: [course],
    lessons: [scheduleA, scheduleB],
    facts: [{
      type: "lesson-completed",
      factId: "external-completed-same-lesson",
      courseId: course.courseId,
      lessonId: "same-lesson",
      occurredAt: "2026-07-21T09:00:00.000Z",
      scheduleItemId: "schedule-a",
    }],
    nextCursor: "cursor-1",
  }, context()).state;
  const correctedFact = {
    type: "lesson-completed",
    factId: "external-completed-same-lesson",
    courseId: course.courseId,
    lessonId: "same-lesson",
    occurredAt: "2026-07-21T10:00:00.000Z",
    scheduleItemId: "schedule-b",
  };

  assert.deepEqual(createLearningMoreDelta(imported, { courses: [course], lessons: [scheduleA, scheduleB], facts: [correctedFact], nextCursor: "cursor-1" })?.facts, [correctedFact]);
});
