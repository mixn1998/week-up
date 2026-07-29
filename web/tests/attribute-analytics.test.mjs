import assert from "node:assert/strict";
import test from "node:test";

import { projectAttributeAnalytics, projectAttributeOverview } from "../lib/attribute-analytics.ts";
import { createEmptyWeekUpState } from "../lib/week-up-domain.ts";

function analyticsState() {
  const base = createEmptyWeekUpState();
  const attributeId = "attribute-management";
  const plans = [
    { id: "plan-w1", title: "第一周研究", detail: "", category: "学术", startAt: "2026-07-08T09:00:00+08:00", endAt: "2026-07-08T10:00:00+08:00", goalIds: [], rewards: [{ attributeId, amount: 3 }], rewardMode: "custom", source: "week-up", projectId: "project-study", createdAt: "2026-07-08T00:00:00+08:00", updatedAt: "2026-07-08T00:00:00+08:00" },
    { id: "plan-undone", title: "已经撤销", detail: "", category: "生活", startAt: "2026-07-18T09:00:00+08:00", endAt: "2026-07-18T10:00:00+08:00", goalIds: [], rewards: [{ attributeId, amount: 8 }], rewardMode: "custom", source: "week-up", createdAt: "2026-07-18T00:00:00+08:00", updatedAt: "2026-07-18T00:00:00+08:00" },
    { id: "plan-w3", title: "课程判断", detail: "", category: "学术", startAt: "2026-07-24T09:00:00+08:00", endAt: "2026-07-24T10:00:00+08:00", goalIds: [], rewards: [{ attributeId, amount: 3 }], rewardMode: "custom", source: "learning-more", sourceCourseId: "course-analysis", createdAt: "2026-07-24T00:00:00+08:00", updatedAt: "2026-07-24T00:00:00+08:00" },
    { id: "plan-w4", title: "拆解本周项目风险", detail: "", category: "工作", startAt: "2026-07-29T09:00:00+08:00", endAt: "2026-07-29T10:00:00+08:00", goalIds: [], rewards: [{ attributeId, amount: 4 }], rewardMode: "template", source: "week-up", projectId: "project-work", createdAt: "2026-07-29T00:00:00+08:00", updatedAt: "2026-07-29T00:00:00+08:00" },
  ];
  const completionFacts = plans.map((plan, index) => ({
    id: `fact-${index + 1}`,
    planId: plan.id,
    completedAt: plan.endAt,
    source: plan.source,
    actualSegments: [],
    rewardSnapshot: plan.rewards,
    ...(plan.id === "plan-undone" ? { revertedAt: "2026-07-18T11:00:00+08:00" } : {}),
  }));
  return {
    attributeId,
    state: {
      ...base,
      attributes: [{ id: attributeId, name: "管理", category: "技能", icon: "mark-01", color: "green", note: "", pinned: false, createdAt: "2026-07-01T00:00:00+08:00" }],
      projects: [
        { id: "project-study", name: "论文写作", category: "学术", unit: "hour", rewardsPerUnit: [], source: "week-up", createdAt: "2026-07-01T00:00:00+08:00", updatedAt: "2026-07-01T00:00:00+08:00" },
        { id: "project-work", name: "事业规划", category: "工作", unit: "hour", rewardsPerUnit: [], source: "week-up", createdAt: "2026-07-01T00:00:00+08:00", updatedAt: "2026-07-01T00:00:00+08:00" },
      ],
      learningMoreCourses: [{ courseId: "course-analysis", title: "Learning MORE · 分析", status: "active", lastSyncedAt: "2026-07-24T00:00:00+08:00" }],
      plans,
      completionFacts,
      xpTransactions: [
        { id: "xp-1", attributeId, amount: 3, occurredAt: "2026-07-08T10:00:00+08:00", kind: "earned", completionFactId: "fact-1" },
        { id: "xp-2", attributeId, amount: 8, occurredAt: "2026-07-18T10:00:00+08:00", kind: "earned", completionFactId: "fact-2" },
        { id: "xp-3", attributeId, amount: -8, occurredAt: "2026-07-18T11:00:00+08:00", kind: "compensation", completionFactId: "fact-2" },
        { id: "xp-4", attributeId, amount: 3, occurredAt: "2026-07-24T10:00:00+08:00", kind: "earned", completionFactId: "fact-3" },
        { id: "xp-5", attributeId, amount: 2, occurredAt: "2026-07-29T10:00:00+08:00", kind: "earned", completionFactId: "fact-4" },
        { id: "xp-6", attributeId, amount: 2, occurredAt: "2026-07-30T10:00:00+08:00", kind: "compensation", completionFactId: "fact-4" },
      ],
    },
  };
}

test("projects current net XP sources and keeps their sum equal to badge total", () => {
  const { state, attributeId } = analyticsState();
  const analytics = projectAttributeAnalytics(state, attributeId, new Date("2026-07-29T12:00:00+08:00"));

  assert.equal(analytics.totalXp, 10);
  assert.equal(analytics.sources.reduce((sum, source) => sum + source.amount, 0), analytics.totalXp);
  assert.deepEqual(analytics.sources.map((source) => source.planTitle), ["拆解本周项目风险", "课程判断", "第一周研究"]);
  assert.equal(analytics.sources.some((source) => source.planTitle === "已经撤销"), false);
  assert.equal(analytics.sources[0].projectOrCourse, "事业规划");
  assert.equal(analytics.sources[1].projectOrCourse, "Learning MORE · 分析");
});

test("uses Shanghai completion dates for trends, weeks, categories, and active days", () => {
  const { state, attributeId } = analyticsState();
  const analytics = projectAttributeAnalytics(state, attributeId, new Date("2026-07-29T12:00:00+08:00"));

  assert.equal(analytics.thirtyDay.points.at(-1).totalXp, analytics.totalXp);
  assert.equal(analytics.thirtyDay.comparisonLabel, "+10 XP");
  assert.deepEqual(analytics.weeklyGains.map((week) => week.amount), [3, 0, 3, 4]);
  assert.deepEqual(analytics.categoryGains.map(({ category, amount }) => [category, amount]), [["学术", 6], ["工作", 4]]);
  assert.deepEqual(analytics.activeDates, ["2026-07-08", "2026-07-24", "2026-07-29"]);
  assert.equal(analytics.longestStreak, 1);
  assert.equal(analytics.monthGain, 10);
});

test("keeps orphaned positive ledger groups visible as historical sources", () => {
  const { state, attributeId } = analyticsState();
  const withOrphan = {
    ...state,
    xpTransactions: [...state.xpTransactions, {
      id: "xp-orphan",
      attributeId,
      amount: 2,
      occurredAt: "2026-07-28T08:00:00+08:00",
      kind: "earned",
      completionFactId: "fact-missing",
    }],
  };
  const analytics = projectAttributeAnalytics(withOrphan, attributeId, new Date("2026-07-29T12:00:00+08:00"));

  assert.equal(analytics.sources.find((source) => source.completionFactId === "fact-missing")?.planTitle, "历史完成记录");
  assert.equal(analytics.sources.reduce((sum, source) => sum + source.amount, 0), 12);
});

test("projects one all-attribute overview from the same effective XP sources", () => {
  const { state } = analyticsState();
  const overview = projectAttributeOverview({
    ...state,
    attributes: [
      ...state.attributes,
      { id: "attribute-empty", name: "创作", category: "技能", icon: "mark-02", color: "purple", note: "", pinned: false, createdAt: "2026-07-01T00:00:00+08:00" },
    ],
  }, new Date("2026-07-29T12:00:00+08:00"));

  assert.equal(overview.attributeCount, 2);
  assert.equal(overview.totalXp, 10);
  assert.equal(overview.thirtyDayGain, 10);
  assert.equal(overview.activeAttributeCount, 1);
  assert.deepEqual(overview.categories, [
    { category: "技能", totalXp: 10, attributeCount: 2, thirtyDayGain: 10 },
  ]);
  assert.equal(overview.thirtyDay.at(-1).totalXp, overview.totalXp);
  assert.deepEqual(overview.attributes.map((attribute) => attribute.name), ["管理", "创作"]);
});
