import type { PlanItem } from "./demo-model";
import { participatesInOverdueQueue } from "./overdue-policy.ts";

export function selectOverduePlans(plans: readonly PlanItem[]): PlanItem[] {
  return plans
    .filter((plan) =>
      plan.overdue === true
      && !plan.completed
      && !plan.overdueRescheduled
      && participatesInOverdueQueue(plan),
    )
    .sort((left, right) => (right.scheduledDate ?? "").localeCompare(left.scheduledDate ?? ""));
}

export function selectPeriodOverduePlans(
  plans: readonly PlanItem[],
  startDate: string,
  endDate: string,
  frozenPlanIds?: readonly string[],
): PlanItem[] {
  if (frozenPlanIds) {
    const plansById = new Map(plans.map((plan) => [plan.id, plan]));
    return frozenPlanIds.flatMap((id) => {
      const plan = plansById.get(id);
      return plan ? [plan] : [];
    });
  }
  return selectOverduePlans(plans).filter((plan) =>
    plan.scheduledDate !== undefined
    && plan.scheduledDate >= startDate
    && plan.scheduledDate <= endDate
  );
}

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
  const overduePlans = selectOverduePlans(plans);
  return { todayPlans, overduePlans };
}
