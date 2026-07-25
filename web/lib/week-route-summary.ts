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
): WeekRouteDaySummary {
  const total = plans.length;
  const completed = plans.filter((plan) => plan.completed).length;

  return {
    completed,
    total,
    progress: total ? Math.round((completed / total) * 100) : 0,
    lit: total > 0 && completed === total,
    label: total ? `${completed}/${total} 完成` : "自由日",
  };
}
