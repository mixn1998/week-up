import { levelFromTotalXp } from "./demo-model.ts";
import type { AiProviderId, AiReviewState, SettlementRecord, WeekUpState } from "./week-up-domain.ts";

export type ReviewSummaryFacts = Readonly<{
  period: "week" | "month";
  startDate: string;
  endDate: string;
  goals: readonly Readonly<{ title: string; note: string; period: "week" | "month"; completedPlanCount: number; scheduledPlanCount: number }>[];
  completedContent: readonly Readonly<{ title: string; detail: string; category: string; scheduledAt: string; source: "week-up" | "learning-more" }>[];
  incompleteContent: readonly Readonly<{ title: string; detail: string; category: string; scheduledAt: string; source: "week-up" | "learning-more" }>[];
  attributeGains: readonly Readonly<{ name: string; icon: string; amount: number }>[];
  badgeUpgrades: readonly Readonly<{ name: string; fromLevel: number; toLevel: number }>[];
  skillbooks: readonly Readonly<{ title: string; acquiredAt: string }>[];
}>;

export type ReviewSummaryResult = Readonly<{
  text: string;
  provider: AiProviderId;
  preferredProvider: AiProviderId;
  fallbackUsed: boolean;
  model?: string;
  reasoningEffort?: string;
  checkedAt: string;
}>;

export type AiServiceStatus = Readonly<{
  preferredProvider: AiProviderId;
  codex: Readonly<{
    available: boolean;
    authenticated: boolean;
    version?: string;
    error?: string;
    models: readonly Readonly<{ id: string; displayName: string; defaultReasoningEffort: string; supportedReasoningEfforts: readonly string[] }>[];
  }>;
  api: Readonly<{ configured: boolean; available: boolean; error?: string }>;
  lastExecution?: Readonly<{ provider: AiProviderId; preferredProvider: AiProviderId; fallbackUsed: boolean; model?: string; reasoningEffort?: string; checkedAt: string }>;
  checkedAt: string;
}>;

export type ReviewSummaryClient = Readonly<{
  generate(facts: ReviewSummaryFacts): Promise<ReviewSummaryResult>;
  status(refresh?: boolean): Promise<AiServiceStatus>;
}>;

function localDate(instant: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(instant));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function buildReviewSummaryFacts(state: WeekUpState, settlement: SettlementRecord): ReviewSummaryFacts {
  const completedIds = new Set(settlement.completedPlanIds);
  const incompleteIds = new Set(settlement.incompletePlanIds);
  const settlementPlanIds = new Set([...completedIds, ...incompleteIds]);
  const settlementPlans = state.plans.filter((plan) => settlementPlanIds.has(plan.id));
  const projectPlan = (plan: (typeof state.plans)[number]) => ({ title: plan.title, detail: plan.detail, category: plan.category, scheduledAt: plan.startAt, source: plan.source });
  const goals = state.goals
    .filter((goal) => goal.startDate <= settlement.endDate && goal.endDate >= settlement.startDate)
    .map((goal) => {
      const linkedPlans = settlementPlans.filter((plan) => plan.goalIds.includes(goal.id));
      return { title: goal.title, note: goal.note, period: goal.period, completedPlanCount: linkedPlans.filter((plan) => completedIds.has(plan.id)).length, scheduledPlanCount: linkedPlans.length };
    });
  const attributeGains = Object.entries(settlement.attributeGains)
    .filter(([, amount]) => amount > 0)
    .map(([attributeId, amount]) => {
      const attribute = state.attributes.find((item) => item.id === attributeId);
      return { name: attribute?.name ?? "已归档属性", icon: attribute?.icon ?? "✦", amount };
    })
    .sort((left, right) => right.amount - left.amount || left.name.localeCompare(right.name, "zh-CN"));
  const activeFacts = state.completionFacts.filter((fact) => fact.revertedAt === undefined);
  const xpBefore = new Map<string, number>();
  for (const fact of activeFacts) {
    const plan = state.plans.find((item) => item.id === fact.planId);
    if (!plan || localDate(plan.startAt) >= settlement.startDate) continue;
    for (const reward of fact.rewardSnapshot) xpBefore.set(reward.attributeId, (xpBefore.get(reward.attributeId) ?? 0) + reward.amount);
  }
  const badgeUpgrades = Object.entries(settlement.attributeGains).flatMap(([attributeId, amount]) => {
    const beforeLevel = levelFromTotalXp(xpBefore.get(attributeId) ?? 0).level;
    const afterLevel = levelFromTotalXp((xpBefore.get(attributeId) ?? 0) + amount).level;
    if (afterLevel <= beforeLevel) return [];
    return [{ name: state.attributes.find((item) => item.id === attributeId)?.name ?? "已归档属性", fromLevel: beforeLevel, toLevel: afterLevel }];
  });
  return {
    period: settlement.period,
    startDate: settlement.startDate,
    endDate: settlement.endDate,
    goals,
    completedContent: settlementPlans.filter((plan) => completedIds.has(plan.id)).map(projectPlan),
    incompleteContent: settlementPlans.filter((plan) => incompleteIds.has(plan.id)).map(projectPlan),
    attributeGains,
    badgeUpgrades,
    skillbooks: state.skillbooks.filter((book) => localDate(book.acquiredAt) >= settlement.startDate && localDate(book.acquiredAt) <= settlement.endDate).map((book) => ({ title: book.title, acquiredAt: book.acquiredAt })),
  };
}

export function createReviewSummaryClient(config: AiReviewState, fetchImpl: typeof fetch = fetch): ReviewSummaryClient {
  const root = config.baseUrl.replace(/\/$/, "");
  const query = (refresh = false) => new URLSearchParams({ preferredProvider: config.preferredProvider, apiBaseUrl: config.apiBaseUrl, ...(refresh ? { refresh: "1" } : {}) }).toString();
  return {
    async generate(facts) {
      const response = await fetchImpl(`${root}/v1/harvests`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          facts,
          preferredProvider: config.preferredProvider,
          apiBaseUrl: config.apiBaseUrl,
          model: config.model,
          reasoningEffort: config.reasoningEffort,
          output: {
            language: "zh-CN",
            title: facts.period === "week" ? "本周收获" : "本月收获",
            tone: "pixel-adventure-journal",
            style: "轻快可爱的像素探险日志；先写点亮进度，再提炼具体收获，最后连接徽章成长与遗留行动",
            format: "2 个短段落，160—260 个汉字，不使用 Markdown、列表或表情符号",
            factualOnly: true,
          },
        }),
      });
      if (!response.ok) throw new Error(`ai_review_http_${response.status}`);
      const body = await response.json() as Partial<ReviewSummaryResult>;
      if (typeof body.text !== "string" || body.text.trim() === "" || (body.provider !== "api" && body.provider !== "codex-cli")) throw new Error("ai_review_response_invalid");
      return { ...body, text: body.text.trim(), preferredProvider: body.preferredProvider === "api" ? "api" : "codex-cli", fallbackUsed: body.fallbackUsed === true, provider: body.provider, checkedAt: body.checkedAt ?? new Date().toISOString() };
    },
    async status(refresh = false) {
      const response = await fetchImpl(`${root}/v1/status?${query(refresh)}`);
      if (!response.ok) throw new Error(`ai_status_http_${response.status}`);
      return await response.json() as AiServiceStatus;
    },
  };
}
