import assert from "node:assert/strict";
import test from "node:test";

import { applyWeekUpStatePatch, createWeekUpStatePatch } from "../lib/state-patch.ts";
import { createEmptyWeekUpState, dispatchWeekUp } from "../lib/week-up-domain.ts";

test("returns and applies only changed entities instead of the full state", () => {
  const context = { now: () => "2026-07-21T08:00:00.000Z", id: (prefix) => `${prefix}-1` };
  const current = createEmptyWeekUpState();
  const next = dispatchWeekUp(current, { type: "attribute.create", value: { name: "逻辑", icon: "node-link", color: "cyan", note: "", category: "智力", pinned: false } }, context).state;
  const patch = createWeekUpStatePatch(current, next);
  assert.equal(patch.revision, 1);
  assert.equal(patch.collections.attributes.upsert.length, 1);
  assert.equal(JSON.stringify(patch).includes('"plans"'), false);
  assert.deepEqual(applyWeekUpStatePatch(current, patch), next);
});
