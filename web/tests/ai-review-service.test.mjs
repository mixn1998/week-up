import assert from "node:assert/strict";
import test from "node:test";

import { buildReviewPrompt, createAiReviewService } from "../server/ai-review-service.mjs";

const facts = { period: "week", startDate: "2026-07-20", endDate: "2026-07-26" };

test("uses the selected pixel adventure journal voice without relaxing factual constraints", () => {
  const prompt = buildReviewPrompt({ ...facts, completedContent: [], incompleteContent: [], attributeGains: [], badgeUpgrades: [], skillbooks: [] });
  assert.match(prompt, /像素探险日志/);
  assert.match(prompt, /本周点亮了/);
  assert.match(prompt, /徽章仍在积蓄经验/);
  assert.match(prompt, /禁止虚构/);
  assert.match(prompt, /不要出现怪物、战斗、金币/);
});

test("uses Codex CLI by default and reports the actual model", async () => {
  const codex = {
    async status() { return { available: true, authenticated: true, version: "0.145", models: [] }; },
    async generate() { return { text: "本周完成了关键行动。", model: "gpt-test", reasoningEffort: "medium" }; },
  };
  const service = createAiReviewService({ codex, clock: () => "2026-07-27T00:00:00.000Z" });
  const result = await service.generate({ facts, preferredProvider: "codex-cli" });
  assert.equal(result.provider, "codex-cli");
  assert.equal(result.fallbackUsed, false);
  assert.equal(result.model, "gpt-test");
});

test("falls back from an unavailable API to Codex CLI and keeps status in sync", async () => {
  const codex = {
    async status() { return { available: true, authenticated: true, version: "0.145", models: [] }; },
    async generate() { return { text: "回退后仍然生成成功。", model: "gpt-test", reasoningEffort: "medium" }; },
  };
  const fetcher = async () => new Response("offline", { status: 503 });
  const service = createAiReviewService({ codex, fetcher, clock: () => "2026-07-27T00:00:00.000Z" });
  const result = await service.generate({ facts, preferredProvider: "api", apiBaseUrl: "http://127.0.0.1:9999" });
  assert.equal(result.provider, "codex-cli");
  assert.equal(result.preferredProvider, "api");
  assert.equal(result.fallbackUsed, true);
  const status = await service.status({ preferredProvider: "api", apiBaseUrl: "http://127.0.0.1:9999" });
  assert.equal(status.lastExecution.provider, "codex-cli");
  assert.equal(status.api.available, false);
});
