import assert from "node:assert/strict";
import test from "node:test";

import { dayIndexFor, projectWeekUpView } from "../lib/use-week-up.ts";
import { createEmptyWeekUpState } from "../lib/week-up-domain.ts";

test("projects Shanghai Monday as day zero without a UTC rollover", () => {
  const monday = new Date("2026-07-20T04:00:00+08:00");
  assert.equal(dayIndexFor("2026-07-20T20:30:00+08:00", monday), 0);
  assert.equal(dayIndexFor("2026-07-26T20:30:00+08:00", monday), 6);
  assert.equal(dayIndexFor("2026-07-27T00:00:00+08:00", monday), 7);
});

test("keeps archived attributes in the badge catalog but out of configuration projections", () => {
  const active = { id: "active", name: "逻辑", icon: "mark-01", color: "cyan", note: "", category: "学习", pinned: false, createdAt: "2026-07-20T00:00:00Z" };
  const archived = { id: "archived", name: "仪态", icon: "mark-02", color: "pink", note: "", category: "表达", pinned: false, createdAt: "2026-07-20T00:00:00Z", archivedAt: "2026-07-21T00:00:00Z" };
  const view = projectWeekUpView({ ...createEmptyWeekUpState(), attributes: [active, archived] });
  assert.deepEqual(view.attributes.map((item) => item.id), ["active"]);
  assert.deepEqual(view.catalogAttributes.map((item) => item.id), ["active", "archived"]);
});
