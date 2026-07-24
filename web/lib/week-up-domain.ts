import { colorIdForCategory, isCategoryColorId } from "./category-palette.ts";

export const WEEK_UP_SCHEMA_VERSION = 14 as const;

export type AiProviderId = "codex-cli" | "api";

export type AttributeReward = Readonly<{ attributeId: string; amount: number }>;
export type RewardUnit = "hour" | "lesson" | "occurrence";
export type PlanTimeSegment = Readonly<{
  id: string;
  startAt: string;
  endAt: string;
  completedAt?: string;
}>;
export type PlanTimeSegmentInput = Readonly<{ startAt: string; endAt: string }>;

export type ProjectRecord = Readonly<{
  id: string;
  name: string;
  category: string;
  unit: RewardUnit;
  rewardsPerUnit: readonly AttributeReward[];
  source: "week-up" | "learning-more";
  sourceCourseId?: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}>;

export type LearningMoreCourse = Readonly<{
  courseId: string;
  title: string;
  status: "active" | "closed";
  lastSyncedAt: string;
}>;

export type LearningMoreLesson = Readonly<{
  courseId: string;
  lessonId: string;
  scheduleItemId: string;
  scheduledDate: string;
  title: string;
  objective: string;
  order: number;
  lastSyncedAt: string;
  completedAt?: string;
}>;

export type AttributeRecord = Readonly<{
  id: string;
  name: string;
  icon: string;
  color: string;
  note: string;
  category: string;
  pinned: boolean;
  createdAt: string;
  archivedAt?: string;
}>;

export type AttributeCategoryRecord = Readonly<{
  id: string;
  name: string;
  color: string;
  integrationKey?: "learning-more";
  system: boolean;
  createdAt: string;
  updatedAt: string;
}>;

export type GoalRecord = Readonly<{
  id: string;
  title: string;
  note: string;
  period: "week" | "month";
  startDate: string;
  endDate: string;
  linkedGoalIds: readonly string[];
  createdAt: string;
  archivedAt?: string;
}>;

export type PlanRecord = Readonly<{
  id: string;
  title: string;
  detail: string;
  category: string;
  startAt: string;
  endAt: string;
  timeSegments?: readonly PlanTimeSegment[];
  timeStatus?: "unscheduled" | "scheduled";
  goalIds: readonly string[];
  rewards: readonly AttributeReward[];
  rewardMode: "none" | "template" | "custom";
  templateKind?: "project" | "course";
  projectId?: string;
  unitKind?: RewardUnit;
  unitQuantity?: number;
  sequenceNumber?: number;
  titleMode?: "template" | "custom";
  source: "week-up" | "learning-more";
  sourceRef?: string;
  sourceLessonId?: string;
  sourceCourseId?: string;
  recurrenceGroupId?: string;
  recurrenceIndex?: number;
  recurrenceSummary?: string;
  recurrenceDetachedAt?: string;
  overdueSourcePlanId?: string;
  overdueRescheduledPlanId?: string;
  removedAt?: string;
  createdAt: string;
  updatedAt: string;
}>;

export type CompletionFact = Readonly<{
  id: string;
  planId: string;
  completedAt: string;
  source: "week-up" | "learning-more";
  externalFactId?: string;
  rewardSnapshot: readonly AttributeReward[];
  revertedAt?: string;
}>;

export type XpTransaction = Readonly<{
  id: string;
  attributeId: string;
  amount: number;
  occurredAt: string;
  kind: "earned" | "compensation";
  completionFactId: string;
}>;

export type WeightRevision = Readonly<{
  id: string;
  localDate: string;
  valueKg: number;
  recordedAt: string;
  supersedesRevisionId?: string;
}>;

export type SettlementRecord = Readonly<{
  id: string;
  period: "week" | "month";
  startDate: string;
  endDate: string;
  generatedAt: string;
  completedPlanIds: readonly string[];
  incompletePlanIds: readonly string[];
  attributeGains: Readonly<Record<string, number>>;
  harvest: Readonly<{
    status: "pending" | "ready" | "failed" | "stale";
    text?: string;
    generatedAt?: string;
    error?: string;
    provider?: AiProviderId;
    preferredProvider?: AiProviderId;
    fallbackUsed?: boolean;
    model?: string;
    reasoningEffort?: string;
  }>;
}>;

export type SkillbookRecord = Readonly<{
  id: string;
  courseId: string;
  title: string;
  acquiredAt: string;
  sourceFactId: string;
}>;

export type LearningMoreState = Readonly<{
  baseUrl: string;
  historyCursor?: string;
  lastSyncedAt?: string;
  lastError?: string;
}>;

export type AiReviewState = Readonly<{
  baseUrl: string;
  preferredProvider: AiProviderId;
  apiBaseUrl: string;
  model?: string;
  reasoningEffort?: string;
}>;

export type WeekUpState = Readonly<{
  schemaVersion: typeof WEEK_UP_SCHEMA_VERSION;
  revision: number;
  attributeCategories: readonly AttributeCategoryRecord[];
  projectCategories: readonly AttributeCategoryRecord[];
  attributes: readonly AttributeRecord[];
  projects: readonly ProjectRecord[];
  learningMoreCourses: readonly LearningMoreCourse[];
  learningMoreLessons: readonly LearningMoreLesson[];
  goals: readonly GoalRecord[];
  plans: readonly PlanRecord[];
  completionFacts: readonly CompletionFact[];
  xpTransactions: readonly XpTransaction[];
  weightRevisions: readonly WeightRevision[];
  settlements: readonly SettlementRecord[];
  skillbooks: readonly SkillbookRecord[];
  preferences: Readonly<{ targetWeightKg?: number }>;
  learningMore: LearningMoreState;
  aiReview: AiReviewState;
}>;

export type LearningMoreLessonItem = Readonly<{
  courseId: string;
  lessonId: string;
  scheduleItemId: string;
  scheduledDate: string;
  title: string;
  objective?: string;
  order: number;
}>;

export type LearningMoreCourseItem = Readonly<{
  courseId: string;
  title: string;
  status: "active" | "closed";
}>;

export type LearningMoreFact = Readonly<
  | {
      factId: string;
      type: "lesson-completed";
      occurredAt: string;
      courseId: string;
      lessonId: string;
      scheduleItemId?: string;
      actualStartedAt?: string;
      actualEndedAt?: string;
    }
  | {
      factId: string;
      type: "course-closed";
      occurredAt: string;
      courseId: string;
      courseTitle: string;
    }
>;

export type WeekUpCommand =
  | { type: "attribute-category.create"; name: string }
  | { type: "attribute-category.rename"; id: string; name: string }
  | { type: "attribute-category.delete"; id: string }
  | { type: "project-category.create"; name: string; color?: string }
  | { type: "project-category.rename"; id: string; name: string; color?: string }
  | { type: "project-category.delete"; id: string }
  | { type: "attribute.create"; value: Omit<AttributeRecord, "id" | "createdAt"> }
  | { type: "attribute.update"; id: string; patch: Partial<Omit<AttributeRecord, "id" | "createdAt">> }
  | { type: "attribute.archive"; id: string }
  | { type: "attribute.remove"; id: string }
  | { type: "project.create"; value: Omit<ProjectRecord, "id" | "createdAt" | "updatedAt" | "source"> & { source?: ProjectRecord["source"] } }
  | { type: "project.update"; id: string; patch: Partial<Omit<ProjectRecord, "id" | "createdAt" | "updatedAt">> }
  | { type: "project.archive"; id: string }
  | { type: "project.remove"; id: string }
  | { type: "project.plan.create"; projectId: string; startAt: string; endAt?: string; timeSegments?: readonly PlanTimeSegmentInput[]; timeStatus?: PlanRecord["timeStatus"]; title?: string; goalIds?: readonly string[]; unitQuantity?: number; sourceLessonId?: string; recurrenceGroupId?: string; recurrenceIndex?: number; recurrenceSummary?: string }
  | { type: "goal.create"; value: Omit<GoalRecord, "id" | "createdAt"> }
  | { type: "goal.update"; id: string; patch: Partial<Omit<GoalRecord, "id" | "createdAt">> }
  | { type: "goal.archive"; id: string }
  | { type: "goal.remove"; id: string }
  | { type: "plan.create"; value: Omit<PlanRecord, "id" | "createdAt" | "updatedAt" | "source" | "rewardMode"> & { source?: PlanRecord["source"]; rewardMode?: PlanRecord["rewardMode"] } }
  | { type: "plan.recurrence.create"; projectId?: string; title?: string; startAts: readonly string[]; endAts?: readonly string[]; timeSegmentsByOccurrence?: readonly (readonly PlanTimeSegmentInput[])[]; timeStatus?: PlanRecord["timeStatus"]; goalIds?: readonly string[]; recurrenceGroupId: string; recurrenceSummary: string }
  | { type: "plan.update"; id: string; patch: Partial<Omit<PlanRecord, "id" | "createdAt" | "source">> }
  | { type: "plan.remove"; id: string }
  | { type: "plan.recurrence.update"; id: string; patch: Pick<PlanRecord, "title" | "detail" | "category" | "startAt" | "endAt" | "goalIds" | "rewards"> & Partial<Pick<PlanRecord, "timeSegments" | "timeStatus">> & { unitQuantity?: number } }
  | { type: "plan.recurrence.cancel"; id: string }
  | { type: "plan.overdue.reschedule"; id: string; startAt: string; endAt: string; timeSegments?: readonly PlanTimeSegmentInput[]; timeStatus?: PlanRecord["timeStatus"] }
  | { type: "plan.complete"; id: string; source?: CompletionFact["source"]; externalFactId?: string; completedAt?: string }
  | { type: "plan.undo"; id: string }
  | { type: "plan.segment.complete"; id: string; segmentId: string; completedAt?: string }
  | { type: "plan.segment.undo"; id: string; segmentId: string }
  | { type: "plan.follow-template"; id: string }
  | { type: "weight.record"; localDate: string; valueKg: number }
  | { type: "weight.target"; valueKg?: number }
  | { type: "settlement.generate"; period: SettlementRecord["period"]; startDate: string; endDate: string }
  | { type: "settlement.harvest.succeeded"; id: string; text: string; provider: AiProviderId; preferredProvider: AiProviderId; fallbackUsed: boolean; model?: string; reasoningEffort?: string }
  | { type: "settlement.harvest.failed"; id: string; message: string }
  | { type: "settlement.harvest.retry"; id: string }
  | { type: "ai-review.configure"; preferredProvider: AiProviderId; apiBaseUrl?: string; model?: string; reasoningEffort?: string }
  | { type: "learning-more.configure"; baseUrl: string }
  | { type: "learning-more.failed"; message: string }
  | { type: "learning-more.import"; courses?: readonly LearningMoreCourseItem[]; lessons?: readonly LearningMoreLessonItem[]; removedCourseIds?: readonly string[]; removedLessonIds?: readonly string[]; removedScheduleItemIds?: readonly string[]; facts: readonly LearningMoreFact[]; nextCursor?: string; incremental?: boolean };

export type DomainContext = Readonly<{ now(): string; id(prefix: string): string }>;
export type CommandOutcome = Readonly<{ state: WeekUpState; changed: boolean; entityId?: string }>;

export function createEmptyWeekUpState(baseUrl = "/learning-more-api"): WeekUpState {
  return {
    schemaVersion: WEEK_UP_SCHEMA_VERSION,
    revision: 0,
    attributeCategories: [{ id: "attribute-category-uncategorized", name: "未分类", color: colorIdForCategory("未分类"), system: true, createdAt: "1970-01-01T00:00:00.000Z", updatedAt: "1970-01-01T00:00:00.000Z" }],
    projectCategories: [{ id: "project-category-uncategorized", name: "未分类", color: colorIdForCategory("未分类"), system: true, createdAt: "1970-01-01T00:00:00.000Z", updatedAt: "1970-01-01T00:00:00.000Z" }],
    attributes: [],
    projects: [],
    learningMoreCourses: [],
    learningMoreLessons: [],
    goals: [],
    plans: [],
    completionFacts: [],
    xpTransactions: [],
    weightRevisions: [],
    settlements: [],
    skillbooks: [],
    preferences: {},
    learningMore: { baseUrl },
    aiReview: { baseUrl: "/week-up-review-api", preferredProvider: "codex-cli", apiBaseUrl: "" },
  };
}

function assertNonEmpty(value: string, field: string): void {
  if (value.trim() === "") throw new Error(`${field}_required`);
}

function normalizedAttributeCategory(name: string | undefined): string {
  return name?.trim() || "未分类";
}

function normalizedCategoryColor(color: string | undefined, categoryName: string): string {
  const value = color ?? colorIdForCategory(categoryName);
  if (!isCategoryColorId(value)) throw new Error("category_color_invalid");
  return value;
}

function appendAttributeCategory(state: WeekUpState, name: string, context: DomainContext, now: string): readonly AttributeCategoryRecord[] {
  if (state.attributeCategories.some((category) => category.name === name)) return state.attributeCategories;
  return [...state.attributeCategories, { id: context.id("attribute-category"), name, color: colorIdForCategory(name), system: false, createdAt: now, updatedAt: now }];
}

function appendProjectCategory(state: WeekUpState, name: string, context: DomainContext, now: string): readonly AttributeCategoryRecord[] {
  if (state.projectCategories.some((category) => category.name === name)) return state.projectCategories;
  return [...state.projectCategories, { id: context.id("project-category"), name, color: colorIdForCategory(name), system: false, createdAt: now, updatedAt: now }];
}

function ensureLearningMoreProjectCategory(state: WeekUpState, context: DomainContext, now: string): Readonly<{
  category: AttributeCategoryRecord;
  projectCategories: readonly AttributeCategoryRecord[];
}> {
  const marked = state.projectCategories.find((category) => category.integrationKey === "learning-more");
  const legacyNamed = state.projectCategories.find((category) => category.name === "Learning MORE" || category.name === "Learning MORE 课程学习");
  const existing = marked ?? legacyNamed;
  if (existing) {
    const category = existing.integrationKey === "learning-more" ? existing : { ...existing, integrationKey: "learning-more" as const, updatedAt: now };
    return {
      category,
      projectCategories: category === existing ? state.projectCategories : state.projectCategories.map((item) => item.id === existing.id ? category : item),
    };
  }
  const category: AttributeCategoryRecord = {
    id: context.id("project-category"),
    name: "Learning MORE",
    color: "mint",
    integrationKey: "learning-more",
    system: false,
    createdAt: now,
    updatedAt: now,
  };
  return { category, projectCategories: [...state.projectCategories, category] };
}

function assertPeriod(start: string, end: string): void {
  if (Date.parse(end) <= Date.parse(start)) throw new Error("end_must_follow_start");
}

function validateRewards(state: WeekUpState, rewards: readonly AttributeReward[]): void {
  const seen = new Set<string>();
  for (const reward of rewards) {
    if (!Number.isFinite(reward.amount) || reward.amount <= 0) throw new Error("reward_amount_invalid");
    if (seen.has(reward.attributeId)) throw new Error("reward_attribute_duplicate");
    const attribute = state.attributes.find((item) => item.id === reward.attributeId && item.archivedAt === undefined);
    if (!attribute) throw new Error("reward_attribute_not_found");
    seen.add(reward.attributeId);
  }
}

function roundReward(value: number): number {
  return Math.round(value * 100) / 100;
}

function scaleRewards(rewards: readonly AttributeReward[], quantity: number): AttributeReward[] {
  return rewards.map((reward) => ({ attributeId: reward.attributeId, amount: roundReward(reward.amount * quantity) }));
}

function rewardsEqual(left: readonly AttributeReward[], right: readonly AttributeReward[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((reward) => right.some((item) => item.attributeId === reward.attributeId && item.amount === reward.amount));
}

function hoursBetween(startAt: string, endAt: string): number {
  return roundReward((Date.parse(endAt) - Date.parse(startAt)) / 3_600_000);
}

function addHours(instant: string, hours: number): string {
  return new Date(Date.parse(instant) + hours * 3_600_000).toISOString();
}

function validateTimeSegments(segments: readonly PlanTimeSegment[]): readonly PlanTimeSegment[] {
  if (segments.length === 0) throw new Error("plan_segments_required");
  const ids = new Set<string>();
  const ordered = [...segments].sort((left, right) => Date.parse(left.startAt) - Date.parse(right.startAt));
  ordered.forEach((segment, index) => {
    if (!segment.id || ids.has(segment.id)) throw new Error("plan_segment_id_invalid");
    ids.add(segment.id);
    assertPeriod(segment.startAt, segment.endAt);
    if (localDate(segment.startAt) !== localDate(segment.endAt)) throw new Error("plan_segment_date_mismatch");
    if (index > 0 && Date.parse(segment.startAt) < Date.parse(ordered[index - 1]!.endAt)) throw new Error("plan_segments_overlap");
  });
  const date = localDate(ordered[0]!.startAt);
  if (ordered.some((segment) => localDate(segment.startAt) !== date)) throw new Error("plan_segments_date_mismatch");
  return ordered;
}

function createTimeSegments(inputs: readonly PlanTimeSegmentInput[], context: DomainContext, completedAt?: string): readonly PlanTimeSegment[] {
  return validateTimeSegments(inputs.map((segment) => ({
    id: context.id("segment"),
    startAt: segment.startAt,
    endAt: segment.endAt,
    ...(completedAt ? { completedAt } : {}),
  })));
}

function segmentEnvelope(segments: readonly PlanTimeSegment[]): { startAt: string; endAt: string } {
  const ordered = validateTimeSegments(segments);
  return { startAt: ordered[0]!.startAt, endAt: ordered.at(-1)!.endAt };
}

function planHours(startAt: string, endAt: string, segments?: readonly PlanTimeSegment[]): number {
  if (!segments?.length) return hoursBetween(startAt, endAt);
  return roundReward(segments.reduce((total, segment) => total + hoursBetween(segment.startAt, segment.endAt), 0));
}

function allSegmentsCompleted(plan: PlanRecord): boolean {
  return Boolean(plan.timeSegments?.length && plan.timeSegments.every((segment) => segment.completedAt !== undefined));
}

function planHasPartialSegmentProgress(plan: PlanRecord): boolean {
  return Boolean(plan.timeSegments?.some((segment) => segment.completedAt !== undefined));
}

function isPlanCompleted(state: WeekUpState, planId: string): boolean {
  return activeCompletion(state, planId) !== undefined;
}

function nextProjectSequence(state: WeekUpState, projectId: string): number {
  const occupied = new Set(state.plans
    .filter((plan) => plan.projectId === projectId && plan.removedAt === undefined && plan.sequenceNumber !== undefined)
    .map((plan) => plan.sequenceNumber));
  let candidate = 1;
  while (occupied.has(candidate)) candidate += 1;
  return candidate;
}

function formatSequence(value: number): string {
  return String(value).padStart(2, "0");
}

function rewardsForProject(project: ProjectRecord, startAt: string, endAt: string, requestedQuantity?: number, segments?: readonly PlanTimeSegment[]): { quantity: number; rewards: AttributeReward[] } {
  const quantity = project.unit === "hour" ? planHours(startAt, endAt, segments) : requestedQuantity ?? 1;
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("unit_quantity_invalid");
  return { quantity, rewards: scaleRewards(project.rewardsPerUnit, quantity) };
}

function propagateProjectTemplate(state: WeekUpState, project: ProjectRecord, now: string): readonly PlanRecord[] {
  return state.plans.map((plan) => {
    if (plan.projectId !== project.id || plan.removedAt !== undefined || isPlanCompleted(state, plan.id)) return plan;
    const sequence = plan.sequenceNumber ?? nextProjectSequence(state, project.id);
    const base = {
      ...plan,
      category: project.category,
      unitKind: project.unit,
      title: plan.titleMode === "template" ? `${project.name} ${formatSequence(sequence)}` : plan.title,
      sequenceNumber: sequence,
      updatedAt: now,
    };
    if (plan.rewardMode === "custom") return base;
    const derived = rewardsForProject(project, plan.startAt, plan.endAt, project.unit === "hour" ? undefined : plan.unitQuantity, plan.timeSegments);
    return { ...base, rewardMode: "template" as const, templateKind: "project" as const, unitQuantity: derived.quantity, rewards: derived.rewards };
  });
}

function replaceProjectCategory(state: WeekUpState, from: string, to: string, now: string): Pick<WeekUpState, "projects" | "plans"> {
  const changedProjectIds = new Set(state.projects.filter((project) => project.category === from).map((project) => project.id));
  const projects = state.projects.map((project) => changedProjectIds.has(project.id) ? { ...project, category: to, updatedAt: now } : project);
  const plans = state.plans.map((plan) => plan.category === from || (plan.projectId && changedProjectIds.has(plan.projectId)) ? { ...plan, category: to, updatedAt: now } : plan);
  return { projects, plans };
}

function changed(state: WeekUpState, patch: Partial<WeekUpState>, entityId?: string): CommandOutcome {
  return { state: { ...state, ...patch, revision: state.revision + 1 }, changed: true, entityId };
}

function unchanged(state: WeekUpState, entityId?: string): CommandOutcome {
  return { state, changed: false, entityId };
}

function activeCompletion(state: WeekUpState, planId: string): CompletionFact | undefined {
  return state.completionFacts.find((fact) => fact.planId === planId && fact.revertedAt === undefined);
}

function learningMoreScheduleKey(value: Pick<LearningMoreLesson, "lessonId" | "scheduleItemId"> | Pick<LearningMoreLessonItem, "lessonId" | "scheduleItemId">): string {
  return value.scheduleItemId || value.lessonId;
}

function learningMoreSourceRef(scheduleItemId: string): string {
  return `learning-more:${scheduleItemId}`;
}

function localDate(instant: string): string {
  return new Date(Date.parse(instant) + 8 * 3_600_000).toISOString().slice(0, 10);
}

function localTime(instant: string): string {
  return new Date(Date.parse(instant) + 8 * 3_600_000).toISOString().slice(11, 16);
}

function moveSegmentsToDate(segments: readonly PlanTimeSegment[], date: string, planId: string): readonly PlanTimeSegment[] {
  return validateTimeSegments(segments.map((segment, index) => ({
    id: `${planId}:segment:${index}`,
    startAt: `${date}T${localTime(segment.startAt)}:00+08:00`,
    endAt: `${date}T${localTime(segment.endAt)}:00+08:00`,
  })));
}

function shiftSegments(segments: readonly PlanTimeSegment[], deltaMs: number, planId: string): readonly PlanTimeSegment[] {
  return validateTimeSegments(segments.map((segment, index) => ({
    id: `${planId}:segment:${index}`,
    startAt: new Date(Date.parse(segment.startAt) + deltaMs).toISOString(),
    endAt: new Date(Date.parse(segment.endAt) + deltaMs).toISOString(),
  })));
}

function planIsOverdue(plan: PlanRecord, at: string): boolean {
  return plan.timeStatus !== "unscheduled" && localDate(plan.startAt) < localDate(at);
}

function settlementSnapshot(state: WeekUpState, startDate: string, endDate: string, generatedAt: string) {
  const plans = state.plans.filter((plan) => localDate(plan.startAt) >= startDate && localDate(plan.startAt) <= endDate && plan.removedAt === undefined);
  const completedFacts = state.completionFacts.filter((fact) => fact.revertedAt === undefined && plans.some((plan) => plan.id === fact.planId));
  const completedIds = new Set(completedFacts.map((fact) => fact.planId));
  const attributeGains: Record<string, number> = {};
  for (const fact of completedFacts) {
    for (const reward of fact.rewardSnapshot) attributeGains[reward.attributeId] = (attributeGains[reward.attributeId] ?? 0) + reward.amount;
  }
  return {
    completedPlanIds: plans.filter((plan) => completedIds.has(plan.id)).map((plan) => plan.id),
    incompletePlanIds: plans.filter((plan) => !completedIds.has(plan.id) && !planIsOverdue(plan, generatedAt)).map((plan) => plan.id),
    attributeGains,
  };
}

function sameSettlementSnapshot(settlement: SettlementRecord, snapshot: ReturnType<typeof settlementSnapshot>): boolean {
  return JSON.stringify(settlement.completedPlanIds) === JSON.stringify(snapshot.completedPlanIds)
    && JSON.stringify(settlement.incompletePlanIds) === JSON.stringify(snapshot.incompletePlanIds)
    && JSON.stringify(settlement.attributeGains) === JSON.stringify(snapshot.attributeGains);
}

function refreshSettlementsAfterFactChanges(state: WeekUpState, now: string): WeekUpState {
  let changedAny = false;
  const settlements = state.settlements.map((settlement): SettlementRecord => {
    const snapshot = settlementSnapshot(state, settlement.startDate, settlement.endDate, now);
    if (sameSettlementSnapshot(settlement, snapshot)) return settlement;
    changedAny = true;
    const harvest = settlement.harvest.status === "failed"
      ? settlement.harvest
      : { ...settlement.harvest, status: "stale" as const };
    return { ...settlement, ...snapshot, harvest };
  });
  return changedAny ? { ...state, settlements } : state;
}

function completePlan(
  state: WeekUpState,
  planId: string,
  context: DomainContext,
  options: { source: CompletionFact["source"]; externalFactId?: string; completedAt: string },
): CommandOutcome {
  const plan = state.plans.find((item) => item.id === planId && item.removedAt === undefined);
  if (!plan) throw new Error("plan_not_found");
  if (options.source === "week-up" && planIsOverdue(plan, options.completedAt)) throw new Error("plan_overdue");
  const duplicateExternal = options.externalFactId && state.completionFacts.find((fact) => fact.externalFactId === options.externalFactId && fact.revertedAt === undefined);
  if (duplicateExternal) return unchanged(state, duplicateExternal.id);
  const existing = activeCompletion(state, planId);
  if (existing) {
    if (options.source === "learning-more" && existing.source === "week-up" && options.externalFactId) {
      const facts = state.completionFacts.map((fact) => fact.id === existing.id ? { ...fact, externalFactId: options.externalFactId } : fact);
      return changed(state, { completionFacts: facts }, existing.id);
    }
    return unchanged(state, existing.id);
  }
  const factId = context.id("completion");
  const rewardSnapshot = plan.rewards.map((reward) => ({ ...reward }));
  const fact: CompletionFact = {
    id: factId,
    planId,
    completedAt: options.completedAt,
    source: options.source,
    ...(options.externalFactId ? { externalFactId: options.externalFactId } : {}),
    rewardSnapshot,
  };
  const transactions = rewardSnapshot.map<XpTransaction>((reward) => ({
    id: context.id("xp"),
    attributeId: reward.attributeId,
    amount: reward.amount,
    occurredAt: options.completedAt,
    kind: "earned",
    completionFactId: factId,
  }));
  return changed(state, {
    completionFacts: [...state.completionFacts, fact],
    xpTransactions: [...state.xpTransactions, ...transactions],
  }, factId);
}

function revertPlanCompletionInState(state: WeekUpState, planId: string, context: DomainContext, now: string): WeekUpState {
  const fact = activeCompletion(state, planId);
  if (!fact) return state;
  const compensation = fact.rewardSnapshot.map<XpTransaction>((reward) => ({
    id: context.id("xp"),
    attributeId: reward.attributeId,
    amount: -reward.amount,
    occurredAt: now,
    kind: "compensation",
    completionFactId: fact.id,
  }));
  return {
    ...state,
    completionFacts: state.completionFacts.map((item) => item.id === fact.id ? { ...item, revertedAt: now } : item),
    xpTransactions: [...state.xpTransactions, ...compensation],
  };
}

export function dispatchWeekUp(state: WeekUpState, command: WeekUpCommand, context: DomainContext): CommandOutcome {
  const now = context.now();
  switch (command.type) {
    case "attribute-category.create": {
      const name = normalizedAttributeCategory(command.name);
      if (state.attributeCategories.some((category) => category.name === name)) throw new Error("attribute_category_exists");
      const id = context.id("attribute-category");
      return changed(state, { attributeCategories: [...state.attributeCategories, { id, name, color: colorIdForCategory(name), system: false, createdAt: now, updatedAt: now }] }, id);
    }
    case "attribute-category.rename": {
      const current = state.attributeCategories.find((category) => category.id === command.id);
      if (!current) throw new Error("attribute_category_not_found");
      if (current.system) throw new Error("attribute_category_system_locked");
      const name = normalizedAttributeCategory(command.name);
      if (state.attributeCategories.some((category) => category.id !== current.id && category.name === name)) throw new Error("attribute_category_exists");
      if (name === current.name) return unchanged(state, current.id);
      return changed(state, {
        attributeCategories: state.attributeCategories.map((category) => category.id === current.id ? { ...category, name, updatedAt: now } : category),
        attributes: state.attributes.map((attribute) => attribute.category === current.name ? { ...attribute, category: name } : attribute),
      }, current.id);
    }
    case "attribute-category.delete": {
      const current = state.attributeCategories.find((category) => category.id === command.id);
      if (!current) throw new Error("attribute_category_not_found");
      if (current.system) throw new Error("attribute_category_system_locked");
      return changed(state, {
        attributeCategories: state.attributeCategories.filter((category) => category.id !== current.id),
        attributes: state.attributes.map((attribute) => attribute.category === current.name ? { ...attribute, category: "未分类" } : attribute),
      }, current.id);
    }
    case "project-category.create": {
      const name = normalizedAttributeCategory(command.name);
      if (state.projectCategories.some((category) => category.name === name)) throw new Error("project_category_exists");
      const id = context.id("project-category");
      const color = normalizedCategoryColor(command.color, name);
      return changed(state, { projectCategories: [...state.projectCategories, { id, name, color, system: false, createdAt: now, updatedAt: now }] }, id);
    }
    case "project-category.rename": {
      const current = state.projectCategories.find((category) => category.id === command.id);
      if (!current) throw new Error("project_category_not_found");
      if (current.system) throw new Error("project_category_system_locked");
      const name = normalizedAttributeCategory(command.name);
      if (state.projectCategories.some((category) => category.id !== current.id && category.name === name)) throw new Error("project_category_exists");
      const color = normalizedCategoryColor(command.color ?? current.color, name);
      if (name === current.name && color === current.color) return unchanged(state, current.id);
      const propagated = replaceProjectCategory(state, current.name, name, now);
      return changed(state, {
        projectCategories: state.projectCategories.map((category) => category.id === current.id ? { ...category, name, color, updatedAt: now } : category),
        ...propagated,
      }, current.id);
    }
    case "project-category.delete": {
      const current = state.projectCategories.find((category) => category.id === command.id);
      if (!current) throw new Error("project_category_not_found");
      if (current.system) throw new Error("project_category_system_locked");
      if (current.integrationKey) throw new Error("project_category_integration_locked");
      const propagated = replaceProjectCategory(state, current.name, "未分类", now);
      return changed(state, {
        projectCategories: state.projectCategories.filter((category) => category.id !== current.id),
        ...propagated,
      }, current.id);
    }
    case "attribute.create": {
      assertNonEmpty(command.value.name, "attribute_name");
      const category = normalizedAttributeCategory(command.value.category);
      const id = context.id("attribute");
      return changed(state, { attributeCategories: appendAttributeCategory(state, category, context, now), attributes: [...state.attributes, { ...command.value, category, id, createdAt: now }] }, id);
    }
    case "attribute.update": {
      const current = state.attributes.find((item) => item.id === command.id);
      if (!current) throw new Error("attribute_not_found");
      if (command.patch.name !== undefined) assertNonEmpty(command.patch.name, "attribute_name");
      const category = command.patch.category === undefined ? undefined : normalizedAttributeCategory(command.patch.category);
      return changed(state, {
        ...(category === undefined ? {} : { attributeCategories: appendAttributeCategory(state, category, context, now) }),
        attributes: state.attributes.map((item) => item.id === command.id ? { ...item, ...command.patch, ...(category === undefined ? {} : { category }) } : item),
      }, command.id);
    }
    case "attribute.archive": {
      if (!state.attributes.some((item) => item.id === command.id)) throw new Error("attribute_not_found");
      return changed(state, { attributes: state.attributes.map((item) => item.id === command.id ? { ...item, archivedAt: now } : item) }, command.id);
    }
    case "attribute.remove": {
      if (!state.attributes.some((item) => item.id === command.id)) throw new Error("attribute_not_found");
      const withoutAttribute = (rewards: readonly AttributeReward[]) => rewards.filter((reward) => reward.attributeId !== command.id);
      return changed(state, {
        attributes: state.attributes.filter((item) => item.id !== command.id),
        projects: state.projects.map((item) => ({ ...item, rewardsPerUnit: withoutAttribute(item.rewardsPerUnit), updatedAt: now })),
        plans: state.plans.map((item) => ({ ...item, rewards: withoutAttribute(item.rewards), updatedAt: now })),
        completionFacts: state.completionFacts.map((item) => ({ ...item, rewardSnapshot: withoutAttribute(item.rewardSnapshot) })),
        xpTransactions: state.xpTransactions.filter((item) => item.attributeId !== command.id),
        settlements: state.settlements.map((item) => ({ ...item, attributeGains: Object.fromEntries(Object.entries(item.attributeGains).filter(([attributeId]) => attributeId !== command.id)) })),
      }, command.id);
    }
    case "project.create": {
      assertNonEmpty(command.value.name, "project_name");
      validateRewards(state, command.value.rewardsPerUnit);
      const id = context.id("project");
      const category = normalizedAttributeCategory(command.value.category);
      const project: ProjectRecord = { ...command.value, category, source: command.value.source ?? "week-up", id, createdAt: now, updatedAt: now };
      return changed(state, { projectCategories: appendProjectCategory(state, category, context, now), projects: [...state.projects, project] }, id);
    }
    case "project.update": {
      const current = state.projects.find((item) => item.id === command.id);
      if (!current) throw new Error("project_not_found");
      const category = command.patch.category === undefined ? current.category : normalizedAttributeCategory(command.patch.category);
      const project: ProjectRecord = { ...current, ...command.patch, category, updatedAt: now };
      assertNonEmpty(project.name, "project_name");
      validateRewards(state, project.rewardsPerUnit);
      const base = { ...state, projects: state.projects.map((item) => item.id === command.id ? project : item) };
      return changed(state, { projectCategories: appendProjectCategory(state, category, context, now), projects: base.projects, plans: propagateProjectTemplate(base, project, now) }, command.id);
    }
    case "project.archive": {
      const current = state.projects.find((item) => item.id === command.id);
      if (!current) throw new Error("project_not_found");
      return changed(state, { projects: state.projects.map((item) => item.id === command.id ? { ...item, archivedAt: now, updatedAt: now } : item) }, command.id);
    }
    case "project.remove": {
      const current = state.projects.find((item) => item.id === command.id);
      if (!current) throw new Error("project_not_found");
      const plans = state.plans.map((item): PlanRecord => {
        if (item.projectId !== command.id) return item;
        const { projectId: _projectId, templateKind: _templateKind, ...snapshot } = item;
        return { ...snapshot, rewardMode: item.rewards.length > 0 ? "custom" : "none", updatedAt: now };
      });
      return changed(state, { projects: state.projects.filter((item) => item.id !== command.id), plans }, command.id);
    }
    case "project.plan.create": {
      const project = state.projects.find((item) => item.id === command.projectId && item.archivedAt === undefined);
      if (!project) throw new Error("project_not_found");
      const sequence = nextProjectSequence(state, project.id);
      const customTitle = command.title?.trim();
      const requestedEndAt = command.endAt ?? addHours(command.startAt, 1);
      const isUnscheduled = command.timeStatus === "unscheduled";
      const timeSegments = isUnscheduled ? [] : createTimeSegments(command.timeSegments ?? [{ startAt: command.startAt, endAt: requestedEndAt }], context);
      const { startAt, endAt } = isUnscheduled ? { startAt: command.startAt, endAt: requestedEndAt } : segmentEnvelope(timeSegments);
      assertPeriod(startAt, endAt);
      const derived = rewardsForProject(project, startAt, endAt, command.unitQuantity, timeSegments);
      const availableLessons = project.source === "learning-more"
        ? [...state.learningMoreLessons]
          .filter((lesson) => lesson.courseId === project.sourceCourseId && lesson.completedAt === undefined && !state.plans.some((plan) => plan.sourceLessonId === lesson.lessonId && plan.removedAt === undefined))
          .sort((left, right) => left.scheduledDate.localeCompare(right.scheduledDate) || left.order - right.order || left.lessonId.localeCompare(right.lessonId))
        : [];
      const selectedLesson = command.sourceLessonId
        ? availableLessons.find((lesson) => lesson.lessonId === command.sourceLessonId)
        : availableLessons[0];
      if (project.source === "learning-more" && !selectedLesson) throw new Error("learning_more_lesson_unavailable");
      if (selectedLesson && localDate(startAt) !== selectedLesson.scheduledDate) throw new Error("learning_more_schedule_date_mismatch");
      const id = context.id("plan");
      const plan: PlanRecord = {
        id,
        title: customTitle || selectedLesson?.title || `${project.name} ${formatSequence(sequence)}`,
        titleMode: customTitle || selectedLesson ? "custom" : "template",
        detail: selectedLesson?.objective || `${project.name} · ${derived.quantity} ${project.unit === "hour" ? "时" : project.unit === "lesson" ? "节" : "次"}`,
        category: project.category,
        startAt,
        endAt,
        timeSegments,
        timeStatus: isUnscheduled ? "unscheduled" : "scheduled",
        goalIds: command.goalIds ?? [],
        rewards: derived.rewards,
        rewardMode: project.rewardsPerUnit.length > 0 ? "template" : "none",
        templateKind: "project",
        projectId: project.id,
        unitKind: project.unit,
        unitQuantity: derived.quantity,
        sequenceNumber: project.source === "week-up" ? sequence : undefined,
        source: project.source,
        ...(command.recurrenceGroupId ? { recurrenceGroupId: command.recurrenceGroupId, recurrenceIndex: command.recurrenceIndex ?? 0, recurrenceSummary: command.recurrenceSummary } : {}),
        ...(selectedLesson ? { sourceLessonId: selectedLesson.lessonId, sourceCourseId: selectedLesson.courseId, sourceRef: `week-up:${id}` } : {}),
        createdAt: now,
        updatedAt: now,
      };
      return changed(state, { plans: [...state.plans, plan] }, id);
    }
    case "goal.create": {
      assertNonEmpty(command.value.title, "goal_title");
      assertPeriod(`${command.value.startDate}T00:00:00Z`, `${command.value.endDate}T23:59:59Z`);
      const id = context.id("goal");
      return changed(state, { goals: [...state.goals, { ...command.value, id, createdAt: now }] }, id);
    }
    case "goal.update": {
      const current = state.goals.find((item) => item.id === command.id);
      if (!current) throw new Error("goal_not_found");
      const next = { ...current, ...command.patch };
      assertNonEmpty(next.title, "goal_title");
      assertPeriod(`${next.startDate}T00:00:00Z`, `${next.endDate}T23:59:59Z`);
      return changed(state, { goals: state.goals.map((item) => item.id === command.id ? next : item) }, command.id);
    }
    case "goal.archive": {
      if (!state.goals.some((item) => item.id === command.id)) throw new Error("goal_not_found");
      return changed(state, { goals: state.goals.map((item) => item.id === command.id ? { ...item, archivedAt: now } : item) }, command.id);
    }
    case "goal.remove": {
      if (!state.goals.some((item) => item.id === command.id)) throw new Error("goal_not_found");
      return changed(state, {
        goals: state.goals.filter((item) => item.id !== command.id).map((item) => ({ ...item, linkedGoalIds: item.linkedGoalIds.filter((id) => id !== command.id) })),
        plans: state.plans.map((item) => ({ ...item, goalIds: item.goalIds.filter((id) => id !== command.id), updatedAt: now })),
      }, command.id);
    }
    case "plan.create": {
      assertNonEmpty(command.value.title, "plan_title");
      const isUnscheduled = command.value.timeStatus === "unscheduled";
      const timeSegments = isUnscheduled ? [] : validateTimeSegments(command.value.timeSegments?.length
        ? command.value.timeSegments
        : [{ id: context.id("segment"), startAt: command.value.startAt, endAt: command.value.endAt }]);
      const envelope = isUnscheduled ? { startAt: command.value.startAt, endAt: command.value.endAt } : segmentEnvelope(timeSegments);
      assertPeriod(envelope.startAt, envelope.endAt);
      validateRewards(state, command.value.rewards);
      const id = context.id("plan");
      const plan: PlanRecord = {
        ...command.value,
        startAt: envelope.startAt,
        endAt: envelope.endAt,
        timeSegments,
        rewardMode: command.value.rewardMode ?? (command.value.rewards.length > 0 ? "custom" : "none"),
        titleMode: command.value.titleMode ?? "custom",
        source: command.value.source ?? "week-up",
        timeStatus: isUnscheduled ? "unscheduled" : "scheduled",
        id,
        createdAt: now,
        updatedAt: now,
      };
      return changed(state, { plans: [...state.plans, plan] }, id);
    }
    case "plan.recurrence.create": {
      if (command.startAts.length < 2 || command.startAts.length > 365) throw new Error("plan_recurrence_size_invalid");
      if (command.endAts && command.endAts.length !== command.startAts.length) throw new Error("plan_recurrence_periods_invalid");
      if (command.timeSegmentsByOccurrence && command.timeSegmentsByOccurrence.length !== command.startAts.length) throw new Error("plan_recurrence_segments_invalid");
      const project = command.projectId ? state.projects.find((item) => item.id === command.projectId && item.source === "week-up" && item.archivedAt === undefined) : undefined;
      if (command.projectId && !project) throw new Error("project_not_found");
      if (!project) assertNonEmpty(command.title ?? "", "plan_title");
      const plans = [...state.plans];
      const createdIds: string[] = [];
      command.startAts.forEach((startAt, recurrenceIndex) => {
        const endAt = command.endAts?.[recurrenceIndex] ?? addHours(startAt, 1);
        assertPeriod(startAt, endAt);
        const id = context.id("plan");
        const sequence = project ? nextProjectSequence({ ...state, plans }, project.id) : undefined;
        const isUnscheduled = command.timeStatus === "unscheduled";
        const segmentInputs = command.timeSegmentsByOccurrence?.[recurrenceIndex] ?? [{ startAt, endAt }];
        const timeSegments = isUnscheduled ? [] : createTimeSegments(segmentInputs, context);
        const envelope = isUnscheduled ? { startAt, endAt } : segmentEnvelope(timeSegments);
        const derived = project ? rewardsForProject(project, envelope.startAt, envelope.endAt, undefined, timeSegments) : undefined;
        const customTitle = command.title?.trim();
        const plan: PlanRecord = {
          id,
          title: customTitle || (project && sequence !== undefined ? `${project.name} ${formatSequence(sequence)}` : ""),
          titleMode: customTitle ? "custom" : "template",
          detail: project && derived ? `${project.name} · ${derived.quantity} ${project.unit === "hour" ? "时" : project.unit === "lesson" ? "节" : "次"}` : "快速新增 · 可继续编辑属性奖励",
          category: project?.category ?? "未分类",
          startAt: envelope.startAt,
          endAt: envelope.endAt,
          timeSegments,
          timeStatus: isUnscheduled ? "unscheduled" : "scheduled",
          goalIds: command.goalIds ?? [],
          rewards: derived?.rewards ?? [],
          rewardMode: project && project.rewardsPerUnit.length > 0 ? "template" : "none",
          ...(project ? { templateKind: "project" as const, projectId: project.id, unitKind: project.unit, unitQuantity: derived!.quantity, sequenceNumber: sequence } : {}),
          source: "week-up",
          recurrenceGroupId: command.recurrenceGroupId,
          recurrenceIndex,
          recurrenceSummary: command.recurrenceSummary,
          createdAt: now,
          updatedAt: now,
        };
        plans.push(plan);
        createdIds.push(id);
      });
      return changed(state, { plans }, createdIds[0]);
    }
    case "plan.update": {
      const current = state.plans.find((item) => item.id === command.id);
      if (!current) throw new Error("plan_not_found");
      let next: PlanRecord = { ...current, ...command.patch, updatedAt: now, ...(current.recurrenceGroupId ? { recurrenceDetachedAt: now } : {}) };
      const makesUnscheduled = command.patch.timeStatus === "unscheduled";
      const requestedSegments = command.patch.timeSegments
        ?? ((command.patch.startAt !== undefined || command.patch.endAt !== undefined) && (current.timeSegments?.length ?? 0) === 1
          ? [{
            id: current.timeSegments![0].id,
            startAt: command.patch.startAt ?? current.timeSegments![0].startAt,
            endAt: command.patch.endAt ?? current.timeSegments![0].endAt,
            ...(current.timeSegments![0].completedAt ? { completedAt: current.timeSegments![0].completedAt } : {}),
          }]
          : undefined);
      if (makesUnscheduled) {
        next = { ...next, timeSegments: [], timeStatus: "unscheduled" };
      } else if (requestedSegments !== undefined) {
        const timeSegments = validateTimeSegments(requestedSegments);
        const envelope = segmentEnvelope(timeSegments);
        next = { ...next, ...envelope, timeSegments, timeStatus: "scheduled" };
      }
      if (command.patch.rewards !== undefined && command.patch.rewardMode === undefined && !rewardsEqual(command.patch.rewards, current.rewards)) {
        next = { ...next, rewardMode: "custom" };
      }
      assertNonEmpty(next.title, "plan_title");
      assertPeriod(next.startAt, next.endAt);
      validateRewards(state, next.rewards);
      if (!makesUnscheduled && next.rewardMode === "template" && next.templateKind === "project" && next.projectId) {
        const project = state.projects.find((item) => item.id === next.projectId);
        if (project) {
          const derived = rewardsForProject(project, next.startAt, next.endAt, next.unitQuantity, next.timeSegments);
          next = { ...next, category: project.category, unitKind: project.unit, unitQuantity: derived.quantity, rewards: derived.rewards };
        }
      }
      let base: WeekUpState = { ...state, plans: state.plans.map((item) => item.id === command.id ? next : item) };
      if (activeCompletion(state, current.id) && !allSegmentsCompleted(next)) base = revertPlanCompletionInState(base, current.id, context, now);
      return changed(state, { plans: base.plans, completionFacts: base.completionFacts, xpTransactions: base.xpTransactions }, command.id);
    }
    case "plan.remove": {
      const current = state.plans.find((item) => item.id === command.id);
      if (!current) throw new Error("plan_not_found");
      if (activeCompletion(state, current.id)) throw new Error("completed_plan_cannot_remove");
      const plans = state.plans
        .filter((item) => item.id !== command.id)
        .map((item) => item.overdueSourcePlanId === command.id
          ? { ...item, overdueSourcePlanId: undefined, updatedAt: now }
          : item.overdueRescheduledPlanId === command.id
            ? { ...item, overdueRescheduledPlanId: undefined, updatedAt: now }
            : item);
      return changed(state, {
        plans,
        settlements: state.settlements.map((item) => ({ ...item, completedPlanIds: item.completedPlanIds.filter((id) => id !== command.id), incompletePlanIds: item.incompletePlanIds.filter((id) => id !== command.id) })),
      }, command.id);
    }
    case "plan.recurrence.update": {
      const current = state.plans.find((item) => item.id === command.id && item.removedAt === undefined);
      if (!current) throw new Error("plan_not_found");
      if (!current.recurrenceGroupId) throw new Error("plan_recurrence_not_found");
      assertNonEmpty(command.patch.title, "plan_title");
      assertPeriod(command.patch.startAt, command.patch.endAt);
      validateRewards(state, command.patch.rewards);

      const cutoff = Date.parse(current.startAt);
      const makesUnscheduled = command.patch.timeStatus === "unscheduled";
      const startDelta = makesUnscheduled ? 0 : Date.parse(command.patch.startAt) - cutoff;
      const nextDuration = makesUnscheduled ? Date.parse(current.endAt) - cutoff : Date.parse(command.patch.endAt) - Date.parse(command.patch.startAt);
      const segmentsChanged = JSON.stringify(command.patch.timeSegments?.map(({ startAt, endAt }) => ({ startAt: localTime(startAt), endAt: localTime(endAt) })) ?? [])
        !== JSON.stringify(current.timeSegments?.map(({ startAt, endAt }) => ({ startAt: localTime(startAt), endAt: localTime(endAt) })) ?? []);
      const timeStatusChanged = command.patch.timeStatus !== undefined && command.patch.timeStatus !== current.timeStatus;
      const scheduleChanged = timeStatusChanged || segmentsChanged || startDelta !== 0 || nextDuration !== Date.parse(current.endAt) - cutoff;
      const titleChanged = command.patch.title !== current.title;
      const detailChanged = command.patch.detail !== current.detail;
      const categoryChanged = command.patch.category !== current.category;
      const goalsChanged = JSON.stringify(command.patch.goalIds) !== JSON.stringify(current.goalIds);
      const rewardsChanged = !rewardsEqual(command.patch.rewards, current.rewards);
      const quantityChanged = command.patch.unitQuantity !== undefined && command.patch.unitQuantity !== current.unitQuantity;

      const plans = state.plans.map((item) => {
        const eligible = item.recurrenceGroupId === current.recurrenceGroupId
          && item.removedAt === undefined
          && item.recurrenceDetachedAt === undefined
          && Date.parse(item.startAt) >= cutoff
          && !isPlanCompleted(state, item.id)
          && !planHasPartialSegmentProgress(item);
        if (!eligible) return item;

        const movedSegments = makesUnscheduled
          ? []
          : segmentsChanged && command.patch.timeSegments
          ? moveSegmentsToDate(command.patch.timeSegments, localDate(item.startAt), item.id)
          : scheduleChanged && item.timeSegments?.length
            ? item.timeSegments.length === 1
              ? validateTimeSegments([{ id: `${item.id}:segment:0`, startAt: new Date(Date.parse(item.timeSegments[0]!.startAt) + startDelta).toISOString(), endAt: new Date(Date.parse(item.timeSegments[0]!.startAt) + startDelta + nextDuration).toISOString() }])
              : shiftSegments(item.timeSegments, startDelta, item.id)
            : undefined;
        const movedEnvelope = movedSegments?.length ? segmentEnvelope(movedSegments) : undefined;
        const startAt = makesUnscheduled
          ? `${localDate(item.startAt)}T00:00:00+08:00`
          : movedEnvelope?.startAt ?? (scheduleChanged ? new Date(Date.parse(item.startAt) + startDelta).toISOString() : item.startAt);
        const endAt = makesUnscheduled
          ? `${localDate(item.startAt)}T01:00:00+08:00`
          : movedEnvelope?.endAt ?? (scheduleChanged ? new Date(Date.parse(startAt) + nextDuration).toISOString() : item.endAt);
        let next: PlanRecord = {
          ...item,
          ...(titleChanged ? { title: command.patch.title, titleMode: "custom" as const } : {}),
          ...(detailChanged ? { detail: command.patch.detail } : {}),
          ...(categoryChanged ? { category: command.patch.category } : {}),
          ...(goalsChanged ? { goalIds: [...command.patch.goalIds] } : {}),
          ...(quantityChanged ? { unitQuantity: command.patch.unitQuantity } : {}),
          ...(scheduleChanged ? { startAt, endAt, ...(movedSegments !== undefined ? { timeSegments: movedSegments } : {}), timeStatus: makesUnscheduled ? "unscheduled" as const : "scheduled" as const } : {}),
          ...(rewardsChanged ? { rewards: command.patch.rewards.map((reward) => ({ ...reward })), rewardMode: "custom" as const } : {}),
          updatedAt: now,
        };
        if (!makesUnscheduled && !rewardsChanged && next.rewardMode === "template" && next.templateKind === "project" && next.projectId) {
          const project = state.projects.find((item) => item.id === next.projectId);
          if (project) {
            const derived = rewardsForProject(project, next.startAt, next.endAt, next.unitQuantity, next.timeSegments);
            next = { ...next, category: project.category, unitKind: project.unit, unitQuantity: derived.quantity, rewards: derived.rewards };
          }
        }
        return next;
      });
      return changed(state, { plans }, command.id);
    }
    case "plan.recurrence.cancel": {
      const current = state.plans.find((item) => item.id === command.id && item.removedAt === undefined);
      if (!current) throw new Error("plan_not_found");
      if (!current.recurrenceGroupId) throw new Error("plan_recurrence_not_found");
      const cutoff = Date.parse(current.startAt);
      const removableIds = new Set(state.plans.filter((item) => {
        const removable = item.recurrenceGroupId === current.recurrenceGroupId
          && item.removedAt === undefined
          && item.recurrenceDetachedAt === undefined
          && Date.parse(item.startAt) >= cutoff
          && !isPlanCompleted(state, item.id);
        return removable;
      }).map((item) => item.id));
      const plans = state.plans.filter((item) => !removableIds.has(item.id));
      return changed(state, { plans }, command.id);
    }
    case "plan.overdue.reschedule": {
      const current = state.plans.find((item) => item.id === command.id && item.removedAt === undefined);
      if (!current) throw new Error("plan_not_found");
      if (activeCompletion(state, current.id)) throw new Error("plan_already_completed");
      if (!planIsOverdue(current, now)) throw new Error("plan_not_overdue");
      if (current.overdueRescheduledPlanId) throw new Error("plan_already_rescheduled");
      assertPeriod(command.startAt, command.endAt);
      if (localDate(command.startAt) < localDate(now)) throw new Error("reschedule_date_in_past");
      const id = context.id("plan");
      const makesUnscheduled = command.timeStatus === "unscheduled";
      const timeSegments = makesUnscheduled
        ? []
        : command.timeSegments !== undefined
          ? validateTimeSegments(command.timeSegments.map((segment, index) => ({ id: `${id}:segment:${index}`, ...segment })))
          : current.timeSegments?.length
            ? shiftSegments(current.timeSegments, Date.parse(command.startAt) - Date.parse(current.startAt), id)
            : undefined;
      const {
        id: _currentId,
        overdueRescheduledPlanId: _overdueRescheduledPlanId,
        recurrenceGroupId: _recurrenceGroupId,
        recurrenceIndex: _recurrenceIndex,
        recurrenceSummary: _recurrenceSummary,
        recurrenceDetachedAt: _recurrenceDetachedAt,
        createdAt: _createdAt,
        updatedAt: _updatedAt,
        ...carried
      } = current;
      let replacement: PlanRecord = {
        ...carried,
        id,
        startAt: command.startAt,
        endAt: command.endAt,
        ...(timeSegments !== undefined ? { timeSegments } : {}),
        timeStatus: makesUnscheduled ? "unscheduled" : "scheduled",
        overdueSourcePlanId: current.id,
        createdAt: now,
        updatedAt: now,
      };
      if (!makesUnscheduled && replacement.rewardMode === "template" && replacement.templateKind === "project" && replacement.projectId) {
        const project = state.projects.find((item) => item.id === replacement.projectId);
        if (project) {
          const derived = rewardsForProject(project, replacement.startAt, replacement.endAt, replacement.unitQuantity, replacement.timeSegments);
          replacement = { ...replacement, category: project.category, unitKind: project.unit, unitQuantity: derived.quantity, rewards: derived.rewards };
        }
      }
      return changed(state, {
        plans: [
          ...state.plans.map((item) => item.id === current.id ? { ...item, overdueRescheduledPlanId: id, updatedAt: now } : item),
          replacement,
        ],
      }, id);
    }
    case "plan.complete": {
      const plan = state.plans.find((item) => item.id === command.id && item.removedAt === undefined);
      if (!plan) throw new Error("plan_not_found");
      if (activeCompletion(state, plan.id)) return unchanged(state);
      const completedAt = command.completedAt ?? now;
      const prepared = plan.timeSegments?.length
        ? { ...state, plans: state.plans.map((item) => item.id === plan.id ? { ...item, timeSegments: item.timeSegments!.map((segment) => ({ ...segment, completedAt: segment.completedAt ?? completedAt })), updatedAt: now } : item) }
        : state;
      const outcome = completePlan(prepared, command.id, context, {
        source: command.source ?? "week-up",
        ...(command.externalFactId ? { externalFactId: command.externalFactId } : {}),
        completedAt,
      });
      const refreshed = refreshSettlementsAfterFactChanges(outcome.state, now);
      if (refreshed === outcome.state) return outcome;
      return outcome.changed
        ? { ...outcome, state: refreshed }
        : { ...outcome, state: { ...refreshed, revision: state.revision + 1 }, changed: true };
    }
    case "plan.undo": {
      const fact = activeCompletion(state, command.id);
      if (!fact) return unchanged(state);
      const reverted = revertPlanCompletionInState(state, command.id, context, now);
      return changed(state, {
        plans: reverted.plans.map((plan) => plan.id === command.id && plan.timeSegments?.length ? { ...plan, timeSegments: plan.timeSegments.map((segment) => ({ id: segment.id, startAt: segment.startAt, endAt: segment.endAt })), updatedAt: now } : plan),
        completionFacts: reverted.completionFacts,
        xpTransactions: reverted.xpTransactions,
      }, fact.id);
    }
    case "plan.segment.complete": {
      const plan = state.plans.find((item) => item.id === command.id && item.removedAt === undefined);
      if (!plan) throw new Error("plan_not_found");
      if (plan.source === "learning-more") throw new Error("learning_more_completion_authoritative");
      if (planIsOverdue(plan, command.completedAt ?? now)) throw new Error("plan_overdue");
      const segments = plan.timeSegments ?? [];
      if (!segments.some((segment) => segment.id === command.segmentId)) throw new Error("plan_segment_not_found");
      if (segments.find((segment) => segment.id === command.segmentId)?.completedAt) return unchanged(state, command.segmentId);
      const completedAt = command.completedAt ?? now;
      const updatedPlan: PlanRecord = { ...plan, timeSegments: segments.map((segment) => segment.id === command.segmentId ? { ...segment, completedAt } : segment), updatedAt: now };
      const prepared = { ...state, plans: state.plans.map((item) => item.id === plan.id ? updatedPlan : item) };
      if (!allSegmentsCompleted(updatedPlan)) return changed(state, { plans: prepared.plans }, command.segmentId);
      const outcome = completePlan(prepared, plan.id, context, { source: "week-up", completedAt });
      const refreshed = refreshSettlementsAfterFactChanges(outcome.state, now);
      return refreshed === outcome.state ? outcome : { ...outcome, state: refreshed };
    }
    case "plan.segment.undo": {
      const plan = state.plans.find((item) => item.id === command.id && item.removedAt === undefined);
      if (!plan) throw new Error("plan_not_found");
      const segment = plan.timeSegments?.find((item) => item.id === command.segmentId);
      if (!segment) throw new Error("plan_segment_not_found");
      if (!segment.completedAt) return unchanged(state, command.segmentId);
      const reverted = revertPlanCompletionInState(state, plan.id, context, now);
      const plans = reverted.plans.map((item) => item.id === plan.id ? { ...item, timeSegments: item.timeSegments?.map((entry) => entry.id === command.segmentId ? { id: entry.id, startAt: entry.startAt, endAt: entry.endAt } : entry), updatedAt: now } : item);
      const refreshed = refreshSettlementsAfterFactChanges({ ...reverted, plans }, now);
      return changed(state, { plans: refreshed.plans, completionFacts: refreshed.completionFacts, xpTransactions: refreshed.xpTransactions, settlements: refreshed.settlements }, command.segmentId);
    }
    case "plan.follow-template": {
      const plan = state.plans.find((item) => item.id === command.id && item.removedAt === undefined);
      if (!plan) throw new Error("plan_not_found");
      if (isPlanCompleted(state, plan.id)) throw new Error("completed_plan_immutable");
      if (plan.templateKind === "project" && plan.projectId) {
        const project = state.projects.find((item) => item.id === plan.projectId && item.archivedAt === undefined);
        if (!project) throw new Error("project_not_found");
        const derived = rewardsForProject(project, plan.startAt, plan.endAt, plan.unitQuantity, plan.timeSegments);
        const updated: PlanRecord = { ...plan, rewardMode: "template", unitKind: project.unit, unitQuantity: derived.quantity, rewards: derived.rewards, updatedAt: now };
        return changed(state, { plans: state.plans.map((item) => item.id === plan.id ? updated : item) }, plan.id);
      }
      if (plan.templateKind === "course" && plan.sourceCourseId) {
        const project = state.projects.find((item) => item.sourceCourseId === plan.sourceCourseId);
        const configured = project && project.rewardsPerUnit.length > 0;
        const updated: PlanRecord = { ...plan, projectId: project?.id, templateKind: "project", rewardMode: configured ? "template" : "none", unitKind: "lesson", unitQuantity: 1, rewards: configured ? scaleRewards(project.rewardsPerUnit, 1) : [], updatedAt: now };
        return changed(state, { plans: state.plans.map((item) => item.id === plan.id ? updated : item) }, plan.id);
      }
      throw new Error("plan_template_not_found");
    }
    case "weight.record": {
      if (!Number.isFinite(command.valueKg) || command.valueKg < 20 || command.valueKg > 300) throw new Error("weight_invalid");
      const previous = [...state.weightRevisions].reverse().find((item) => item.localDate === command.localDate);
      const id = context.id("weight");
      const revision: WeightRevision = { id, localDate: command.localDate, valueKg: Math.round(command.valueKg * 10) / 10, recordedAt: now, ...(previous ? { supersedesRevisionId: previous.id } : {}) };
      return changed(state, { weightRevisions: [...state.weightRevisions, revision] }, id);
    }
    case "weight.target": {
      if (command.valueKg !== undefined && (!Number.isFinite(command.valueKg) || command.valueKg < 20 || command.valueKg > 300)) throw new Error("weight_target_invalid");
      return changed(state, { preferences: command.valueKg === undefined ? {} : { targetWeightKg: Math.round(command.valueKg * 10) / 10 } });
    }
    case "settlement.generate": {
      const key = `${command.period}:${command.startDate}:${command.endDate}`;
      const existing = state.settlements.find((item) => `${item.period}:${item.startDate}:${item.endDate}` === key);
      if (existing) return unchanged(state, existing.id);
      const snapshot = settlementSnapshot(state, command.startDate, command.endDate, now);
      const id = context.id("settlement");
      const settlement: SettlementRecord = {
        id,
        period: command.period,
        startDate: command.startDate,
        endDate: command.endDate,
        generatedAt: now,
        ...snapshot,
        harvest: { status: "pending" },
      };
      return changed(state, { settlements: [...state.settlements, settlement] }, id);
    }
    case "settlement.harvest.succeeded": {
      assertNonEmpty(command.text, "harvest_text");
      const settlement = state.settlements.find((item) => item.id === command.id);
      if (!settlement) throw new Error("settlement_not_found");
      if (settlement.harvest.status === "stale") return unchanged(state, command.id);
      return changed(state, { settlements: state.settlements.map((item) => item.id === command.id ? { ...item, harvest: { status: "ready", text: command.text.trim(), generatedAt: now, provider: command.provider, preferredProvider: command.preferredProvider, fallbackUsed: command.fallbackUsed, ...(command.model ? { model: command.model } : {}), ...(command.reasoningEffort ? { reasoningEffort: command.reasoningEffort } : {}) } } : item) }, command.id);
    }
    case "settlement.harvest.failed": {
      if (!state.settlements.some((item) => item.id === command.id)) throw new Error("settlement_not_found");
      return changed(state, { settlements: state.settlements.map((item) => item.id === command.id ? { ...item, harvest: { status: "failed", error: command.message.trim() || "ai_review_failed" } } : item) }, command.id);
    }
    case "settlement.harvest.retry": {
      const settlement = state.settlements.find((item) => item.id === command.id);
      if (!settlement) throw new Error("settlement_not_found");
      if (settlement.harvest.status === "ready" || settlement.harvest.status === "pending") return unchanged(state, command.id);
      return changed(state, { settlements: state.settlements.map((item) => item.id === command.id ? { ...item, harvest: { status: "pending" } } : item) }, command.id);
    }
    case "ai-review.configure": {
      const apiBaseUrl = (command.apiBaseUrl ?? state.aiReview.apiBaseUrl).trim().replace(/\/$/, "");
      return changed(state, { aiReview: { baseUrl: "/week-up-review-api", preferredProvider: command.preferredProvider, apiBaseUrl, ...(command.model ? { model: command.model } : {}), ...(command.reasoningEffort ? { reasoningEffort: command.reasoningEffort } : {}) } });
    }
    case "learning-more.configure": {
      assertNonEmpty(command.baseUrl, "learning_more_url");
      return changed(state, { learningMore: { ...state.learningMore, baseUrl: command.baseUrl.replace(/\/$/, "") } });
    }
    case "learning-more.failed":
      return changed(state, { learningMore: { ...state.learningMore, lastError: command.message } });
    case "learning-more.import": {
      let next = state;
      let didChange = false;
      if (command.courses !== undefined) {
        const resolvedCategory = ensureLearningMoreProjectCategory(next, context, now);
        const learningMoreCategory = resolvedCategory.category.name;
        const projectCategories = resolvedCategory.projectCategories;
        if (projectCategories !== next.projectCategories) {
          next = { ...next, projectCategories };
          didChange = true;
        }
        const learningMoreProjectIds = new Set(next.projects.filter((project) => project.source === "learning-more").map((project) => project.id));
        next = {
          ...next,
          projects: next.projects.map((project) => project.source === "learning-more" && project.category !== learningMoreCategory ? { ...project, category: learningMoreCategory, updatedAt: now } : project),
          plans: next.plans.map((plan) => plan.projectId && learningMoreProjectIds.has(plan.projectId) && plan.category !== learningMoreCategory ? { ...plan, category: learningMoreCategory, updatedAt: now } : plan),
        };
        const removedCourseIds = command.incremental
          ? new Set(command.removedCourseIds ?? [])
          : new Set(next.learningMoreCourses.filter((course) => !command.courses!.some((incoming) => incoming.courseId === course.courseId)).map((course) => course.courseId));
        let projects = next.projects.map((project): ProjectRecord => project.source === "learning-more" && removedCourseIds.has(project.sourceCourseId ?? "") && project.archivedAt === undefined
          ? { ...project, archivedAt: now, updatedAt: now }
          : project);
        next = { ...next, projects };
        for (const course of command.courses) {
          const existingProject = next.projects.find((item) => item.sourceCourseId === course.courseId);
          if (!existingProject) {
            const project: ProjectRecord = {
              id: context.id("project"),
              name: course.title,
              category: learningMoreCategory,
              unit: "lesson",
              rewardsPerUnit: [],
              source: "learning-more",
              sourceCourseId: course.courseId,
              createdAt: now,
              updatedAt: now,
            };
            next = { ...next, projects: [...next.projects, project] };
          } else {
            const { archivedAt: _archivedAt, ...activeProject } = existingProject;
            const project: ProjectRecord = { ...activeProject, name: course.title, category: learningMoreCategory, unit: "lesson", updatedAt: now };
            const base = { ...next, projects: next.projects.map((item) => item.id === project.id ? project : item) };
            next = { ...base, plans: propagateProjectTemplate(base, project, now) };
          }
        }
        const incomingCourses = command.courses.map((course) => ({ ...course, lastSyncedAt: now }));
        next = { ...next, learningMoreCourses: command.incremental
          ? [...next.learningMoreCourses.filter((course) => !removedCourseIds.has(course.courseId) && !incomingCourses.some((incoming) => incoming.courseId === course.courseId)), ...incomingCourses]
          : incomingCourses };
        didChange = true;
      }
      if (command.incremental && command.courses === undefined && command.removedCourseIds?.length) {
        const removedCourseIds = new Set(command.removedCourseIds);
        next = {
          ...next,
          projects: next.projects.map((project): ProjectRecord => project.source === "learning-more" && removedCourseIds.has(project.sourceCourseId ?? "") && project.archivedAt === undefined ? { ...project, archivedAt: now, updatedAt: now } : project),
          learningMoreCourses: next.learningMoreCourses.filter((course) => !removedCourseIds.has(course.courseId)),
        };
        didChange = true;
      }
      if (command.lessons !== undefined) {
        const removedScheduleRefs = new Set((command.removedScheduleItemIds ?? []).map((item) => learningMoreSourceRef(item)));
        const canRemoveByLessonId = removedScheduleRefs.size === 0;
        const removedLessonIds = command.incremental
          ? new Set(command.removedLessonIds ?? [])
          : new Set(next.learningMoreLessons.filter((lesson) => !command.lessons!.some((incoming) => learningMoreScheduleKey(incoming) === learningMoreScheduleKey(lesson))).map((lesson) => lesson.lessonId));
        const incomingLessons: LearningMoreLesson[] = command.lessons.map((item) => {
          const existing = next.learningMoreLessons.find((lesson) => learningMoreScheduleKey(lesson) === learningMoreScheduleKey(item));
          return {
            courseId: item.courseId,
            lessonId: item.lessonId,
            scheduleItemId: item.scheduleItemId,
            scheduledDate: item.scheduledDate,
            title: item.title,
            objective: item.objective ?? "",
            order: item.order,
            lastSyncedAt: now,
            ...(existing?.completedAt ? { completedAt: existing.completedAt } : {}),
          };
        });
        const lessons = command.incremental
          ? [...next.learningMoreLessons.filter((lesson) => !removedScheduleRefs.has(learningMoreSourceRef(lesson.scheduleItemId)) && !(canRemoveByLessonId && removedLessonIds.has(lesson.lessonId)) && !incomingLessons.some((incoming) => learningMoreScheduleKey(incoming) === learningMoreScheduleKey(lesson))), ...incomingLessons]
          : incomingLessons;
        let plans = next.plans.map((plan): PlanRecord => plan.source === "learning-more" && ((plan.sourceRef && removedScheduleRefs.has(plan.sourceRef)) || (canRemoveByLessonId && plan.sourceLessonId && removedLessonIds.has(plan.sourceLessonId))) && activeCompletion(next, plan.id) === undefined && plan.removedAt === undefined
          ? { ...plan, removedAt: now, updatedAt: now }
          : plan);
        for (const lesson of lessons) {
          const project = next.projects.find((item) => item.source === "learning-more" && item.sourceCourseId === lesson.courseId && item.archivedAt === undefined);
          if (!project) continue;
          const sourceRef = learningMoreSourceRef(lesson.scheduleItemId);
          const existing = [...plans].reverse().find((plan) => plan.source === "learning-more" && plan.sourceRef === sourceRef)
            ?? [...plans].reverse().find((plan) => plan.source === "learning-more" && plan.sourceLessonId === lesson.lessonId && plan.sourceRef === undefined);
          const existingCompletion = existing ? activeCompletion(next, existing.id) : undefined;
          const keepsDate = existing !== undefined && localDate(existing.startAt) === lesson.scheduledDate;
          const startAt = keepsDate ? existing.startAt : `${lesson.scheduledDate}T00:00:00+08:00`;
          const endAt = keepsDate ? existing.endAt : `${lesson.scheduledDate}T01:00:00+08:00`;
          const configured = project.rewardsPerUnit.length > 0;
          if (existing) {
            const { removedAt: _removedAt, ...activePlan } = existing;
            const updated: PlanRecord = existingCompletion ? {
              ...activePlan,
              title: lesson.title,
              titleMode: "template",
              detail: lesson.objective,
              category: project.category,
              templateKind: "project",
              projectId: project.id,
              sourceCourseId: lesson.courseId,
              sourceRef,
              sourceLessonId: lesson.lessonId,
              updatedAt: now,
            } : {
              ...activePlan,
              title: lesson.title,
              titleMode: "template",
              detail: lesson.objective,
              category: project.category,
              startAt,
              endAt,
              timeStatus: keepsDate ? existing.timeStatus ?? "scheduled" : "unscheduled",
              rewards: existing.rewardMode === "custom" ? existing.rewards : configured ? scaleRewards(project.rewardsPerUnit, 1) : [],
              rewardMode: existing.rewardMode === "custom" ? "custom" : configured ? "template" : "none",
              templateKind: "project",
              projectId: project.id,
              unitKind: "lesson",
              unitQuantity: 1,
              sourceCourseId: lesson.courseId,
              sourceRef,
              sourceLessonId: lesson.lessonId,
              updatedAt: now,
            };
            plans = plans.map((plan) => plan.id === existing.id ? updated : plan);
          } else {
            const id = context.id("plan");
            plans = [...plans, {
              id,
              title: lesson.title,
              titleMode: "template",
              detail: lesson.objective,
              category: project.category,
              startAt,
              endAt,
              timeStatus: "unscheduled",
              goalIds: [],
              rewards: configured ? scaleRewards(project.rewardsPerUnit, 1) : [],
              rewardMode: configured ? "template" : "none",
              templateKind: "project",
              projectId: project.id,
              unitKind: "lesson",
              unitQuantity: 1,
              source: "learning-more",
              sourceRef,
              sourceLessonId: lesson.lessonId,
              sourceCourseId: lesson.courseId,
              createdAt: now,
              updatedAt: now,
            }];
          }
        }
        next = { ...next, learningMoreLessons: lessons, plans };
        didChange = true;
      }
      if (command.incremental && command.lessons === undefined && ((command.removedLessonIds?.length ?? 0) > 0 || (command.removedScheduleItemIds?.length ?? 0) > 0)) {
        const removedLessonIds = new Set(command.removedLessonIds);
        const removedScheduleRefs = new Set((command.removedScheduleItemIds ?? []).map((item) => learningMoreSourceRef(item)));
        const canRemoveByLessonId = removedScheduleRefs.size === 0;
        next = {
          ...next,
          learningMoreLessons: next.learningMoreLessons.filter((lesson) => !removedScheduleRefs.has(learningMoreSourceRef(lesson.scheduleItemId)) && !(canRemoveByLessonId && removedLessonIds.has(lesson.lessonId))),
          plans: next.plans.map((plan): PlanRecord => plan.source === "learning-more" && ((plan.sourceRef && removedScheduleRefs.has(plan.sourceRef)) || (canRemoveByLessonId && plan.sourceLessonId && removedLessonIds.has(plan.sourceLessonId))) && activeCompletion(next, plan.id) === undefined && plan.removedAt === undefined ? { ...plan, removedAt: now, updatedAt: now } : plan),
        };
        didChange = true;
      }
      for (const fact of command.facts) {
        if (fact.type === "course-closed") {
          if (!next.skillbooks.some((book) => book.courseId === fact.courseId)) {
            const book: SkillbookRecord = { id: context.id("skillbook"), courseId: fact.courseId, title: fact.courseTitle, acquiredAt: fact.occurredAt, sourceFactId: fact.factId };
            next = { ...next, skillbooks: [...next.skillbooks, book] };
            didChange = true;
          }
          continue;
        }
        const factSourceRef = fact.scheduleItemId ? learningMoreSourceRef(fact.scheduleItemId) : undefined;
        const lesson = fact.scheduleItemId
          ? next.learningMoreLessons.find((item) => item.scheduleItemId === fact.scheduleItemId)
          : next.learningMoreLessons.find((item) => item.lessonId === fact.lessonId);
        if (lesson && lesson.completedAt !== fact.occurredAt) {
          next = { ...next, learningMoreLessons: next.learningMoreLessons.map((item) => item.scheduleItemId === lesson.scheduleItemId ? { ...item, completedAt: fact.occurredAt, lastSyncedAt: now } : item) };
          didChange = true;
        }
        const candidatePlans = [...next.plans]
          .filter((item) => item.removedAt === undefined && item.source === "learning-more" && (factSourceRef ? item.sourceRef === factSourceRef : item.sourceLessonId === fact.lessonId))
          .sort((left, right) => Math.abs(Date.parse(left.startAt) - Date.parse(fact.occurredAt)) - Math.abs(Date.parse(right.startAt) - Date.parse(fact.occurredAt)) || left.startAt.localeCompare(right.startAt));
        const plan = candidatePlans.find((item) => item.overdueRescheduledPlanId === undefined && activeCompletion(next, item.id) === undefined)
          ?? candidatePlans[0]
          ?? [...next.plans]
            .filter((item) => item.removedAt === undefined && item.source === "learning-more" && item.sourceLessonId === fact.lessonId)
            .sort((left, right) => Math.abs(Date.parse(left.startAt) - Date.parse(fact.occurredAt)) - Math.abs(Date.parse(right.startAt) - Date.parse(fact.occurredAt)) || left.startAt.localeCompare(right.startAt))
            .find((item) => item.overdueRescheduledPlanId === undefined && activeCompletion(next, item.id) === undefined)
          ?? next.plans.find((item) => item.removedAt === undefined && item.source === "learning-more" && item.sourceLessonId === fact.lessonId);
        if (!plan) continue;
        const actualStart = fact.actualStartedAt;
        const actualEnd = fact.actualEndedAt;
        const hasActualRange =
          actualStart !== undefined &&
          actualEnd !== undefined &&
          Number.isFinite(Date.parse(actualStart)) &&
          Number.isFinite(Date.parse(actualEnd)) &&
          Date.parse(actualEnd) > Date.parse(actualStart);
        if (hasActualRange && (plan.startAt !== actualStart || plan.endAt !== actualEnd || plan.timeStatus !== "scheduled")) {
          next = {
            ...next,
            plans: next.plans.map((item) => item.id === plan.id
              ? { ...item, startAt: actualStart, endAt: actualEnd, timeSegments: [{ id: `${plan.id}:learning-more:actual`, startAt: actualStart, endAt: actualEnd, completedAt: fact.occurredAt }], timeStatus: "scheduled", updatedAt: now }
              : item),
          };
          didChange = true;
        } else {
          next = {
            ...next,
            plans: next.plans.map((item) => item.id === plan.id && item.timeSegments?.length
              ? { ...item, timeSegments: item.timeSegments.map((segment) => ({ ...segment, completedAt: segment.completedAt ?? fact.occurredAt })), updatedAt: now }
              : item),
          };
        }
        const outcome = completePlan(next, plan.id, context, { source: "learning-more", externalFactId: fact.factId, completedAt: fact.occurredAt });
        if (outcome.changed) { next = outcome.state; didChange = true; }
      }
      next = refreshSettlementsAfterFactChanges(next, now);
      const syncChanged = next.learningMore.historyCursor !== command.nextCursor || next.learningMore.lastSyncedAt !== now;
      if (syncChanged) {
        next = { ...next, learningMore: { ...next.learningMore, ...(command.nextCursor ? { historyCursor: command.nextCursor } : {}), lastSyncedAt: now, lastError: undefined } };
        didChange = true;
      }
      return didChange ? { state: { ...next, revision: state.revision + 1 }, changed: true } : unchanged(state);
    }
  }
  throw new Error(`week_up_command_unsupported:${String((command as { type?: unknown }).type ?? "unknown")}`);
}

export function totalXpForAttribute(state: WeekUpState, attributeId: string): number {
  return state.xpTransactions.filter((item) => item.attributeId === attributeId).reduce((sum, item) => sum + item.amount, 0);
}

export function currentWeightEntries(state: WeekUpState): ReadonlyArray<{ date: string; value: number }> {
  const latest = new Map<string, WeightRevision>();
  for (const revision of state.weightRevisions) latest.set(revision.localDate, revision);
  return [...latest.values()].sort((a, b) => a.localDate.localeCompare(b.localDate)).map((item) => ({ date: item.localDate, value: item.valueKg }));
}

export function exportWeekUpBackup(state: WeekUpState): string {
  return JSON.stringify({ format: "week-up-backup", exportedAt: new Date().toISOString(), state }, null, 2);
}

export function importWeekUpBackup(serialized: string): WeekUpState {
  const value: unknown = JSON.parse(serialized);
  if (!value || typeof value !== "object" || (value as { format?: unknown }).format !== "week-up-backup") throw new Error("backup_format_invalid");
  const state = (value as { state?: unknown }).state;
  try { return migrateWeekUpState(state); }
  catch { throw new Error("backup_schema_unsupported"); }
}

export function migrateWeekUpState(value: unknown): WeekUpState {
  if (value === undefined || value === null) return createEmptyWeekUpState();
  if (typeof value !== "object") throw new Error("database_state_invalid");
  const version = (value as { schemaVersion?: unknown }).schemaVersion;
  if (version !== 1 && version !== 2 && version !== 3 && version !== 4 && version !== 5 && version !== 6 && version !== 7 && version !== 8 && version !== 9 && version !== 10 && version !== 11 && version !== 12 && version !== 13 && version !== WEEK_UP_SCHEMA_VERSION) throw new Error("database_schema_unsupported");
  type MigratableSettlement = Omit<SettlementRecord, "harvest"> & {
    harvest?: SettlementRecord["harvest"];
    reflection?: string;
  };
  type MigratableCategory = Omit<AttributeCategoryRecord, "color"> & { color?: string };
  const raw = value as Omit<WeekUpState, "schemaVersion" | "attributeCategories" | "projectCategories" | "plans" | "projects" | "learningMoreCourses" | "learningMoreLessons" | "settlements" | "aiReview"> & {
    schemaVersion: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;
    attributeCategories?: readonly MigratableCategory[];
    projectCategories?: readonly MigratableCategory[];
    plans: readonly (Omit<PlanRecord, "rewardMode"> & Partial<Pick<PlanRecord, "rewardMode">>)[];
    projects?: readonly ProjectRecord[];
    learningMoreCourses?: readonly LearningMoreCourse[];
    learningMoreLessons?: readonly (Omit<LearningMoreLesson, "scheduleItemId" | "scheduledDate"> & Partial<Pick<LearningMoreLesson, "scheduleItemId" | "scheduledDate">>)[];
    settlements: readonly MigratableSettlement[];
    aiReview?: Partial<AiReviewState> & { baseUrl: string };
    preferences?: WeekUpState["preferences"];
  };
  const plans: PlanRecord[] = raw.plans.map((plan) => {
    const activeFact = raw.completionFacts.find((fact) => fact.planId === plan.id && fact.revertedAt === undefined);
    const isCompleted = activeFact !== undefined;
    const legacyExternalSchedule = raw.schemaVersion < 4 && plan.source === "learning-more" && !plan.sourceRef?.startsWith("week-up:");
    const migratedTimeStatus = raw.schemaVersion < 6 && plan.source === "learning-more" && !isCompleted && plan.removedAt === undefined ? "unscheduled" as const : plan.timeStatus;
    const timeSegments = plan.timeSegments?.length
      ? plan.timeSegments
      : migratedTimeStatus === "unscheduled"
        ? []
        : [{ id: `${plan.id}:segment:0`, startAt: plan.startAt, endAt: plan.endAt, ...(activeFact ? { completedAt: activeFact.completedAt } : {}) }];
    return {
      ...plan,
      timeSegments,
      rewardMode: plan.rewardMode ?? (plan.rewards.length > 0 ? "custom" : "none"),
      titleMode: plan.titleMode ?? "custom",
      ...(plan.source === "learning-more" ? { templateKind: plan.templateKind ?? "course", unitKind: plan.unitKind ?? "lesson", unitQuantity: plan.unitQuantity ?? 1 } : {}),
      ...(migratedTimeStatus ? { timeStatus: migratedTimeStatus } : {}),
      ...(legacyExternalSchedule && !isCompleted && plan.removedAt === undefined ? { removedAt: plan.updatedAt } : {}),
    };
  });
  const legacyCategoryNames = ["未分类", ...raw.attributes.map((attribute) => normalizedAttributeCategory(attribute.category))]
    .filter((name, index, names) => names.indexOf(name) === index);
  const attributeCategoriesSource = raw.attributeCategories ?? legacyCategoryNames.map((name, index) => ({
    id: name === "未分类" ? "attribute-category-uncategorized" : `attribute-category-legacy-${index}`,
    name,
    color: colorIdForCategory(name),
    system: name === "未分类",
    createdAt: "1970-01-01T00:00:00.000Z",
    updatedAt: "1970-01-01T00:00:00.000Z",
  }));
  const attributeCategories: AttributeCategoryRecord[] = attributeCategoriesSource.map((category) => ({
    ...category,
    color: category.color && isCategoryColorId(category.color) ? category.color : colorIdForCategory(category.name),
  }));
  const legacyProjectCategoryNames = ["未分类", ...(raw.projects ?? []).map((project) => normalizedAttributeCategory(project.category))]
    .filter((name, index, names) => names.indexOf(name) === index);
  const projectCategoriesSource = raw.projectCategories ?? legacyProjectCategoryNames.map((name, index) => ({
    id: name === "未分类" ? "project-category-uncategorized" : `project-category-legacy-${index}`,
    name,
    color: colorIdForCategory(name),
    system: name === "未分类",
    createdAt: "1970-01-01T00:00:00.000Z",
    updatedAt: "1970-01-01T00:00:00.000Z",
  }));
  const learningMoreCategoryName = projectCategoriesSource.find((category) => "integrationKey" in category && category.integrationKey === "learning-more")?.name
    ?? (raw.projects ?? []).find((project) => project.source === "learning-more" && project.category !== "未分类")?.category
    ?? projectCategoriesSource.find((category) => category.name === "Learning MORE" || category.name === "Learning MORE 课程学习")?.name;
  const projectCategories: AttributeCategoryRecord[] = projectCategoriesSource.reduce<AttributeCategoryRecord[]>((categories, category) => {
    const name = category.name;
    if (categories.some((item) => item.name === name)) return categories;
    categories.push({
      ...category,
      name,
      color: category.color && isCategoryColorId(category.color) ? category.color : colorIdForCategory(name),
      ...(name === learningMoreCategoryName ? { integrationKey: "learning-more" as const } : {}),
    });
    return categories;
  }, []);
  return {
    ...raw,
    schemaVersion: WEEK_UP_SCHEMA_VERSION,
    attributeCategories,
    projectCategories,
    attributes: raw.attributes.map((attribute) => attribute.color === "purple" ? { ...attribute, color: "violet" } : attribute),
    plans,
    projects: (raw.projects ?? []).map((project) => {
      const source = project.source ?? "week-up";
      return source === "learning-more" && raw.schemaVersion < 5 && project.archivedAt === undefined
        ? { ...project, source, archivedAt: project.updatedAt }
        : { ...project, source };
    }),
    learningMoreCourses: raw.schemaVersion < 5 ? [] : raw.learningMoreCourses ?? [],
    learningMoreLessons: raw.schemaVersion < 5 ? [] : (raw.learningMoreLessons ?? []).map((lesson, index) => ({ ...lesson, scheduleItemId: lesson.scheduleItemId!, scheduledDate: lesson.scheduledDate!, order: lesson.order ?? index })),
    settlements: (raw.settlements ?? []).map(({ reflection: _legacyReflection, ...settlement }) => ({
      ...settlement,
      harvest: settlement.harvest ?? { status: "pending" },
    })),
    preferences: raw.preferences ?? {},
    aiReview: {
      baseUrl: "/week-up-review-api",
      preferredProvider: raw.aiReview?.preferredProvider ?? "codex-cli",
      apiBaseUrl: raw.aiReview?.apiBaseUrl ?? (raw.aiReview?.baseUrl && raw.aiReview.baseUrl !== "/week-up-review-api" ? raw.aiReview.baseUrl : ""),
      ...(raw.aiReview?.model ? { model: raw.aiReview.model } : {}),
      ...(raw.aiReview?.reasoningEffort ? { reasoningEffort: raw.aiReview.reasoningEffort } : {}),
    },
  };
}
