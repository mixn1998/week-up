import type { AiProviderId } from "./week-up-domain.ts";

export const AWARENESS_TOPIC_LABELS = [
  "自我认知", "情绪调节", "关系联结", "认知学习", "行动成长",
  "系统策略", "商业社会", "身体审美", "价值存在",
] as const;

export const THOUGHT_FORM_LABELS = ["观察", "原则", "心智模型", "行动策略", "自我提醒"] as const;

export type AwarenessTopic = typeof AWARENESS_TOPIC_LABELS[number];
export type ThoughtForm = typeof THOUGHT_FORM_LABELS[number];
export type EmotionLevel = 1 | 2 | 3 | 4 | 5;
export type EmotionType = "low" | "anxious" | "angry" | "joyful" | "excited" | "complex";

export const EMOTION_TYPES: readonly Readonly<{ key: EmotionType; label: string; mark: string; legacyLevel: EmotionLevel }>[] = [
  { key: "low", label: "低落", mark: "▂", legacyLevel: 1 },
  { key: "anxious", label: "焦虑", mark: "≋", legacyLevel: 2 },
  { key: "angry", label: "愤怒", mark: "▲", legacyLevel: 2 },
  { key: "joyful", label: "愉悦", mark: "◆", legacyLevel: 4 },
  { key: "excited", label: "激动", mark: "▇", legacyLevel: 5 },
  { key: "complex", label: "复杂", mark: "◇", legacyLevel: 3 },
] as const;

export function emotionTypeFromLegacyLevel(level: EmotionLevel): EmotionType {
  if (level <= 2) return "low";
  if (level === 3) return "complex";
  if (level === 4) return "joyful";
  return "excited";
}

export function legacyLevelForEmotionType(type: EmotionType): EmotionLevel {
  return EMOTION_TYPES.find((item) => item.key === type)?.legacyLevel ?? 3;
}
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
  | AwarenessEntryBase & Readonly<{
      kind: "emotion";
      level: EmotionLevel;
      emotionType?: EmotionType;
      reason?: string;
    }>;

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
    reasons: readonly Readonly<{
      entryId: string;
      occurredAt: string;
      level: EmotionLevel;
      emotionType?: EmotionType;
      reason: string;
    }>[];
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

export type MentalModelDimensionKey =
  | "self"
  | "relationships"
  | "power"
  | "action"
  | "learning"
  | "values"
  | "vitality"
  | "world";

export type MentalModelDimensionProfile = Readonly<{
  dimension: MentalModelDimensionKey;
  strength: number;
  confidence: "low" | "medium" | "high";
  summary: string;
  defaultJudgments: readonly string[];
  currentStrategies: readonly string[];
  supportingModelKeys: readonly string[];
  changeDirection: "new" | "stable" | "strengthened" | "weakened" | "reframed";
  changeSummary?: string;
}>;

export const MENTAL_MODEL_DIMENSIONS: readonly Readonly<{
  key: MentalModelDimensionKey;
  label: string;
  description: string;
  keywords: readonly string[];
}>[] = [
  { key: "self", label: "自我观", description: "主体性、自我认同、能动性与边界", keywords: ["自我", "主体", "边界", "注意力", "自主", "身份", "选择"] },
  { key: "relationships", label: "人际观", description: "亲密、合作、差异、信任与关系共创", keywords: ["人际", "关系", "信任", "合作", "亲密", "沟通", "差异", "他人"] },
  { key: "power", label: "权力观", description: "选择权、资源、谈判、规则与结构性影响", keywords: ["权力", "权限", "资源", "规则", "结构", "谈判", "控制", "影响"] },
  { key: "action", label: "行动观", description: "执行、节奏、风险处理、实践与复盘", keywords: ["行动", "执行", "实践", "复盘", "风险", "步骤", "节奏", "决策"] },
  { key: "learning", label: "学习观", description: "认知方式、知识结构、验证与理解策略", keywords: ["学习", "认知", "知识", "理解", "验证", "问题", "思考"] },
  { key: "values", label: "价值观", description: "长期价值、贡献、交换、责任与意义", keywords: ["价值", "责任", "贡献", "交换", "长期", "非零和", "意义"] },
  { key: "vitality", label: "生命观", description: "情绪、身体经验、欲望、克制与生命力", keywords: ["生命", "情绪", "身体", "欲望", "克制", "活力", "感受", "审美"] },
  { key: "world", label: "世界观", description: "环境、系统、情境、不确定性与整体解释", keywords: ["世界", "系统", "环境", "情境", "不确定", "整体", "现实", "社会"] },
] as const;

const MENTAL_MODEL_CONFIDENCE_WEIGHT = { low: 16, medium: 26, high: 36 } as const;

function uniqueText(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function isMentalModelDimensionKey(value: unknown): value is MentalModelDimensionKey {
  return MENTAL_MODEL_DIMENSIONS.some((item) => item.key === value);
}

export function completeMentalModelDimensionProfile(
  models: readonly MentalModelItem[],
  supplied: readonly MentalModelDimensionProfile[] = [],
): readonly MentalModelDimensionProfile[] {
  const suppliedByKey = new Map(supplied
    .filter((item): item is MentalModelDimensionProfile => Boolean(item) && isMentalModelDimensionKey(item.dimension))
    .map((item) => [item.dimension, item]));
  return MENTAL_MODEL_DIMENSIONS.map((definition) => {
    const existing = suppliedByKey.get(definition.key);
    if (existing) {
      const strength = Number.isFinite(existing.strength) ? Math.max(0, Math.min(100, Math.round(existing.strength))) : 0;
      return {
        ...existing,
        dimension: definition.key,
        strength,
        summary: existing.summary?.trim() || (strength > 0 ? definition.description : "当前没有足够证据"),
        defaultJudgments: uniqueText(existing.defaultJudgments ?? []),
        currentStrategies: uniqueText(existing.currentStrategies ?? []),
        supportingModelKeys: uniqueText(existing.supportingModelKeys ?? []),
      };
    }
    const matched = models.filter((model) => {
      const text = [
        model.stableKey, model.name, model.summary, ...model.triggers, ...model.assumptions,
        ...model.defaultResponses, ...model.currentStrategies,
      ].join(" ").toLocaleLowerCase();
      return definition.keywords.some((keyword) => text.includes(keyword.toLocaleLowerCase()));
    });
    if (matched.length === 0) {
      return {
        dimension: definition.key,
        strength: 0,
        confidence: "low",
        summary: "当前没有足够证据",
        defaultJudgments: [],
        currentStrategies: [],
        supportingModelKeys: [],
        changeDirection: "stable",
      };
    }
    const confidenceScore = Math.max(...matched.map((model) => MENTAL_MODEL_CONFIDENCE_WEIGHT[model.confidence]));
    const supportingEntries = new Set(matched.flatMap((model) => model.supportingEntryIds)).size;
    const counterEvidence = new Set(matched.flatMap((model) => model.counterEvidenceEntryIds)).size;
    const strength = Math.max(0, Math.min(100,
      20 + confidenceScore + Math.min(24, matched.length * 8) + Math.min(18, supportingEntries * 3) - Math.min(20, counterEvidence * 4)
    ));
    const confidence = matched.some((model) => model.confidence === "high")
      ? "high"
      : matched.some((model) => model.confidence === "medium") ? "medium" : "low";
    return {
      dimension: definition.key,
      strength,
      confidence,
      summary: matched.slice(0, 2).map((model) => model.summary).join("；"),
      defaultJudgments: uniqueText(matched.flatMap((model) => model.assumptions)).slice(0, 4),
      currentStrategies: uniqueText(matched.flatMap((model) => model.currentStrategies)).slice(0, 4),
      supportingModelKeys: matched.map((model) => model.stableKey),
      changeDirection: "new",
      changeSummary: "由既有结构化心智模型形成初始维度画像",
    };
  });
}

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
    | Readonly<{
        status: "ready";
        models: readonly MentalModelItem[];
        dimensionProfile: readonly MentalModelDimensionProfile[];
      }> & AwarenessAnalysisMeta;
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
        ? [{
            entryId: entry.id,
            occurredAt: entry.occurredAt,
            level: entry.level,
            emotionType: entry.emotionType ?? emotionTypeFromLegacyLevel(entry.level),
            reason: entry.reason.trim(),
          }]
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
