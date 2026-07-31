# Mental Model Radar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace scattered mental-model cards with one continuously evolving eight-dimension radar profile that updates from new awareness evidence.

**Architecture:** Keep `MentalModelVersion` records as internal immutable revision snapshots, but expose only the latest effective revision as the current profile. Each analysis consumes the previous complete models/profile plus newly settled facts and returns a complete merged profile. A local SVG component renders the current profile without chart dependencies.

**Tech Stack:** TypeScript, React 19, local SVG, CSS, Node test runner, Vite.

## Global Constraints

- The fixed dimension keys are `self`, `relationships`, `power`, `action`, `learning`, `values`, `vitality`, and `world`.
- Radar values describe evidence strength from 0 to 100, never personality quality, health, or ability.
- Missing dates are not imputed, and multiple entries on one date do not count as multiple independent dates.
- A month with no new evidence for a dimension must preserve the existing dimension instead of weakening or retiring it.
- The UI shows one current profile only; it must not show a version picker or previous-version overlay.
- Historical raw thought text must not be re-imported or resent during compatibility migration.
- No new chart dependency may be added.

---

### Task 1: Dimension profile domain model and compatibility derivation

**Files:**
- Modify: `web/lib/awareness.ts`
- Test: `web/tests/awareness.test.mjs`

**Interfaces:**
- Produces: `MentalModelDimensionKey`, `MentalModelDimensionProfile`, `MENTAL_MODEL_DIMENSIONS`, and `completeMentalModelDimensionProfile(models, profile?)`.
- Consumes: existing `MentalModelItem`.

- [ ] **Step 1: Write failing tests for fixed ordering, value clamping, and legacy model derivation**

```js
import {
  MENTAL_MODEL_DIMENSIONS,
  completeMentalModelDimensionProfile,
} from "../lib/awareness.ts";

test("mental profile always exposes the fixed eight dimensions", () => {
  const profile = completeMentalModelDimensionProfile([], []);
  assert.deepEqual(profile.map((item) => item.dimension), MENTAL_MODEL_DIMENSIONS.map((item) => item.key));
  assert.ok(profile.every((item) => item.strength === 0));
});

test("legacy mental models derive a complete bounded profile", () => {
  const profile = completeMentalModelDimensionProfile([{
    stableKey: "attention-control",
    name: "注意力主权",
    summary: "将注意力配置视为主体性实践。",
    triggers: [], assumptions: ["回应比控制世界重要"], defaultResponses: [],
    currentStrategies: ["收束注意力"], supportingEntryIds: [],
    counterEvidenceEntryIds: [], confidence: "high", changeType: "new",
  }]);
  assert.equal(profile.length, 8);
  assert.ok(profile.find((item) => item.dimension === "self").strength > 0);
  assert.ok(profile.every((item) => item.strength >= 0 && item.strength <= 100));
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- --test-name-pattern="mental profile|legacy mental models"`

Expected: FAIL because the exported dimension interfaces and completion helper do not exist.

- [ ] **Step 3: Add dimension types, definitions, and deterministic compatibility completion**

```ts
export type MentalModelDimensionKey =
  | "self" | "relationships" | "power" | "action"
  | "learning" | "values" | "vitality" | "world";

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

export const MENTAL_MODEL_DIMENSIONS = [/* eight fixed labels and keyword groups */] as const;

export function completeMentalModelDimensionProfile(
  models: readonly MentalModelItem[],
  supplied: readonly MentalModelDimensionProfile[] = [],
): readonly MentalModelDimensionProfile[] {
  // Validate supplied keys, clamp strength to 0..100, and fill missing keys.
  // For legacy models, map model name/summary/assumptions/strategies through
  // stable keyword groups, then compute evidence strength from confidence,
  // model count, support count, and counter-evidence.
}
```

Extend the ready analysis variant:

```ts
Readonly<{
  status: "ready";
  models: readonly MentalModelItem[];
  dimensionProfile: readonly MentalModelDimensionProfile[];
}> & AwarenessAnalysisMeta
```

- [ ] **Step 4: Run the focused tests and verify they pass**

Run: `npm test -- --test-name-pattern="mental profile|legacy mental models"`

Expected: PASS.

- [ ] **Step 5: Commit the domain model**

```bash
git add web/lib/awareness.ts web/tests/awareness.test.mjs
git commit -m "feat: add mental model dimension profile"
```

### Task 2: Incremental analysis contract and persistence

**Files:**
- Modify: `web/lib/awareness-analysis-client.ts`
- Modify: `web/server/ai-review-service.mjs`
- Modify: `web/lib/week-up-domain.ts`
- Test: `web/tests/awareness-analysis-client.test.mjs`
- Test: `web/tests/awareness.test.mjs`
- Test: `web/tests/ai-review-service.test.mjs`

**Interfaces:**
- Consumes: `MentalModelDimensionProfile` and `completeMentalModelDimensionProfile`.
- Produces: `previousDimensionProfile` in monthly facts and `dimensionProfile` in historical/monthly results and success commands.

- [ ] **Step 1: Write failing contract tests**

```js
test("monthly facts carry the complete current profile forward", () => {
  const facts = buildMonthlyAwarenessFacts(stateWithReadyPreviousProfile, thoughtReview, pendingVersion);
  assert.equal(facts.previousDimensionProfile.length, 8);
});

test("prompt requires a merged current profile rather than a monthly-only profile", () => {
  const prompt = buildAwarenessPrompt(monthlyFacts);
  assert.match(prompt, /完整当前画像/);
  assert.match(prompt, /没有新证据.*保留/);
  assert.match(prompt, /dimensionProfile/);
});

test("monthly success persists a completed eight-dimension profile", () => {
  const next = dispatchWeekUp(state, monthlySuccessCommand, context()).state;
  const ready = next.mentalModelVersions.at(-1).analysis;
  assert.equal(ready.status, "ready");
  assert.equal(ready.dimensionProfile.length, 8);
});
```

- [ ] **Step 2: Run focused analysis/domain tests and verify failure**

Run: `npm test -- --test-name-pattern="current profile|merged current profile|eight-dimension"`

Expected: FAIL because the facts, prompt, command, and persisted result do not yet carry `dimensionProfile`.

- [ ] **Step 3: Update facts and result types**

Add this field to `MonthlyAwarenessFacts`:

```ts
previousDimensionProfile: readonly MentalModelDimensionProfile[];
```

Add this field to historical/monthly result:

```ts
dimensionProfile: readonly MentalModelDimensionProfile[];
```

`buildModelFacts` must find the ready previous revision, complete its legacy profile if necessary, and pass it as `previousDimensionProfile`.

- [ ] **Step 4: Update AI prompt and response validation**

The prompt must explicitly state:

```text
previousModels 与 previousDimensionProfile 是更新前的完整当前画像。
请把本批新增记录作为增量证据，输出合并更新后的完整 models 与 dimensionProfile。
某维度没有新证据时必须保留原结论与强度；不得把本月未出现解释为弱化或退出。
每个 dimensionProfile 项必须使用固定八维键，strength 为 0—100 的证据强度。
```

The JSON result schema must include all eight dimension fields. `parseStructuredResult` must reject a non-array `dimensionProfile`; the domain layer completes missing dimensions for resilience.

- [ ] **Step 5: Persist complete profiles and migrate old snapshots on read**

Update both baseline and monthly success commands to accept `dimensionProfile`. Persist:

```ts
analysis: {
  status: "ready",
  models: command.models,
  dimensionProfile: completeMentalModelDimensionProfile(command.models, command.dimensionProfile),
  ...meta,
}
```

In `migrateWeekUpState`, map every ready legacy mental-model revision through the same helper. Keep historical raw entry collections unchanged and retain revision snapshots for rollback.

- [ ] **Step 6: Run focused tests**

Run: `npm test -- --test-name-pattern="historical baseline|awareness client|current profile|merged current profile|eight-dimension|schema"`

Expected: PASS.

- [ ] **Step 7: Commit the incremental pipeline**

```bash
git add web/lib/awareness-analysis-client.ts web/server/ai-review-service.mjs web/lib/week-up-domain.ts web/tests/awareness-analysis-client.test.mjs web/tests/awareness.test.mjs web/tests/ai-review-service.test.mjs
git commit -m "feat: evolve mental profile from new evidence"
```

### Task 3: Current-profile radar and dimension analysis UI

**Files:**
- Create: `web/app/mental-model-radar.tsx`
- Modify: `web/app/awareness-view.tsx`
- Modify: `web/app/globals.css`
- Test: `web/tests/demo-source.test.mjs`

**Interfaces:**
- Consumes: complete `MentalModelDimensionProfile[]` from the latest ready `MentalModelVersion`.
- Produces: `MentalModelRadar` and `MentalModelDimensionList`.

- [ ] **Step 1: Write failing source-structure assertions**

```js
test("mental model view renders one current radar without version comparison cards", () => {
  assert.match(awarenessSource, /MentalModelRadar/);
  assert.match(awarenessSource, /当前心智模型/);
  assert.doesNotMatch(awarenessSource, /awareness-version-strip/);
  assert.doesNotMatch(awarenessSource, /mental-model-grid/);
  assert.match(radarSource, /viewBox="0 0 640 520"/);
  assert.match(radarSource, /数值表示记录证据强度，不代表优劣/);
});
```

- [ ] **Step 2: Run the source test and verify failure**

Run: `npm test -- --test-name-pattern="current radar"`

Expected: FAIL because the radar component is absent and the version/card UI remains.

- [ ] **Step 3: Implement local SVG radar**

`MentalModelRadar` must:

```tsx
export function MentalModelRadar({ profile }: {
  profile: readonly MentalModelDimensionProfile[];
}) {
  // Render five polygon grid rings, eight axes, Chinese axis labels,
  // vertex markers, and one magenta translucent current-profile polygon.
  // Include title/desc for accessibility and preserve the fixed dimension order.
}
```

Use coordinate helpers based on center `(320, 250)` and radius `176`. If all values are zero, render the grid and a readable “当前证据不足” state without fabricating shape area.

- [ ] **Step 4: Replace cards and version picker with the current-profile layout**

Select the latest ready revision, falling back to the latest pending/failed revision for status display. The banner copy is:

```text
CURRENT MENTAL MAP
当前心智模型
在新记录上持续发展
```

Render the radar beside a compact summary of the three strongest dimensions. Below it, render a single bordered dimension table/list ordered by strength. Expand four rows by default; reveal the rest using one “展开全部维度” control. Supporting model names may appear in row details, but raw historical content must not.

- [ ] **Step 5: Add responsive pixel-style CSS**

Desktop uses a two-column radar/summary layout. At widths below `760px`, stack the summary below the radar, keep SVG labels within the viewport, reduce heading sizes, and avoid horizontal scrolling. Remove obsolete `.mental-model-grid`, `.mental-model-card`, and `.awareness-version-strip` rules.

- [ ] **Step 6: Run the source test and typecheck**

Run: `npm test -- --test-name-pattern="current radar"`

Expected: PASS.

Run: `npm run typecheck`

Expected: exit code 0.

- [ ] **Step 7: Commit the radar UI**

```bash
git add web/app/mental-model-radar.tsx web/app/awareness-view.tsx web/app/globals.css web/tests/demo-source.test.mjs
git commit -m "feat: render current mental model radar"
```

### Task 4: Full verification and active local release

**Files:**
- Modify only if verification exposes defects.

**Interfaces:**
- Consumes: completed domain, analysis, and UI implementation.
- Produces: tested build and active local runtime release.

- [ ] **Step 1: Run the complete automated suite**

Run: `npm test`

Expected: all tests pass.

Run: `npm run typecheck`

Expected: exit code 0.

Run: `npm run build`

Expected: Vite production build succeeds.

- [ ] **Step 2: Publish the local runtime release**

Run: `npm run runtime:publish`

Expected: a new release is created and activated while user data remains outside the release directory.

- [ ] **Step 3: Verify desktop layout**

Open `http://127.0.0.1:4173/`, enter 自我觉察 → 心智模型, and verify at a 1440px viewport:

- one current radar is visible;
- no version picker or comparison outline is visible;
- eight labels and the strength note are readable;
- dimension rows are aligned and only four are initially expanded.

- [ ] **Step 4: Verify 390px layout**

At a 390px viewport, verify no horizontal overflow, no axis-label collision, readable summary copy, and a usable expand/collapse control.

- [ ] **Step 5: Check persistence safety and working tree**

Confirm the active state still contains the historical source metadata and no imported historical thought entries. Run:

```bash
git status --short
```

Expected: only intentional implementation/spec/plan changes, or a clean tree after the final commit.

- [ ] **Step 6: Commit verification fixes if needed**

```bash
git add <only verified implementation files>
git commit -m "fix: polish mental model radar"
```

