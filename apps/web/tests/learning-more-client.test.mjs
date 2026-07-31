import assert from "node:assert/strict";
import test from "node:test";

import { createLearningMoreClient } from "../src/lib/learning-more-client.ts";

globalThis.btoa ??= (value) => Buffer.from(value, "binary").toString("base64");

test("imports the full course catalog but only lessons already placed on the Learning MORE timetable without clock time", async () => {
  const calls = [];
  const fetcher = async (url) => {
    calls.push(String(url));
    const parsed = new URL(url);
    if (parsed.pathname.endsWith("/home")) return Response.json({
      generatedAt: "2026-07-20T03:00:00Z",
      courses: [{ courseId: "c1", title: "概率论", status: "closed" }, { courseId: "c2", title: "未排课程", status: "active" }],
      lessons: [{ courseId: "c1", lessonId: "l1", title: "条件概率", objective: "完成例题", progress: "completed", lastActivityAt: "2026-07-20T02:00:00Z" }, { courseId: "c2", lessonId: "l2", title: "不会同步", progress: "not_started" }],
      schedule: [{ scheduleItemId: "s1", courseId: "c1", lessonId: "l1", startAt: "2026-07-20T01:00:00Z", endAt: "2026-07-20T02:00:00Z" }],
    });
    if (!parsed.searchParams.has("cursor")) return Response.json({ entries: [{ factId: "f1", factType: "LessonCompletedFact", occurredAt: "2026-07-20T02:00:00Z", subjectRefs: { courseId: "c1", lessonId: "l1" } }], nextCursor: "page-2" });
    return Response.json({ entries: [{ factId: "f2", factType: "CourseClosedFact", occurredAt: "2026-07-20T02:01:00Z", subjectRefs: { courseId: "c1" } }] });
  };
  const batch = await createLearningMoreClient("http://learning-more.local/", fetcher).pull();
  assert.equal(calls.length, 4);
  assert.deepEqual(batch.courses, [{ courseId: "c1", title: "概率论", status: "closed" }, { courseId: "c2", title: "未排课程", status: "active" }]);
  assert.deepEqual(batch.lessons, [{ courseId: "c1", lessonId: "l1", scheduleItemId: "s1", scheduledDate: "2026-07-20", title: "条件概率", objective: "完成例题", order: 0 }]);
  assert.equal("schedule" in batch, false);
  assert.equal("startAt" in batch.lessons[0], false);
  assert.deepEqual(batch.facts.map((fact) => fact.type), ["lesson-completed", "course-closed"]);
  assert.equal(batch.facts[1].courseTitle, "概率论");
  assert.ok(batch.nextCursor);
});

test("reports HTTP failures without partially importing", async () => {
  const fetcher = async (url) => String(url).endsWith("/home") ? new Response(null, { status: 503 }) : Response.json({ items: [] });
  await assert.rejects(() => createLearningMoreClient("http://learning-more.local", fetcher).pull(), /learning_more_http_503/);
});

test("reconstructs past completed lessons from history after they leave the current timetable", async () => {
  const fetcher = async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith("/home")) return Response.json({
      generatedAt: "2026-07-20T12:00:00Z",
      courses: [{ courseId: "course-game", title: "游戏设计", status: "active" }],
      lessons: [
        { courseId: "course-game", lessonId: "lesson-past", title: "卡牌设计的本质", objective: "制造有意义的选择", progress: "completed", lastActivityAt: "2026-07-17T03:40:00Z" },
        { courseId: "course-game", lessonId: "lesson-today", title: "今天的课程", progress: "not_started" },
        { courseId: "course-game", lessonId: "lesson-completed-today", title: "今天已完成的课程", progress: "completed", lastActivityAt: "2026-07-20T10:00:00Z" },
      ],
      schedule: [{ scheduleItemId: "schedule-today", courseId: "course-game", lessonId: "lesson-today", startAt: "2026-07-20T01:00:00Z", endAt: "2026-07-20T02:00:00Z" }],
    });
    if (parsed.pathname.endsWith("/history/calendar")) return Response.json({
      days: [
        { localDate: "2026-07-17", actualSeconds: 2400, completedLessonIds: ["lesson-past"], completions: [{ lessonId: "lesson-past", courseId: "course-game", actualSeconds: 2400, actualStartedAt: "2026-07-17T02:10:00.000Z", actualEndedAt: "2026-07-17T03:40:00.000Z" }] },
        { localDate: "2026-07-20", actualSeconds: 1800, completedLessonIds: ["lesson-completed-today"], completions: [{ lessonId: "lesson-completed-today", courseId: "course-game", actualSeconds: 1800 }] },
      ],
    });
    return Response.json({ entries: [] });
  };

  const batch = await createLearningMoreClient("http://learning-more.local", fetcher).pull("latest-cursor");

  assert.deepEqual(batch.lessons.map((lesson) => [lesson.lessonId, lesson.scheduledDate, lesson.scheduleItemId]), [
    ["lesson-past", "2026-07-17", "history:2026-07-17:lesson-past"],
    ["lesson-today", "2026-07-20", "schedule-today"],
    ["lesson-completed-today", "2026-07-20", "history:2026-07-20:lesson-completed-today"],
  ]);
  assert.deepEqual(batch.facts.filter((fact) => fact.type === "lesson-completed").map((fact) => [fact.lessonId, fact.occurredAt]), [
    ["lesson-past", "2026-07-17T12:00:00+08:00"],
    ["lesson-completed-today", "2026-07-20T12:00:00+08:00"],
  ]);
  assert.deepEqual(
    batch.facts.find((fact) => fact.type === "lesson-completed" && fact.lessonId === "lesson-past"),
    {
      factId: "calendar-completed:2026-07-17:lesson-past",
      type: "lesson-completed",
      occurredAt: "2026-07-17T12:00:00+08:00",
      courseId: "course-game",
      lessonId: "lesson-past",
      actualStartedAt: "2026-07-17T02:10:00.000Z",
      actualEndedAt: "2026-07-17T03:40:00.000Z",
    },
  );
});

test("keeps an unfinished past timetable item so Week UP can mark it overdue", async () => {
  const fetcher = async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith("/home")) return Response.json({
      generatedAt: "2026-07-25T02:00:00Z",
      courses: [{ courseId: "course-business", title: "Business", status: "active" }],
      lessons: [{ courseId: "course-business", lessonId: "lesson-overdue", title: "工业设备交付案", objective: "区分事实", progress: "not_started" }],
      schedule: [{ scheduleItemId: "schedule-yesterday", courseId: "course-business", lessonId: "lesson-overdue", startAt: "2026-07-24T11:00:00.000Z", endAt: "2026-07-24T11:40:00.000Z" }],
    });
    if (parsed.pathname.endsWith("/history/calendar")) return Response.json({ days: [] });
    return Response.json({ entries: [] });
  };

  const batch = await createLearningMoreClient("http://learning-more.local", fetcher).pull("latest-cursor");

  assert.deepEqual(batch.lessons.map((lesson) => [lesson.lessonId, lesson.scheduleItemId, lesson.scheduledDate, lesson.title]), [
    ["lesson-overdue", "schedule-yesterday", "2026-07-24", "工业设备交付案"],
  ]);
  assert.deepEqual(batch.facts, []);
});

test("emits separate completion facts for repeated Learning MORE schedule items with the same lesson id", async () => {
  const fetcher = async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith("/home")) return Response.json({
      generatedAt: "2026-07-25T02:00:00Z",
      courses: [{ courseId: "course-ai", title: "AI", status: "active" }],
      lessons: [{ courseId: "course-ai", lessonId: "lesson-token", title: "Token", objective: "理解 Token", progress: "completed", lastActivityAt: "2026-07-25T01:00:00Z" }],
      schedule: [
        { scheduleItemId: "schedule-token-a", courseId: "course-ai", lessonId: "lesson-token", startAt: "2026-07-24T10:00:00.000Z", endAt: "2026-07-24T10:40:00.000Z" },
        { scheduleItemId: "schedule-token-b", courseId: "course-ai", lessonId: "lesson-token", startAt: "2026-07-25T01:00:00.000Z", endAt: "2026-07-25T01:40:00.000Z" },
      ],
    });
    if (parsed.pathname.endsWith("/history/calendar")) return Response.json({
      days: [
        { localDate: "2026-07-24", completions: [{ lessonId: "lesson-token", courseId: "course-ai", actualSeconds: 2400 }] },
        { localDate: "2026-07-25", completions: [{ lessonId: "lesson-token", courseId: "course-ai", actualSeconds: 2400 }] },
      ],
    });
    return Response.json({ entries: [] });
  };

  const batch = await createLearningMoreClient("http://learning-more.local", fetcher).pull("latest-cursor");
  const completedScheduleIds = batch.facts
    .filter((fact) => fact.type === "lesson-completed")
    .map((fact) => fact.scheduleItemId)
    .sort();

  assert.deepEqual(completedScheduleIds, ["schedule-token-a", "schedule-token-b"]);
});

test("binds a completion that crosses midnight to the schedule item from its actual start date", async () => {
  const fetcher = async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith("/home")) return Response.json({
      generatedAt: "2026-07-25T06:30:00Z",
      courses: [{ courseId: "course-token", title: "Token", status: "active" }],
      lessons: [{
        courseId: "course-token",
        lessonId: "lesson-token",
        title: "Token 到底是什么",
        progress: "completed",
        lastActivityAt: "2026-07-24T16:08:40.104Z",
      }],
      schedule: [{
        scheduleItemId: "schedule-token",
        courseId: "course-token",
        lessonId: "lesson-token",
        startAt: "2026-07-24T11:00:00.000Z",
        endAt: "2026-07-24T11:40:00.000Z",
      }],
    });
    if (parsed.pathname.endsWith("/history/calendar")) return Response.json({
      days: [{
        localDate: "2026-07-25",
        completions: [{
          lessonId: "lesson-token",
          courseId: "course-token",
          actualSeconds: 1429,
          actualStartedAt: "2026-07-24T14:43:57.007Z",
          actualEndedAt: "2026-07-24T16:08:40.104Z",
        }],
      }],
    });
    return Response.json({ entries: [] });
  };

  const batch = await createLearningMoreClient("http://learning-more.local", fetcher).pull("latest-cursor");
  const lessonFacts = batch.facts.filter((fact) => fact.type === "lesson-completed");

  assert.deepEqual(batch.lessons.map((item) => item.scheduleItemId), ["schedule-token"]);
  assert.equal(lessonFacts.length, 1);
  assert.equal(lessonFacts[0].scheduleItemId, "schedule-token");
});

test("keeps a historical completion when the same lesson id is scheduled again on another date", async () => {
  const fetcher = async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith("/home")) return Response.json({
      generatedAt: "2026-07-25T06:30:00Z",
      courses: [{ courseId: "course-repeat", title: "Repeat", status: "active" }],
      lessons: [{
        courseId: "course-repeat",
        lessonId: "lesson-repeat",
        title: "重复课节",
        progress: "completed",
        lastActivityAt: "2026-07-20T03:00:00Z",
      }],
      schedule: [{
        scheduleItemId: "schedule-future",
        courseId: "course-repeat",
        lessonId: "lesson-repeat",
        startAt: "2026-07-27T11:00:00.000Z",
        endAt: "2026-07-27T11:40:00.000Z",
      }],
    });
    if (parsed.pathname.endsWith("/history/calendar")) return Response.json({
      days: [{
        localDate: "2026-07-20",
        completions: [{
          lessonId: "lesson-repeat",
          courseId: "course-repeat",
          actualSeconds: 1200,
          actualStartedAt: "2026-07-20T02:00:00.000Z",
          actualEndedAt: "2026-07-20T03:00:00.000Z",
        }],
      }],
    });
    return Response.json({ entries: [] });
  };

  const batch = await createLearningMoreClient("http://learning-more.local", fetcher).pull("latest-cursor");

  assert.deepEqual(batch.lessons.map((item) => item.scheduleItemId), [
    "history:2026-07-20:lesson-repeat",
    "schedule-future",
  ]);
});
