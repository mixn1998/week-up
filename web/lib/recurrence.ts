export type RecurrenceEnd =
  | Readonly<{ mode: "count"; count: number }>
  | Readonly<{ mode: "date"; until: string }>;

export type RecurrenceRule =
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "daily"; interval: number; end: RecurrenceEnd }>
  | Readonly<{ kind: "weekly"; interval: number; weekdays: readonly number[]; end: RecurrenceEnd }>;

const MAX_OCCURRENCES = 365;

function dateAtUtc(date: string) {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime())) throw new Error("recurrence_start_invalid");
  return parsed;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function mondayIndex(date: Date) {
  return (date.getUTCDay() + 6) % 7;
}

export function expandRecurrenceDates(startDate: string, rule: RecurrenceRule): string[] {
  if (rule.kind === "none") return [startDate];
  const start = dateAtUtc(startDate);
  const targetCount = rule.end.mode === "count" ? Math.min(MAX_OCCURRENCES, Math.max(1, Math.floor(rule.end.count))) : MAX_OCCURRENCES;
  const until = rule.end.mode === "date" ? rule.end.until : undefined;
  if (until !== undefined && until < startDate) return [startDate];
  const results: string[] = [];
  const interval = Math.min(365, Math.max(1, Math.floor(rule.interval)));
  const weekdays = rule.kind === "weekly" ? [...new Set(rule.weekdays.filter((day) => day >= 0 && day <= 6))].sort((a, b) => a - b) : [];
  const activeWeekdays = rule.kind === "weekly" && weekdays.length === 0 ? [mondayIndex(start)] : weekdays;
  let cursor = start;
  for (let scanned = 0; scanned < 3660 && results.length < targetCount; scanned += 1, cursor = addDays(cursor, 1)) {
    const key = dateKey(cursor);
    if (until !== undefined && key > until) break;
    const daysFromStart = Math.round((cursor.getTime() - start.getTime()) / 86_400_000);
    const matches = rule.kind === "daily"
      ? daysFromStart % interval === 0
      : Math.floor(daysFromStart / 7) % interval === 0 && activeWeekdays.includes(mondayIndex(cursor));
    if (matches) results.push(key);
  }
  return results.length > 0 ? results : [startDate];
}

export function recurrenceSummary(rule: RecurrenceRule): string | undefined {
  if (rule.kind === "none") return undefined;
  const end = rule.end.mode === "count" ? `共 ${rule.end.count} 次` : `至 ${rule.end.until}`;
  if (rule.kind === "daily") return `${rule.interval === 1 ? "每天" : `每 ${rule.interval} 天`} · ${end}`;
  const labels = ["一", "二", "三", "四", "五", "六", "日"];
  const days = rule.weekdays.map((day) => `周${labels[day]}`).join("、") || "每周同日";
  return `${rule.interval === 1 ? "每周" : `每 ${rule.interval} 周`} ${days} · ${end}`;
}
