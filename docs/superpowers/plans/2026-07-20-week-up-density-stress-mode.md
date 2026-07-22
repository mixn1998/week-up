# Week UP Density Stress Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有空白 Web Demo 中增加可开关的高数据量压力模式，同时验证 30 个属性、50 项周日程和 365 天历史数据下的信息密度与交互兜底。

**Architecture:** 新增纯函数压力数据生成器，页面根状态保存进入压力模式前的快照并在关闭时原样恢复。属性、今日计划、周日历、回顾和体重视图分别只消费切片、分组或下采样后的数据，避免一次渲染完整历史。

**Tech Stack:** React 19、TypeScript、Vite 8、CSS、Node Test Runner。

## Global Constraints

- 压力数据固定生成 30 个属性、50 项周日程和 365 天体重历史。
- 压力数据不得写入正式数据存储或同步队列；关闭模式必须恢复进入前的数据。
- 今日页最多展示 4 个置顶或最近增长属性。
- 奖励标签最多直接展示 3 个，其余显示“+N”。
- 当日计划超过 8 项时已完成默认折叠；超过 20 项时分批渲染。
- 单日周历最多直接展示 6 项；同一时间最多展示 3 项，其余通过“+N”访问。
- 回顾事实默认展示 5 条；历史流水每页最多 50 条。
- 长周期图表按可见范围切片并下采样，统计仍使用原始数据。
- 保持糖果电玩色板、3 px 描边、硬阴影、44 px 交互热区和减少动画支持。

---

### Task 1: Deterministic Stress Data and Projection Helpers

**Files:**
- Modify: `web/lib/demo-model.ts`
- Create: `web/lib/stress-data.ts`
- Modify: `web/tests/demo-source.test.mjs`

**Interfaces:**
- Produces: `createStressData(): { attributes: Attribute[]; plans: PlanItem[]; weights: WeightEntry[] }`.
- Produces: `downsampleEntries(entries: WeightEntry[], maxPoints: number): WeightEntry[]`.
- Extends: `Attribute` with `category`, `pinned`, `lastGainedAt`; `PlanItem` with `dayIndex`, `scheduleGroup`.

- [ ] **Step 1: Write failing count and determinism tests**

```js
const first = createStressData();
const second = createStressData();
assert.equal(first.attributes.length, 30);
assert.equal(first.attributes.filter((item) => item.pinned).length, 4);
assert.equal(first.plans.length, 50);
assert.equal(first.weights.length, 365);
assert.deepEqual(first, second);
```

- [ ] **Step 2: Run tests and confirm the missing export failure**

Run: `npm test`

Expected: FAIL because `createStressData` and `downsampleEntries` are not exported.

- [ ] **Step 3: Implement deterministic generators and downsampling**

Use fixed title/category arrays and index-derived timestamps. `downsampleEntries` divides the input into equal buckets and retains first, minimum, maximum, and last entries in chronological order without duplicate dates.

- [ ] **Step 4: Run tests and commit**

Run: `npm test`

Expected: all stress data and existing model tests PASS.

Commit: `feat: add deterministic Week UP stress data`

---

### Task 2: Reversible Stress Mode and Dense Today View

**Files:**
- Modify: `web/app/page.tsx`
- Modify: `web/app/globals.css`
- Modify: `web/tests/demo-source.test.mjs`

**Interfaces:**
- Consumes: `createStressData`.
- Produces: root callbacks `enableStressMode(): void` and `disableStressMode(): void`.
- Produces: grouped today plan rendering and expandable reward chips.

- [ ] **Step 1: Add a failing source contract for the stress toggle**

Assert that the page contains “压力测试”, “30 属性”, “50 日程”, “365 天” and a snapshot restore ref.

- [ ] **Step 2: Implement reversible root state**

Before enabling, store `{ plans, attributes, weights }` in a `useRef`; replace live state with `createStressData()`. On disable, restore the ref exactly and clear it.

- [ ] **Step 3: Implement dense Today behavior**

Group plans as “正在进行、接下来、稍后、已完成”. Keep the first three groups open, collapse completed by default when the day has more than 8 plans, and render pending items in batches of 20. Show four pinned/recent badges and a correct “全部 N 项” count.

- [ ] **Step 4: Implement reward chip overflow**

Render the first three rewards and a keyboard-operable “+N” button. Expanding shows all rewards without changing plan completion behavior.

- [ ] **Step 5: Test, build, and commit**

Run: `npm test && npm run build`

Expected: tests pass and Vite production build succeeds.

Commit: `feat: add reversible density stress mode`

---

### Task 3: Attribute Search, Calendar Overflow, and Mobile Agenda

**Files:**
- Modify: `web/app/page.tsx`
- Modify: `web/app/globals.css`
- Modify: `web/tests/demo-source.test.mjs`

**Interfaces:**
- Consumes: extended attributes and plans.
- Produces: searchable/sortable attribute collection, capped calendar columns, and responsive agenda view.

- [ ] **Step 1: Add attribute density controls**

Provide search, category filter, pinned/level/recent sort, and an initial 24-badge window with an explicit “显示剩余 N 项” action.

- [ ] **Step 2: Add deterministic calendar overflow**

Group by `dayIndex` and start time. Show at most three plans per identical start time and at most six visible blocks per day, with correct “+N” controls for both limits.

- [ ] **Step 3: Add mobile agenda fallback**

Below 820 px, hide the seven-column grid and show date-grouped agenda rows. All 50 plans remain reachable by day expansion.

- [ ] **Step 4: Test, build, and commit**

Run: `npm test && npm run build`

Expected: source contracts pass and production build succeeds.

Commit: `feat: scale dense attributes and calendars`

---

### Task 4: Review Expansion, History Pagination, and Final Verification

**Files:**
- Modify: `web/app/page.tsx`
- Modify: `web/app/globals.css`
- Modify: `web/tests/demo-source.test.mjs`
- Modify: `web/README.md`

**Interfaces:**
- Consumes: stress plans, attributes, weight entries and `downsampleEntries`.
- Produces: five-item review preview, 50-row history pages, 7/30/90/365-day chart ranges, and stress-mode documentation.

- [ ] **Step 1: Implement review fact expansion**

Sort completed and incomplete plans by deterministic occurrence order, show five per section, and expose the exact remaining count before expansion.

- [ ] **Step 2: Implement chart ranges and pagination**

Add 7/30/90/365-day controls, downsample the visible chart to at most 60 points, and paginate history in 50-row pages with previous/next controls.

- [ ] **Step 3: Verify reversible isolation**

Enable pressure mode, navigate across all six views, disable it, and confirm the original empty state returns. The stress mode banner must state that data is temporary.

- [ ] **Step 4: Run final checks**

Run: `npm test`

Expected: all model, stress count, source contract and isolation tests PASS.

Run: `npm run build`

Expected: production build succeeds without TypeScript or CSS errors.

- [ ] **Step 5: Commit**

Commit: `feat: complete Week UP density verification`

