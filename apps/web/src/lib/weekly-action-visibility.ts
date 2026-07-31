import { isExactDailyRecurrence, type OverduePolicyPlan } from "./overdue-policy.ts";

export type WeeklyCourseBundleCandidate = Readonly<{
  source?: string;
  completed: boolean;
  overdue?: boolean;
  timeStatus?: string;
}>;

export function isLearningMoreCoursePlan(plan: WeeklyCourseBundleCandidate): boolean {
  return plan.source === "learning-more";
}

export function isLearningMoreCourseBundlePlan(plan: WeeklyCourseBundleCandidate): boolean {
  return isLearningMoreCoursePlan(plan)
    && (plan.completed || plan.overdue === true || plan.timeStatus === "unscheduled");
}

export function isLearningMoreCourseComplete(plans: readonly WeeklyCourseBundleCandidate[]): boolean {
  return plans.length > 0 && plans.every((plan) => plan.completed);
}

export function isWeeklyRepeatDayLocked(
  plan: OverduePolicyPlan,
  date: string,
  settledDates: ReadonlySet<string>,
  readOnly: boolean,
): boolean {
  return readOnly
    || plan.source === "learning-more"
    || (isExactDailyRecurrence(plan) && settledDates.has(date));
}

export function takeVisibleGroupedRows<T>(
  items: readonly T[],
  limit: number,
  columns: number,
  groupKey: (item: T) => string,
): T[] {
  const safeLimit = Math.max(0, limit);
  if (items.length <= safeLimit || columns <= 1) {
    return items.slice(0, safeLimit);
  }

  const visible = items.slice(0, safeLimit);
  const lastVisible = visible.at(-1);
  if (!lastVisible) return visible;

  const lastGroup = groupKey(lastVisible);
  let visibleInLastGroup = 0;
  for (let index = visible.length - 1; index >= 0; index -= 1) {
    if (groupKey(visible[index]!) !== lastGroup) break;
    visibleInLastGroup += 1;
  }

  const remainder = visibleInLastGroup % columns;
  if (remainder === 0) return visible;

  const extras: T[] = [];
  const needed = columns - remainder;
  for (const item of items.slice(safeLimit)) {
    if (groupKey(item) !== lastGroup || extras.length >= needed) break;
    extras.push(item);
  }

  return [...visible, ...extras];
}
