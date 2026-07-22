import type { AttributeReward } from "./demo-model";
import type { XpTransaction } from "./week-up-domain";

export function sortAttributeRewardsByAmount(rewards: readonly AttributeReward[]): AttributeReward[] {
  return [...rewards].sort((left, right) => right.amount - left.amount || left.attributeId.localeCompare(right.attributeId));
}

function localDateInTimeZone(instant: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(instant));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function netAttributeGainsForDate(
  transactions: readonly XpTransaction[],
  localDate: string,
  timeZone = "Asia/Shanghai",
): AttributeReward[] {
  const totals = new Map<string, number>();
  transactions.forEach((transaction) => {
    if (localDateInTimeZone(transaction.occurredAt, timeZone) !== localDate) return;
    totals.set(transaction.attributeId, (totals.get(transaction.attributeId) ?? 0) + transaction.amount);
  });

  return sortAttributeRewardsByAmount([...totals.entries()]
    .filter(([, amount]) => amount > 0)
    .map(([attributeId, amount]) => ({ attributeId, amount })));
}
