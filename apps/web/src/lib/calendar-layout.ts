import type { PlanItem } from "./demo-model";

export type CalendarCluster = {
  id: string;
  startMinutes: number;
  endMinutes: number;
  plans: PlanItem[];
};

const CALENDAR_START = 6 * 60;
const CALENDAR_END = 24 * 60;
const CALENDAR_SPAN = CALENDAR_END - CALENDAR_START;
const BLOCK_GAP_PERCENT = 0.65;

function toMinutes(value: string) {
  const [hour = 0, minute = 0] = value.split(":").map(Number);
  return hour * 60 + minute;
}

export function clusterCalendarPlans(plans: PlanItem[]): CalendarCluster[] {
  const ordered = [...plans].sort((left, right) => left.start.localeCompare(right.start) || left.id.localeCompare(right.id));
  const clusters: CalendarCluster[] = [];

  for (const plan of ordered) {
    const startMinutes = toMinutes(plan.start);
    const parsedEnd = toMinutes(plan.end);
    const endMinutes = parsedEnd > startMinutes ? parsedEnd : startMinutes + 60;
    const current = clusters.at(-1);

    if (current && startMinutes < current.endMinutes) {
      current.plans.push(plan);
      current.endMinutes = Math.max(current.endMinutes, endMinutes);
      continue;
    }

    clusters.push({
      id: `calendar-cluster-${plan.id}`,
      startMinutes,
      endMinutes,
      plans: [plan],
    });
  }

  return clusters;
}

export function projectCalendarCluster(cluster: CalendarCluster) {
  const start = Math.max(CALENDAR_START, Math.min(CALENDAR_END, cluster.startMinutes));
  const end = Math.max(start, Math.min(CALENDAR_END, cluster.endMinutes));
  const topPercent = ((start - CALENDAR_START) / CALENDAR_SPAN) * 100;
  const rawHeight = ((end - start) / CALENDAR_SPAN) * 100;
  return {
    topPercent,
    heightPercent: Math.max(0, rawHeight - BLOCK_GAP_PERCENT),
  };
}

export function rescheduleRange(dateKey: string, startTime: string, originalStartAt: string, originalEndAt: string) {
  const originalDuration = Date.parse(originalEndAt) - Date.parse(originalStartAt);
  const duration = Number.isFinite(originalDuration) && originalDuration > 0 ? originalDuration : 3_600_000;
  const startAt = `${dateKey}T${startTime}:00+08:00`;
  return { startAt, endAt: new Date(Date.parse(startAt) + duration).toISOString() };
}
