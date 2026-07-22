import type { PlanItem } from "./demo-model";

export function selectDailyPlans(
  plans: readonly PlanItem[],
  today: string,
  todayDayIndex: number,
): Readonly<{ todayPlans: PlanItem[]; overduePlans: PlanItem[] }> {
  const todayPlans = plans.filter((plan) =>
    plan.scheduledDate !== undefined
      ? plan.scheduledDate === today
      : plan.dayIndex === undefined || plan.dayIndex === todayDayIndex,
  );
  const overduePlans = plans
    .filter((plan) =>
      plan.overdue === true
      && !plan.completed
      && !plan.overdueRescheduled,
    )
    .sort((left, right) => (right.scheduledDate ?? "").localeCompare(left.scheduledDate ?? ""));
  return { todayPlans, overduePlans };
}
