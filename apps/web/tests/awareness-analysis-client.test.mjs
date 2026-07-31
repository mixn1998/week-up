import assert from "node:assert/strict";
import test from "node:test";

import {
  buildHistoricalBaselineFacts,
  buildMonthlyAwarenessFacts,
  buildWeeklyEmotionFacts,
  createAwarenessAnalysisClient,
  selectNextAwarenessAnalysisTarget,
} from "../src/lib/awareness-analysis-client.ts";
import { buildAwarenessPrompt } from "../server/ai-review-service.mjs";
import { createEmptyWeekUpState } from "../src/lib/week-up-domain.ts";

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
        dimensionProfile: [],
      },
      provider: "codex-cli",
      preferredProvider: "codex-cli",
      fallbackUsed: false,
      checkedAt: "2026-08-01T00:00:00.000Z",
    }), { status: 200, headers: { "content-type": "application/json" } });
  });
  const result = await client.generate({
    kind: "historical-baseline", sampling: "sparse-significant-events",
    mentalModelVersionId: "model-1", thoughts: [], emotions: [], previousModels: [], previousDimensionProfile: [],
  });
  assert.equal(calls[0].url, "/week-up-review-api/v1/awareness");
  assert.equal(calls[0].body.facts.sampling, "sparse-significant-events");
  assert.equal(result.result.kind, "historical-baseline");
});

test("monthly facts carry the complete current profile forward", () => {
  const previous = {
    id: "baseline", scope: "historical-baseline", periodKey: "baseline", revisionNumber: 1,
    sourceThoughtEntryIds: [], sourceEmotionSnapshotIds: [], sourceEmotionReviewIds: [],
    analysis: {
      status: "ready", models: [], dimensionProfile: [{
        dimension: "self", strength: 68, confidence: "high", summary: "保持主体性",
        defaultJudgments: [], currentStrategies: [], supportingModelKeys: [],
        changeDirection: "stable",
      }],
    }, frozenAt: "2026-07-01T00:00:00.000Z",
  };
  const pending = {
    id: "month", scope: "monthly", periodKey: "2026-07", revisionNumber: 2,
    previousVersionId: "baseline", sourceThoughtEntryIds: [], sourceEmotionSnapshotIds: [],
    sourceEmotionReviewIds: [], analysis: { status: "pending" },
    frozenAt: "2026-08-01T00:00:00.000Z",
  };
  const facts = buildMonthlyAwarenessFacts({
    ...createEmptyWeekUpState(), mentalModelVersions: [previous, pending],
  }, undefined, pending);
  assert.equal(facts.previousDimensionProfile.length, 8);
  assert.equal(facts.previousDimensionProfile.find((item) => item.dimension === "self").strength, 68);
  const prompt = buildAwarenessPrompt(facts);
  assert.match(prompt, /完整当前画像/);
  assert.match(prompt, /没有新证据时必须保留/);
  assert.match(prompt, /dimensionProfile/);
});

test("monthly mental-model facts include ready weekly emotion analysis as derivative evidence", () => {
  const emotionEntry = {
    id: "emotion-1", kind: "emotion", localDate: "2026-07-23", occurredAt: "2026-07-23T08:00:00.000Z",
    level: 2, emotionType: "anxious", reason: "验收口径临时变化",
    createdAt: "2026-07-23T08:00:00.000Z", updatedAt: "2026-07-23T08:00:00.000Z", settlementState: "frozen",
  };
  const snapshot = {
    id: "day-1", localDate: "2026-07-23", thoughtEntryIds: [], emotionEntryIds: ["emotion-1"], thoughtDisplayBlocks: [],
    emotionSummary: {
      recordedEventCount: 1, levelDistribution: { "1": 0, "2": 1, "3": 0, "4": 0, "5": 0 },
      minimumLevel: 2, maximumLevel: 2,
      reasons: [{ entryId: "emotion-1", occurredAt: emotionEntry.occurredAt, level: 2, emotionType: "anxious", reason: emotionEntry.reason }],
    }, frozenAt: "2026-07-24T00:00:00.000Z",
  };
  const weeklyReview = {
    id: "emotion-review-1", weekKey: "2026-07-20:2026-07-26", rangeStart: "2026-07-20", rangeEnd: "2026-07-26",
    sourceSnapshotIds: ["day-1"], statistics: { entryCount: 1, daysWithRecordedEvents: 1, levelDistribution: { "1": 0, "2": 1, "3": 0, "4": 0, "5": 0 } },
    analysis: { status: "ready", value: {
      dominantFlow: "边界变化触发焦虑",
      recurringTriggers: ["验收口径变化"], recoveryPatterns: [], notableChanges: [], evidenceEntryIds: ["emotion-1"],
      triggerChains: [{
        eventSummary: "验收口径变化", interpretation: "无法判断何时完成", underlyingNeeds: ["可控感"],
        emotionalResponse: "焦虑", possibleMechanism: "投入和结果失去稳定对应", evidenceEntryIds: ["emotion-1"],
      }],
      alternativeExplanations: [], pendingValidations: [],
      mentalModelSignals: [{ dimension: "action", summary: "偏好先明确完成边界", evidenceEntryIds: ["emotion-1"] }],
    } }, frozenAt: "2026-07-27T00:00:00.000Z",
  };
  const version = {
    id: "model-1", scope: "monthly", periodKey: "2026-07", revisionNumber: 1,
    sourceThoughtEntryIds: [], sourceEmotionSnapshotIds: ["day-1"], sourceEmotionReviewIds: ["emotion-review-1"],
    analysis: { status: "pending" }, frozenAt: "2026-08-01T00:00:00.000Z",
  };
  const facts = buildMonthlyAwarenessFacts({
    ...createEmptyWeekUpState(), awarenessEntries: [emotionEntry], dailyAwarenessSnapshots: [snapshot],
    weeklyEmotionReviews: [weeklyReview], mentalModelVersions: [version],
  }, undefined, version);
  assert.equal(facts.emotions.length, 1);
  assert.equal(facts.emotionReviews.length, 1);
  assert.equal(facts.emotionReviews[0].analysis.triggerChains[0].possibleMechanism, "投入和结果失去稳定对应");
  const prompt = buildAwarenessPrompt(facts);
  assert.match(prompt, /情绪周报是基于原始事件形成的可能解释/);
  assert.match(prompt, /情绪事件与情绪周报都是心智模型的更新来源/);
});

test("a pending weekly review blocks its dependent mental-model update", () => {
  const review = {
    id: "emotion-review-1", weekKey: "2026-07-20:2026-07-26", rangeStart: "2026-07-20", rangeEnd: "2026-07-26",
    sourceSnapshotIds: [], statistics: { entryCount: 1, daysWithRecordedEvents: 1, levelDistribution: { "1": 0, "2": 1, "3": 0, "4": 0, "5": 0 } },
    analysis: { status: "pending" }, frozenAt: "2026-07-27T00:00:00.000Z",
  };
  const version = {
    id: "model-1", scope: "monthly", periodKey: "2026-07", revisionNumber: 1,
    sourceThoughtEntryIds: [], sourceEmotionSnapshotIds: [], sourceEmotionReviewIds: [review.id],
    analysis: { status: "pending" }, frozenAt: "2026-08-01T00:00:00.000Z",
  };
  const state = { ...createEmptyWeekUpState(), weeklyEmotionReviews: [review], mentalModelVersions: [version] };
  assert.deepEqual(selectNextAwarenessAnalysisTarget(state, new Set()), { kind: "weekly-emotion", id: review.id });
  assert.deepEqual(selectNextAwarenessAnalysisTarget(state, new Set([review.id])), undefined);
  assert.deepEqual(selectNextAwarenessAnalysisTarget({
    ...state, weeklyEmotionReviews: [{ ...review, analysis: { status: "ready", value: {} } }],
  }, new Set()), { kind: "mental-model", id: version.id });
});
