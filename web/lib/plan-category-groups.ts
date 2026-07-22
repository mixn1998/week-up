import type { PlanItem } from "./demo-model";

export type PlanCategoryGroup = Readonly<{
  category: string;
  plans: readonly PlanItem[];
  scheduledCount: number;
  unscheduledCount: number;
}>;

export function groupPlansByProjectCategory(plans: readonly PlanItem[]): PlanCategoryGroup[] {
  const groups = new Map<string, PlanItem[]>();

  plans.forEach((plan) => {
    const category = plan.category.trim() || "未分类";
    const group = groups.get(category) ?? [];
    group.push(plan);
    groups.set(category, group);
  });

  return [...groups.entries()]
    .map(([category, items]) => ({
      category,
      plans: [...items].sort((left, right) => left.start.localeCompare(right.start) || left.title.localeCompare(right.title, "zh-CN")),
      scheduledCount: items.filter((plan) => plan.timeStatus !== "unscheduled").length,
      unscheduledCount: items.filter((plan) => plan.timeStatus === "unscheduled").length,
    }))
    .sort((left, right) => right.plans.length - left.plans.length || left.category.localeCompare(right.category, "zh-CN"));
}
