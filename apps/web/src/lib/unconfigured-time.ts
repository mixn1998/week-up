import type { PlanItem } from "./demo-model.ts";

export function selectUnconfiguredPlansForDate(
  dateKey: string,
  scheduledPlans: readonly PlanItem[],
  untimedCompletionPlans: readonly PlanItem[],
  settledDates: ReadonlySet<string>,
): PlanItem[] {
  const source = settledDates.has(dateKey) ? untimedCompletionPlans : scheduledPlans;
  return source.filter((plan) =>
    plan.scheduledDate === dateKey
    && plan.timeStatus === "unscheduled"
    && (!settledDates.has(dateKey) || plan.completed)
  );
}
