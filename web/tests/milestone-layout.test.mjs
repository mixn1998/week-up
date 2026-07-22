import assert from "node:assert/strict";
import test from "node:test";

import {
  MILESTONE_ROUTE_END_X,
  MILESTONE_ROUTE_START_X,
  getFullWidthMilestoneRoute,
  milestoneNodeX,
  milestoneRouteY,
  resolveMilestoneNodePositions,
  selectMilestoneMapGoals,
} from "../lib/milestone-layout.ts";

const nodeSize = {
  start: { width: 8, height: 14 },
  week: { width: 10, height: 16 },
  finish: { width: 18, height: 22 },
};

function overlaps(a, b) {
  const aSize = nodeSize[a.kind];
  const bSize = nodeSize[b.kind];
  return Math.abs(a.x - b.x) < (aSize.width + bSize.width) / 2 + 2
    && Math.abs(a.y - b.y) < (aSize.height + bSize.height) / 2 + 2;
}

test("separates a direction start, weekly checkpoint and landmark that share one route", () => {
  const positioned = resolveMilestoneNodePositions([
    { id: "start", kind: "start", x: 70, y: 50 },
    { id: "week", kind: "week", x: 72, y: 50 },
    { id: "finish", kind: "finish", x: 72, y: 50 },
  ]);

  for (let index = 0; index < positioned.length; index += 1) {
    for (let other = index + 1; other < positioned.length; other += 1) {
      assert.equal(overlaps(positioned[index], positioned[other]), false, `${positioned[index].id} overlaps ${positioned[other].id}`);
    }
  }
});

test("keeps a dense month of mixed milestone nodes collision-free", () => {
  const kinds = ["start", "week", "finish"];
  const positioned = resolveMilestoneNodePositions(Array.from({ length: 18 }, (_, index) => ({
    id: `node-${index}`,
    kind: kinds[index % kinds.length],
    x: 52 + (index % 3),
    y: 50,
  })));

  for (let index = 0; index < positioned.length; index += 1) {
    for (let other = index + 1; other < positioned.length; other += 1) {
      assert.equal(overlaps(positioned[index], positioned[other]), false, `${positioned[index].id} overlaps ${positioned[other].id}`);
    }
  }
});

test("shows a month direction start immediately but waits to show a weekly checkpoint until archive", () => {
  const base = { note: "", linkedGoalIds: [], createdAt: "2026-07-21T08:00:00+08:00" };
  const activeDirection = { ...base, id: "direction", title: "产品启程", period: "month", startDate: "2026-07-21", endDate: "2026-09-30" };
  const activeWeek = { ...base, id: "week-active", title: "本周推进", period: "week", startDate: "2026-07-20", endDate: "2026-07-26" };
  const archivedWeek = { ...activeWeek, id: "week-archived", archivedAt: "2026-07-24T20:00:00+08:00" };

  const selected = selectMilestoneMapGoals([activeDirection, activeWeek, archivedWeek]);

  assert.deepEqual(selected.directions.map((goal) => goal.id), ["direction"]);
  assert.deepEqual(selected.weeklyGoals.map((goal) => goal.id), ["week-archived"]);
});

test("every direction route spans the full playable width from the left starting flag", () => {
  const route = getFullWidthMilestoneRoute(0, 240);

  assert.equal(route.start, MILESTONE_ROUTE_START_X);
  assert.equal(route.end, MILESTONE_ROUTE_END_X);
  assert.equal(route.width, 1200);
  assert.match(route.path, /^M0 240/);
  assert.match(route.path, /H0z$/);
});

test("keeps a linked checkpoint and its monthly landmark on their shared route lane", () => {
  const positioned = resolveMilestoneNodePositions([
    { id: "start", kind: "start", x: 7, y: 18, lane: 0 },
    { id: "week", kind: "week", x: 62, y: 18, lane: 0 },
    { id: "finish", kind: "finish", x: 62, y: 18, lane: 0 },
  ]);

  assert.deepEqual(positioned.map((item) => item.y), [18, 18, 18]);
});

test("anchors monthly directions to route endpoints while weekly goals retain their date position", () => {
  assert.equal(milestoneNodeX("start", 48), 7);
  assert.equal(milestoneNodeX("week", 48), 48);
  assert.equal(milestoneNodeX("finish", 48), 92);
});

test("keeps every route baseline at one constant offset from its node lane", () => {
  const mapHeight = 660;
  for (const lane of [18, 50, 82]) {
    assert.ok(Math.abs(milestoneRouteY(mapHeight, lane) - (lane / 100) * mapHeight - 40) < 0.000001);
  }
});
