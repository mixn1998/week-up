import { join } from "node:path";

import { createWeekUpDatabase } from "../server/week-up-database.mjs";

const databasePath = join(process.env.LOCALAPPDATA, "Week UP", "data", "week-up.sqlite");
const store = await createWeekUpDatabase(databasePath);
try {
  const state = store.load();
  const planById = new Map(state.plans.map((plan) => [plan.id, plan]));
  const activeFacts = state.completionFacts.filter((fact) => fact.revertedAt === undefined);
  const learningMoreFacts = activeFacts
    .map((fact) => ({ fact, plan: planById.get(fact.planId) }))
    .filter(({ plan }) => plan?.source === "learning-more");
  const logicalGroups = new Map();
  for (const value of learningMoreFacts) {
    const key = `${value.plan.sourceCourseId ?? ""}|${value.plan.sourceLessonId ?? ""}`;
    logicalGroups.set(key, [...(logicalGroups.get(key) ?? []), value]);
  }
  const logicalDuplicateGroups = [...logicalGroups.values()]
    .filter((group) => group.length > 1)
    .map((group) => group.map(({ fact, plan }) => ({
      title: plan.title,
      sourceRef: plan.sourceRef,
      startAt: plan.startAt,
      externalFactId: fact.externalFactId,
      rewards: fact.rewardSnapshot,
    })));
  const xpTotals = new Map();
  for (const transaction of state.xpTransactions) {
    xpTotals.set(transaction.attributeId, (xpTotals.get(transaction.attributeId) ?? 0) + transaction.amount);
  }
  const activeRewardTotals = new Map();
  for (const fact of activeFacts) {
    for (const reward of fact.rewardSnapshot) {
      activeRewardTotals.set(reward.attributeId, (activeRewardTotals.get(reward.attributeId) ?? 0) + reward.amount);
    }
  }
  const attributeById = new Map(state.attributes.map((attribute) => [attribute.id, attribute.name]));
  const attributeIds = new Set([...xpTotals.keys(), ...activeRewardTotals.keys()]);
  const xpMismatches = [...attributeIds]
    .map((attributeId) => ({
      attribute: attributeById.get(attributeId) ?? attributeId,
      ledger: xpTotals.get(attributeId) ?? 0,
      activeRewards: activeRewardTotals.get(attributeId) ?? 0,
    }))
    .filter((row) => row.ledger !== row.activeRewards);
  console.log(JSON.stringify({
    revision: state.revision,
    plans: state.plans.length,
    activeFacts: activeFacts.length,
    learningMoreActiveFacts: learningMoreFacts.length,
    logicalDuplicateGroups,
    xpMismatches,
    xpTotals: [...xpTotals]
      .map(([attributeId, value]) => ({ attribute: attributeById.get(attributeId) ?? attributeId, value }))
      .sort((left, right) => right.value - left.value),
  }, null, 2));
} finally {
  store.close();
}
