import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { buildReviewSummaryFacts, createReviewSummaryClient, type AiServiceStatus } from "./review-summary-client.ts";
import {
  buildMonthlyAwarenessFacts,
  buildWeeklyEmotionFacts,
  createAwarenessAnalysisClient,
  selectNextAwarenessAnalysisTarget,
} from "./awareness-analysis-client.ts";
import {
  createEmptyWeekUpState,
  currentWeightEntries,
  totalXpForAttribute,
  type CompletionFact,
  type PlanRecord,
  type PlanTimeSegmentInput,
  type WeekUpCommand,
  type WeekUpState,
} from "./week-up-domain.ts";
import { HttpWeekUpRepository } from "./week-up-repository.ts";
import { createWeekUpStore } from "./week-up-store.ts";
import { dueDailySettlementCommands, dueSettlementCommands } from "./settlement-scheduler.ts";
import type { Attribute, PlanItem, WeightEntry } from "./demo-model";
import { colorForCategory, readableTextColor } from "./category-palette.ts";
import { participatesInOverdueQueue } from "./overdue-policy.ts";
import {
  completedBeforeSchedule,
  shanghaiDate as dateInShanghai,
  shanghaiTime as timeInShanghai,
} from "./execution-policy.ts";

const repository = typeof window === "undefined" ? undefined : new HttpWeekUpRepository();
const store = repository ? createWeekUpStore(repository) : undefined;
const storeLoadPromise = store?.load();

function millisecondsUntilNextShanghaiDay(now = new Date()): number {
  const [year, month, day] = dateInShanghai(now.toISOString()).split("-").map(Number);
  const nextCalendarDay = new Date(Date.UTC(year, month - 1, day + 1));
  const nextDate = [
    nextCalendarDay.getUTCFullYear(),
    String(nextCalendarDay.getUTCMonth() + 1).padStart(2, "0"),
    String(nextCalendarDay.getUTCDate()).padStart(2, "0"),
  ].join("-");
  return Math.max(1_000, Date.parse(`${nextDate}T00:00:00+08:00`) - now.getTime() + 100);
}

function mondayDate(date = new Date()): string {
  const localDate = dateInShanghai(date.toISOString());
  const calendar = new Date(`${localDate}T00:00:00Z`);
  const offset = (calendar.getUTCDay() + 6) % 7;
  calendar.setUTCDate(calendar.getUTCDate() - offset);
  return calendar.toISOString().slice(0, 10);
}

export function dayIndexFor(instant: string, now = new Date()): number {
  const start = new Date(`${mondayDate(now)}T00:00:00Z`);
  const target = new Date(`${dateInShanghai(instant)}T00:00:00Z`);
  return Math.round((target.getTime() - start.getTime()) / 86_400_000);
}

export type WeekUpViewModel = Readonly<{
  attributes: Attribute[];
  catalogAttributes: Attribute[];
  plans: PlanItem[];
  timelinePlans: PlanItem[];
  weights: WeightEntry[];
}>;

function projectTimelinePlan(
  state: WeekUpState,
  item: PlanRecord,
  value: {
    id: string;
    segment?: PlanTimeSegmentInput;
    completedAt: string;
    executionSource: CompletionFact["source"];
  },
): PlanItem {
  const currentProject = item.projectId
    ? state.projects.find((project) => project.id === item.projectId)
    : item.sourceCourseId
      ? state.projects.find((project) => project.sourceCourseId === item.sourceCourseId)
      : undefined;
  const category = currentProject?.category ?? item.category;
  const categoryColor = colorForCategory(category, state.projectCategories.find((entry) => entry.name === category)?.color);
  const anchor = value.segment?.startAt ?? value.completedAt;
  return {
    id: value.id,
    calendarSourceId: item.id,
    ...(item.projectId ? { projectId: item.projectId } : {}),
    scheduledDate: dateInShanghai(anchor),
    title: item.title,
    detail: item.detail,
    start: value.segment ? timeInShanghai(value.segment.startAt) : "时间未配置",
    end: value.segment ? timeInShanghai(value.segment.endAt) : "",
    timeSegments: value.segment ? [{
      id: value.id,
      start: timeInShanghai(value.segment.startAt),
      end: timeInShanghai(value.segment.endAt),
      completed: true,
    }] : [],
    timeStatus: value.segment ? "scheduled" : "unscheduled",
    category,
    categoryColor,
    categoryTextColor: readableTextColor(categoryColor),
    completed: true,
    completedAt: value.completedAt,
    completedDate: dateInShanghai(value.completedAt),
    completedEarly: completedBeforeSchedule(value.completedAt, item),
    rewards: item.rewards.map((reward) => ({ ...reward })),
    source: item.source,
    executionSource: value.executionSource,
    syncState: "completed",
    dayIndex: dayIndexFor(anchor),
    scheduleGroup: "completed",
    rewardMode: item.rewardMode,
    templateLabel: item.projectId
      ? state.projects.find((project) => project.id === item.projectId)?.name
      : item.sourceCourseId
        ? state.learningMoreCourses.find((course) => course.courseId === item.sourceCourseId)?.title
        : undefined,
    unitLabel: item.unitKind && item.unitQuantity !== undefined
      ? `${item.unitQuantity} ${item.unitKind === "hour" ? "时" : item.unitKind === "lesson" ? "节" : "次"}`
      : undefined,
  };
}

export function projectWeekUpView(state: WeekUpState, at = new Date()): WeekUpViewModel {
  const activeFacts = new Map(state.completionFacts.filter((fact) => fact.revertedAt === undefined).map((fact) => [fact.planId, fact]));
  const today = dateInShanghai(at.toISOString());
  const catalogAttributes: Attribute[] = state.attributes.map((item) => ({
    id: item.id,
    name: item.name,
    icon: item.icon,
    color: item.color,
    totalXp: totalXpForAttribute(state, item.id),
    note: item.note,
    category: item.category,
    pinned: item.pinned,
    lastGainedAt: [...state.xpTransactions].reverse().find((transaction) => transaction.attributeId === item.id && transaction.amount > 0)?.occurredAt,
  }));
  const activeAttributeIds = new Set(state.attributes.filter((item) => item.archivedAt === undefined).map((item) => item.id));
  const attributes = catalogAttributes.filter((item) => activeAttributeIds.has(item.id));
  const plans: PlanItem[] = state.plans.filter((item) => item.removedAt === undefined).map((item) => {
    const activeFact = activeFacts.get(item.id);
    const currentProject = item.projectId
      ? state.projects.find((project) => project.id === item.projectId)
      : item.sourceCourseId
        ? state.projects.find((project) => project.sourceCourseId === item.sourceCourseId)
        : undefined;
    const category = currentProject?.category ?? item.category;
    const categoryColor = colorForCategory(category, state.projectCategories.find((entry) => entry.name === category)?.color);
    return {
    id: item.id,
    ...(item.projectId ? { projectId: item.projectId } : {}),
    ...(item.recurrenceGroupId ? { recurrenceGroupId: item.recurrenceGroupId } : {}),
    scheduledDate: dateInShanghai(item.startAt),
    title: item.title,
    detail: item.detail,
    start: item.timeStatus === "unscheduled" ? "时间待配置" : timeInShanghai(item.startAt),
    end: item.timeStatus === "unscheduled" ? "" : timeInShanghai(item.endAt),
    timeSegments: (item.timeSegments ?? []).map((segment) => ({
      id: segment.id,
      start: timeInShanghai(segment.startAt),
      end: timeInShanghai(segment.endAt),
      completed: segment.completedAt !== undefined,
    })),
    timeStatus: item.timeStatus ?? "scheduled",
    category,
    categoryColor,
    categoryTextColor: readableTextColor(categoryColor),
    completed: activeFact !== undefined,
    ...(activeFact ? {
      completedAt: activeFact.completedAt,
      completedDate: dateInShanghai(activeFact.completedAt),
      completedEarly: completedBeforeSchedule(activeFact.completedAt, item),
    } : {}),
    rewards: item.rewards.map((reward) => ({ ...reward })),
    source: item.source,
    syncState: activeFacts.has(item.id) ? "completed" : "scheduled",
    dayIndex: dayIndexFor(item.startAt),
    scheduleGroup: "later",
    rewardMode: item.rewardMode,
    templateLabel: item.projectId
      ? state.projects.find((project) => project.id === item.projectId)?.name
      : item.sourceCourseId
        ? state.learningMoreCourses.find((course) => course.courseId === item.sourceCourseId)?.title
        : undefined,
    unitLabel: item.unitKind && item.unitQuantity !== undefined
      ? `${item.unitQuantity} ${item.unitKind === "hour" ? "时" : item.unitKind === "lesson" ? "节" : "次"}`
      : undefined,
    ...(item.recurrenceSummary ? { recurrenceSummary: item.recurrenceSummary } : {}),
    ...(item.recurrenceGroupId ? { recurrenceDetached: item.recurrenceDetachedAt !== undefined } : {}),
    ...(dateInShanghai(item.startAt) < today && !activeFacts.has(item.id) && participatesInOverdueQueue(item) ? { overdue: true } : {}),
    ...(item.overdueSourcePlanId || item.scheduleHistory?.length ? { overdueCarried: true } : {}),
    ...(item.overdueRescheduledPlanId ? { overdueRescheduled: true } : {}),
  };
  });
  const activePlans = new Map(state.plans.filter((item) => item.removedAt === undefined).map((item) => [item.id, item]));
  const completedTimelinePlans: PlanItem[] = state.completionFacts
    .filter((fact) => fact.revertedAt === undefined)
    .flatMap((fact): PlanItem[] => {
      const item = activePlans.get(fact.planId);
      if (!item) return [];
      const segments = fact.actualSegments.length > 0 ? fact.actualSegments : [undefined];
      return segments.map((segment, index) => projectTimelinePlan(state, item, {
        id: segment ? `${fact.id}:actual:${index}` : fact.id,
        ...(segment ? { segment } : {}),
        completedAt: fact.completedAt,
        executionSource: fact.source,
      }));
    });
  const partialSegmentTimelinePlans: PlanItem[] = state.plans
    .filter((item) => item.removedAt === undefined && !activeFacts.has(item.id))
    .flatMap((item) => (item.timeSegments ?? []).flatMap((segment): PlanItem[] => {
      if (!segment.completedAt) return [];
      return [projectTimelinePlan(state, item, {
        id: `${item.id}:segment:${segment.id}`,
        segment: {
          startAt: segment.actualStartAt ?? segment.startAt,
          endAt: segment.actualEndAt ?? segment.endAt,
        },
        completedAt: segment.completedAt,
        executionSource: "week-up",
      })];
    }));
  const timelinePlans = [...completedTimelinePlans, ...partialSegmentTimelinePlans]
    .sort((left, right) =>
      (left.scheduledDate ?? "").localeCompare(right.scheduledDate ?? "")
      || left.start.localeCompare(right.start)
      || left.id.localeCompare(right.id)
    );
  const weights: WeightEntry[] = currentWeightEntries(state).map((item) => ({ date: item.date, label: item.date.slice(5).replace("-", "/"), value: item.value }));
  return { attributes, catalogAttributes, plans, timelinePlans, weights };
}

export function useWeekUp() {
  const [state, setState] = useState<WeekUpState>(() => store?.snapshot() ?? createEmptyWeekUpState());
  const [ready, setReady] = useState(false);
  const [persistenceStatus, setPersistenceStatus] = useState<"connecting" | "online" | "offline">(() => repository?.status ?? "connecting");
  const [syncing, setSyncing] = useState(false);
  const [generatingHarvestIds, setGeneratingHarvestIds] = useState<readonly string[]>([]);
  const [generatingAwarenessIds, setGeneratingAwarenessIds] = useState<readonly string[]>([]);
  const [aiStatus, setAiStatus] = useState<AiServiceStatus>();
  const [checkingAi, setCheckingAi] = useState(false);
  const [projectionDate, setProjectionDate] = useState(() => dateInShanghai(new Date().toISOString()));
  const syncingRef = useRef(false);
  const harvestsInFlightRef = useRef(new Set<string>());
  const awarenessInFlightRef = useRef(new Set<string>());
  useEffect(() => {
    if (!store) return;
    const unsubscribe = store.subscribe(setState);
    void storeLoadPromise?.then(async (loaded) => {
      setState(loaded);
      const now = new Date().toISOString();
      for (const command of dueDailySettlementCommands(loaded, now)) await store.dispatch(command);
      for (const command of dueSettlementCommands(store.snapshot(), now)) await store.dispatch(command);
      setReady(true);
    });
    return unsubscribe;
  }, []);
  useEffect(() => repository?.subscribeStatus(setPersistenceStatus), []);
  useEffect(() => {
    if (!repository || !store) return;
    return repository.startRecovery(() => undefined, { reload: () => store.load() });
  }, []);
  const dispatch = useCallback(async (command: WeekUpCommand) => {
    if (!store) return state;
    return await store.dispatch(command);
  }, [state]);
  const replace = useCallback(async (next: WeekUpState) => {
    if (!store) return next;
    return await store.replace(next);
  }, []);
  const syncLearningMore = useCallback(async () => {
    if (!store || syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      await storeLoadPromise;
      const response = await fetch("/api/learning-more/sync", {
        method: "POST",
        headers: { accept: "application/json" },
      });
      const result = await response.json() as { status?: "changed" | "unchanged" | "failed"; error?: string };
      if (!response.ok) throw new Error(result.error ?? `learning_more_sync_http_${response.status}`);
      await store.refresh();
      setProjectionDate(dateInShanghai(new Date().toISOString()));
      if (result.status === "failed") {
        await store.dispatch({ type: "learning-more.failed", message: "learning_more_sync_failed" });
      }
    } catch (error) {
      await store.dispatch({ type: "learning-more.failed", message: error instanceof Error ? error.message : "learning_more_sync_failed" });
    } finally {
      setProjectionDate(dateInShanghai(new Date().toISOString()));
      syncingRef.current = false;
      setSyncing(false);
    }
  }, []);
  useEffect(() => {
    if (!ready || !store) return;
    const now = new Date().toISOString();
    void (async () => {
      for (const command of dueDailySettlementCommands(store.snapshot(), now)) await store.dispatch(command);
      for (const command of dueSettlementCommands(store.snapshot(), now)) await store.dispatch(command);
    })();
  }, [ready, projectionDate]);
  const refreshAiStatus = useCallback(async (refresh = false) => {
    if (!store) return;
    setCheckingAi(true);
    try { setAiStatus(await createReviewSummaryClient(store.snapshot().aiReview).status(refresh)); }
    catch { setAiStatus(undefined); }
    finally { setCheckingAi(false); }
  }, []);
  useEffect(() => {
    if (!ready) return;
    let refreshTimer: number | undefined;
    let dayBoundaryTimer: number | undefined;

    const stopVisibleTimers = () => {
      if (refreshTimer !== undefined) window.clearInterval(refreshTimer);
      if (dayBoundaryTimer !== undefined) window.clearTimeout(dayBoundaryTimer);
      refreshTimer = undefined;
      dayBoundaryTimer = undefined;
    };
    const scheduleDayBoundary = () => {
      dayBoundaryTimer = window.setTimeout(() => {
        if (document.visibilityState !== "visible") return;
        setProjectionDate(dateInShanghai(new Date().toISOString()));
        void syncLearningMore();
        scheduleDayBoundary();
      }, millisecondsUntilNextShanghaiDay());
    };
    const startVisibleTimers = () => {
      stopVisibleTimers();
      if (document.visibilityState !== "visible") return;
      void syncLearningMore();
      refreshTimer = window.setInterval(() => void syncLearningMore(), 60_000);
      scheduleDayBoundary();
    };
    const onVisible = () => startVisibleTimers();

    document.addEventListener("visibilitychange", onVisible);
    startVisibleTimers();
    return () => {
      stopVisibleTimers();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [ready, syncLearningMore]);
  useEffect(() => {
    if (!ready) return;
    void refreshAiStatus(false);
    const timer = window.setInterval(() => void refreshAiStatus(false), 60_000);
    return () => window.clearInterval(timer);
  }, [ready, state.aiReview, refreshAiStatus]);
  useEffect(() => {
    if (!ready || !store) return;
    const pending = state.settlements.find((settlement) => settlement.harvest.status === "pending" && !harvestsInFlightRef.current.has(settlement.id));
    if (!pending) return;
    harvestsInFlightRef.current.add(pending.id);
    setGeneratingHarvestIds((current) => current.includes(pending.id) ? current : [...current, pending.id]);
    const snapshot = store.snapshot();
    void createReviewSummaryClient(snapshot.aiReview).generate(buildReviewSummaryFacts(snapshot, pending))
      .then((result) => store.dispatch({ type: "settlement.harvest.succeeded", id: pending.id, text: result.text, provider: result.provider, preferredProvider: result.preferredProvider, fallbackUsed: result.fallbackUsed, model: result.model, reasoningEffort: result.reasoningEffort }))
      .then(() => refreshAiStatus(false))
      .catch((error) => store.dispatch({ type: "settlement.harvest.failed", id: pending.id, message: error instanceof Error ? error.message : "ai_review_failed" }))
      .finally(() => {
        harvestsInFlightRef.current.delete(pending.id);
        setGeneratingHarvestIds((current) => current.filter((id) => id !== pending.id));
      });
  }, [ready, state.aiReview, state.settlements, refreshAiStatus]);
  useEffect(() => {
    if (!ready || !store) return;
    const target = selectNextAwarenessAnalysisTarget(state, awarenessInFlightRef.current);
    const pendingModel = target?.kind === "mental-model"
      ? state.mentalModelVersions.find((version) => version.id === target.id)
      : undefined;
    const pendingEmotion = target?.kind === "weekly-emotion"
      ? state.weeklyEmotionReviews.find((review) => review.id === target.id)
      : undefined;
    if (!pendingModel && !pendingEmotion) return;
    const id = pendingModel?.id ?? pendingEmotion!.id;
    awarenessInFlightRef.current.add(id);
    setGeneratingAwarenessIds((current) => current.includes(id) ? current : [...current, id]);
    const snapshot = store.snapshot();
    const client = createAwarenessAnalysisClient(snapshot.aiReview);
    const operation = pendingModel
      ? client.generate(buildMonthlyAwarenessFacts(
          snapshot,
          pendingModel.sourceThoughtReviewId
            ? snapshot.monthlyThoughtReviews.find((review) => review.id === pendingModel.sourceThoughtReviewId)
            : undefined,
          pendingModel,
        ))
      : client.generate(buildWeeklyEmotionFacts(snapshot, pendingEmotion!));
    void operation
      .then(async (response) => {
        const meta = {
          provider: response.provider,
          preferredProvider: response.preferredProvider,
          fallbackUsed: response.fallbackUsed,
          ...(response.model ? { model: response.model } : {}),
          ...(response.reasoningEffort ? { reasoningEffort: response.reasoningEffort } : {}),
        };
        if (response.result.kind === "weekly-emotion") {
          await store.dispatch({
            type: "awareness.weekly-analysis.succeeded",
            id: response.result.reviewId,
            value: response.result.emotion,
            ...meta,
          });
        } else {
          await store.dispatch({
            type: "awareness.monthly-analysis.succeeded",
            ...(response.result.thoughtReviewId ? { thoughtReviewId: response.result.thoughtReviewId } : {}),
            mentalModelVersionId: response.result.mentalModelVersionId,
            ...(response.result.thought ? { thought: response.result.thought } : {}),
            models: response.result.models,
            dimensionProfile: response.result.dimensionProfile,
            ...meta,
          });
        }
        await refreshAiStatus(false);
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : "awareness_analysis_failed";
        return pendingModel
          ? store.dispatch({
              type: "awareness.monthly-analysis.failed",
              ...(pendingModel.sourceThoughtReviewId ? { thoughtReviewId: pendingModel.sourceThoughtReviewId } : {}),
              mentalModelVersionId: pendingModel.id,
              message,
            })
          : store.dispatch({ type: "awareness.weekly-analysis.failed", id: pendingEmotion!.id, message });
      })
      .finally(() => {
        awarenessInFlightRef.current.delete(id);
        setGeneratingAwarenessIds((current) => current.filter((item) => item !== id));
      });
  }, [ready, state.aiReview, state.weeklyEmotionReviews, state.monthlyThoughtReviews, state.mentalModelVersions, refreshAiStatus]);
  const projectionNow = useMemo(() => new Date(`${projectionDate}T12:00:00+08:00`), [projectionDate]);
  return { state, view: useMemo(() => projectWeekUpView(state, projectionNow), [state, projectionNow]), ready, persistenceStatus, syncing, generatingHarvestIds, generatingAwarenessIds, aiStatus, checkingAi, dispatch, replace, syncLearningMore, refreshAiStatus };
}
