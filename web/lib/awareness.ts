import type { AiProviderId } from "./week-up-domain.ts";

export const AWARENESS_TOPIC_LABELS = [
  "自我认知", "情绪调节", "关系联结", "认知学习", "行动成长",
  "系统策略", "商业社会", "身体审美", "价值存在",
] as const;

export const THOUGHT_FORM_LABELS = ["观察", "原则", "心智模型", "行动策略", "自我提醒"] as const;

export type AwarenessTopic = typeof AWARENESS_TOPIC_LABELS[number];
export type ThoughtForm = typeof THOUGHT_FORM_LABELS[number];
export type EmotionLevel = 1 | 2 | 3 | 4 | 5;
export type AwarenessAnalysisMeta = Readonly<{
  generatedAt?: string;
  provider?: AiProviderId;
  preferredProvider?: AiProviderId;
  fallbackUsed?: boolean;
  model?: string;
  reasoningEffort?: string;
}>;

type AwarenessEntryBase = Readonly<{
  id: string;
  localDate: string;
  occurredAt: string;
  createdAt: string;
  updatedAt: string;
  settlementState: "open" | "frozen";
  removedAt?: string;
}>;

export type AwarenessEntry =
  | AwarenessEntryBase & Readonly<{ kind: "thought"; content: string }>
  | AwarenessEntryBase & Readonly<{ kind: "emotion"; level: EmotionLevel; reason?: string }>;

export type DailyAwarenessSnapshot = Readonly<{
  id: string;
  localDate: string;
  thoughtEntryIds: readonly string[];
  emotionEntryIds: readonly string[];
  thoughtDisplayBlocks: readonly Readonly<{ entryId: string; occurredAt: string; content: string }>[];
  emotionSummary: Readonly<{
    recordedEventCount: number;
    levelDistribution: Readonly<Record<"1" | "2" | "3" | "4" | "5", number>>;
    minimumLevel: EmotionLevel | null;
    maximumLevel: EmotionLevel | null;
    reasons: readonly Readonly<{ entryId: string; occurredAt: string; level: EmotionLevel; reason: string }>[];
  }>;
  frozenAt: string;
}>;

export type WeeklyEmotionAnalysis = Readonly<{
  dominantFlow: string;
  recurringTriggers: readonly string[];
  recoveryPatterns: readonly string[];
  notableChanges: readonly string[];
  evidenceEntryIds: readonly string[];
}>;

export type WeeklyEmotionReview = Readonly<{
  id: string;
  weekKey: string;
  rangeStart: string;
  rangeEnd: string;
  sourceSnapshotIds: readonly string[];
  statistics: Readonly<{
    entryCount: number;
    daysWithRecordedEvents: number;
    levelDistribution: Readonly<Record<"1" | "2" | "3" | "4" | "5", number>>;
  }>;
  analysis:
    | Readonly<{ status: "pending" }>
    | Readonly<{ status: "failed"; error: string }>
    | Readonly<{ status: "ready"; value: WeeklyEmotionAnalysis }> & AwarenessAnalysisMeta;
  frozenAt: string;
}>;

export type ClassifiedThoughtEntry = Readonly<{
  entryId: string;
  primaryTopic: AwarenessTopic;
  thoughtForm: ThoughtForm;
  modelTags: readonly string[];
}>;

export type MonthlyThoughtAnalysis = Readonly<{
  classifiedEntries: readonly ClassifiedThoughtEntry[];
  topicDistribution: readonly Readonly<{ topic: AwarenessTopic; entryCount: number; recordedDateCount: number }>[];
  recordingShape: Readonly<{
    entryCount: number;
    recordedDateCount: number;
    burstDates: readonly Readonly<{ localDate: string; entryCount: number }>[];
  }>;
  keyInsights: readonly Readonly<{ summary: string; evidenceEntryIds: readonly string[] }>[];
  thoughtShifts: readonly Readonly<{ from: string; to: string; evidenceEntryIds: readonly string[] }>[];
  recurringQuestions: readonly Readonly<{ question: string; evidenceEntryIds: readonly string[] }>[];
}>;

export type MonthlyThoughtReview = Readonly<{
  id: string;
  monthKey: string;
  rangeStart: string;
  rangeEnd: string;
  sourceSnapshotIds: readonly string[];
  sourceThoughtEntryIds: readonly string[];
  analysis:
    | Readonly<{ status: "pending" }>
    | Readonly<{ status: "failed"; error: string }>
    | Readonly<{ status: "ready"; value: MonthlyThoughtAnalysis }> & AwarenessAnalysisMeta;
  frozenAt: string;
}>;

export type MentalModelItem = Readonly<{
  stableKey: string;
  name: string;
  summary: string;
  triggers: readonly string[];
  assumptions: readonly string[];
  defaultResponses: readonly string[];
  currentStrategies: readonly string[];
  supportingEntryIds: readonly string[];
  counterEvidenceEntryIds: readonly string[];
  confidence: "low" | "medium" | "high";
  changeType: "new" | "reinforced" | "revised" | "retired";
  previousModelKey?: string;
  changeSummary?: string;
}>;

export type MentalModelVersion = Readonly<{
  id: string;
  scope: "historical-baseline" | "monthly";
  periodKey: string;
  revisionNumber: number;
  previousVersionId?: string;
  sourceThoughtReviewId?: string;
  sourceThoughtEntryIds: readonly string[];
  sourceEmotionSnapshotIds: readonly string[];
  sourceEmotionReviewIds: readonly string[];
  historicalSource?: Readonly<{
    sourceKey: string;
    sourceName: string;
    recordCount: number;
    recordedDateCount: number;
    rangeStart: string;
    rangeEnd: string;
  }>;
  analysis:
    | Readonly<{ status: "pending" }>
    | Readonly<{ status: "failed"; error: string }>
    | Readonly<{ status: "ready"; models: readonly MentalModelItem[] }> & AwarenessAnalysisMeta;
  frozenAt: string;
}>;

function emptyDistribution(): Record<"1" | "2" | "3" | "4" | "5", number> {
  return { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
}

export function buildDailyAwarenessSnapshot(
  entries: readonly AwarenessEntry[],
  localDate: string,
  id: string,
  frozenAt: string,
): DailyAwarenessSnapshot | undefined {
  const selected = entries
    .filter((entry) => entry.localDate === localDate && entry.removedAt === undefined)
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id));
  if (selected.length === 0) return undefined;
  const thoughts = selected.filter((entry): entry is Extract<AwarenessEntry, { kind: "thought" }> => entry.kind === "thought");
  const emotions = selected.filter((entry): entry is Extract<AwarenessEntry, { kind: "emotion" }> => entry.kind === "emotion");
  const distribution = emptyDistribution();
  for (const emotion of emotions) distribution[String(emotion.level) as keyof typeof distribution] += 1;
  const levels = emotions.map((entry) => entry.level);
  return {
    id,
    localDate,
    thoughtEntryIds: thoughts.map((entry) => entry.id),
    emotionEntryIds: emotions.map((entry) => entry.id),
    thoughtDisplayBlocks: thoughts.map((entry) => ({ entryId: entry.id, occurredAt: entry.occurredAt, content: entry.content })),
    emotionSummary: {
      recordedEventCount: emotions.length,
      levelDistribution: distribution,
      minimumLevel: levels.length ? Math.min(...levels) as EmotionLevel : null,
      maximumLevel: levels.length ? Math.max(...levels) as EmotionLevel : null,
      reasons: emotions.flatMap((entry) => entry.reason?.trim()
        ? [{ entryId: entry.id, occurredAt: entry.occurredAt, level: entry.level, reason: entry.reason.trim() }]
        : []),
    },
    frozenAt,
  };
}

export function awarenessEntriesInRange(
  entries: readonly AwarenessEntry[],
  startDate: string,
  endDate: string,
  kind?: AwarenessEntry["kind"],
): AwarenessEntry[] {
  return entries
    .filter((entry) =>
      entry.removedAt === undefined
      && entry.localDate >= startDate
      && entry.localDate <= endDate
      && (kind === undefined || entry.kind === kind)
    )
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id));
}

export function weeklyEmotionReviewShell(
  snapshots: readonly DailyAwarenessSnapshot[],
  startDate: string,
  endDate: string,
  id: string,
  frozenAt: string,
): WeeklyEmotionReview | undefined {
  const source = snapshots.filter((snapshot) =>
    snapshot.localDate >= startDate
    && snapshot.localDate <= endDate
    && snapshot.emotionEntryIds.length > 0
  );
  if (source.length === 0) return undefined;
  const distribution = emptyDistribution();
  for (const snapshot of source) {
    for (const key of Object.keys(distribution) as Array<keyof typeof distribution>) {
      distribution[key] += snapshot.emotionSummary.levelDistribution[key];
    }
  }
  return {
    id,
    weekKey: `${startDate}:${endDate}`,
    rangeStart: startDate,
    rangeEnd: endDate,
    sourceSnapshotIds: source.map((snapshot) => snapshot.id),
    statistics: {
      entryCount: source.reduce((sum, snapshot) => sum + snapshot.emotionEntryIds.length, 0),
      daysWithRecordedEvents: source.length,
      levelDistribution: distribution,
    },
    analysis: { status: "pending" },
    frozenAt,
  };
}

export function monthlyThoughtReviewShell(
  snapshots: readonly DailyAwarenessSnapshot[],
  startDate: string,
  endDate: string,
  id: string,
  frozenAt: string,
): MonthlyThoughtReview | undefined {
  const source = snapshots.filter((snapshot) =>
    snapshot.localDate >= startDate
    && snapshot.localDate <= endDate
    && snapshot.thoughtEntryIds.length > 0
  );
  if (source.length === 0) return undefined;
  return {
    id,
    monthKey: startDate.slice(0, 7),
    rangeStart: startDate,
    rangeEnd: endDate,
    sourceSnapshotIds: source.map((snapshot) => snapshot.id),
    sourceThoughtEntryIds: source.flatMap((snapshot) => snapshot.thoughtEntryIds),
    analysis: { status: "pending" },
    frozenAt,
  };
}

export function monthlyMentalModelShell(
  snapshots: readonly DailyAwarenessSnapshot[],
  emotionReviews: readonly WeeklyEmotionReview[],
  thoughtReview: MonthlyThoughtReview | undefined,
  startDate: string,
  endDate: string,
  id: string,
  frozenAt: string,
  previousVersionId?: string,
): MentalModelVersion | undefined {
  const emotionSnapshots = snapshots.filter((snapshot) =>
    snapshot.localDate >= startDate
    && snapshot.localDate <= endDate
    && snapshot.emotionEntryIds.length > 0
  );
  const thoughtEntryIds = thoughtReview?.sourceThoughtEntryIds ?? [];
  if (thoughtEntryIds.length === 0 && emotionSnapshots.length === 0) return undefined;
  return {
    id,
    scope: "monthly",
    periodKey: startDate.slice(0, 7),
    revisionNumber: 1,
    ...(previousVersionId ? { previousVersionId } : {}),
    ...(thoughtReview ? { sourceThoughtReviewId: thoughtReview.id } : {}),
    sourceThoughtEntryIds: thoughtEntryIds,
    sourceEmotionSnapshotIds: emotionSnapshots.map((snapshot) => snapshot.id),
    sourceEmotionReviewIds: emotionReviews
      .filter((review) => review.rangeStart <= endDate && review.rangeEnd >= startDate)
      .map((review) => review.id),
    analysis: { status: "pending" },
    frozenAt,
  };
}
