import type {
  EmotionType,
  MentalModelDimensionProfile,
  MentalModelItem,
  MentalModelVersion,
  MonthlyThoughtAnalysis,
  MonthlyThoughtReview,
  WeeklyEmotionAnalysis,
  WeeklyEmotionReview,
} from "./awareness.ts";
import {
  completeMentalModelDimensionProfile,
  emotionTypeFromLegacyLevel,
} from "./awareness.ts";
import type { AiProviderId, AiReviewState, WeekUpState } from "./week-up-domain.ts";

export type WeeklyEmotionFacts = Readonly<{
  kind: "weekly-emotion";
  sampling: "sparse-significant-events";
  reviewId: string;
  rangeStart: string;
  rangeEnd: string;
  events: readonly Readonly<{
    entryId: string;
    localDate: string;
    occurredAt: string;
    level: number;
    emotionType: EmotionType;
    reason?: string;
  }>[];
}>;

export type MonthlyAwarenessFacts = Readonly<{
  kind: "monthly-awareness" | "historical-baseline";
  sampling: "sparse-significant-events";
  thoughtReviewId?: string;
  mentalModelVersionId: string;
  rangeStart?: string;
  rangeEnd?: string;
  thoughts: readonly Readonly<{
    entryId: string;
    localDate: string;
    occurredAt: string;
    content: string;
    legacySourceReference?: string;
  }>[];
  emotions: readonly Readonly<{
    entryId: string;
    localDate: string;
    occurredAt: string;
    level: number;
    emotionType: EmotionType;
    reason?: string;
  }>[];
  emotionReviews: readonly Readonly<{
    reviewId: string;
    rangeStart: string;
    rangeEnd: string;
    analysis: WeeklyEmotionAnalysis;
  }>[];
  previousModels: readonly MentalModelItem[];
  previousDimensionProfile: readonly MentalModelDimensionProfile[];
}>;

export type HistoricalThoughtInput = Readonly<{
  entryId: string;
  localDate: string;
  occurredAt: string;
  content: string;
  legacySourceReference?: string;
}>;

export type AwarenessAnalysisFacts = WeeklyEmotionFacts | MonthlyAwarenessFacts;

export type AwarenessAnalysisResult =
  | Readonly<{
      kind: "weekly-emotion";
      reviewId: string;
      emotion: WeeklyEmotionAnalysis;
    }>
  | Readonly<{
      kind: "monthly-awareness" | "historical-baseline";
      thoughtReviewId?: string;
      mentalModelVersionId: string;
      thought?: MonthlyThoughtAnalysis;
      models: readonly MentalModelItem[];
      dimensionProfile: readonly MentalModelDimensionProfile[];
    }>;

export type AwarenessAnalysisResponse = Readonly<{
  result: AwarenessAnalysisResult;
  provider: AiProviderId;
  preferredProvider: AiProviderId;
  fallbackUsed: boolean;
  model?: string;
  reasoningEffort?: string;
  checkedAt: string;
}>;

function sourceEntryMap(state: WeekUpState) {
  return new Map(state.awarenessEntries.filter((entry) => entry.removedAt === undefined).map((entry) => [entry.id, entry]));
}

function previousModels(state: WeekUpState, version: MentalModelVersion): readonly MentalModelItem[] {
  const previous = version.previousVersionId
    ? state.mentalModelVersions.find((item) => item.id === version.previousVersionId)
    : undefined;
  return previous?.analysis.status === "ready" ? previous.analysis.models : [];
}

function previousDimensionProfile(
  state: WeekUpState,
  version: MentalModelVersion,
): readonly MentalModelDimensionProfile[] {
  const previous = version.previousVersionId
    ? state.mentalModelVersions.find((item) => item.id === version.previousVersionId)
    : undefined;
  return previous?.analysis.status === "ready"
    ? completeMentalModelDimensionProfile(previous.analysis.models, previous.analysis.dimensionProfile)
    : completeMentalModelDimensionProfile([]);
}

export function buildWeeklyEmotionFacts(state: WeekUpState, review: WeeklyEmotionReview): WeeklyEmotionFacts {
  const snapshotIds = new Set(review.sourceSnapshotIds);
  const entryIds = new Set(state.dailyAwarenessSnapshots
    .filter((snapshot) => snapshotIds.has(snapshot.id))
    .flatMap((snapshot) => snapshot.emotionEntryIds));
  const entries = sourceEntryMap(state);
  const events = [...entryIds].flatMap((id) => {
    const entry = entries.get(id);
    if (!entry || entry.kind !== "emotion") return [];
    return [{
      entryId: entry.id,
      localDate: entry.localDate,
      occurredAt: entry.occurredAt,
      level: entry.level,
      emotionType: entry.emotionType ?? emotionTypeFromLegacyLevel(entry.level),
      ...(entry.reason ? { reason: entry.reason } : {}),
    }];
  }).sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
  return {
    kind: "weekly-emotion",
    sampling: "sparse-significant-events",
    reviewId: review.id,
    rangeStart: review.rangeStart,
    rangeEnd: review.rangeEnd,
    events,
  };
}

function buildModelFacts(
  state: WeekUpState,
  version: MentalModelVersion,
  thoughtReview?: MonthlyThoughtReview,
): MonthlyAwarenessFacts {
  const entries = sourceEntryMap(state);
  const thoughts = version.sourceThoughtEntryIds.flatMap((id) => {
    const entry = entries.get(id);
    if (!entry || entry.kind !== "thought") return [];
    return [{
      entryId: entry.id,
      localDate: entry.localDate,
      occurredAt: entry.occurredAt,
      content: entry.content,
    }];
  }).sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
  const emotionSnapshotIds = new Set(version.sourceEmotionSnapshotIds);
  const emotionEntryIds = new Set(state.dailyAwarenessSnapshots
    .filter((snapshot) => emotionSnapshotIds.has(snapshot.id))
    .flatMap((snapshot) => snapshot.emotionEntryIds));
  const emotions = [...emotionEntryIds].flatMap((id) => {
    const entry = entries.get(id);
    if (!entry || entry.kind !== "emotion") return [];
    return [{
      entryId: entry.id,
      localDate: entry.localDate,
      occurredAt: entry.occurredAt,
      level: entry.level,
      emotionType: entry.emotionType ?? emotionTypeFromLegacyLevel(entry.level),
      ...(entry.reason ? { reason: entry.reason } : {}),
    }];
  }).sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
  const emotionReviewIds = new Set(version.sourceEmotionReviewIds);
  const emotionReviews = state.weeklyEmotionReviews.flatMap((review) =>
    emotionReviewIds.has(review.id) && review.analysis.status === "ready"
      ? [{
          reviewId: review.id,
          rangeStart: review.rangeStart,
          rangeEnd: review.rangeEnd,
          analysis: review.analysis.value,
        }]
      : []
  );
  return {
    kind: version.scope === "historical-baseline" ? "historical-baseline" : "monthly-awareness",
    sampling: "sparse-significant-events",
    ...(thoughtReview ? {
      thoughtReviewId: thoughtReview.id,
      rangeStart: thoughtReview.rangeStart,
      rangeEnd: thoughtReview.rangeEnd,
    } : {}),
    mentalModelVersionId: version.id,
    thoughts,
    emotions,
    emotionReviews,
    previousModels: previousModels(state, version),
    previousDimensionProfile: previousDimensionProfile(state, version),
  };
}

export function buildMonthlyAwarenessFacts(
  state: WeekUpState,
  thoughtReview: MonthlyThoughtReview | undefined,
  version: MentalModelVersion,
): MonthlyAwarenessFacts {
  return buildModelFacts(state, version, thoughtReview);
}

export function buildHistoricalBaselineFacts(
  thoughts: readonly HistoricalThoughtInput[],
  mentalModelVersionId: string,
): MonthlyAwarenessFacts {
  return {
    kind: "historical-baseline",
    sampling: "sparse-significant-events",
    mentalModelVersionId,
    thoughts: [...thoughts].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt)),
    emotions: [],
    emotionReviews: [],
    previousModels: [],
    previousDimensionProfile: completeMentalModelDimensionProfile([]),
  };
}

export type AwarenessAnalysisTarget =
  | Readonly<{ kind: "weekly-emotion"; id: string }>
  | Readonly<{ kind: "mental-model"; id: string }>;

export function selectNextAwarenessAnalysisTarget(
  state: WeekUpState,
  inFlightIds: ReadonlySet<string>,
): AwarenessAnalysisTarget | undefined {
  const pendingModel = state.mentalModelVersions.find((version) =>
    version.analysis.status === "pending" && !inFlightIds.has(version.id)
  );
  if (pendingModel) {
    const sourceIds = new Set(pendingModel.sourceEmotionReviewIds);
    const blockingEmotion = state.weeklyEmotionReviews.find((review) =>
      sourceIds.has(review.id)
      && review.analysis.status === "pending"
      && !inFlightIds.has(review.id)
    );
    if (blockingEmotion) return { kind: "weekly-emotion", id: blockingEmotion.id };
    const sourceStillInFlight = state.weeklyEmotionReviews.some((review) =>
      sourceIds.has(review.id) && review.analysis.status === "pending" && inFlightIds.has(review.id)
    );
    if (sourceStillInFlight) return undefined;
    return { kind: "mental-model", id: pendingModel.id };
  }
  const pendingEmotion = state.weeklyEmotionReviews.find((review) =>
    review.analysis.status === "pending" && !inFlightIds.has(review.id)
  );
  return pendingEmotion ? { kind: "weekly-emotion", id: pendingEmotion.id } : undefined;
}

export function createAwarenessAnalysisClient(config: AiReviewState, fetchImpl: typeof fetch = fetch) {
  const root = config.baseUrl.replace(/\/$/, "");
  return {
    async generate(facts: AwarenessAnalysisFacts): Promise<AwarenessAnalysisResponse> {
      const response = await fetchImpl(`${root}/v1/awareness`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          facts,
          preferredProvider: config.preferredProvider,
          apiBaseUrl: config.apiBaseUrl,
          model: config.model,
          reasoningEffort: config.reasoningEffort,
        }),
      });
      if (!response.ok) throw new Error(`awareness_analysis_http_${response.status}`);
      const body = await response.json() as Partial<AwarenessAnalysisResponse>;
      if (!body.result || (body.provider !== "api" && body.provider !== "codex-cli")) {
        throw new Error("awareness_analysis_response_invalid");
      }
      return {
        result: body.result,
        provider: body.provider,
        preferredProvider: body.preferredProvider === "api" ? "api" : "codex-cli",
        fallbackUsed: body.fallbackUsed === true,
        ...(body.model ? { model: body.model } : {}),
        ...(body.reasoningEffort ? { reasoningEffort: body.reasoningEffort } : {}),
        checkedAt: body.checkedAt ?? new Date().toISOString(),
      };
    },
  };
}
