export type AttributeReward = {
  attributeId: string;
  amount: number;
};

export type Attribute = {
  id: string;
  name: string;
  icon: string;
  color: string;
  totalXp: number;
  note: string;
  category?: string;
  pinned?: boolean;
  lastGainedAt?: string;
};

export type PlanTimeSegmentItem = {
  id: string;
  start: string;
  end: string;
  completed: boolean;
};

export type PlanItem = {
  id: string;
  calendarSourceId?: string;
  projectId?: string;
  recurrenceGroupId?: string;
  scheduledDate?: string;
  title: string;
  detail: string;
  start: string;
  end: string;
  timeSegments?: PlanTimeSegmentItem[];
  timeStatus?: "unscheduled" | "scheduled";
  category: string;
  categoryColor: string;
  categoryTextColor: string;
  completed: boolean;
  completedAt?: string;
  completedDate?: string;
  completedEarly?: boolean;
  rewards: AttributeReward[];
  source?: "week-up" | "learning-more";
  executionSource?: "week-up" | "learning-more";
  syncState?: "scheduled" | "in_progress" | "completed";
  dayIndex?: number;
  scheduleGroup?: "now" | "next" | "later" | "completed";
  rewardMode?: "none" | "template" | "custom";
  templateLabel?: string;
  unitLabel?: string;
  recurrenceSummary?: string;
  recurrenceDetached?: boolean;
  overdue?: boolean;
  overdueCarried?: boolean;
  overdueRescheduled?: boolean;
};

export type WeightEntry = {
  date: string;
  label: string;
  value: number;
};

export type BadgeProgress = {
  level: number;
  xpInLevel: number;
  xpForNext: number;
  percent: number;
};

export function levelFromTotalXp(totalXp: number): BadgeProgress {
  let level = 1;
  let remaining = Math.max(0, totalXp);
  let xpForNext = 5 * (level + 1);

  while (remaining >= xpForNext) {
    remaining -= xpForNext;
    level += 1;
    xpForNext = 5 * (level + 1);
  }

  return {
    level,
    xpInLevel: remaining,
    xpForNext,
    percent: Math.round((remaining / xpForNext) * 100),
  };
}

export function movingAverage(entries: WeightEntry[], windowSize = 7): Array<number | null> {
  return entries.map((_, index) => {
    const slice = entries.slice(Math.max(0, index - windowSize + 1), index + 1);
    if (slice.length < 2) return null;
    const average = slice.reduce((sum, entry) => sum + entry.value, 0) / slice.length;
    return Math.round(average * 10) / 10;
  });
}

export function downsampleEntries(entries: WeightEntry[], maxPoints: number): WeightEntry[] {
  if (entries.length <= maxPoints || maxPoints < 3) return [...entries];
  const result: WeightEntry[] = [entries[0]!];
  const interiorSlots = maxPoints - 2;
  const bucketSize = (entries.length - 2) / interiorSlots;
  for (let slot = 0; slot < interiorSlots; slot += 1) {
    const start = 1 + Math.floor(slot * bucketSize);
    const end = Math.min(entries.length - 1, 1 + Math.floor((slot + 1) * bucketSize));
    const bucket = entries.slice(start, Math.max(start + 1, end));
    const previous = result.at(-1)!.value;
    result.push(bucket.reduce((best, item) => Math.abs(item.value - previous) > Math.abs(best.value - previous) ? item : best));
  }
  result.push(entries.at(-1)!);
  return result;
}
