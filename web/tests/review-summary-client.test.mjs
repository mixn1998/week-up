import assert from "node:assert/strict";
import test from "node:test";

import { buildReviewSummaryFacts, createReviewSummaryClient } from "../lib/review-summary-client.ts";
import { createEmptyWeekUpState, dispatchWeekUp } from "../lib/week-up-domain.ts";

function harness() {
  let sequence = 0;
  const context = { now: () => "2026-07-27T00:00:00+08:00", id: (prefix) => `${prefix}-${++sequence}` };
  return { run: (state, command) => dispatchWeekUp(state, command, context).state };
}

test("builds an AI review request from frozen facts without user-authored reflection", () => {
  const h = harness();
  let state = createEmptyWeekUpState();
  state = h.run(state, { type: "attribute.create", value: { name: "推理", icon: "◆", color: "cyan", note: "", category: "学习", pinned: false } });
  const attributeId = state.attributes[0].id;
  state = h.run(state, { type: "goal.create", value: { title: "推进数学", note: "完成两节", period: "week", startDate: "2026-07-20", endDate: "2026-07-26", linkedGoalIds: [] } });
  state = h.run(state, { type: "plan.create", value: { title: "概率论", detail: "条件概率", category: "学习", startAt: "2026-07-22T09:00:00+08:00", endAt: "2026-07-22T10:00:00+08:00", goalIds: [state.goals[0].id], rewards: [{ attributeId, amount: 10 }] } });
  state = h.run(state, { type: "plan.complete", id: state.plans[0].id, completedAt: "2026-07-22T10:00:00+08:00" });
  state = h.run(state, { type: "settlement.generate", period: "week", startDate: "2026-07-20", endDate: "2026-07-26" });
  const facts = buildReviewSummaryFacts(state, state.settlements[0]);
  assert.equal(facts.completedContent[0].title, "概率论");
  assert.equal(facts.goals[0].completedPlanCount, 1);
  assert.deepEqual(facts.attributeGains[0], { name: "推理", icon: "◆", amount: 10 });
  assert.deepEqual(facts.badgeUpgrades[0], { name: "推理", fromLevel: 1, toLevel: 2 });
  assert.equal("reflection" in facts, false);
});

test("posts the factual payload and accepts only a non-empty AI harvest", async () => {
  let captured;
  const client = createReviewSummaryClient({ baseUrl: "/week-up-review-api/", preferredProvider: "codex-cli", apiBaseUrl: "" }, async (_url, init) => {
    captured = JSON.parse(init.body);
    return new Response(JSON.stringify({ text: "你完成了关键的一步，积累正在变得清晰。", provider: "codex-cli", preferredProvider: "codex-cli", fallbackUsed: false, checkedAt: "2026-07-31T00:00:00.000Z" }), { status: 200, headers: { "content-type": "application/json" } });
  });
  const result = await client.generate({ period: "month", startDate: "2026-07-01", endDate: "2026-07-31", goals: [], completedContent: [], incompleteContent: [], attributeGains: [], badgeUpgrades: [], skillbooks: [] });
  assert.equal(result.text, "你完成了关键的一步，积累正在变得清晰。");
  assert.equal(result.provider, "codex-cli");
  assert.equal(captured.output.title, "本月收获");
  assert.equal(captured.output.tone, "pixel-adventure-journal");
  assert.match(captured.output.style, /像素探险日志/);
  assert.match(captured.output.format, /2 个短段落/);
  assert.equal(captured.output.factualOnly, true);
});
