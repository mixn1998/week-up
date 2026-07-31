import type { PlanItem } from "./demo-model";

function scheduledDate(plan: PlanItem): string {
  return plan.scheduledDate ?? "9999-12-31";
}

function executionTime(plan: PlanItem): string {
  if (plan.timeStatus === "unscheduled") return "99:99";
  return plan.timeSegments?.[0]?.start ?? plan.start ?? "99:99";
}

export function comparePlansByExecution(left: PlanItem, right: PlanItem): number {
  return scheduledDate(left).localeCompare(scheduledDate(right))
    || executionTime(left).localeCompare(executionTime(right))
    || left.title.localeCompare(right.title, "zh-CN")
    || left.id.localeCompare(right.id);
}

export function earliestPlanByExecution(plans: readonly PlanItem[]): PlanItem {
  const first = [...plans].sort(comparePlansByExecution)[0];
  if (!first) throw new Error("weekly_action_group_empty");
  return first;
}
