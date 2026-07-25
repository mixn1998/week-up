import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createLearningMoreClient } from "./learning-more-client.ts";
import { createLearningMoreDelta } from "./learning-more-delta.ts";
import { buildReviewSummaryFacts, createReviewSummaryClient, type AiServiceStatus } from "./review-summary-client.ts";
import {
  createEmptyWeekUpState,
  currentWeightEntries,
  totalXpForAttribute,
  type WeekUpCommand,
  type WeekUpState,
} from "./week-up-domain.ts";
import { HttpWeekUpRepository } from "./week-up-repository.ts";
import { createWeekUpStore } from "./week-up-store.ts";
import { dueSettlementCommands } from "./settlement-scheduler.ts";
import type { Attribute, PlanItem, WeightEntry } from "./demo-model";
import { colorForCategory, readableTextColor } from "./category-palette.ts";
import { participatesInOverdueQueue } from "./overdue-policy.ts";

const repository = typeof window === "undefined" ? undefined : new HttpWeekUpRepository();
const store = repository ? createWeekUpStore(repository) : undefined;
const storeLoadPromise = store?.load();

function timeInShanghai(instant: string): string {
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(instant));
}

function dateInShanghai(instant: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(instant));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
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
  weights: WeightEntry[];
}>;

export function projectWeekUpView(state: WeekUpState): WeekUpViewModel {
  const activeFacts = new Map(state.completionFacts.filter((fact) => fact.revertedAt === undefined).map((fact) => [fact.planId, fact]));
  const today = dateInShanghai(new Date().toISOString());
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
    completed: activeFacts.has(item.id),
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
    ...(item.overdueSourcePlanId ? { overdueCarried: true } : {}),
    ...(item.overdueRescheduledPlanId ? { overdueRescheduled: true } : {}),
  };
  });
  const weights: WeightEntry[] = currentWeightEntries(state).map((item) => ({ date: item.date, label: item.date.slice(5).replace("-", "/"), value: item.value }));
  return { attributes, catalogAttributes, plans, weights };
}

export function useWeekUp() {
  const [state, setState] = useState<WeekUpState>(() => store?.snapshot() ?? createEmptyWeekUpState());
  const [ready, setReady] = useState(false);
  const [persistenceStatus, setPersistenceStatus] = useState<"connecting" | "online" | "offline">(() => repository?.status ?? "connecting");
  const [syncing, setSyncing] = useState(false);
  const [generatingHarvestIds, setGeneratingHarvestIds] = useState<readonly string[]>([]);
  const [aiStatus, setAiStatus] = useState<AiServiceStatus>();
  const [checkingAi, setCheckingAi] = useState(false);
  const syncingRef = useRef(false);
  const harvestsInFlightRef = useRef(new Set<string>());
  useEffect(() => {
    if (!store) return;
    const unsubscribe = store.subscribe(setState);
    void storeLoadPromise?.then(async (loaded) => {
      setState(loaded);
      for (const command of dueSettlementCommands(loaded, new Date().toISOString())) await store.dispatch(command);
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
      const current = store.snapshot();
      const batch = await createLearningMoreClient(current.learningMore.baseUrl).pull(current.learningMore.historyCursor);
      const delta = createLearningMoreDelta(current, batch);
      if (delta) await store.dispatch({ type: "learning-more.import", ...delta });
    } catch (error) {
      await store.dispatch({ type: "learning-more.failed", message: error instanceof Error ? error.message : "learning_more_sync_failed" });
    } finally { syncingRef.current = false; setSyncing(false); }
  }, []);
  const refreshAiStatus = useCallback(async (refresh = false) => {
    if (!store) return;
    setCheckingAi(true);
    try { setAiStatus(await createReviewSummaryClient(store.snapshot().aiReview).status(refresh)); }
    catch { setAiStatus(undefined); }
    finally { setCheckingAi(false); }
  }, []);
  useEffect(() => {
    if (!ready) return;
    void syncLearningMore();
    const timer = window.setInterval(() => void syncLearningMore(), 60_000);
    const onVisible = () => { if (document.visibilityState === "visible") void syncLearningMore(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
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
  return { state, view: useMemo(() => projectWeekUpView(state), [state]), ready, persistenceStatus, syncing, generatingHarvestIds, aiStatus, checkingAi, dispatch, replace, syncLearningMore, refreshAiStatus };
}
