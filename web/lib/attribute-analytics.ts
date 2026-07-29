import { shanghaiDate } from "./execution-policy.ts";
import type { WeekUpState } from "./week-up-domain.ts";

export type AttributeXpSource = Readonly<{
  attributeId: string;
  completionFactId: string;
  planId?: string;
  completedAt: string;
  amount: number;
  planTitle: string;
  projectOrCourse: string;
  projectCategory: string;
  source: "week-up" | "learning-more";
}>;

export type AttributeDailyPoint = Readonly<{
  localDate: string;
  totalXp: number;
  gainedXp: number;
}>;

export type AttributeWeeklyGain = Readonly<{
  startDate: string;
  endDate: string;
  amount: number;
}>;

export type AttributeCategoryGain = Readonly<{
  category: string;
  amount: number;
}>;

export type AttributeAnalytics = Readonly<{
  totalXp: number;
  monthGain: number;
  sources: readonly AttributeXpSource[];
  thirtyDay: Readonly<{
    points: readonly AttributeDailyPoint[];
    comparisonLabel: string;
  }>;
  weeklyGains: readonly AttributeWeeklyGain[];
  categoryGains: readonly AttributeCategoryGain[];
  activeDates: readonly string[];
  longestStreak: number;
}>;

function shiftDate(localDate: string, days: number): string {
  const date = new Date(`${localDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function weekStart(localDate: string): string {
  const date = new Date(`${localDate}T00:00:00Z`);
  return shiftDate(localDate, -((date.getUTCDay() + 6) % 7));
}

function amountWithin(sources: readonly AttributeXpSource[], startDate: string, endDate: string): number {
  return sources.reduce((sum, source) => {
    const date = shanghaiDate(source.completedAt);
    return date >= startDate && date <= endDate ? sum + source.amount : sum;
  }, 0);
}

function longestDateStreak(localDates: readonly string[]): number {
  const ordered = [...new Set(localDates)].sort();
  let longest = 0;
  let current = 0;
  let previous: string | undefined;
  for (const date of ordered) {
    current = previous !== undefined && shiftDate(previous, 1) === date ? current + 1 : 1;
    longest = Math.max(longest, current);
    previous = date;
  }
  return longest;
}

function buildAttributeAggregates(
  sources: readonly AttributeXpSource[],
  at: Date,
): Omit<AttributeAnalytics, "sources"> {
  const today = shanghaiDate(at.toISOString());
  const thirtyDayStart = shiftDate(today, -29);
  const previousStart = shiftDate(today, -59);
  const previousEnd = shiftDate(today, -30);
  const gainsByDate = new Map<string, number>();
  for (const source of sources) {
    const date = shanghaiDate(source.completedAt);
    gainsByDate.set(date, (gainsByDate.get(date) ?? 0) + source.amount);
  }
  let runningTotal = sources.reduce((sum, source) =>
    shanghaiDate(source.completedAt) < thirtyDayStart ? sum + source.amount : sum, 0);
  const points: AttributeDailyPoint[] = [];
  for (let index = 0; index < 30; index += 1) {
    const localDate = shiftDate(thirtyDayStart, index);
    const gainedXp = gainsByDate.get(localDate) ?? 0;
    runningTotal += gainedXp;
    points.push({ localDate, totalXp: runningTotal, gainedXp });
  }
  const currentGain = amountWithin(sources, thirtyDayStart, today);
  const previousGain = amountWithin(sources, previousStart, previousEnd);
  const comparison = previousGain > 0 ? Math.round(((currentGain - previousGain) / previousGain) * 100) : undefined;
  const comparisonLabel = comparison === undefined
    ? `+${currentGain} XP`
    : `${comparison >= 0 ? "+" : ""}${comparison}%`;

  const currentWeekStart = weekStart(today);
  const weeklyGains: AttributeWeeklyGain[] = [];
  for (let index = 3; index >= 0; index -= 1) {
    const startDate = shiftDate(currentWeekStart, -index * 7);
    const endDate = shiftDate(startDate, 6);
    weeklyGains.push({ startDate, endDate, amount: amountWithin(sources, startDate, endDate) });
  }

  const categoryTotals = new Map<string, number>();
  for (const source of sources) {
    categoryTotals.set(source.projectCategory, (categoryTotals.get(source.projectCategory) ?? 0) + source.amount);
  }
  const categoryGains = [...categoryTotals.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((left, right) => right.amount - left.amount || left.category.localeCompare(right.category, "zh-CN"));

  const activeDates = [...gainsByDate.entries()]
    .filter(([date, amount]) => date >= thirtyDayStart && date <= today && amount > 0)
    .map(([date]) => date)
    .sort();
  const monthStart = `${today.slice(0, 7)}-01`;
  return {
    totalXp: sources.reduce((sum, source) => sum + source.amount, 0),
    monthGain: amountWithin(sources, monthStart, today),
    thirtyDay: { points, comparisonLabel },
    weeklyGains,
    categoryGains,
    activeDates,
    longestStreak: longestDateStreak(activeDates),
  };
}

export function projectAttributeAnalytics(
  state: WeekUpState,
  attributeId: string,
  at = new Date(),
): AttributeAnalytics {
  const factById = new Map(state.completionFacts.map((fact) => [fact.id, fact]));
  const planById = new Map(state.plans.map((plan) => [plan.id, plan]));
  const projectById = new Map(state.projects.map((project) => [project.id, project]));
  const courseById = new Map(state.learningMoreCourses.map((course) => [course.courseId, course]));
  const transactionGroups = new Map<string, { amount: number; occurredAt: string }>();

  for (const transaction of state.xpTransactions) {
    if (transaction.attributeId !== attributeId) continue;
    const current = transactionGroups.get(transaction.completionFactId);
    transactionGroups.set(transaction.completionFactId, {
      amount: (current?.amount ?? 0) + transaction.amount,
      occurredAt: current?.occurredAt ?? transaction.occurredAt,
    });
  }

  const sources = [...transactionGroups.entries()].flatMap<AttributeXpSource>(([completionFactId, net]) => {
    if (net.amount <= 0) return [];
    const fact = factById.get(completionFactId);
    const plan = fact ? planById.get(fact.planId) : undefined;
    const project = plan?.projectId ? projectById.get(plan.projectId) : undefined;
    const course = plan?.sourceCourseId ? courseById.get(plan.sourceCourseId) : undefined;
    return [{
      attributeId,
      completionFactId,
      ...(fact ? { planId: fact.planId } : {}),
      completedAt: fact?.completedAt ?? net.occurredAt,
      amount: net.amount,
      planTitle: plan?.title ?? "历史完成记录",
      projectOrCourse: project?.name ?? course?.title ?? (plan?.source === "learning-more" ? "Learning MORE" : "临时计划"),
      projectCategory: plan?.category?.trim() || "未分类",
      source: plan?.source ?? fact?.source ?? "week-up",
    }];
  }).sort((left, right) =>
    right.completedAt.localeCompare(left.completedAt) ||
    left.completionFactId.localeCompare(right.completionFactId)
  );

  return { sources, ...buildAttributeAggregates(sources, at) };
}
