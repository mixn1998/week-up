import type {
  CompletionFact,
  LearningMoreCourseItem,
  LearningMoreFact,
  LearningMoreLessonItem,
  WeekUpState,
} from "./week-up-domain.ts";
import type { LearningMoreImportBatch } from "./learning-more-client.ts";

export type LearningMoreDelta = Readonly<{
  courses?: readonly LearningMoreCourseItem[];
  lessons?: readonly LearningMoreLessonItem[];
  removedCourseIds?: readonly string[];
  removedLessonIds?: readonly string[];
  facts: readonly LearningMoreFact[];
  nextCursor?: string;
  incremental: true;
}>;

function sameCourse(current: WeekUpState["learningMoreCourses"][number] | undefined, incoming: LearningMoreCourseItem): boolean {
  return current !== undefined && current.title === incoming.title && current.status === incoming.status;
}

function sameLesson(current: WeekUpState["learningMoreLessons"][number] | undefined, incoming: LearningMoreLessonItem): boolean {
  return current !== undefined
    && current.courseId === incoming.courseId
    && current.scheduleItemId === incoming.scheduleItemId
    && current.scheduledDate === incoming.scheduledDate
    && current.title === incoming.title
    && current.objective === (incoming.objective ?? "")
    && current.order === incoming.order;
}

function activeExternalFacts(facts: readonly CompletionFact[]): Set<string> {
  return new Set(facts.flatMap((fact) => fact.externalFactId && fact.revertedAt === undefined ? [fact.externalFactId] : []));
}

export function createLearningMoreDelta(state: WeekUpState, batch: LearningMoreImportBatch): LearningMoreDelta | undefined {
  const coursesById = new Map(state.learningMoreCourses.map((course) => [course.courseId, course]));
  const lessonsById = new Map(state.learningMoreLessons.map((lesson) => [lesson.lessonId, lesson]));
  const incomingCourseIds = new Set(batch.courses.map((course) => course.courseId));
  const incomingLessonIds = new Set(batch.lessons.map((lesson) => lesson.lessonId));
  const courses = batch.courses.filter((course) => !sameCourse(coursesById.get(course.courseId), course));
  const lessons = batch.lessons.filter((lesson) => !sameLesson(lessonsById.get(lesson.lessonId), lesson));
  const removedCourseIds = state.learningMoreCourses.flatMap((course) => incomingCourseIds.has(course.courseId) ? [] : [course.courseId]);
  const removedLessonIds = state.learningMoreLessons.flatMap((lesson) => incomingLessonIds.has(lesson.lessonId) ? [] : [lesson.lessonId]);
  const externalFacts = activeExternalFacts(state.completionFacts);
  const skillbookFacts = new Set(state.skillbooks.map((book) => book.sourceFactId));
  const completedLessonIds = new Set(state.learningMoreLessons.flatMap((lesson) => lesson.completedAt ? [lesson.lessonId] : []));
  const facts = batch.facts.filter((fact) => fact.type === "course-closed"
    ? !skillbookFacts.has(fact.factId)
    : !externalFacts.has(fact.factId) && !completedLessonIds.has(fact.lessonId));
  const cursorChanged = batch.nextCursor !== undefined && batch.nextCursor !== state.learningMore.historyCursor;
  if (courses.length === 0 && lessons.length === 0 && removedCourseIds.length === 0 && removedLessonIds.length === 0 && facts.length === 0 && !cursorChanged) return undefined;
  return {
    ...(courses.length > 0 ? { courses } : {}),
    ...(lessons.length > 0 ? { lessons } : {}),
    ...(removedCourseIds.length > 0 ? { removedCourseIds } : {}),
    ...(removedLessonIds.length > 0 ? { removedLessonIds } : {}),
    facts,
    ...(batch.nextCursor ? { nextCursor: batch.nextCursor } : {}),
    incremental: true,
  };
}
