import assert from "node:assert/strict";
import test from "node:test";

import { attributeGainsForCompletedDate, netAttributeGainsForDate, sortAttributeRewardsByAmount, totalAttributeGain } from "../lib/attribute-gains.ts";

test("sorts displayed attribute rewards from highest gain to lowest", () => {
  assert.deepEqual(sortAttributeRewardsByAmount([
    { attributeId: "logic", amount: 1 },
    { attributeId: "design", amount: 3 },
    { attributeId: "analysis", amount: 2 },
  ]).map((reward) => reward.attributeId), ["design", "analysis", "logic"]);
});

test("sums all attribute gains in the selected period", () => {
  assert.equal(totalAttributeGain([
    { attributeId: "logic", amount: 3 },
    { attributeId: "design", amount: 2 },
    { attributeId: "coding", amount: 4 },
  ]), 9);
});

test("calculates today's net positive gains in Shanghai and removes undone gains", () => {
  const transaction = (attributeId, amount, occurredAt) => ({
    id: `${attributeId}-${amount}-${occurredAt}`,
    attributeId,
    amount,
    occurredAt,
    kind: amount > 0 ? "earned" : "compensation",
    completionFactId: "completion",
  });

  assert.deepEqual(netAttributeGainsForDate([
    transaction("logic", 2, "2026-07-20T00:30:00.000Z"),
    transaction("logic", -1, "2026-07-20T03:00:00.000Z"),
    transaction("design", 3, "2026-07-19T16:30:00.000Z"),
    transaction("old", 9, "2026-07-19T15:59:59.000Z"),
  ], "2026-07-20"), [
    { attributeId: "design", amount: 3 },
    { attributeId: "logic", amount: 1 },
  ]);
});

test("derives today's visible growth from active completion facts, not repair transaction time", () => {
  const fact = (id, completedAt, rewardSnapshot, revertedAt) => ({
    id,
    planId: `plan-${id}`,
    completedAt,
    source: "week-up",
    rewardSnapshot,
    ...(revertedAt ? { revertedAt } : {}),
  });

  assert.deepEqual(attributeGainsForCompletedDate([
    fact("today", "2026-07-25T06:24:46.637Z", [
      { attributeId: "logic", amount: 1 },
      { attributeId: "coding", amount: 2 },
    ]),
    fact("historical-repair", "2026-07-24T12:00:00+08:00", [
      { attributeId: "logic", amount: 99 },
    ]),
    fact("undone-today", "2026-07-25T12:00:00+08:00", [
      { attributeId: "design", amount: 3 },
    ], "2026-07-25T13:00:00+08:00"),
  ], "2026-07-25"), [
    { attributeId: "coding", amount: 2 },
    { attributeId: "logic", amount: 1 },
  ]);
});
