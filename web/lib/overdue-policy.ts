export type OverduePolicyPlan = Readonly<{
  source?: string;
  recurrenceGroupId?: string;
  recurrenceSummary?: string;
}>;

export type OverdueDisposition = "ignored-daily" | "learning-more" | "week-up";

/**
 * Only an exact daily recurrence is exempt from overdue handling.
 * Interval recurrences such as "每 2 天" remain reschedulable overdue work.
 */
export function isExactDailyRecurrence(plan: OverduePolicyPlan): boolean {
  if (!plan.recurrenceGroupId) return false;
  const summary = plan.recurrenceSummary?.trim() ?? "";
  return /^每天(?:\s|·|$)/u.test(summary) || /^daily(?:\s|·|$)/iu.test(summary);
}

export function overdueDisposition(plan: OverduePolicyPlan): OverdueDisposition {
  if (isExactDailyRecurrence(plan)) return "ignored-daily";
  if (plan.source === "learning-more") return "learning-more";
  return "week-up";
}

export function participatesInOverdueQueue(plan: OverduePolicyPlan): boolean {
  return overdueDisposition(plan) !== "ignored-daily";
}

export function canRescheduleInsideWeekUp(plan: OverduePolicyPlan): boolean {
  return overdueDisposition(plan) === "week-up";
}
