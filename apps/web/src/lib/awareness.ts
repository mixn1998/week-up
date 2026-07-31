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
  triggerChains?: readonly Readonly<{
    eventSummary: string;
    interpretation: string;
    underlyingNeeds: readonly string[];
    emotionalResponse: string;
    possibleMechanism: string;
    evidenceEntryIds: readonly string[];
  }>[];
  alternativeExplanations?: readonly Readonly<{ summary: string; evidenceEntryIds: readonly string[] }>[];
  pendingValidations?: readonly Readonly<{ question: string; evidenceEntryIds: readonly string[] }>[];
  mentalModelSignals?: readonly Readonly<{
    dimension: MentalModelDimensionKey;
    summary: string;
    evidenceEntryIds: readonly string[];
  }>[];
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
  repeatedThemes?: readonly Readonly<{ summary: string; evidenceEntryIds: readonly string[] }>[];
  emergingSignals?: readonly Readonly<{ summary: string; evidenceEntryIds: readonly string[] }>[];
  openObservations?: readonly Readonly<{ question: string; evidenceEntryIds: readonly string[] }>[];
  thoughtShifts?: readonly Readonly<{ from: string; to: string; evidenceEntryIds: readonly string[] }>[];
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
  preferredModelKeys: readonly string[];
}>[] = [
  { key: "self", label: "自我观", description: "怎么看自己、边界和选择", keywords: ["自我", "主体", "边界", "注意力", "自主", "身份", "选择"], preferredModelKeys: ["internal_agency_and_response", "authentic_open_subjectivity"] },
  { key: "relationships", label: "人际观", description: "怎么看关系、合作和信任", keywords: ["人际", "关系", "信任", "合作", "亲密", "沟通", "差异", "他人"], preferredModelKeys: ["relationship_as_dynamic_co_creation"] },
  { key: "power", label: "权力观", description: "怎么看选择权、资源和规则", keywords: ["权力", "权限", "资源", "规则", "结构", "谈判", "控制", "影响"], preferredModelKeys: ["optionality_power_and_negotiation"] },
  { key: "action", label: "行动观", description: "怎么行动、处理风险和复盘", keywords: ["行动", "执行", "实践", "复盘", "风险", "步骤", "节奏", "决策"], preferredModelKeys: ["process_rhythm_and_practice"] },
  { key: "learning", label: "学习观", description: "怎么理解、学习和验证", keywords: ["学习", "认知", "知识", "理解", "验证", "问题", "思考"], preferredModelKeys: ["structural_semantic_learning"] },
  { key: "values", label: "价值观", description: "什么值得长期投入", keywords: ["价值", "责任", "贡献", "交换", "长期", "非零和", "意义"], preferredModelKeys: ["long_term_nonzero_sum_value"] },
  { key: "vitality", label: "生命观", description: "怎么看情绪、身体和生命力", keywords: ["生命", "情绪", "身体", "欲望", "克制", "活力", "感受", "审美"], preferredModelKeys: ["vitality_with_restraint"] },
  { key: "world", label: "世界观", description: "怎么看环境、变化和不确定性", keywords: ["世界", "系统", "环境", "情境", "不确定", "整体", "现实", "社会"], preferredModelKeys: ["contextual_dynamic_systems", "strategic_environment_filtering"] },
] as const;

const MENTAL_MODEL_CONFIDENCE_WEIGHT = { low: 16, medium: 26, high: 36 } as const;

function uniqueText(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function isMentalModelDimensionKey(value: unknown): value is MentalModelDimensionKey {
  return MENTAL_MODEL_DIMENSIONS.some((item) => item.key === value);
}

function mentalModelText(model: MentalModelItem): string {
  return [
    model.stableKey, model.name, model.summary, ...model.triggers, ...model.assumptions,
    ...model.defaultResponses, ...model.currentStrategies,
  ].join(" ").toLocaleLowerCase();
}

function profileNeedsDistinctRebuild(
  models: readonly MentalModelItem[],
  supplied: readonly MentalModelDimensionProfile[],
): boolean {
  const valid = supplied.filter((item) => item && isMentalModelDimensionKey(item.dimension));
  if (models.length < 8 || valid.length < 8) return false;
  const distinctSummaries = new Set(valid.map((item) => item.summary?.trim() ?? "")).size;
  const saturated = valid.filter((item) => item.strength >= 90).length;
  const overShared = valid.filter((item) => (item.supportingModelKeys ?? []).length >= 5).length;
  return distinctSummaries <= Math.floor(valid.length / 2) && saturated >= 6 && overShared >= 4;
}

export function completeMentalModelDimensionProfile(
  models: readonly MentalModelItem[],
  supplied: readonly MentalModelDimensionProfile[] = [],
): readonly MentalModelDimensionProfile[] {
  const suppliedByKey = new Map((profileNeedsDistinctRebuild(models, supplied) ? [] : supplied)
    .filter((item): item is MentalModelDimensionProfile => Boolean(item) && isMentalModelDimensionKey(item.dimension))
    .map((item) => [item.dimension, item]));
  const claimedFallbackModels = new Set<string>();
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
    const preferred = definition.preferredModelKeys
      .map((stableKey) => models.find((model) => model.stableKey === stableKey))
      .filter((model): model is MentalModelItem => Boolean(model));
    const fallback = models
      .filter((model) => !claimedFallbackModels.has(model.stableKey) && !preferred.some((item) => item.stableKey === model.stableKey))
      .map((model) => ({
        model,
        score: definition.keywords.filter((keyword) => mentalModelText(model).includes(keyword.toLocaleLowerCase())).length,
      }))
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 1)
      .map((candidate) => candidate.model);
    const matched = preferred.length > 0 ? preferred : fallback;
    matched.forEach((model) => claimedFallbackModels.add(model.stableKey));
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
      summary: matched[0].summary,
      defaultJudgments: uniqueText(matched.flatMap((model) => model.assumptions)).slice(0, 3),
      currentStrategies: uniqueText(matched.flatMap((model) => model.currentStrategies)).slice(0, 3),
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
