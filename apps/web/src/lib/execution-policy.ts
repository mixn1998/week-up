import type { PlanRecord, PlanTimeSegmentInput } from "./week-up-domain.ts";

export type ExecutionTimeDraft = Readonly<{
  id: string;
  start: string;
  end: string;
}>;

export function shanghaiDate(instant: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(instant));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function shanghaiTime(instant: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(instant));
}

export function completedBeforeSchedule(completedAt: string, plan: Pick<PlanRecord, "startAt">): boolean {
  return shanghaiDate(completedAt) < shanghaiDate(plan.startAt);
}

export function executionDraftForPlan(
  plan: Pick<PlanRecord, "startAt" | "endAt" | "timeSegments" | "timeStatus">,
  segmentId?: string,
): ExecutionTimeDraft[] {
  const source = segmentId
    ? plan.timeSegments?.filter((segment) => segment.id === segmentId)
    : plan.timeSegments?.length
      ? plan.timeSegments
      : plan.timeStatus === "unscheduled"
        ? []
        : [{ id: "actual", startAt: plan.startAt, endAt: plan.endAt }];
  if (source?.length) {
    return source.map((segment) => ({
      id: segment.id,
      start: shanghaiTime(segment.startAt),
      end: shanghaiTime(segment.endAt),
    }));
  }
  const now = new Date();
  const end = shanghaiTime(now.toISOString());
  const start = shanghaiTime(new Date(now.getTime() - 60 * 60 * 1_000).toISOString());
  return [{ id: "actual", start, end }];
}

export function executionDraftIsValid(segments: readonly ExecutionTimeDraft[]): boolean {
  if (segments.length === 0 || segments.some((segment) => !segment.start || !segment.end || segment.end <= segment.start)) return false;
  const ordered = [...segments].sort((left, right) => left.start.localeCompare(right.start));
  return ordered.every((segment, index) => index === 0 || ordered[index - 1]!.end <= segment.start);
}

export function executionSegmentsForDate(date: string, segments: readonly ExecutionTimeDraft[]): PlanTimeSegmentInput[] {
  if (!executionDraftIsValid(segments)) throw new Error("execution_time_invalid");
  return [...segments]
    .sort((left, right) => left.start.localeCompare(right.start))
    .map((segment) => ({
      startAt: `${date}T${segment.start}:00+08:00`,
      endAt: `${date}T${segment.end}:00+08:00`,
    }));
}
