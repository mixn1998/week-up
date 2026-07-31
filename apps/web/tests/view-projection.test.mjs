import assert from "node:assert/strict";
import test from "node:test";

import { dayIndexFor, projectWeekUpView } from "../src/lib/use-week-up.ts";
import { createEmptyWeekUpState, dispatchWeekUp } from "../src/lib/week-up-domain.ts";

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

test("keeps schedule projection separate from completed execution timeline", () => {
  let sequence = 0;
  let now = "2026-07-28T08:00:00.000Z";
  const context = {
    now: () => now,
    id: (prefix) => `${prefix}-${++sequence}`,
  };
  const run = (state, command) => dispatchWeekUp(state, command, context).state;
  let state = createEmptyWeekUpState();
  state = run(state, {
    type: "plan.create",
    value: {
      title: "Future work",
      detail: "",
      category: "Work",
      startAt: "2026-07-29T17:00:00+08:00",
      endAt: "2026-07-29T19:00:00+08:00",
      goalIds: [],
      rewards: [],
    },
  });
  const completedPlanId = state.plans[0].id;
  state = run(state, {
    type: "plan.create",
    value: {
      title: "Scheduled only",
      detail: "",
      category: "Work",
      startAt: "2026-07-28T20:00:00+08:00",
      endAt: "2026-07-28T21:00:00+08:00",
      goalIds: [],
      rewards: [],
    },
  });
  now = "2026-07-28T12:00:00.000Z";
  state = run(state, {
    type: "plan.complete",
    id: completedPlanId,
    completedAt: "2026-07-28T11:00:00+08:00",
    actualSegments: [{
      startAt: "2026-07-28T10:00:00+08:00",
      endAt: "2026-07-28T11:00:00+08:00",
    }],
  });

  const view = projectWeekUpView(state, new Date("2026-07-28T12:00:00+08:00"));
  const scheduled = view.plans.find((item) => item.id === completedPlanId);
  assert.equal(scheduled.scheduledDate, "2026-07-29");
  assert.equal(scheduled.start, "17:00");
  assert.equal(scheduled.completed, true);
  assert.equal(scheduled.completedEarly, true);
  assert.deepEqual(
    view.timelinePlans.map(({ calendarSourceId, scheduledDate, start, end }) => ({ calendarSourceId, scheduledDate, start, end })),
    [{ calendarSourceId: completedPlanId, scheduledDate: "2026-07-28", start: "10:00", end: "11:00" }],
  );
});

test("keeps an untimed completion visible at the top of its completion day", () => {
  let sequence = 0;
  const context = {
    now: () => "2026-07-28T12:00:00+08:00",
    id: (prefix) => `${prefix}-${++sequence}`,
  };
  let state = createEmptyWeekUpState();
  state = dispatchWeekUp(state, {
    type: "plan.create",
    value: {
      title: "Completed without actual time",
      detail: "",
      category: "Work",
      startAt: "2026-07-29T17:00:00+08:00",
      endAt: "2026-07-29T19:00:00+08:00",
      timeStatus: "unscheduled",
      timeSegments: [],
      goalIds: [],
      rewards: [],
    },
  }, context).state;
  const planId = state.plans[0].id;
  state = dispatchWeekUp(state, {
    type: "plan.complete",
    id: planId,
    completedAt: "2026-07-28T11:00:00+08:00",
  }, context).state;

  const view = projectWeekUpView(state, new Date("2026-07-28T12:00:00+08:00"));
  assert.deepEqual(
    view.timelinePlans.map(({ calendarSourceId, scheduledDate, start, end, timeStatus, completed }) => ({
      calendarSourceId,
      scheduledDate,
      start,
      end,
      timeStatus,
      completed,
    })),
    [{
      calendarSourceId: planId,
      scheduledDate: "2026-07-28",
      start: "时间未配置",
      end: "",
      timeStatus: "unscheduled",
      completed: true,
    }],
  );
});

test("projects each completed segment into Timeline before the whole plan is complete", () => {
  let sequence = 0;
  const context = {
    now: () => "2026-07-26T12:00:00+08:00",
    id: (prefix) => `${prefix}-${++sequence}`,
  };
  const run = (state, command) => dispatchWeekUp(state, command, context).state;
  let state = createEmptyWeekUpState();
  state = run(state, {
    type: "plan.create",
    value: {
      title: "Segmented routine",
      detail: "",
      category: "Life",
      startAt: "2026-07-26T08:30:00+08:00",
      endAt: "2026-07-26T23:40:00+08:00",
      timeSegments: [
        { id: "morning", startAt: "2026-07-26T08:30:00+08:00", endAt: "2026-07-26T08:40:00+08:00" },
        { id: "night", startAt: "2026-07-26T23:30:00+08:00", endAt: "2026-07-26T23:40:00+08:00" },
      ],
      goalIds: [],
      rewards: [],
    },
  });
  const planId = state.plans[0].id;

  state = run(state, { type: "plan.segment.complete", id: planId, segmentId: "morning" });
  let view = projectWeekUpView(state, new Date("2026-07-26T12:00:00+08:00"));
  assert.equal(state.completionFacts.length, 0);
  assert.equal(view.plans.find((plan) => plan.id === planId)?.completed, false);
  assert.deepEqual(
    view.timelinePlans.map(({ calendarSourceId, scheduledDate, start, end }) => ({ calendarSourceId, scheduledDate, start, end })),
    [{ calendarSourceId: planId, scheduledDate: "2026-07-26", start: "08:30", end: "08:40" }],
  );

  state = run(state, { type: "plan.segment.complete", id: planId, segmentId: "night" });
  view = projectWeekUpView(state, new Date("2026-07-26T23:50:00+08:00"));
  assert.equal(state.completionFacts.filter((fact) => fact.revertedAt === undefined).length, 1);
  assert.deepEqual(
    view.timelinePlans.map(({ calendarSourceId, start, end }) => ({ calendarSourceId, start, end })),
    [
      { calendarSourceId: planId, start: "08:30", end: "08:40" },
      { calendarSourceId: planId, start: "23:30", end: "23:40" },
    ],
  );

  state = run(state, { type: "plan.segment.undo", id: planId, segmentId: "morning" });
  view = projectWeekUpView(state, new Date("2026-07-26T23:55:00+08:00"));
  assert.deepEqual(
    view.timelinePlans.map(({ calendarSourceId, start, end }) => ({ calendarSourceId, start, end })),
    [{ calendarSourceId: planId, start: "23:30", end: "23:40" }],
  );
});
