import type { WeekUpState } from "./week-up-domain.ts";

const COLLECTION_KEYS = [
  "attributeCategories", "projectCategories", "attributes", "projects",
  "learningMoreCourses", "learningMoreLessons", "goals", "plans",
  "completionFacts", "xpTransactions", "weightRevisions", "dailySettlements", "settlements", "skillbooks",
] as const;

type CollectionKey = typeof COLLECTION_KEYS[number];
type StateEntity = WeekUpState[CollectionKey][number];

export type WeekUpStatePatch = Readonly<{
  revision: number;
  fields?: Partial<Pick<WeekUpState, "schemaVersion" | "preferences" | "learningMore" | "aiReview">>;
  collections?: Partial<Record<CollectionKey, Readonly<{ upsert: readonly StateEntity[]; remove: readonly string[] }>>>;
}>;

type MutablePatchFields = { -readonly [K in "schemaVersion" | "preferences" | "learningMore" | "aiReview"]?: WeekUpState[K] };

function entityId(key: CollectionKey, entity: StateEntity): string {
  if (key === "learningMoreCourses") return (entity as WeekUpState["learningMoreCourses"][number]).courseId;
  if (key === "learningMoreLessons") {
    const lesson = entity as WeekUpState["learningMoreLessons"][number];
    return lesson.scheduleItemId || lesson.lessonId;
  }
  return (entity as { id: string }).id;
}

export function createWeekUpStatePatch(previous: WeekUpState, next: WeekUpState): WeekUpStatePatch {
  const fields: MutablePatchFields = {};
  if (previous.schemaVersion !== next.schemaVersion) fields.schemaVersion = next.schemaVersion;
  if (previous.preferences !== next.preferences) fields.preferences = next.preferences;
  if (previous.learningMore !== next.learningMore) fields.learningMore = next.learningMore;
  if (previous.aiReview !== next.aiReview) fields.aiReview = next.aiReview;
  const collections: NonNullable<WeekUpStatePatch["collections"]> = {};
  for (const key of COLLECTION_KEYS) {
    if (previous[key] === next[key]) continue;
    const prior = new Map(previous[key].map((entity) => [entityId(key, entity), entity]));
    const currentIds = new Set(next[key].map((entity) => entityId(key, entity)));
    const upsert = next[key].filter((entity) => prior.get(entityId(key, entity)) !== entity);
    const remove = previous[key].flatMap((entity) => currentIds.has(entityId(key, entity)) ? [] : [entityId(key, entity)]);
    if (upsert.length || remove.length) collections[key] = { upsert, remove };
  }
  return {
    revision: next.revision,
    ...(Object.keys(fields).length ? { fields } : {}),
    ...(Object.keys(collections).length ? { collections } : {}),
  };
}

export function applyWeekUpStatePatch(state: WeekUpState, patch: WeekUpStatePatch): WeekUpState {
  const next = { ...state, ...patch.fields, revision: patch.revision } as WeekUpState;
  if (!patch.collections) return next;
  const mutable = next as unknown as Record<string, unknown>;
  for (const key of COLLECTION_KEYS) {
    const change = patch.collections[key];
    if (!change) continue;
    const upserts = new Map(change.upsert.map((entity) => [entityId(key, entity), entity]));
    const removed = new Set(change.remove);
    const current = state[key].flatMap((entity) => {
      const id = entityId(key, entity);
      if (removed.has(id)) return [];
      const replacement = upserts.get(id);
      if (replacement) { upserts.delete(id); return [replacement]; }
      return [entity];
    });
    mutable[key] = [...current, ...upserts.values()];
  }
  return next;
}
