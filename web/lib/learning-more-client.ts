import type { LearningMoreCourseItem, LearningMoreFact, LearningMoreLessonItem } from "./week-up-domain.ts";

type HomeView = Readonly<{
  generatedAt?: string;
  courses: readonly Readonly<{ courseId: string; title: string; status: "active" | "closed" }>[];
  lessons: readonly Readonly<{ courseId: string; lessonId: string; title: string; objective?: string; progress?: "not_started" | "in_progress" | "abandoned" | "completed"; lastActivityAt?: string }>[];
  schedule: readonly Readonly<{ scheduleItemId: string; courseId: string; lessonId: string; startAt: string; endAt: string }>[];
}>;

type HistoryEntry = Readonly<{
  factId: string;
  factType: string;
  occurredAt: string;
  subjectRefs: Readonly<Record<string, string>>;
  payload?: Readonly<Record<string, unknown>>;
}>;

type HistoryPage = Readonly<{ entries: readonly HistoryEntry[]; nextCursor?: string }>;

type CalendarPage = Readonly<{
  days?: readonly Readonly<{
    localDate: string;
    completions: readonly Readonly<{
      lessonId: string;
      courseId?: string;
      actualSeconds: number;
      actualStartedAt?: string;
      actualEndedAt?: string;
    }>[];
  }>[];
}>;

export type LearningMoreImportBatch = Readonly<{
  courses: readonly LearningMoreCourseItem[];
  lessons: readonly LearningMoreLessonItem[];
  facts: readonly LearningMoreFact[];
  nextCursor?: string;
}>;

export type LearningMoreClient = Readonly<{
  pull(cursor?: string): Promise<LearningMoreImportBatch>;
}>;

function encodeCursor(entry: HistoryEntry): string {
  const bytes = new TextEncoder().encode(JSON.stringify({ occurredAt: entry.occurredAt, factId: entry.factId }));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function readJson<T>(fetcher: typeof fetch, url: string): Promise<T> {
  const response = await fetcher(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`learning_more_http_${response.status}`);
  return await response.json() as T;
}

function shanghaiDate(instant: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(instant));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function shiftShanghaiDate(localDate: string, days: number): string {
  return shanghaiDate(new Date(Date.parse(`${localDate}T00:00:00+08:00`) + days * 86_400_000).toISOString());
}

export function createLearningMoreClient(baseUrl: string, fetcher: typeof fetch = fetch): LearningMoreClient {
  const base = baseUrl.replace(/\/$/, "");
  return {
    async pull(cursor) {
      const home = await readJson<HomeView>(fetcher, `${base}/api/v1/home`);
      const courseById = new Map(home.courses.map((course) => [course.courseId, course]));
      const lessonById = new Map(home.lessons.map((lesson) => [lesson.lessonId, lesson]));
      const today = shanghaiDate(home.generatedAt ?? new Date().toISOString());
      const scheduled = [...(home.schedule ?? [])]
        .sort((left, right) => left.startAt.localeCompare(right.startAt) || left.scheduleItemId.localeCompare(right.scheduleItemId));
      const scheduleItemForCompletion = (lessonId: string, courseId: string | undefined, localDate: string): string | undefined => {
        const matches = scheduled.filter((item) =>
          item.lessonId === lessonId &&
          (courseId === undefined || item.courseId === courseId) &&
          shanghaiDate(item.startAt) === localDate
        );
        return matches.length === 1 ? matches[0].scheduleItemId : undefined;
      };
      const calendarUrl = new URL(`${base}/api/v1/history/calendar`, globalThis.location?.origin ?? "http://127.0.0.1");
      calendarUrl.searchParams.set("from", shiftShanghaiDate(today, -365));
      calendarUrl.searchParams.set("to", today);
      const calendar = await readJson<CalendarPage>(fetcher, calendarUrl.toString());
      const historicalCompletions = (calendar.days ?? []).flatMap((day) => day.localDate <= today
        ? day.completions.map((completion) => ({ ...completion, localDate: day.localDate }))
        : []);
      const courses: LearningMoreCourseItem[] = home.courses.map((course) => ({ courseId: course.courseId, title: course.title, status: course.status }));
      const currentLessons: LearningMoreLessonItem[] = scheduled.map((item, order) => {
        const lesson = lessonById.get(item.lessonId);
        return {
          courseId: item.courseId,
          lessonId: item.lessonId,
          scheduleItemId: item.scheduleItemId,
          scheduledDate: shanghaiDate(item.startAt),
          title: lesson?.title ?? "已排课时",
          objective: lesson?.objective,
          order,
        };
      });
      const currentLessonIds = new Set(currentLessons.map((lesson) => lesson.lessonId));
      const historicalLessons: LearningMoreLessonItem[] = historicalCompletions.flatMap((completion, index) => {
        if (currentLessonIds.has(completion.lessonId)) return [];
        const lesson = lessonById.get(completion.lessonId);
        const courseId = completion.courseId ?? lesson?.courseId;
        if (!courseId) return [];
        return [{
          courseId,
          lessonId: completion.lessonId,
          scheduleItemId: `history:${completion.localDate}:${completion.lessonId}`,
          scheduledDate: completion.localDate,
          title: lesson?.title ?? "已完成课时",
          objective: lesson?.objective,
          order: scheduled.length + index,
        }];
      });
      const lessons = [...historicalLessons, ...currentLessons]
        .sort((left, right) => left.scheduledDate.localeCompare(right.scheduledDate) || left.order - right.order);

      const entries: HistoryEntry[] = [];
      let pageCursor = cursor;
      let lastCursor = cursor;
      for (let pageNumber = 0; pageNumber < 100; pageNumber += 1) {
        const url = new URL(`${base}/api/v1/history`, globalThis.location?.origin ?? "http://127.0.0.1");
        url.searchParams.set("pageSize", "100");
        if (pageCursor) url.searchParams.set("cursor", pageCursor);
        const page = await readJson<HistoryPage>(fetcher, url.toString());
        entries.push(...page.entries);
        const last = page.entries.at(-1);
        if (last) lastCursor = page.nextCursor ?? encodeCursor(last);
        if (!page.nextCursor) break;
        pageCursor = page.nextCursor;
        if (pageNumber === 99) throw new Error("learning_more_history_too_large");
      }

      const lessonFacts = new Map<string, LearningMoreFact & { type: "lesson-completed" }>();
      const courseFacts = new Map<string, LearningMoreFact & { type: "course-closed" }>();
      for (const completion of historicalCompletions) {
        const lesson = lessonById.get(completion.lessonId);
        const courseId = completion.courseId ?? lesson?.courseId;
        if (!courseId) continue;
        lessonFacts.set(completion.lessonId, {
          factId: `calendar-completed:${completion.localDate}:${completion.lessonId}`,
          type: "lesson-completed",
          occurredAt: `${completion.localDate}T12:00:00+08:00`,
          courseId,
          lessonId: completion.lessonId,
          ...(scheduleItemForCompletion(completion.lessonId, courseId, completion.localDate) ? { scheduleItemId: scheduleItemForCompletion(completion.lessonId, courseId, completion.localDate) } : {}),
          ...(completion.actualStartedAt ? { actualStartedAt: completion.actualStartedAt } : {}),
          ...(completion.actualEndedAt ? { actualEndedAt: completion.actualEndedAt } : {}),
        });
      }
      for (const entry of entries) {
        const courseId = entry.subjectRefs.courseId;
        if (entry.factType === "LessonCompletedFact" && courseId && entry.subjectRefs.lessonId) {
          const existing = lessonFacts.get(entry.subjectRefs.lessonId);
          const payloadStart = typeof entry.payload?.actualStartedAt === "string" ? entry.payload.actualStartedAt : undefined;
          const payloadEnd = typeof entry.payload?.actualEndedAt === "string" ? entry.payload.actualEndedAt : undefined;
          lessonFacts.set(entry.subjectRefs.lessonId, {
            ...existing,
            factId: entry.factId,
            type: "lesson-completed",
            occurredAt: entry.occurredAt,
            courseId,
            lessonId: entry.subjectRefs.lessonId,
            ...(scheduleItemForCompletion(entry.subjectRefs.lessonId, courseId, shanghaiDate(entry.occurredAt)) ? { scheduleItemId: scheduleItemForCompletion(entry.subjectRefs.lessonId, courseId, shanghaiDate(entry.occurredAt)) } : {}),
            ...(payloadStart ? { actualStartedAt: payloadStart } : {}),
            ...(payloadEnd ? { actualEndedAt: payloadEnd } : {}),
          });
        }
        if (entry.factType === "CourseClosedFact" && courseId) {
          courseFacts.set(courseId, { factId: entry.factId, type: "course-closed", occurredAt: entry.occurredAt, courseId, courseTitle: courseById.get(courseId)?.title ?? "已完成课程" });
        }
      }
      for (const item of lessons) {
        const lesson = lessonById.get(item.lessonId);
        if (lesson?.progress === "completed" && !lessonFacts.has(item.lessonId)) {
          lessonFacts.set(item.lessonId, { factId: `lesson-completed:${item.lessonId}`, type: "lesson-completed", occurredAt: lesson.lastActivityAt ?? `${item.scheduledDate}T12:00:00+08:00`, courseId: item.courseId, lessonId: item.lessonId, scheduleItemId: item.scheduleItemId });
        }
      }
      for (const course of home.courses) {
        if (course.status === "closed" && !courseFacts.has(course.courseId)) {
          courseFacts.set(course.courseId, { factId: `course-closed:${course.courseId}`, type: "course-closed", occurredAt: home.generatedAt ?? new Date().toISOString(), courseId: course.courseId, courseTitle: course.title });
        }
      }
      const facts: LearningMoreFact[] = [...lessonFacts.values(), ...courseFacts.values()];
      return { courses, lessons, facts, ...(lastCursor ? { nextCursor: lastCursor } : {}) };
    },
  };
}
