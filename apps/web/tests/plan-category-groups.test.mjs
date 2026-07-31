import assert from "node:assert/strict";
import test from "node:test";

import { groupPlansByProjectCategory } from "../src/lib/plan-category-groups.ts";

const plan = (id, category, start, timeStatus = "scheduled") => ({
  id,
  title: id,
  detail: "",
  start,
  end: "",
  timeStatus,
  category,
  completed: false,
  rewards: [],
});

test("groups open plans by project category and reports scheduling state", () => {
  const groups = groupPlansByProjectCategory([
    plan("course-2", "课程学习", "时间待配置", "unscheduled"),
    plan("dance-1", "舞蹈学习", "18:30"),
    plan("course-1", "课程学习", "17:00"),
  ]);

  assert.deepEqual(groups.map((group) => ({
    category: group.category,
    ids: group.plans.map((item) => item.id),
    scheduledCount: group.scheduledCount,
    unscheduledCount: group.unscheduledCount,
  })), [
    { category: "课程学习", ids: ["course-1", "course-2"], scheduledCount: 1, unscheduledCount: 1 },
    { category: "舞蹈学习", ids: ["dance-1"], scheduledCount: 1, unscheduledCount: 0 },
  ]);
});

test("uses an explicit fallback for blank categories", () => {
  assert.equal(groupPlansByProjectCategory([plan("misc", "  ", "09:00")])[0]?.category, "未分类");
});
