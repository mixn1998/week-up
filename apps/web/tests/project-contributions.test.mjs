import assert from "node:assert/strict";
import test from "node:test";

import { aggregateProjectCategoryContributions } from "../src/lib/project-contributions.ts";

const project = (id, name, category, source = "week-up") => ({
  id,
  name,
  category,
  source,
  unit: "hour",
  rewardsPerUnit: [],
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
});

const record = (id, projectId, source = "week-up") => ({
  id,
  title: id,
  detail: "",
  category: "旧行动标签",
  startAt: "2026-07-20T08:00:00+08:00",
  endAt: "2026-07-20T09:00:00+08:00",
  goalIds: [],
  rewards: [],
  rewardMode: "template",
  projectId,
  source,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
});

const plan = (id, xp, completed = true) => ({
  id,
  title: id,
  detail: "",
  start: "08:00",
  end: "09:00",
  category: "具体行动名称",
  completed,
  rewards: [{ attributeId: "focus", amount: xp }],
});

test("aggregates project contribution by category instead of concrete action", () => {
  const projects = [
    project("jazz", "JAZZ", "舞蹈学习"),
    project("hiphop", "HIPHOP", "舞蹈学习"),
    project("course", "微积分课程", "课程学习", "learning-more"),
  ];
  const records = [record("p1", "jazz"), record("p2", "hiphop"), record("p3", "course", "learning-more")];
  const categories = [
    { id: "dance", name: "舞蹈学习", color: "coral" },
    { id: "courses", name: "课程学习", color: "mint", integrationKey: "learning-more" },
  ];

  assert.deepEqual(
    aggregateProjectCategoryContributions([plan("p1", 3), plan("p2", 2), plan("p3", 4)], records, projects, categories),
    [
      { categoryId: "dance", label: "舞蹈学习", color: "coral", xp: 5 },
      { categoryId: "courses", label: "课程学习", color: "mint", xp: 4 },
    ],
  );
});

test("uses the current user-defined integration category and ignores unfinished or zero-XP actions", () => {
  const records = [record("learning", undefined, "learning-more"), record("temporary", undefined)];
  const categories = [
    { id: "my-learning", name: "我的课程世界", color: "blue", integrationKey: "learning-more" },
    { id: "legacy-label", name: "旧行动标签", color: "yellow" },
  ];

  assert.deepEqual(
    aggregateProjectCategoryContributions(
      [plan("learning", 2), plan("temporary", 1), plan("unfinished", 9, false), plan("zero", 0)],
      records,
      [],
      categories,
    ),
    [
      { categoryId: "my-learning", label: "我的课程世界", color: "blue", xp: 2 },
      { categoryId: "legacy-label", label: "旧行动标签", color: "yellow", xp: 1 },
    ],
  );
});
