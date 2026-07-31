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
  removedScheduleItemIds?: readonly string[];
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

function lessonScheduleKey(lesson: Pick<LearningMoreLessonItem, "lessonId" | "scheduleItemId">): string {
  return lesson.scheduleItemId || lesson.lessonId;
}

function findLearningMorePlanMirror(state: WeekUpState, incoming: LearningMoreLessonItem): WeekUpState["plans"][number] | undefined {
  const sourceRef = `learning-more:${incoming.scheduleItemId}`;
  return [...state.plans].reverse().find((plan) => plan.source === "learning-more" && plan.sourceRef === sourceRef)
    ?? [...state.plans].reverse().find((plan) => plan.source === "learning-more" && plan.sourceRef === undefined && plan.sourceLessonId === incoming.lessonId);
}

function samePlanMirror(state: WeekUpState, incoming: LearningMoreLessonItem): boolean {
  const plan = findLearningMorePlanMirror(state, incoming);
  if (!plan || plan.removedAt !== undefined) return true;
  return plan.title === incoming.title
    && plan.detail === (incoming.objective ?? "")
    && plan.sourceLessonId === incoming.lessonId
    && plan.sourceCourseId === incoming.courseId
    && plan.sourceRef === `learning-more:${incoming.scheduleItemId}`;
}

function activeExternalFactsById(facts: readonly CompletionFact[]): Map<string, Set<string>> {
  const byId = new Map<string, Set<string>>();
  for (const fact of facts) {
    if (!fact.externalFactId || fact.revertedAt !== undefined) continue;
    const planIds = byId.get(fact.externalFactId) ?? new Set<string>();
    planIds.add(fact.planId);
    byId.set(fact.externalFactId, planIds);
  }
  return byId;
}

function hasMatchingActiveLessonFact(state: WeekUpState, activeFacts: Map<string, Set<string>>, fact: LearningMoreFact): boolean {
  if (fact.type !== "lesson-completed") return false;
  const planIds = activeFacts.get(fact.factId);
  if (!fact.scheduleItemId) return planIds !== undefined;
  const targetRef = `learning-more:${fact.scheduleItemId}`;
  const targetPlan = state.plans.find((plan) => plan.source === "learning-more" && plan.sourceRef === targetRef && plan.removedAt === undefined);
  if (!targetPlan) return false;
  if (planIds?.has(targetPlan.id)) return true;
  // The paged history and calendar endpoints can assign different fact ids to
  // the same completed schedule occurrence. Once that plan has authoritative
  // Learning MORE provenance, a calendar alias must not create a new event
  // every poll. A manual completion has no externalFactId and still flows
  // through so the authoritative provenance can be attached.
  return state.completionFacts.some((completion) =>
    completion.planId === targetPlan.id
    && completion.revertedAt === undefined
    && completion.externalFactId !== undefined
  );
}

export function createLearningMoreDelta(state: WeekUpState, batch: LearningMoreImportBatch): LearningMoreDelta | undefined {
  const coursesById = new Map(state.learningMoreCourses.map((course) => [course.courseId, course]));
  const lessonsByScheduleKey = new Map(state.learningMoreLessons.map((lesson) => [lessonScheduleKey(lesson), lesson]));
  const incomingCourseIds = new Set(batch.courses.map((course) => course.courseId));
  const incomingLessonKeys = new Set(batch.lessons.map((lesson) => lessonScheduleKey(lesson)));
  const courses = batch.courses.filter((course) => !sameCourse(coursesById.get(course.courseId), course));
  const lessons = batch.lessons.filter((lesson) => !sameLesson(lessonsByScheduleKey.get(lessonScheduleKey(lesson)), lesson) || !samePlanMirror(state, lesson));
  const removedCourseIds = state.learningMoreCourses.flatMap((course) => incomingCourseIds.has(course.courseId) ? [] : [course.courseId]);
  const removedLessons = state.learningMoreLessons.filter((lesson) => !incomingLessonKeys.has(lessonScheduleKey(lesson)));
  const removedLessonIds = [...new Set(removedLessons.map((lesson) => lesson.lessonId))];
  const removedScheduleItemIds = removedLessons.map((lesson) => lesson.scheduleItemId);
  const externalFacts = activeExternalFactsById(state.completionFacts);
  const skillbookFacts = new Set(state.skillbooks.map((book) => book.sourceFactId));
  const facts = batch.facts.filter((fact) => fact.type === "course-closed"
    ? !skillbookFacts.has(fact.factId)
    : !hasMatchingActiveLessonFact(state, externalFacts, fact));
  const cursorChanged = batch.nextCursor !== undefined && batch.nextCursor !== state.learningMore.historyCursor;
  if (courses.length === 0 && lessons.length === 0 && removedCourseIds.length === 0 && removedLessonIds.length === 0 && removedScheduleItemIds.length === 0 && facts.length === 0 && !cursorChanged) return undefined;
  return {
    ...(courses.length > 0 ? { courses } : {}),
    ...(lessons.length > 0 ? { lessons } : {}),
    ...(removedCourseIds.length > 0 ? { removedCourseIds } : {}),
    ...(removedLessonIds.length > 0 ? { removedLessonIds } : {}),
    ...(removedScheduleItemIds.length > 0 ? { removedScheduleItemIds } : {}),
    facts,
    ...(batch.nextCursor ? { nextCursor: batch.nextCursor } : {}),
    incremental: true,
  };
}
