export type WeekRoutePlanStatus = {
  completed: boolean;
  overdue?: boolean;
};

export type WeekRouteDaySummary = {
  completed: number;
  total: number;
  progress: number;
  lit: boolean;
  label: string;
};

export function summarizeWeekRouteDay(
  plans: readonly WeekRoutePlanStatus[],
  frozen?: Readonly<{ planIds: readonly string[]; completedPlanIds: readonly string[] }>,
): WeekRouteDaySummary {
  const total = frozen?.planIds.length ?? plans.length;
  const completed = frozen?.completedPlanIds.length ?? plans.filter((plan) => plan.completed).length;

  return {
    completed,
    total,
    progress: total ? Math.round((completed / total) * 100) : 0,
    lit: total > 0 && completed === total,
    label: total ? `${completed}/${total} 完成` : "自由日",
  };
}
