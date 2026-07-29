# Attribute XP Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a desktop Web attribute-badge analytics page and show a matching current-period total beside the existing daily, weekly, and monthly attribute-gain summaries.

**Architecture:** Keep `XpTransaction`, `CompletionFact`, and `PlanRecord` as the only persisted facts. Add a pure `attribute-analytics.ts` projection that converts those facts into effective per-completion sources and chart aggregates, then render the selected badge as an in-place Growth subpage. The period-total UI sums the same gain arrays already rendered by Today, Week, and Month.

**Tech Stack:** React 19, TypeScript 5.9, CSS, Node test runner, Vite.

## Global Constraints

- Modify only the desktop Week UP Web experience; do not add a mobile entry or mobile analytics layout.
- Full-size badges in the Achievement Atlas open the analytics page; compact summary badges remain non-interactive.
- The XP source list contains only current positive net sources and its sum equals the badge total.
- Group source history by month and append 20 older rows per click; do not use numbered pagination.
- Group source composition by project category.
- Do not add a second persisted XP ledger or require a database migration.
- Keep the established pixel visual language.

---

### Task 1: Pure Attribute Analytics Projection

**Files:**
- Create: `web/lib/attribute-analytics.ts`
- Create: `web/tests/attribute-analytics.test.mjs`

**Interfaces:**
- Consumes: `WeekUpState`, `AttributeRecord`, `CompletionFact`, `PlanRecord`, and `XpTransaction` from `week-up-domain.ts`.
- Produces: `projectAttributeAnalytics(state: WeekUpState, attributeId: string, at?: Date): AttributeAnalytics`.
- Produces: `AttributeXpSource`, `AttributeDailyPoint`, `AttributeWeeklyGain`, and `AttributeCategoryGain`.

- [ ] **Step 1: Write failing source-invariant and aggregation tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { projectAttributeAnalytics } from "../lib/attribute-analytics.ts";
import { createEmptyWeekUpState, dispatchWeekUp } from "../lib/week-up-domain.ts";

test("projects current net XP sources and keeps their sum equal to badge total", () => {
  // Create one attribute and two completed plans, undo one plan, then update
  // the surviving project reward. The projection must expose one positive
  // source whose amount equals analytics.totalXp.
  const analytics = projectAttributeAnalytics(state, attributeId, new Date("2026-07-29T12:00:00+08:00"));
  assert.equal(analytics.sources.reduce((sum, source) => sum + source.amount, 0), analytics.totalXp);
  assert.deepEqual(analytics.sources.map((source) => source.planTitle), ["保留的完成行动"]);
});

test("uses Shanghai completion dates for 30-day, weekly, category, and active-day aggregates", () => {
  const analytics = projectAttributeAnalytics(state, attributeId, new Date("2026-07-29T12:00:00+08:00"));
  assert.equal(analytics.thirtyDay.points.at(-1).totalXp, analytics.totalXp);
  assert.deepEqual(analytics.weeklyGains.map((week) => week.amount), [2, 0, 3, 5]);
  assert.deepEqual(analytics.categoryGains.map(({ category, amount }) => [category, amount]), [["学术", 6], ["工作", 4]]);
  assert.deepEqual(analytics.activeDates, ["2026-07-24", "2026-07-26", "2026-07-29"]);
});
```

- [ ] **Step 2: Run the projection tests and verify the missing-module failure**

Run: `node --test tests/attribute-analytics.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `lib/attribute-analytics.ts`.

- [ ] **Step 3: Implement the pure projection**

```ts
export type AttributeXpSource = Readonly<{
  attributeId: string;
  completionFactId: string;
  planId?: string;
  completedAt: string;
  amount: number;
  planTitle: string;
  projectOrCourse: string;
  projectCategory: string;
  source: "week-up" | "learning-more";
}>;

export type AttributeAnalytics = Readonly<{
  totalXp: number;
  monthGain: number;
  sources: readonly AttributeXpSource[];
  thirtyDay: Readonly<{
    points: readonly Readonly<{ localDate: string; totalXp: number; gainedXp: number }>[];
    comparisonLabel: string;
  }>;
  weeklyGains: readonly Readonly<{ startDate: string; endDate: string; amount: number }>[];
  categoryGains: readonly Readonly<{ category: string; amount: number }>[];
  activeDates: readonly string[];
  longestStreak: number;
}>;

export function projectAttributeAnalytics(
  state: WeekUpState,
  attributeId: string,
  at = new Date(),
): AttributeAnalytics {
  const facts = new Map(state.completionFacts.map((fact) => [fact.id, fact]));
  const plans = new Map(state.plans.map((plan) => [plan.id, plan]));
  const projects = new Map(state.projects.map((project) => [project.id, project]));
  const courses = new Map(state.learningMoreCourses.map((course) => [course.courseId, course]));
  const grouped = new Map<string, { amount: number; occurredAt: string }>();
  for (const transaction of state.xpTransactions) {
    if (transaction.attributeId !== attributeId) continue;
    const current = grouped.get(transaction.completionFactId);
    grouped.set(transaction.completionFactId, {
      amount: (current?.amount ?? 0) + transaction.amount,
      occurredAt: current?.occurredAt ?? transaction.occurredAt,
    });
  }
  const sources = [...grouped.entries()].flatMap(([completionFactId, net]) => {
    if (net.amount <= 0) return [];
    const fact = facts.get(completionFactId);
    const plan = fact ? plans.get(fact.planId) : undefined;
    const project = plan?.projectId ? projects.get(plan.projectId) : undefined;
    const course = plan?.sourceCourseId ? courses.get(plan.sourceCourseId) : undefined;
    return [{
      attributeId,
      completionFactId,
      ...(fact ? { planId: fact.planId } : {}),
      completedAt: fact?.completedAt ?? net.occurredAt,
      amount: net.amount,
      planTitle: plan?.title ?? "历史完成记录",
      projectOrCourse: project?.name ?? course?.title ?? (plan?.source === "learning-more" ? "Learning MORE" : "临时计划"),
      projectCategory: plan?.category?.trim() || "未分类",
      source: plan?.source ?? fact?.source ?? "week-up",
    }];
  }).sort((left, right) => right.completedAt.localeCompare(left.completedAt) || left.completionFactId.localeCompare(right.completionFactId));

  return buildAttributeAggregates(sources, at);
}
```

Implement `buildAttributeAggregates` with Shanghai-local `YYYY-MM-DD` keys, a 30-day inclusive window, the preceding 30-day comparison, four Monday-to-Sunday weeks, category totals sorted descending, unique active dates, and a longest-consecutive-date scan. Start the cumulative curve with all positive source XP completed before the 30-day window, so the final point equals `totalXp`.

- [ ] **Step 4: Run projection tests**

Run: `node --test tests/attribute-analytics.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit the projection**

```bash
git add web/lib/attribute-analytics.ts web/tests/attribute-analytics.test.mjs
git commit -m "feat: project attribute XP analytics"
```

### Task 2: Desktop Badge Analytics Page

**Files:**
- Modify: `web/app/page.tsx`
- Modify: `web/app/globals.css`
- Modify: `web/tests/demo-source.test.mjs`

**Interfaces:**
- Consumes: `projectAttributeAnalytics(state, attributeId, at)` from Task 1.
- Produces: `AttributeAnalyticsView` in `page.tsx`.
- Updates: `PixelBadge` with optional `onOpen?: () => void`.
- Updates: `GrowthView` with `state: WeekUpState`.

- [ ] **Step 1: Write failing desktop-source tests**

```js
test("opens full atlas badges into one desktop attribute analytics page", async () => {
  const page = await readFile(pagePath, "utf8");
  assert.match(page, /function AttributeAnalyticsView/);
  assert.match(page, /projectAttributeAnalytics/);
  assert.match(page, /返回成就图鉴/);
  assert.match(page, /30 日累计趋势/);
  assert.match(page, /每周增量/);
  assert.match(page, /来源构成/);
  assert.match(page, /增长节奏/);
  assert.match(page, /继续加载更早记录/);
  assert.doesNotMatch(page, /下一页 →/);
});

test("only full atlas badges receive the analytics open action", async () => {
  const page = await readFile(pagePath, "utf8");
  const growth = sourceBetween(page, "function GrowthView", "function WeightView");
  assert.match(growth, /onOpen=/);
  const today = sourceBetween(page, "function TodayView", "function GoalsView");
  assert.doesNotMatch(today, /onOpen=/);
});
```

- [ ] **Step 2: Run the UI source tests and verify failure**

Run: `node --test --test-name-pattern="attribute analytics|full atlas badges" tests/demo-source.test.mjs`

Expected: FAIL because the analytics component and copy are absent.

- [ ] **Step 3: Add badge selection and the analytics page**

In `GrowthView`, retain the existing category and expansion state and add:

```tsx
const [selectedAttributeId, setSelectedAttributeId] = useState<string | null>(null);
const selectedAttribute = attributes.find((attribute) => attribute.id === selectedAttributeId);
if (selectedAttribute) {
  return (
    <AttributeAnalyticsView
      attribute={selectedAttribute}
      state={state}
      onBack={() => setSelectedAttributeId(null)}
    />
  );
}
```

Change only the atlas grid usage to:

```tsx
<PixelBadge
  key={attribute.id}
  attribute={attribute}
  onOpen={() => setSelectedAttributeId(attribute.id)}
/>
```

Render `AttributeAnalyticsView` with the approved desktop layout:

- badge identity, level progress, total XP, and month gain;
- SVG cumulative 30-day step path;
- four weekly bars;
- CSS conic-gradient category composition and legend;
- 30-day activity cells and longest streak;
- effective source list with `all`, `month`, and `week` filters;
- month selector;
- month grouping and 20-row incremental loading.

Use semantic buttons and table-like CSS grids. When the selected attribute disappears, return to the atlas instead of rendering a stale record.

- [ ] **Step 4: Add pixel analytics styling**

Add `.attribute-analytics-view`, `.attribute-analytics-hero`, `.attribute-analytics-grid`, `.attribute-trend-chart`, `.attribute-week-bars`, `.attribute-source-donut`, `.attribute-activity-grid`, `.attribute-source-ledger`, `.attribute-source-month`, and `.attribute-source-row` rules to `globals.css`.

Wrap the desktop-only analytics layout in:

```css
@media (min-width: 901px) {
  .attribute-analytics-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 20px;
  }
}
```

Do not add a mobile analytics entry. The generic narrow viewport fallback may stack existing content, but the mobile navigation never links directly to analytics.

- [ ] **Step 5: Run UI tests, typecheck, and build**

Run:

```bash
node --test tests/demo-source.test.mjs
npm run typecheck
npm run build
```

Expected: all commands PASS.

- [ ] **Step 6: Commit the desktop analytics page**

```bash
git add web/app/page.tsx web/app/globals.css web/tests/demo-source.test.mjs
git commit -m "feat: add attribute XP analytics page"
```

### Task 3: Current-Period Total Attribute Growth

**Files:**
- Modify: `web/app/page.tsx`
- Modify: `web/tests/demo-source.test.mjs`
- Modify: `web/tests/attribute-gains.test.mjs`

**Interfaces:**
- Consumes: the existing `dailyGains` and `attributeGains` arrays already rendered by Today and `PeriodFacts`.
- Produces: `totalAttributeGain(rewards: readonly { amount: number }[]): number`.

- [ ] **Step 1: Write failing total-invariant tests**

```js
test("sums the same visible attribute gains used by each period panel", () => {
  assert.equal(totalAttributeGain([{ amount: 2 }, { amount: 3 }, { amount: 0 }]), 5);
});

test("shows one current-period total beside daily weekly and monthly growth", async () => {
  const page = await readFile(pagePath, "utf8");
  assert.match(page, /今日总属性增长/);
  assert.match(page, /本周总属性增长/);
  assert.match(page, /本月总属性增长/);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
node --test tests/attribute-gains.test.mjs
node --test --test-name-pattern="current-period total" tests/demo-source.test.mjs
```

Expected: FAIL because `totalAttributeGain` and the labels do not exist.

- [ ] **Step 3: Implement one shared total helper**

In `attribute-gains.ts` add:

```ts
export function totalAttributeGain(rewards: readonly Readonly<{ amount: number }>[]): number {
  return rewards.reduce((sum, reward) => sum + reward.amount, 0);
}
```

Use `totalAttributeGain(dailyGains)` in Today. Use `totalAttributeGain(attributeGains)` in `PeriodFacts`, with `period === "week" ? "本周总属性增长" : "本月总属性增长"`. Because historical `PeriodFacts` already builds `attributeGains` from frozen `settlement.attributeGains`, the same UI automatically displays the frozen historical total.

- [ ] **Step 4: Run focused and full verification**

Run:

```bash
node --test tests/attribute-gains.test.mjs tests/demo-source.test.mjs
npm test
npm run typecheck
npm run build
```

Expected: all tests, typecheck, and build PASS.

- [ ] **Step 5: Commit the current-period totals**

```bash
git add web/lib/attribute-gains.ts web/app/page.tsx web/tests/attribute-gains.test.mjs web/tests/demo-source.test.mjs
git commit -m "feat: show total period attribute growth"
```

### Task 4: Activation, Real-Data Verification, and Process Cleanup

**Files:**
- Delete: `docs/superpowers/specs/2026-07-29-attribute-xp-analytics-design.md`
- Delete: `docs/superpowers/plans/2026-07-29-attribute-xp-analytics.md`
- Remove ignored session: `.superpowers/brainstorm/718-1785315799`
- Verify: `web/demo-dist/index.html`

**Interfaces:**
- Consumes: the production build and current local SQLite state.
- Produces: an active local Week UP build with a clean tracked worktree and no feature-process artifacts.

- [ ] **Step 1: Rebuild and restart the local service**

Run:

```powershell
npm run build
web\scripts\install-week-up-autostart.ps1
```

If scheduled-task registration is denied, start `run-week-up-service.ps1` as a hidden background process after stopping only the PID listening on `127.0.0.1:4173`.

- [ ] **Step 2: Verify the live bundle and analytics invariant**

Run the live state through `projectAttributeAnalytics` for every attribute and assert:

```js
for (const attribute of state.attributes) {
  const analytics = projectAttributeAnalytics(state, attribute.id, new Date());
  assert.equal(
    analytics.sources.reduce((sum, source) => sum + source.amount, 0),
    analytics.totalXp,
  );
}
```

Expected: HTTP health is `ok`, storage is `ok`, the served asset is the new build, and every attribute invariant passes.

- [ ] **Step 3: Delete process artifacts and commit final cleanup**

Stop the visual-companion server, remove its verified session directory, delete the feature spec and implementation plan, then run:

```bash
git diff --check
git status --short
git add docs/superpowers/specs/2026-07-29-attribute-xp-analytics-design.md docs/superpowers/plans/2026-07-29-attribute-xp-analytics.md
git commit -m "chore: remove attribute analytics process docs"
```

Expected: no feature process document or visual session remains and the tracked worktree is clean.
