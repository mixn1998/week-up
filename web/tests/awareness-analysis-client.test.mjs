import assert from "node:assert/strict";
import test from "node:test";

import {
  buildHistoricalBaselineFacts,
  buildWeeklyEmotionFacts,
  createAwarenessAnalysisClient,
} from "../lib/awareness-analysis-client.ts";
import { buildAwarenessPrompt } from "../server/ai-review-service.mjs";
import { createEmptyWeekUpState } from "../lib/week-up-domain.ts";

function context(now = "2026-08-01T04:00:00.000Z") {
  let sequence = 0;
  return { now: () => now, id: (prefix) => `${prefix}-${++sequence}` };
}

test("historical baseline facts use transient thoughts and explicitly contain no emotion history", () => {
  const facts = buildHistoricalBaselineFacts([{
    entryId: "legacy-row-1",
    localDate: "2025-07-21",
    occurredAt: "2025-07-21T04:00:00.000Z",
    content: "控制注意力而不是控制世界",
  }], "baseline-preview");
  assert.equal(facts.kind, "historical-baseline");
  assert.equal(facts.sampling, "sparse-significant-events");
  assert.equal(facts.thoughts.length, 1);
  assert.deepEqual(facts.emotions, []);
  const prompt = buildAwarenessPrompt(facts);
  assert.match(prompt, /不得推断未记录日期/);
  assert.match(prompt, /不得计算日常平均情绪/);
  assert.match(prompt, /没有历史情绪来源/);
});

test("weekly emotion facts expose recorded events only and never add an average mood", () => {
  const state = {
    ...createEmptyWeekUpState(),
    awarenessEntries: [{
      id: "emotion-1", kind: "emotion", localDate: "2026-07-27", occurredAt: "2026-07-27T06:00:00.000Z",
      level: 2, reason: "突发消息", createdAt: "2026-07-27T06:00:00.000Z",
      updatedAt: "2026-07-27T06:00:00.000Z", settlementState: "frozen",
    }],
    dailyAwarenessSnapshots: [{
      id: "day-1", localDate: "2026-07-27", thoughtEntryIds: [], emotionEntryIds: ["emotion-1"],
      thoughtDisplayBlocks: [], emotionSummary: {
        recordedEventCount: 1, levelDistribution: { "1": 0, "2": 1, "3": 0, "4": 0, "5": 0 },
        minimumLevel: 2, maximumLevel: 2,
        reasons: [{ entryId: "emotion-1", occurredAt: "2026-07-27T06:00:00.000Z", level: 2, reason: "突发消息" }],
      }, frozenAt: "2026-07-28T00:00:00.000Z",
    }],
  };
  const review = {
    id: "week-1", weekKey: "2026-07-27:2026-08-02", rangeStart: "2026-07-27", rangeEnd: "2026-08-02",
    sourceSnapshotIds: ["day-1"], statistics: {
      entryCount: 1, daysWithRecordedEvents: 1,
      levelDistribution: { "1": 0, "2": 1, "3": 0, "4": 0, "5": 0 },
    }, analysis: { status: "pending" }, frozenAt: "2026-08-03T00:00:00.000Z",
  };
  const facts = buildWeeklyEmotionFacts(state, review);
  assert.equal(facts.events.length, 1);
  assert.equal("averageMood" in facts, false);
  assert.equal(facts.events[0].reason, "突发消息");
});

test("awareness client posts structured facts and accepts a structured result", async () => {
  const calls = [];
  const client = createAwarenessAnalysisClient({
    baseUrl: "/week-up-review-api", preferredProvider: "codex-cli", apiBaseUrl: "",
  }, async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({
      result: {
        kind: "historical-baseline",
        mentalModelVersionId: "model-1",
        models: [],
      },
      provider: "codex-cli",
      preferredProvider: "codex-cli",
      fallbackUsed: false,
      checkedAt: "2026-08-01T00:00:00.000Z",
    }), { status: 200, headers: { "content-type": "application/json" } });
  });
  const result = await client.generate({
    kind: "historical-baseline", sampling: "sparse-significant-events",
    mentalModelVersionId: "model-1", thoughts: [], emotions: [], previousModels: [],
  });
  assert.equal(calls[0].url, "/week-up-review-api/v1/awareness");
  assert.equal(calls[0].body.facts.sampling, "sparse-significant-events");
  assert.equal(result.result.kind, "historical-baseline");
});
