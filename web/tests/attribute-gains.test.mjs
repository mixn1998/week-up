import assert from "node:assert/strict";
import test from "node:test";

import { netAttributeGainsForDate, sortAttributeRewardsByAmount } from "../lib/attribute-gains.ts";

test("sorts displayed attribute rewards from highest gain to lowest", () => {
  assert.deepEqual(sortAttributeRewardsByAmount([
    { attributeId: "logic", amount: 1 },
    { attributeId: "design", amount: 3 },
    { attributeId: "analysis", amount: 2 },
  ]).map((reward) => reward.attributeId), ["design", "analysis", "logic"]);
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
