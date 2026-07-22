import type { SettlementRecord, WeekUpCommand, WeekUpState } from "./week-up-domain.ts";

function shanghaiDate(instant: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(instant));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function addDays(date: string, amount: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function weekBounds(date: string): { startDate: string; endDate: string } {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  const startDate = addDays(date, -((day + 6) % 7));
  return { startDate, endDate: addDays(startDate, 6) };
}

function monthBounds(date: string): { startDate: string; endDate: string } {
  const [year, month] = date.split("-").map(Number);
  const end = new Date(Date.UTC(year!, month!, 0)).toISOString().slice(0, 10);
  return { startDate: `${year}-${String(month).padStart(2, "0")}-01`, endDate: end };
}

function key(period: SettlementRecord["period"], startDate: string, endDate: string): string {
  return `${period}:${startDate}:${endDate}`;
}

export function dueSettlementCommands(state: WeekUpState, now: string): WeekUpCommand[] {
  const today = shanghaiDate(now);
  const existing = new Set(state.settlements.map((item) => key(item.period, item.startDate, item.endDate)));
  const due = new Map<string, WeekUpCommand>();
  for (const plan of state.plans) {
    const date = shanghaiDate(plan.startAt);
    const week = weekBounds(date);
    if (week.endDate < today) {
      const periodKey = key("week", week.startDate, week.endDate);
      if (!existing.has(periodKey)) due.set(periodKey, { type: "settlement.generate", period: "week", ...week });
    }
    const month = monthBounds(date);
    if (month.endDate < today) {
      const periodKey = key("month", month.startDate, month.endDate);
      if (!existing.has(periodKey)) due.set(periodKey, { type: "settlement.generate", period: "month", ...month });
    }
  }
  return [...due.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, command]) => command);
}
