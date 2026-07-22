# Week UP Web Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个可直接操作、可响应式预览的 Week UP Web Demo，用真实示例数据展示计划完成、属性经验、徽章升级、目标、回顾、技能书和体重趋势之间的核心闭环。

**Architecture:** 使用单页 React + Vite 应用承载桌面 Web 工作台，通过页面级本地状态模拟本地优先数据与即时结算。导航切换不同产品视图；任务完成、快速新增、体重录入和 Learning MORE 状态回传演示只改变当前浏览器会话，不实现真实同步和后端持久化。

**Tech Stack:** React 19、TypeScript、Vite 8、CSS、Node Test Runner、Sites 项目结构。

**Implementation status:** 2026-07-20 已完成并验证首版 Demo。由于 Windows 本地依赖安装出现文件锁，最终使用精简 Vite 客户端入口；产品交互与规格范围不受影响。

## Global Constraints

- 产品名称为 `Week UP`，界面语言为简体中文。
- 视觉方向固定为“糖果电玩”：`#FFF8EC` 背景、`#302447` 描边、`#FF4D9E` 主行动、`#85F2FF` 数据强调、`#FFE05B` 提示、`#79F2B5` 成功、`#7457FF` 导航。
- 组件遵循 8 px 间距网格、3 px 硬描边、5 px 无模糊硬阴影；不得使用渐变制造层级。
- 正文最小 14 px；交互热区不小于 44×44 px；颜色不能是状态的唯一表达。
- Demo 仅展示已经批准的范围，不加入金币、商店、装扮、怪物、战斗、装备、道具、连续打卡或 AI 建议。
- 属性经验完全由计划预设；完成计划获得全部经验，未完成不获得也不扣除。
- 徽章升级曲线为从当前等级 `L` 升到 `L+1` 需要 `5 × (L + 1)` 经验。
- Learning MORE 技能书仅作为课程完成收藏，不提供数值效果。
- Learning MORE 每日课表直接同步为 Week UP 计划，课节完成状态直接同步为对应计划的完成事实；属性奖励仍由 Week UP 用户配置。
- 体重单位固定为 kg，并区分每日值、7 日移动平均和目标体重线。
- Demo 必须在 1440×1000 桌面视口和 390×844 移动视口下保持可用。

---

### Task 1: Initialize the Web Surface and Demo Domain Model

**Files:**
- Create: `package.json`
- Create: `app/layout.tsx`
- Create: `app/page.tsx`
- Create: `app/globals.css`
- Create: `lib/demo-model.ts`
- Create: `lib/demo-model.test.ts`
- Create: `.openai/hosting.json`

**Interfaces:**
- Produces: `Attribute`, `PlanItem`, `WeightEntry`, `BadgeProgress`, `DemoState` types.
- Produces: `levelFromTotalXp(totalXp: number): BadgeProgress` and `movingAverage(entries: WeightEntry[], windowDays?: number): Array<number | null>`.

- [ ] **Step 1: Initialize the Sites React project**

Run the bundled `scripts/init-site.sh` with the Week UP directory as its target, keeping the generated package manager and lockfile.

- [ ] **Step 2: Write failing domain tests**

```ts
import { describe, expect, it } from "vitest";
import { levelFromTotalXp, movingAverage } from "./demo-model";

describe("levelFromTotalXp", () => {
  it("projects the shared progressive badge curve", () => {
    expect(levelFromTotalXp(0)).toMatchObject({ level: 1, xpInLevel: 0, xpForNext: 10 });
    expect(levelFromTotalXp(25)).toMatchObject({ level: 3, xpInLevel: 0, xpForNext: 20 });
  });
});

describe("movingAverage", () => {
  it("ignores missing calendar days and returns one decimal", () => {
    const values = movingAverage([
      { date: "2026-07-14", value: 58.8 },
      { date: "2026-07-16", value: 58.4 },
    ]);
    expect(values).toEqual([null, 58.6]);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- --run`

Expected: FAIL because `lib/demo-model.ts` does not yet export the functions.

- [ ] **Step 4: Implement the domain helpers and typed demo state**

```ts
export type AttributeReward = { attributeId: string; amount: number };
export type Attribute = { id: string; name: string; icon: string; color: string; totalXp: number };
export type PlanItem = {
  id: string;
  title: string;
  start: string;
  end: string;
  category: string;
  completed: boolean;
  rewards: AttributeReward[];
};
export type WeightEntry = { date: string; value: number };
export type BadgeProgress = { level: number; xpInLevel: number; xpForNext: number; percent: number };

export function levelFromTotalXp(totalXp: number): BadgeProgress {
  let level = 1;
  let remaining = Math.max(0, totalXp);
  let xpForNext = 5 * (level + 1);
  while (remaining >= xpForNext) {
    remaining -= xpForNext;
    level += 1;
    xpForNext = 5 * (level + 1);
  }
  return { level, xpInLevel: remaining, xpForNext, percent: (remaining / xpForNext) * 100 };
}
```

- [ ] **Step 5: Run tests and commit**

Run: `npm test -- --run`

Expected: PASS for level projection and moving average behavior.

Commit: `feat: initialize Week UP web demo`

---

### Task 2: Build the Candy Arcade Shell and Today Experience

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/globals.css`
- Create: `components/app-shell.tsx`
- Create: `components/today-dashboard.tsx`
- Create: `components/pixel-icons.tsx`

**Interfaces:**
- Consumes: `DemoState`, `PlanItem`, `BadgeProgress` from `lib/demo-model.ts`.
- Produces: `AppShell`, `TodayDashboard`, `PixelIcon` components.
- Produces callback contract `onComplete(planId: string): void` and `onQuickAdd(title: string, start: string): void`.

- [ ] **Step 1: Replace starter content with the Week UP application shell**

Build a left navigation rail, compact top status bar, and responsive mobile bottom navigation. Include “今日、目标计划、日历、周月回顾、成长收藏、体重趋势” routes as local tab state.

- [ ] **Step 2: Implement the Today dashboard**

Use concrete sample content:

```ts
const plans = [
  { title: "梳理博士论文第三章", start: "09:00", end: "10:30", category: "深度工作", rewards: [{ attributeId: "focus", amount: 2 }] },
  { title: "概率论 · 随机变量", start: "14:00", end: "15:00", category: "Learning MORE", source: "learning-more", externalStatus: "in_progress", rewards: [{ attributeId: "reasoning", amount: 2 }] },
  { title: "羽毛球训练", start: "18:30", end: "19:30", category: "运动", rewards: [{ attributeId: "agility", amount: 1 }, { attributeId: "coordination", amount: 1 }] },
];
```

Show the week direction, completion count, timeline, growth snapshot, compact weight widget, and a floating quick-add action.

Learning MORE 计划行必须显示来源标记、课程/课节信息和“已同步”状态；Demo 中提供一次“收到完成状态”的可操作演示，它走与本地完成相同的幂等结算路径，但不要求用户再次点击完成。

- [ ] **Step 3: Implement completion feedback**

When a plan is completed:

1. Mark the row completed.
2. Add each configured reward to its attribute total.
3. Open a non-blocking pixel settlement card showing the plan name and exact gains.
4. Animate the affected badge progress bar for no more than 450 ms.

- [ ] **Step 4: Implement responsive and accessible states**

Provide visible focus styles, button labels, keyboard activation, `prefers-reduced-motion` handling, and mobile stacking without horizontal scrolling.

- [ ] **Step 5: Build and commit**

Run: `npm run build`

Expected: successful production build with no TypeScript errors.

Commit: `feat: build candy arcade today dashboard`

---

### Task 3: Add Goals, Calendar, Reviews, and Growth Collection Views

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/globals.css`
- Create: `components/goals-view.tsx`
- Create: `components/calendar-view.tsx`
- Create: `components/review-view.tsx`
- Create: `components/growth-view.tsx`

**Interfaces:**
- Consumes: page tab state and the shared in-memory `DemoState`.
- Produces: read-only product views plus local demo interactions for filters and review notes.

- [ ] **Step 1: Build the goals and plan hierarchy view**

Show one monthly direction, three weekly directions, their linked plan counts, completion ratios, and editable-looking attribute reward chips. The visual hierarchy must make “月目标 → 周方向 → 具体计划” immediately understandable.

- [ ] **Step 2: Build the calendar view**

Render a seven-day weekly calendar with time columns, colored plan blocks, status labels, and a today highlight. Provide week/month toggle controls, with the month toggle changing to a compact month summary rather than a nonfunctional button.

- [ ] **Step 3: Build the structured review view**

Provide weekly/monthly tabs. Show goals, completed content, missed content, attribute gains with source plans, badge upgrades, new skillbooks, and an editable “我的感想” field. Do not generate interpretive AI copy.

- [ ] **Step 4: Build the growth collection view**

Render distinct pixel badges for专注、推理、敏捷、协调、气质 with level, current XP, next threshold, and action-source history. Add a separate Learning MORE skillbook shelf with permanent course-completion cards and explicit “仅收藏” copy.

- [ ] **Step 5: Build and commit**

Run: `npm run build`

Expected: successful build and all navigation targets render without runtime imports missing.

Commit: `feat: add planning and growth views`

---

### Task 4: Add the Weight Dashboard and Final Demo Polish

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/globals.css`
- Create: `components/weight-view.tsx`
- Modify: `app/layout.tsx`
- Delete: `app/_sites-preview/**`

**Interfaces:**
- Consumes: `WeightEntry` and `movingAverage` from `lib/demo-model.ts`.
- Produces callback contract `onAddWeight(value: number): void`.

- [ ] **Step 1: Build the weight trend view**

Show latest weight, delta from previous entry, 7-day average, target weight, an accessible chart legend, and a CSS/canvas chart that visually distinguishes raw values, moving average, and target line.

- [ ] **Step 2: Add weight input behavior**

Validate values between 20.0 and 300.0 kg, round to one decimal, update the current-day entry in local state, and recompute the displayed moving average immediately.

- [ ] **Step 3: Finalize metadata and starter cleanup**

Set the document title to `Week UP — 让每一次行动都看得见` and the description to `像素可爱风的个人行动成长系统 Web Demo`。Remove starter preview code, placeholder metadata, and unused dependencies.

- [ ] **Step 4: Run automated verification**

Run: `npm test -- --run`

Expected: all unit tests PASS.

Run: `npm run build`

Expected: production build succeeds without TypeScript or bundling errors.

- [ ] **Step 5: Verify the user-visible demo**

Open the development URL and verify:

1. Desktop layout presents the complete Today dashboard in the first viewport.
2. 390 px layout uses bottom navigation and has no horizontal overflow.
3. Completing a task changes status, attribute XP, and the settlement card exactly once.
4. Quick add creates a visible plan.
5. Every navigation entry opens a meaningful populated view.
6. Weight entry updates the latest value and chart.
7. Reduced-motion media preference disables nonessential movement.

- [ ] **Step 6: Commit the verified demo**

Commit: `feat: complete Week UP interactive web demo`
