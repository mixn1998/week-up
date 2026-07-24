import assert from "node:assert/strict";
import test from "node:test";

import {
  createEmptyWeekUpState,
  currentWeightEntries,
  dispatchWeekUp,
  exportWeekUpBackup,
  importWeekUpBackup,
  migrateWeekUpState,
  totalXpForAttribute,
} from "../lib/week-up-domain.ts";
import { HttpWeekUpRepository, MemoryWeekUpRepository } from "../lib/week-up-repository.ts";
import { createWeekUpStore } from "../lib/week-up-store.ts";

function harness(at = "2026-07-20T08:00:00.000Z") {
  let sequence = 0;
  let now = at;
  const context = { now: () => now, id: (prefix) => `${prefix}-${++sequence}` };
  return {
    context,
    setNow(value) { now = value; },
    run(state, command) { return dispatchWeekUp(state, command, context).state; },
  };
}

function addAttribute(h, state, name = "推理") {
  return h.run(state, {
    type: "attribute.create",
    value: { name, icon: "◆", color: "cyan", note: "", category: "学习", pinned: false },
  });
}

function addPlan(h, state, attributeId, overrides = {}) {
  return h.run(state, {
    type: "plan.create",
    value: {
      title: "学习数学课程",
      detail: "第 1 课",
      category: "学习",
      startAt: "2026-07-20T09:00:00+08:00",
      endAt: "2026-07-20T10:00:00+08:00",
      goalIds: [],
      rewards: [{ attributeId, amount: 2 }],
      ...overrides,
    },
  });
}

test("persists CRUD state and serializes writes through the store", async () => {
  const h = harness();
  const repository = new MemoryWeekUpRepository();
  const store = createWeekUpStore(repository, h.context);
  await store.load();
  await Promise.all([
    store.dispatch({ type: "attribute.create", value: { name: "体力", icon: "♥", color: "pink", note: "", category: "身体", pinned: true } }),
    store.dispatch({ type: "attribute.create", value: { name: "敏捷", icon: "➜", color: "cyan", note: "", category: "身体", pinned: false } }),
  ]);
  assert.deepEqual(store.snapshot().attributes.map((item) => item.name), ["体力", "敏捷"]);
  const reloaded = createWeekUpStore(repository, h.context);
  await reloaded.load();
  assert.equal(reloaded.snapshot().revision, 2);
  assert.equal(reloaded.snapshot().attributes.length, 2);
});

test("automatically reconnects persistence after a temporary local service outage", async () => {
  const cached = { ...createEmptyWeekUpState(), revision: 2 };
  const server = { ...createEmptyWeekUpState(), revision: 3 };
  let available = false;
  const cache = {
    async load() { return structuredClone(cached); },
    async replace(state) { return structuredClone(state); },
  };
  const fetcher = async () => {
    if (!available) throw new TypeError("fetch failed");
    return new Response(JSON.stringify({ state: server }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const repository = new HttpWeekUpRepository(fetcher, cache);
  const statuses = [];
  repository.subscribeStatus((status) => statuses.push(status));
  assert.equal((await repository.load()).revision, 2);
  assert.equal(repository.status, "offline");

  const recovered = new Promise((resolve) => {
    const stop = repository.startRecovery((state) => { stop(); resolve(state); }, { intervalMs: 5 });
    available = true;
  });
  assert.equal((await recovered).revision, 3);
  assert.equal(repository.status, "online");
  assert.deepEqual(statuses, ["connecting", "offline", "online"]);
});

test("keeps persistence online when the server returns an application error", async () => {
  const state = createEmptyWeekUpState();
  let failing = false;
  const cache = {
    async load() { return structuredClone(state); },
    async replace(next) { return structuredClone(next); },
  };
  const fetcher = async () => failing
    ? new Response(JSON.stringify({ error: "plan_not_found" }), { status: 400, headers: { "content-type": "application/json" } })
    : new Response(JSON.stringify({ state }), { status: 200, headers: { "content-type": "application/json" } });
  const repository = new HttpWeekUpRepository(fetcher, cache);
  await repository.load();
  failing = true;
  await assert.rejects(() => repository.dispatch(state, { type: "plan.remove", id: "missing" }), /plan_not_found/);
  assert.equal(repository.status, "online");
});

test("rejects unsupported commands explicitly instead of returning an undefined outcome", () => {
  const h = harness();
  assert.throws(() => dispatchWeekUp(createEmptyWeekUpState(), { type: "plan.future-command" }, h.context), /week_up_command_unsupported/);
});

test("manages persistent badge categories and safely rehomes badges on deletion", () => {
  const h = harness();
  let state = createEmptyWeekUpState();
  assert.deepEqual(state.attributeCategories.map((category) => category.name), ["未分类"]);
  state = h.run(state, { type: "attribute-category.create", name: "运动类" });
  const categoryId = state.attributeCategories.find((category) => category.name === "运动类").id;
  state = h.run(state, { type: "attribute.create", value: { name: "敏捷", icon: "⚡", color: "yellow", note: "", category: "运动类", pinned: false } });
  state = h.run(state, { type: "attribute-category.rename", id: categoryId, name: "身体类" });
  assert.equal(state.attributes[0].category, "身体类");
  state = h.run(state, { type: "attribute-category.delete", id: categoryId });
  assert.equal(state.attributes[0].category, "未分类");
  assert.equal(state.attributeCategories.some((category) => category.name === "身体类"), false);
  assert.throws(() => h.run(state, { type: "attribute-category.delete", id: "attribute-category-uncategorized" }), /attribute_category_system_locked/);
});

test("manages project categories and propagates taxonomy changes to historical plans", () => {
  const h = harness();
  let state = createEmptyWeekUpState();
  state = h.run(state, { type: "project-category.create", name: "研究工作", color: "cyan" });
  const categoryId = state.projectCategories.find((category) => category.name === "研究工作").id;
  assert.equal(state.projectCategories.find((category) => category.id === categoryId).color, "cyan");
  state = h.run(state, { type: "project.create", value: { name: "论文", category: "研究工作", unit: "occurrence", rewardsPerUnit: [] } });
  state = h.run(state, { type: "project.plan.create", projectId: state.projects[0].id, startAt: "2026-07-20T09:00:00+08:00" });
  state = h.run(state, { type: "plan.complete", id: state.plans[0].id });
  state = h.run(state, { type: "plan.create", value: { title: "旧历史记录", detail: "", category: "研究工作", startAt: "2026-07-13T09:00:00+08:00", endAt: "2026-07-13T10:00:00+08:00", goalIds: [], rewards: [] } });
  const historicalPlanId = state.plans[1].id;
  state = h.run(state, { type: "project-category.rename", id: categoryId, name: "学术研究", color: "violet" });
  assert.equal(state.projects[0].category, "学术研究");
  assert.equal(state.plans[0].category, "学术研究");
  assert.equal(state.plans.find((plan) => plan.id === historicalPlanId).category, "学术研究");
  assert.equal(state.projectCategories.find((category) => category.id === categoryId).color, "violet");
  state = h.run(state, { type: "project-category.delete", id: categoryId });
  assert.equal(state.projects[0].category, "未分类");
  assert.equal(state.plans[0].category, "未分类");
  assert.throws(() => h.run(state, { type: "project-category.delete", id: "project-category-uncategorized" }), /project_category_system_locked/);
});

test("keeps the user-defined Learning MORE category name and color across later syncs", () => {
  const h = harness();
  const course = { courseId: "course-1", title: "概率论", status: "active" };
  const lesson = { courseId: "course-1", lessonId: "lesson-1", scheduleItemId: "schedule-1", scheduledDate: "2026-07-20", title: "条件概率", order: 0 };
  let state = h.run(createEmptyWeekUpState(), { type: "learning-more.import", courses: [course], lessons: [lesson], facts: [] });
  const category = state.projectCategories.find((item) => item.integrationKey === "learning-more");
  assert.ok(category);
  state = h.run(state, { type: "project-category.rename", id: category.id, name: "我的系统课程", color: "blue" });
  state = h.run(state, { type: "learning-more.import", courses: [course], lessons: [lesson], facts: [] });
  assert.equal(state.projectCategories.find((item) => item.integrationKey === "learning-more")?.name, "我的系统课程");
  assert.equal(state.projectCategories.find((item) => item.integrationKey === "learning-more")?.color, "blue");
  assert.equal(state.projectCategories.some((item) => item.name === "Learning MORE"), false);
  assert.equal(state.projects[0].category, "我的系统课程");
  assert.equal(state.plans[0].category, "我的系统课程");
  assert.throws(() => h.run(state, { type: "project-category.delete", id: category.id }), /project_category_integration_locked/);
});

test("archives goals while permanently removing plans", () => {
  const h = harness();
  let state = addAttribute(h, createEmptyWeekUpState());
  state = h.run(state, { type: "goal.create", value: { title: "论文方向", note: "", period: "month", startDate: "2026-07-01", endDate: "2026-07-31", linkedGoalIds: [] } });
  const goalId = state.goals[0].id;
  state = h.run(state, { type: "goal.update", id: goalId, patch: { note: "完成理论章节" } });
  assert.equal(state.goals[0].note, "完成理论章节");
  state = addPlan(h, state, state.attributes[0].id, { goalIds: [goalId] });
  const planId = state.plans[0].id;
  state = h.run(state, { type: "plan.update", id: planId, patch: { title: "重写理论章节" } });
  assert.equal(state.plans[0].title, "重写理论章节");
  state = h.run(state, { type: "plan.remove", id: planId });
  state = h.run(state, { type: "goal.archive", id: goalId });
  assert.equal(state.plans.some((plan) => plan.id === planId), false);
  assert.ok(state.goals[0].archivedAt);
});

test("creates project plans with derived rewards and reuses the smallest sequence gap", () => {
  const h = harness();
  let state = addAttribute(h, createEmptyWeekUpState());
  const attributeId = state.attributes[0].id;
  state = h.run(state, { type: "project.create", value: { name: "论文", category: "研究", unit: "hour", rewardsPerUnit: [{ attributeId, amount: 2 }] } });
  const projectId = state.projects[0].id;
  state = h.run(state, { type: "project.plan.create", projectId, startAt: "2026-07-20T09:00:00+08:00" });
  state = h.run(state, { type: "project.plan.create", projectId, startAt: "2026-07-21T09:00:00+08:00" });
  assert.deepEqual(state.plans.map((plan) => [plan.title, plan.sequenceNumber, plan.rewards[0].amount]), [["论文 01", 1, 2], ["论文 02", 2, 2]]);
  const removedPlanId = state.plans[0].id;
  state = h.run(state, { type: "plan.remove", id: removedPlanId });
  assert.equal(state.plans.some((plan) => plan.id === removedPlanId), false);
  state = h.run(state, { type: "project.plan.create", projectId, startAt: "2026-07-22T09:00:00+08:00" });
  const replacement = state.plans.find((plan) => plan.sequenceNumber === 1);
  assert.equal(replacement.title, "论文 01");
  assert.equal(replacement.sequenceNumber, 1);
  state = h.run(state, { type: "plan.update", id: replacement.id, patch: { endAt: "2026-07-22T10:30:00+08:00" } });
  const updatedReplacement = state.plans.find((plan) => plan.id === replacement.id);
  assert.equal(updatedReplacement.unitQuantity, 1.5);
  assert.equal(updatedReplacement.rewards[0].amount, 3);
});

test("creates unscheduled project and recurring plans with goal links", () => {
  const h = harness();
  let state = addAttribute(h, createEmptyWeekUpState());
  const attributeId = state.attributes[0].id;
  state = h.run(state, { type: "project.create", value: { name: "论文", category: "研究", unit: "hour", rewardsPerUnit: [{ attributeId, amount: 2 }] } });
  state = h.run(state, { type: "goal.create", value: { title: "推进论文", note: "", period: "week", startDate: "2026-07-20", endDate: "2026-07-26", linkedGoalIds: [] } });
  const projectId = state.projects[0].id;
  const goalId = state.goals[0].id;

  state = h.run(state, { type: "project.plan.create", projectId, startAt: "2026-07-20T00:00:00+08:00", endAt: "2026-07-20T01:00:00+08:00", timeStatus: "unscheduled", timeSegments: [], goalIds: [goalId] });
  assert.equal(state.plans[0].timeStatus, "unscheduled");
  assert.deepEqual(state.plans[0].timeSegments, []);
  assert.deepEqual(state.plans[0].goalIds, [goalId]);

  state = h.run(state, { type: "plan.recurrence.create", projectId, startAts: ["2026-07-21T00:00:00+08:00", "2026-07-22T00:00:00+08:00"], endAts: ["2026-07-21T01:00:00+08:00", "2026-07-22T01:00:00+08:00"], timeStatus: "unscheduled", goalIds: [goalId], recurrenceGroupId: "repeat-unscheduled", recurrenceSummary: "每天 · 共 2 次" });
  assert.deepEqual(state.plans.slice(1).map((plan) => [plan.timeStatus, plan.timeSegments, plan.goalIds]), [
    ["unscheduled", [], [goalId]],
    ["unscheduled", [], [goalId]],
  ]);
});

test("lets an edited plan switch between scheduled and time-unconfigured", () => {
  const h = harness();
  let state = h.run(createEmptyWeekUpState(), {
    type: "plan.create",
    value: {
      title: "Write outline",
      detail: "Draft section one",
      category: "Research",
      startAt: "2026-07-21T09:00:00+08:00",
      endAt: "2026-07-21T10:00:00+08:00",
      goalIds: [],
      rewards: [],
    },
  });
  const id = state.plans[0].id;

  state = h.run(state, {
    type: "plan.update",
    id,
    patch: {
      startAt: "2026-07-21T00:00:00+08:00",
      endAt: "2026-07-21T01:00:00+08:00",
      timeSegments: [],
      timeStatus: "unscheduled",
    },
  });
  assert.equal(state.plans[0].timeStatus, "unscheduled");
  assert.deepEqual(state.plans[0].timeSegments, []);

  state = h.run(state, {
    type: "plan.update",
    id,
    patch: {
      startAt: "2026-07-21T14:00:00+08:00",
      endAt: "2026-07-21T15:00:00+08:00",
      timeSegments: [{ id: "segment-restored", startAt: "2026-07-21T14:00:00+08:00", endAt: "2026-07-21T15:00:00+08:00" }],
      timeStatus: "scheduled",
    },
  });
  assert.equal(state.plans[0].timeStatus, "scheduled");
  assert.equal(state.plans[0].timeSegments.length, 1);
});

test("batch editing a recurrence can clear time without changing occurrence dates", () => {
  const h = harness();
  let state = h.run(createEmptyWeekUpState(), {
    type: "plan.recurrence.create",
    title: "Daily review",
    startAts: ["2026-07-21T09:00:00+08:00", "2026-07-22T09:00:00+08:00"],
    endAts: ["2026-07-21T10:00:00+08:00", "2026-07-22T10:00:00+08:00"],
    recurrenceGroupId: "review-series",
    recurrenceSummary: "Daily",
  });
  const current = state.plans[0];

  state = h.run(state, {
    type: "plan.recurrence.update",
    id: current.id,
    patch: {
      title: current.title,
      detail: current.detail,
      category: current.category,
      startAt: "2026-07-21T00:00:00+08:00",
      endAt: "2026-07-21T01:00:00+08:00",
      timeSegments: [],
      timeStatus: "unscheduled",
      goalIds: current.goalIds,
      rewards: current.rewards,
    },
  });

  assert.deepEqual(state.plans.map((plan) => [plan.startAt.slice(0, 10), plan.timeStatus, plan.timeSegments]), [
    ["2026-07-21", "unscheduled", []],
    ["2026-07-22", "unscheduled", []],
  ]);
});

test("uses an explicitly selected execution period for project and recurring plans", () => {
  const h = harness();
  let state = addAttribute(h, createEmptyWeekUpState());
  const attributeId = state.attributes[0].id;
  state = h.run(state, { type: "project.create", value: { name: "写作", category: "研究", unit: "hour", rewardsPerUnit: [{ attributeId, amount: 2 }] } });
  const projectId = state.projects[0].id;
  state = h.run(state, { type: "project.plan.create", projectId, startAt: "2026-07-20T09:00:00+08:00", endAt: "2026-07-20T10:30:00+08:00" });
  assert.equal(state.plans[0].endAt, "2026-07-20T10:30:00+08:00");
  assert.equal(state.plans[0].unitQuantity, 1.5);
  assert.equal(state.plans[0].rewards[0].amount, 3);

  state = h.run(state, { type: "plan.recurrence.create", projectId, startAts: ["2026-07-21T18:00:00+08:00", "2026-07-22T18:00:00+08:00"], endAts: ["2026-07-21T18:45:00+08:00", "2026-07-22T18:45:00+08:00"], recurrenceGroupId: "repeat-period", recurrenceSummary: "每天 · 共 2 次" });
  assert.deepEqual(state.plans.slice(1).map((plan) => [plan.startAt, plan.endAt, plan.unitQuantity, plan.rewards[0].amount]), [
    ["2026-07-21T18:00:00+08:00", "2026-07-21T18:45:00+08:00", 0.75, 1.5],
    ["2026-07-22T18:00:00+08:00", "2026-07-22T18:45:00+08:00", 0.75, 1.5],
  ]);
});

test("sums segmented execution time without counting the gaps between segments", () => {
  const h = harness();
  let state = addAttribute(h, createEmptyWeekUpState());
  const attributeId = state.attributes[0].id;
  state = h.run(state, { type: "project.create", value: { name: "分段写作", category: "研究", unit: "hour", rewardsPerUnit: [{ attributeId, amount: 2 }] } });
  const projectId = state.projects[0].id;

  state = h.run(state, {
    type: "project.plan.create",
    projectId,
    startAt: "2026-07-20T09:00:00+08:00",
    endAt: "2026-07-20T15:30:00+08:00",
    timeSegments: [
      { startAt: "2026-07-20T09:00:00+08:00", endAt: "2026-07-20T10:00:00+08:00" },
      { startAt: "2026-07-20T14:00:00+08:00", endAt: "2026-07-20T15:30:00+08:00" },
    ],
  });

  assert.equal(state.plans[0].unitQuantity, 2.5);
  assert.equal(state.plans[0].rewards[0].amount, 5);
});

test("cancels future recurrence members while preserving completed and manually edited occurrences", () => {
  const h = harness();
  let state = addAttribute(h, createEmptyWeekUpState());
  state = h.run(state, { type: "project.create", value: { name: "慢跑", category: "运动", unit: "occurrence", rewardsPerUnit: [] } });
  const projectId = state.projects[0].id;
  state = h.run(state, { type: "plan.recurrence.create", projectId, startAts: [20, 21, 22, 23].map((day) => `2026-07-${day}T07:00:00+08:00`), recurrenceGroupId: "repeat-1", recurrenceSummary: "每天 · 共 4 次" });
  assert.equal(state.revision, 3);
  assert.deepEqual(state.plans.map((plan) => plan.sequenceNumber), [1, 2, 3, 4]);
  state = h.run(state, { type: "plan.complete", id: state.plans[0].id });
  state = h.run(state, { type: "plan.update", id: state.plans[1].id, patch: { startAt: "2026-07-21T08:00:00+08:00", endAt: "2026-07-21T09:00:00+08:00" } });
  assert.ok(state.plans[1].recurrenceDetachedAt);
  const completedId = state.plans[0].id;
  const detachedId = state.plans[1].id;
  const cancelledIds = state.plans.slice(2).map((plan) => plan.id);
  state = h.run(state, { type: "plan.recurrence.cancel", id: state.plans[0].id });
  assert.ok(state.plans.some((plan) => plan.id === completedId));
  assert.ok(state.plans.some((plan) => plan.id === detachedId));
  assert.ok(cancelledIds.every((id) => !state.plans.some((plan) => plan.id === id)));
});

test("updates future recurrence members while preserving completed and manually edited occurrences", () => {
  const h = harness();
  let state = addAttribute(h, createEmptyWeekUpState());
  const attributeId = state.attributes[0].id;
  state = h.run(state, { type: "project.create", value: { name: "慢跑", category: "运动", unit: "hour", rewardsPerUnit: [{ attributeId, amount: 2 }] } });
  const projectId = state.projects[0].id;
  const startAts = [20, 21, 22, 23, 24].map((day) => `2026-07-${day}T07:00:00+08:00`);
  const endAts = [20, 21, 22, 23, 24].map((day) => `2026-07-${day}T08:00:00+08:00`);
  state = h.run(state, { type: "plan.recurrence.create", projectId, startAts, endAts, recurrenceGroupId: "repeat-update", recurrenceSummary: "每天 · 共 5 次" });
  state = h.run(state, { type: "plan.complete", id: state.plans[2].id });
  state = h.run(state, { type: "plan.update", id: state.plans[3].id, patch: { startAt: "2026-07-23T09:00:00+08:00", endAt: "2026-07-23T10:00:00+08:00" } });
  const current = state.plans[1];
  const originalDetails = state.plans.map((plan) => plan.detail);
  state = h.run(state, {
    type: "plan.recurrence.update",
    id: current.id,
    patch: {
      title: current.title,
      detail: "轻松跑",
      category: current.category,
      startAt: "2026-07-21T08:30:00+08:00",
      endAt: "2026-07-21T10:00:00+08:00",
      goalIds: [],
      rewards: current.rewards,
    },
  });

  assert.equal(state.plans[0].detail, originalDetails[0]);
  assert.equal(state.plans[0].startAt, startAts[0]);
  assert.equal(state.plans[1].detail, "轻松跑");
  assert.equal(Date.parse(state.plans[1].startAt), Date.parse("2026-07-21T08:30:00+08:00"));
  assert.equal(state.plans[1].rewards[0].amount, 3);
  assert.equal(state.plans[2].detail, originalDetails[2]);
  assert.equal(state.plans[2].startAt, startAts[2]);
  assert.equal(state.plans[3].detail, originalDetails[3]);
  assert.equal(Date.parse(state.plans[3].startAt), Date.parse("2026-07-23T09:00:00+08:00"));
  assert.equal(state.plans[4].title, "慢跑 05");
  assert.equal(state.plans[4].detail, "轻松跑");
  assert.equal(Date.parse(state.plans[4].startAt), Date.parse("2026-07-24T08:30:00+08:00"));
  assert.equal(Date.parse(state.plans[4].endAt), Date.parse("2026-07-24T10:00:00+08:00"));
  assert.equal(state.plans[4].rewards[0].amount, 3);
});

test("propagates project template changes only to unfinished followers", () => {
  const h = harness();
  let state = addAttribute(h, createEmptyWeekUpState());
  const attributeId = state.attributes[0].id;
  state = h.run(state, { type: "project.create", value: { name: "舞蹈", category: "身体", unit: "occurrence", rewardsPerUnit: [{ attributeId, amount: 2 }] } });
  const projectId = state.projects[0].id;
  state = h.run(state, { type: "project.plan.create", projectId, startAt: "2026-07-20T09:00:00+08:00" });
  state = h.run(state, { type: "project.plan.create", projectId, startAt: "2026-07-21T09:00:00+08:00", unitQuantity: 2 });
  const completedId = state.plans[0].id;
  const followerId = state.plans[1].id;
  state = h.run(state, { type: "plan.complete", id: completedId });
  state = h.run(state, { type: "project.update", id: projectId, patch: { name: "现代舞", rewardsPerUnit: [{ attributeId, amount: 4 }] } });
  assert.equal(state.plans[0].title, "舞蹈 01");
  assert.equal(state.plans[0].rewards[0].amount, 2);
  assert.equal(state.plans[1].title, "现代舞 02");
  assert.equal(state.plans[1].rewards[0].amount, 8);
  assert.equal(totalXpForAttribute(state, attributeId), 2);
  state = h.run(state, { type: "plan.update", id: followerId, patch: { rewards: [{ attributeId, amount: 9 }] } });
  assert.equal(state.plans[1].rewardMode, "custom");
  state = h.run(state, { type: "project.update", id: projectId, patch: { rewardsPerUnit: [{ attributeId, amount: 6 }] } });
  assert.equal(state.plans[1].rewards[0].amount, 9);
  state = h.run(state, { type: "plan.follow-template", id: followerId });
  assert.equal(state.plans[1].rewardMode, "template");
  assert.equal(state.plans[1].rewards[0].amount, 12);
});

test("imports scheduled Learning MORE lessons as time-unconfigured plans and applies one course template", () => {
  const h = harness();
  let state = addAttribute(h, createEmptyWeekUpState());
  const attributeId = state.attributes[0].id;
  const lessons = [
    { courseId: "c1", lessonId: "l1", scheduleItemId: "s1", scheduledDate: "2026-07-20", title: "第一节", objective: "认识事件", order: 0 },
    { courseId: "c1", lessonId: "l2", scheduleItemId: "s2", scheduledDate: "2026-07-21", title: "第二节", objective: "练习概率", order: 1 },
  ];
  state = h.run(state, { type: "learning-more.import", courses: [{ courseId: "c1", title: "概率论", status: "active" }], lessons, facts: [] });
  assert.equal(state.projects[0].source, "learning-more");
  assert.equal(state.projects[0].unit, "lesson");
  assert.equal(state.plans.length, 2);
  assert.deepEqual(state.plans.map((plan) => [plan.title, plan.startAt, plan.timeStatus]), [["第一节", "2026-07-20T00:00:00+08:00", "unscheduled"], ["第二节", "2026-07-21T00:00:00+08:00", "unscheduled"]]);
  state = h.run(state, { type: "project.update", id: state.projects[0].id, patch: { rewardsPerUnit: [{ attributeId, amount: 3 }] } });
  assert.deepEqual(state.plans.map((plan) => plan.rewards[0].amount), [3, 3]);
  state = h.run(state, { type: "plan.update", id: state.plans[0].id, patch: { startAt: "2026-07-20T09:00:00+08:00", endAt: "2026-07-20T10:00:00+08:00", timeStatus: "scheduled" } });
  state = h.run(state, { type: "learning-more.import", facts: [{ factId: "f1", type: "lesson-completed", occurredAt: "2026-07-20T10:00:00+08:00", courseId: "c1", lessonId: "l1" }] });
  state = h.run(state, { type: "plan.update", id: state.plans[1].id, patch: { rewards: [{ attributeId, amount: 8 }] } });
  state = h.run(state, { type: "project.update", id: state.projects[0].id, patch: { rewardsPerUnit: [{ attributeId, amount: 5 }] } });
  assert.equal(state.plans[0].rewards[0].amount, 3);
  assert.equal(state.plans[1].rewards[0].amount, 8);
  assert.equal(totalXpForAttribute(state, attributeId), 3);
  const nextLesson = { courseId: "c1", lessonId: "l3", scheduleItemId: "s3", scheduledDate: "2026-07-22", title: "第三节", objective: "综合练习", order: 2 };
  state = h.run(state, { type: "learning-more.import", courses: [{ courseId: "c1", title: "概率论", status: "active" }], lessons: [...lessons, nextLesson], facts: [] });
  assert.equal(state.plans[2].rewards[0].amount, 5);
  assert.equal(state.plans[2].timeStatus, "unscheduled");
});

test("removes an unfinished Learning MORE plan when its lesson leaves the timetable", () => {
  const h = harness();
  const course = { courseId: "c1", title: "概率论", status: "active" };
  const lesson = { courseId: "c1", lessonId: "l1", scheduleItemId: "s1", scheduledDate: "2026-07-20", title: "第一节", order: 0 };
  let state = h.run(createEmptyWeekUpState(), { type: "learning-more.import", courses: [course], lessons: [lesson], facts: [] });
  const planId = state.plans[0].id;
  const projectId = state.projects[0].id;

  state = h.run(state, { type: "learning-more.import", courses: [], lessons: [], facts: [] });

  assert.ok(state.plans.find((plan) => plan.id === planId).removedAt);
  assert.ok(state.projects.find((project) => project.id === projectId).archivedAt);
  assert.deepEqual(state.learningMoreCourses, []);
  assert.deepEqual(state.learningMoreLessons, []);
});

test("keeps distinct Learning MORE schedule items even when lesson id or title repeats", () => {
  const h = harness();
  const course = { courseId: "c1", title: "Token Course", status: "active" };
  const lessons = [
    { courseId: "c1", lessonId: "l-token", scheduleItemId: "s-token-a", scheduledDate: "2026-07-24", title: "Token 01", objective: "first objective", order: 0 },
    { courseId: "c1", lessonId: "l-token", scheduleItemId: "s-token-b", scheduledDate: "2026-07-25", title: "Token 01", objective: "second objective", order: 1 },
  ];

  const state = h.run(createEmptyWeekUpState(), { type: "learning-more.import", courses: [course], lessons, facts: [] });

  assert.equal(state.learningMoreLessons.length, 2);
  assert.equal(state.plans.length, 2);
  assert.deepEqual(state.plans.map((plan) => [plan.sourceRef, plan.detail]), [
    ["learning-more:s-token-a", "first objective"],
    ["learning-more:s-token-b", "second objective"],
  ]);
});

test("refreshes Learning MORE timetable by schedule item without deleting another repeated lesson", () => {
  const h = harness();
  const course = { courseId: "c1", title: "Travel Course", status: "active" };
  let state = h.run(createEmptyWeekUpState(), {
    type: "learning-more.import",
    courses: [course],
    lessons: [
      { courseId: "c1", lessonId: "l-repeat", scheduleItemId: "s-old", scheduledDate: "2026-07-24", title: "Route 02", objective: "old row", order: 0 },
      { courseId: "c1", lessonId: "l-repeat", scheduleItemId: "s-keep", scheduledDate: "2026-07-25", title: "Route 02", objective: "kept row", order: 1 },
    ],
    facts: [],
  });

  state = h.run(state, {
    type: "learning-more.import",
    lessons: [
      { courseId: "c1", lessonId: "l-repeat", scheduleItemId: "s-keep", scheduledDate: "2026-07-25", title: "Route 02", objective: "kept row updated", order: 0 },
      { courseId: "c1", lessonId: "l-repeat", scheduleItemId: "s-new", scheduledDate: "2026-07-26", title: "Route 02", objective: "new row", order: 1 },
    ],
    removedLessonIds: ["l-repeat"],
    removedScheduleItemIds: ["s-old"],
    facts: [],
    incremental: true,
  });

  const active = state.plans.filter((plan) => plan.source === "learning-more" && plan.removedAt === undefined);
  assert.deepEqual(active.map((plan) => [plan.sourceRef, plan.detail]).sort(), [
    ["learning-more:s-keep", "kept row updated"],
    ["learning-more:s-new", "new row"],
  ]);
  assert.ok(state.plans.find((plan) => plan.sourceRef === "learning-more:s-old")?.removedAt);
});

test("records completion exactly once and undo uses compensating XP", () => {
  const h = harness();
  let state = addAttribute(h, createEmptyWeekUpState());
  const attributeId = state.attributes[0].id;
  state = addPlan(h, state, attributeId);
  const planId = state.plans[0].id;
  state = h.run(state, { type: "plan.complete", id: planId });
  const afterDuplicate = h.run(state, { type: "plan.complete", id: planId });
  assert.equal(afterDuplicate, state);
  assert.equal(totalXpForAttribute(state, attributeId), 2);
  assert.equal(state.completionFacts.length, 1);
  state = h.run(state, { type: "plan.undo", id: planId });
  assert.equal(totalXpForAttribute(state, attributeId), 0);
  assert.equal(state.xpTransactions.length, 2);
  assert.equal(state.xpTransactions[1].kind, "compensation");
  assert.ok(state.completionFacts[0].revertedAt);
});

test("keeps historical overdue plans visible but excludes them from settlement and blocks completion", () => {
  const h = harness("2026-07-20T08:00:00+08:00");
  let state = addAttribute(h, createEmptyWeekUpState());
  state = addPlan(h, state, state.attributes[0].id, {
    title: "逾期行动",
    startAt: "2026-07-19T09:00:00+08:00",
    endAt: "2026-07-19T10:00:00+08:00",
  });
  const planId = state.plans[0].id;
  assert.throws(() => h.run(state, { type: "plan.complete", id: planId }), /plan_overdue/);
  state = h.run(state, { type: "settlement.generate", period: "week", startDate: "2026-07-13", endDate: "2026-07-19" });
  assert.equal(state.plans.some((plan) => plan.id === planId && plan.removedAt === undefined), true);
  assert.equal(state.settlements[0].completedPlanIds.includes(planId), false);
  assert.equal(state.settlements[0].incompletePlanIds.includes(planId), false);
});

test("reschedules an overdue plan as a new carried record and grants rewards only once", () => {
  const h = harness("2026-07-20T08:00:00+08:00");
  let state = addAttribute(h, createEmptyWeekUpState());
  state = addPlan(h, state, state.attributes[0].id, {
    title: "重新出发",
    startAt: "2026-07-19T09:00:00+08:00",
    endAt: "2026-07-19T10:00:00+08:00",
  });
  const originalId = state.plans[0].id;
  state = h.run(state, { type: "plan.overdue.reschedule", id: originalId, startAt: "2026-07-20T18:00:00+08:00", endAt: "2026-07-20T19:00:00+08:00" });
  const original = state.plans.find((plan) => plan.id === originalId);
  const carried = state.plans.find((plan) => plan.overdueSourcePlanId === originalId);
  assert.ok(carried);
  assert.equal(original.overdueRescheduledPlanId, carried.id);
  assert.equal(carried.startAt, "2026-07-20T18:00:00+08:00");
  assert.throws(() => h.run(state, { type: "plan.overdue.reschedule", id: originalId, startAt: "2026-07-21T18:00:00+08:00", endAt: "2026-07-21T19:00:00+08:00" }), /plan_already_rescheduled/);
  state = h.run(state, { type: "plan.complete", id: carried.id, completedAt: "2026-07-20T19:00:00+08:00" });
  assert.equal(totalXpForAttribute(state, state.attributes[0].id), 2);
  assert.equal(state.completionFacts.filter((fact) => fact.revertedAt === undefined).length, 1);
});

test("can carry an overdue plan into a new date without assigning a time", () => {
  const h = harness("2026-07-20T08:00:00+08:00");
  let state = addAttribute(h, createEmptyWeekUpState());
  state = addPlan(h, state, state.attributes[0].id, {
    title: "稍后安排",
    startAt: "2026-07-19T09:00:00+08:00",
    endAt: "2026-07-19T10:00:00+08:00",
  });
  const originalId = state.plans[0].id;
  state = h.run(state, {
    type: "plan.overdue.reschedule",
    id: originalId,
    startAt: "2026-07-21T00:00:00+08:00",
    endAt: "2026-07-21T01:00:00+08:00",
    timeSegments: [],
    timeStatus: "unscheduled",
  });
  const carried = state.plans.find((plan) => plan.overdueSourcePlanId === originalId);
  assert.ok(carried);
  assert.equal(carried.timeStatus, "unscheduled");
  assert.deepEqual(carried.timeSegments, []);
  assert.equal(carried.startAt.slice(0, 10), "2026-07-21");
});

test("refreshes a frozen settlement when a historical completion fact is corrected", () => {
  const h = harness("2026-07-20T08:00:00+08:00");
  let state = addAttribute(h, createEmptyWeekUpState());
  state = addPlan(h, state, state.attributes[0].id, {
    title: "历史补正",
    startAt: "2026-07-19T19:00:00+08:00",
    endAt: "2026-07-19T20:00:00+08:00",
  });
  const planId = state.plans[0].id;
  state = h.run(state, { type: "settlement.generate", period: "week", startDate: "2026-07-13", endDate: "2026-07-19" });
  assert.equal(state.settlements[0].completedPlanIds.includes(planId), false);
  state = h.run(state, { type: "plan.complete", id: planId, completedAt: "2026-07-19T20:00:00+08:00" });
  assert.equal(state.settlements[0].completedPlanIds.includes(planId), true);
  assert.equal(state.settlements[0].attributeGains[state.attributes[0].id], 2);
  assert.equal(state.settlements[0].harvest.status, "stale");
});

test("freezes weekly and monthly facts and queues an AI harvest idempotently", () => {
  const h = harness();
  let state = addAttribute(h, createEmptyWeekUpState());
  const attributeId = state.attributes[0].id;
  state = addPlan(h, state, attributeId);
  state = addPlan(h, state, attributeId, { title: "未完成的阅读", startAt: "2026-07-21T09:00:00+08:00", endAt: "2026-07-21T10:00:00+08:00" });
  state = h.run(state, { type: "plan.complete", id: state.plans[0].id });
  state = h.run(state, { type: "settlement.generate", period: "week", startDate: "2026-07-20", endDate: "2026-07-26" });
  const frozen = state.settlements[0];
  const duplicate = h.run(state, { type: "settlement.generate", period: "week", startDate: "2026-07-20", endDate: "2026-07-26" });
  assert.equal(duplicate, state);
  assert.deepEqual(frozen.completedPlanIds, [state.plans[0].id]);
  assert.deepEqual(frozen.incompletePlanIds, [state.plans[1].id]);
  assert.equal(frozen.attributeGains[attributeId], 2);
  assert.deepEqual(frozen.harvest, { status: "pending" });
  state = h.run(state, { type: "settlement.harvest.failed", id: frozen.id, message: "offline" });
  assert.deepEqual(state.settlements[0].harvest, { status: "failed", error: "offline" });
  state = h.run(state, { type: "settlement.harvest.retry", id: frozen.id });
  state = h.run(state, { type: "settlement.harvest.succeeded", id: frozen.id, text: "你本周稳稳推进了数学学习。" });
  assert.equal(state.settlements[0].harvest.status, "ready");
  assert.equal(state.settlements[0].harvest.text, "你本周稳稳推进了数学学习。");
});

test("counts only Learning MORE lessons scheduled inside the settlement period", () => {
  const h = harness();
  let state = createEmptyWeekUpState();
  const lessons = [
    { courseId: "c1", lessonId: "l0", scheduleItemId: "s0", scheduledDate: "2026-07-19", title: "上周课节", order: 0 },
    { courseId: "c1", lessonId: "l1", scheduleItemId: "s1", scheduledDate: "2026-07-22", title: "本周课节", order: 1 },
    { courseId: "c1", lessonId: "l2", scheduleItemId: "s2", scheduledDate: "2026-07-27", title: "下周课节", order: 2 },
  ];
  state = h.run(state, { type: "learning-more.import", courses: [{ courseId: "c1", title: "概率论", status: "active" }], lessons, facts: [] });
  state = h.run(state, { type: "settlement.generate", period: "week", startDate: "2026-07-20", endDate: "2026-07-26" });
  assert.deepEqual(state.settlements[0].incompletePlanIds, [state.plans.find((plan) => plan.sourceLessonId === "l1").id]);
});

test("refreshes a settled period and allows one AI regeneration after a historical Learning MORE backfill", () => {
  const h = harness("2026-07-20T08:00:00.000Z");
  let state = h.run(createEmptyWeekUpState(), {
    type: "learning-more.import",
    courses: [{ courseId: "course-game", title: "游戏设计", status: "active" }],
    lessons: [{ courseId: "course-game", lessonId: "lesson-a", scheduleItemId: "history:2026-07-17:lesson-a", scheduledDate: "2026-07-17", title: "第一节", order: 0 }],
    facts: [{ factId: "fact-a", type: "lesson-completed", occurredAt: "2026-07-17T12:00:00+08:00", courseId: "course-game", lessonId: "lesson-a" }],
  });
  state = h.run(state, { type: "settlement.generate", period: "week", startDate: "2026-07-13", endDate: "2026-07-19" });
  state = h.run(state, { type: "settlement.harvest.succeeded", id: state.settlements[0].id, text: "旧总结", provider: "codex-cli", preferredProvider: "codex-cli", fallbackUsed: false });

  state = h.run(state, {
    type: "learning-more.import",
    lessons: [
      { courseId: "course-game", lessonId: "lesson-a", scheduleItemId: "history:2026-07-17:lesson-a", scheduledDate: "2026-07-17", title: "第一节", order: 0 },
      { courseId: "course-game", lessonId: "lesson-b", scheduleItemId: "history:2026-07-17:lesson-b", scheduledDate: "2026-07-17", title: "漏同步课节", order: 1 },
    ],
    facts: [{ factId: "fact-b", type: "lesson-completed", occurredAt: "2026-07-17T13:00:00+08:00", courseId: "course-game", lessonId: "lesson-b" }],
  });

  assert.equal(state.settlements[0].completedPlanIds.length, 2);
  assert.equal(state.settlements[0].harvest.status, "stale");
  assert.equal(state.settlements[0].harvest.text, "旧总结");
  state = h.run(state, { type: "settlement.harvest.retry", id: state.settlements[0].id });
  assert.equal(state.settlements[0].harvest.status, "pending");
});

test("keeps one effective daily weight while preserving revision history", () => {
  const h = harness();
  let state = createEmptyWeekUpState();
  state = h.run(state, { type: "weight.record", localDate: "2026-07-20", valueKg: 58.4 });
  h.setNow("2026-07-20T09:00:00.000Z");
  state = h.run(state, { type: "weight.record", localDate: "2026-07-20", valueKg: 58.2 });
  assert.equal(state.weightRevisions.length, 2);
  assert.equal(state.weightRevisions[1].supersedesRevisionId, state.weightRevisions[0].id);
  assert.deepEqual(currentWeightEntries(state), [{ date: "2026-07-20", value: 58.2 }]);
  state = h.run(state, { type: "weight.target", valueKg: 56.5 });
  assert.equal(state.preferences.targetWeightKg, 56.5);
});

test("round-trips a versioned backup", () => {
  const h = harness();
  const state = addAttribute(h, createEmptyWeekUpState(), "协调");
  assert.deepEqual(importWeekUpBackup(exportWeekUpBackup(state)), state);
  assert.throws(() => importWeekUpBackup('{"format":"other"}'), /backup_format_invalid/);
  assert.deepEqual(migrateWeekUpState(state), state);
  const { attributeCategories: _legacyCategories, ...legacyState } = state;
  const migratedLegacy = migrateWeekUpState({ ...legacyState, schemaVersion: 6 });
  assert.deepEqual(migratedLegacy.attributeCategories.map((category) => category.name), ["未分类", "学习"]);
  assert.throws(() => migrateWeekUpState({ schemaVersion: 99 }), /database_schema_unsupported/);
});

test("migrates legacy Learning MORE clock times back to time-unconfigured", () => {
  const h = harness();
  let state = addAttribute(h, createEmptyWeekUpState());
  state = addPlan(h, state, state.attributes[0].id, {
    source: "learning-more",
    sourceRef: "learning-more:schedule-1",
    sourceLessonId: "lesson-1",
    sourceCourseId: "course-1",
    timeStatus: "scheduled",
  });
  const migrated = migrateWeekUpState({ ...state, schemaVersion: 5 });
  assert.equal(migrated.plans[0].timeStatus, "unscheduled");
});

test("imports Learning MORE course tables and facts while Week UP owns schedule time", () => {
  const h = harness();
  let state = addAttribute(h, createEmptyWeekUpState());
  const lessons = [{
    courseId: "course-1",
    lessonId: "lesson-1",
    scheduleItemId: "schedule-1",
    scheduledDate: "2026-07-20",
    title: "概率论第 1 课",
    objective: "条件概率",
    order: 0,
  }];
  state = h.run(state, { type: "learning-more.import", courses: [{ courseId: "course-1", title: "概率论", status: "active" }], lessons, facts: [], nextCursor: "cursor-1" });
  state = h.run(state, { type: "project.update", id: state.projects[0].id, patch: { rewardsPerUnit: [{ attributeId: state.attributes[0].id, amount: 3 }] } });
  state = h.run(state, { type: "plan.update", id: state.plans[0].id, patch: { startAt: "2026-07-20T09:00:00+08:00", endAt: "2026-07-20T10:00:00+08:00", timeStatus: "scheduled" } });
  const facts = [
    { factId: "fact-lesson", type: "lesson-completed", occurredAt: "2026-07-20T02:00:00Z", courseId: "course-1", lessonId: "lesson-1", actualStartedAt: "2026-07-20T02:12:00Z", actualEndedAt: "2026-07-20T03:47:00Z" },
    { factId: "fact-course", type: "course-closed", occurredAt: "2026-07-31T02:00:00Z", courseId: "course-1", courseTitle: "概率论" },
  ];
  const updatedLessons = [{ ...lessons[0], title: "概率论：条件概率" }];
  state = h.run(state, { type: "learning-more.import", courses: [{ courseId: "course-1", title: "概率论", status: "closed" }], lessons: updatedLessons, facts, nextCursor: "cursor-2" });
  assert.equal(state.plans[0].startAt, "2026-07-20T02:12:00Z");
  assert.equal(state.plans[0].endAt, "2026-07-20T03:47:00Z");
  assert.equal(state.plans[0].timeStatus, "scheduled");
  assert.equal(state.plans[0].title, "概率论：条件概率");
  assert.equal(state.plans[0].rewards[0].amount, 3);
  assert.equal(totalXpForAttribute(state, state.attributes[0].id), 3);
  assert.equal(state.skillbooks.length, 1);
  const duplicate = h.run(state, { type: "learning-more.import", courses: [{ courseId: "course-1", title: "概率论", status: "closed" }], lessons: updatedLessons, facts, nextCursor: "cursor-2" });
  assert.equal(duplicate.completionFacts.length, 1);
  assert.equal(duplicate.skillbooks.length, 1);
  assert.equal(totalXpForAttribute(duplicate, duplicate.attributes[0].id), 3);
  assert.equal(duplicate.learningMoreLessons[0].completedAt, "2026-07-20T02:00:00Z");
  assert.equal(duplicate.plans[0].removedAt, undefined);
});

test("adds Learning MORE provenance without duplicating a manual completion reward", () => {
  const h = harness();
  let state = addAttribute(h, createEmptyWeekUpState());
  const attributeId = state.attributes[0].id;
  state = addPlan(h, state, attributeId, { source: "learning-more", sourceRef: "schedule-1", sourceLessonId: "lesson-1", sourceCourseId: "course-1" });
  state = h.run(state, { type: "plan.complete", id: state.plans[0].id });
  state = h.run(state, { type: "learning-more.import", facts: [{ factId: "external-1", type: "lesson-completed", occurredAt: "2026-07-20T02:00:00Z", courseId: "course-1", lessonId: "lesson-1" }] });
  assert.equal(state.completionFacts.length, 1);
  assert.equal(state.completionFacts[0].externalFactId, "external-1");
  assert.equal(totalXpForAttribute(state, attributeId), 2);
});

test("reapplies an authoritative Learning MORE completion after its local completion was undone", () => {
  const h = harness();
  let state = addAttribute(h, createEmptyWeekUpState());
  const attributeId = state.attributes[0].id;
  const course = { courseId: "course-1", title: "数学", status: "active" };
  const lesson = { courseId: "course-1", lessonId: "lesson-1", scheduleItemId: "schedule-1", scheduledDate: "2026-07-20", title: "命题、量词与数学否定", order: 0 };
  state = h.run(state, { type: "learning-more.import", courses: [course], lessons: [lesson], facts: [] });
  state = h.run(state, { type: "project.update", id: state.projects[0].id, patch: { rewardsPerUnit: [{ attributeId, amount: 2 }] } });
  const planId = state.plans[0].id;
  const completion = { factId: "fact-completed", type: "lesson-completed", occurredAt: "2026-07-20T10:00:00+08:00", courseId: "course-1", lessonId: "lesson-1" };

  state = h.run(state, { type: "learning-more.import", facts: [completion] });
  state = h.run(state, { type: "plan.undo", id: planId });
  assert.equal(totalXpForAttribute(state, attributeId), 0);
  assert.equal(state.completionFacts.filter((fact) => fact.planId === planId && fact.revertedAt === undefined).length, 0);

  state = h.run(state, { type: "learning-more.import", facts: [completion] });

  assert.equal(state.completionFacts.filter((fact) => fact.planId === planId && fact.revertedAt === undefined).length, 1);
  assert.equal(totalXpForAttribute(state, attributeId), 2);
});

test("applies a repeated Learning MORE completion to the matching schedule item only", () => {
  const h = harness();
  let state = addAttribute(h, createEmptyWeekUpState());
  const attributeId = state.attributes[0].id;
  const course = { courseId: "course-repeat", title: "Token", status: "active" };
  const lessons = [
    { courseId: "course-repeat", lessonId: "lesson-repeat", scheduleItemId: "schedule-a", scheduledDate: "2026-07-23", title: "Token 01", order: 0 },
    { courseId: "course-repeat", lessonId: "lesson-repeat", scheduleItemId: "schedule-b", scheduledDate: "2026-07-24", title: "Token 01", order: 1 },
  ];
  state = h.run(state, { type: "learning-more.import", courses: [course], lessons, facts: [] });
  state = h.run(state, { type: "project.update", id: state.projects[0].id, patch: { rewardsPerUnit: [{ attributeId, amount: 1 }] } });

  state = h.run(state, {
    type: "learning-more.import",
    facts: [{ factId: "fact-schedule-b", type: "lesson-completed", occurredAt: "2026-07-24T10:00:00+08:00", courseId: "course-repeat", lessonId: "lesson-repeat", scheduleItemId: "schedule-b" }],
  });

  const planA = state.plans.find((plan) => plan.sourceRef === "learning-more:schedule-a");
  const planB = state.plans.find((plan) => plan.sourceRef === "learning-more:schedule-b");
  assert.ok(planA);
  assert.ok(planB);
  assert.equal(state.completionFacts.some((fact) => fact.planId === planA.id && fact.revertedAt === undefined), false);
  assert.equal(state.completionFacts.some((fact) => fact.planId === planB.id && fact.revertedAt === undefined), true);
  assert.equal(totalXpForAttribute(state, attributeId), 1);
});

test("completes a segmented plan only after every segment and awards XP once", () => {
  const h = harness();
  let state = addAttribute(h, createEmptyWeekUpState());
  const attributeId = state.attributes[0].id;
  state = addPlan(h, state, attributeId, {
    timeSegments: [
      { id: "morning", startAt: "2026-07-20T08:30:00+08:00", endAt: "2026-07-20T08:40:00+08:00" },
      { id: "noon", startAt: "2026-07-20T12:30:00+08:00", endAt: "2026-07-20T12:40:00+08:00" },
      { id: "night", startAt: "2026-07-20T23:00:00+08:00", endAt: "2026-07-20T23:10:00+08:00" },
    ],
  });
  const plan = state.plans[0];
  assert.equal(plan.startAt, "2026-07-20T08:30:00+08:00");
  assert.equal(plan.endAt, "2026-07-20T23:10:00+08:00");

  state = h.run(state, { type: "plan.segment.complete", id: plan.id, segmentId: "morning" });
  state = h.run(state, { type: "plan.segment.complete", id: plan.id, segmentId: "noon" });
  assert.equal(state.completionFacts.length, 0);
  assert.equal(totalXpForAttribute(state, attributeId), 0);

  state = h.run(state, { type: "plan.segment.complete", id: plan.id, segmentId: "night" });
  assert.equal(state.completionFacts.filter((fact) => fact.revertedAt === undefined).length, 1);
  assert.equal(totalXpForAttribute(state, attributeId), 2);
});

test("undoing one segment reopens the plan and compensates its single reward", () => {
  const h = harness();
  let state = addAttribute(h, createEmptyWeekUpState());
  const attributeId = state.attributes[0].id;
  state = addPlan(h, state, attributeId, {
    timeSegments: [
      { id: "first", startAt: "2026-07-20T09:00:00+08:00", endAt: "2026-07-20T09:30:00+08:00" },
      { id: "second", startAt: "2026-07-20T15:00:00+08:00", endAt: "2026-07-20T15:30:00+08:00" },
    ],
  });
  const planId = state.plans[0].id;
  state = h.run(state, { type: "plan.segment.complete", id: planId, segmentId: "first" });
  state = h.run(state, { type: "plan.segment.complete", id: planId, segmentId: "second" });
  state = h.run(state, { type: "plan.segment.undo", id: planId, segmentId: "first" });

  assert.equal(state.completionFacts.filter((fact) => fact.revertedAt === undefined).length, 0);
  assert.equal(totalXpForAttribute(state, attributeId), 0);
  assert.equal(state.plans[0].timeSegments.find((segment) => segment.id === "first").completedAt, undefined);
  assert.ok(state.plans[0].timeSegments.find((segment) => segment.id === "second").completedAt);
});
