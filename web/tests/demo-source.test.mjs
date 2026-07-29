import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { levelFromTotalXp, movingAverage } from "../lib/demo-model.ts";
import { clusterCalendarPlans, projectCalendarCluster, rescheduleRange } from "../lib/calendar-layout.ts";
import { CATEGORY_PALETTE, colorForCategory } from "../lib/category-palette.ts";

test("projects badge levels with the approved shared curve", () => {
  assert.deepEqual(levelFromTotalXp(0), { level: 1, xpInLevel: 0, xpForNext: 10, percent: 0 });
  assert.deepEqual(levelFromTotalXp(25), { level: 3, xpInLevel: 0, xpForNext: 20, percent: 0 });
  assert.deepEqual(levelFromTotalXp(37), { level: 3, xpInLevel: 12, xpForNext: 20, percent: 60 });
});

test("calculates the weight moving average without inventing missing values", () => {
  const entries = [
    { date: "2026-07-14", label: "周二", value: 58.8 },
    { date: "2026-07-16", label: "周四", value: 58.4 },
  ];
  assert.deepEqual(movingAverage(entries), [null, 58.6]);
});


test("groups overlapping calendar plans into non-overlapping display blocks", () => {
  const plans = [
    { id: "a", start: "08:00", end: "09:00", title: "A", detail: "", category: "测试", completed: false, rewards: [] },
    { id: "b", start: "08:00", end: "09:00", title: "B", detail: "", category: "测试", completed: false, rewards: [] },
    { id: "c", start: "08:30", end: "09:30", title: "C", detail: "", category: "测试", completed: false, rewards: [] },
    { id: "d", start: "09:30", end: "10:30", title: "D", detail: "", category: "测试", completed: false, rewards: [] },
  ];
  const clusters = clusterCalendarPlans(plans);
  assert.equal(clusters.length, 2);
  assert.deepEqual(clusters.map((cluster) => cluster.plans.map((plan) => plan.id)), [["a", "b", "c"], ["d"]]);
  const first = projectCalendarCluster(clusters[0]);
  const second = projectCalendarCluster(clusters[1]);
  assert.ok(first.topPercent + first.heightPercent < second.topPercent);
});

test("keeps late-night plans inside the full calendar grid", () => {
  const [cluster] = clusterCalendarPlans([{ id: "late", start: "23:30", end: "00:30", title: "夜间复盘", detail: "", category: "生活", completed: false, rewards: [] }]);
  const position = projectCalendarCluster(cluster);
  assert.ok(position.topPercent > 95 && position.topPercent < 100);
  assert.ok(position.heightPercent > 0);
  assert.ok(position.topPercent + position.heightPercent <= 100);
});

test("quick scheduling preserves the original duration", () => {
  const result = rescheduleRange("2026-07-22", "19:30", "2026-07-22T00:00:00+08:00", "2026-07-22T01:30:00+08:00");
  assert.equal(result.startAt, "2026-07-22T19:30:00+08:00");
  assert.equal(Date.parse(result.endAt) - Date.parse(result.startAt), 90 * 60 * 1000);
});

test("uses one stable expanded palette for badge and schedule categories", () => {
  assert.equal(CATEGORY_PALETTE.length, 10);
  assert.equal(colorForCategory("课程学习"), colorForCategory("课程学习"));
  assert.notEqual(colorForCategory("课程学习"), colorForCategory("身体"));
});

test("contains the complete Week UP demo surface", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  for (const label of ["今日计划", "时间轨迹", "本周目标", "本月方向", "行动配置", "成长图鉴", "体重趋势"]) {
    assert.match(page, new RegExp(label));
  }
  assert.match(page, /const INITIAL_ATTRIBUTES: Attribute\[\] = \[\]/);
  assert.match(page, /const INITIAL_PLANS: PlanItem\[\] = \[\]/);
  assert.match(page, /const INITIAL_WEIGHTS: WeightEntry\[\] = \[\]/);
  assert.match(page, /生活探险家/);
  assert.doesNotMatch(page, /行动成长系统/);
  assert.match(page, /今天也有/);
  assert.match(page, /新事物可以探索/);
  assert.match(page, /挑一件先出发吧/);
  assert.match(page, /今天还没有计划/);
  assert.match(page, /技能书收藏架/);
});

test("keeps navigation ordered and weight accessible only from Today", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const navigation = page.match(/const NAV_ITEMS:[\s\S]*?= \[([\s\S]*?)\];/)?.[1] ?? "";
  const ids = [...navigation.matchAll(/id: "([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(ids, ["today", "calendar", "week", "month", "action-config", "growth"]);
  assert.doesNotMatch(navigation, /id: "weight"/);
  assert.match(page, /onOpenWeight=\{\(\) => setTab\("weight"\)\}/);
});

test("uses one cache-free canonical loopback entry on a strict fixed port", async () => {
  const [config, packageJson] = await Promise.all([
    readFile(new URL("../vite.demo.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  const scripts = JSON.parse(packageJson).scripts;
  assert.match(config, /CANONICAL_HOST = "127\.0\.0\.1"/);
  assert.match(config, /CANONICAL_PORT = 4173/);
  assert.match(config, /hostname === "localhost"/);
  assert.match(config, /Cache-Control", "no-store/);
  assert.equal((config.match(/strictPort: true/g) ?? []).length, 2);
  assert.match(scripts.start, /npm run build/);
  assert.match(scripts.start, /server\/server\.mjs/);
  assert.notEqual(scripts.start, scripts.dev);
});

test("splits action configuration into three tabs and manages badge categories", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const tabsStart = page.indexOf('className="action-config-tabs"');
  const tabs = page.slice(tabsStart, tabsStart + 1800);
  assert.ok(tabs.indexOf("行动项目") < tabs.indexOf("课程设置"));
  assert.ok(tabs.indexOf("课程设置") < tabs.indexOf("属性徽章"));
  assert.match(page, /徽章类别管理/);
  assert.match(page, /徽章类别<select/);
  assert.match(page, /badgeColorValue\(attribute\.color\)/);
  assert.match(page, /枚徽章将移入“未分类”/);
  assert.match(page, /项目类别管理/);
  assert.match(page, /projectCategories/);
  assert.match(page, /<details className="pixel-card category-manager-collapse">/);
  assert.match(page, /projectCategories\.map\(\(item\) => <option/);
  assert.match(page, /onClick=\{\(\) => onQuickAdd\(activeWeekGoalLinkIds\)\}>＋ 安排行动/);
});

test("highlights the desktop launch entry and groups compact reward tiles", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /desktopLabel: "立即出发！"/);
  assert.match(page, /item\.desktopLabel \?\? item\.label/);
  assert.match(page, /className="mobile-nav"[\s\S]*?\{item\.label\}/);
  assert.match(css, /button\.nav-launch/);
  assert.match(page, /className="modal-field-row project-meta-row"/);
  assert.match(page, /reward-category-group/);
  assert.match(page, /reward-tile-grid/);
  assert.match(page, /Number\(value\) > 0 \? " is-active"/);
  assert.match(page, /<em>XP<\/em>/);
  assert.match(css, /grid-template-columns: repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css, /reward-tile-grid \{ grid-template-columns: repeat\(2,minmax\(0,1fr\)\)/);
});

test("offers a collapsed library of 60 distinct semantic badge icons", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const groups = page.match(/const PIXEL_SYMBOL_GROUPS = \[([\s\S]*?)\] as const;/)?.[1] ?? "";
  assert.equal([...groups.matchAll(/\["[^"]+", "[^"]+"\]/g)].length, 60);
  assert.match(page, /useState\(false\).*symbolsOpen|symbolsOpen, setSymbolsOpen/s);
  assert.match(page, /展开 \$\{PIXEL_SYMBOLS\.length\} 个/);
  assert.match(page, /mode === "month"/);
  assert.match(page, /month-calendar__grid/);
});

test("keeps month calendar focused on completed content and batches Learning MORE feedback", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /plansForDate\(key\)\.filter\(\(plan\) => plan\.completed\)/);
  assert.match(page, /另有 \{cell\.plans\.length - 3\} 项完成/);
  assert.match(page, /seenLearningCompletionsRef/);
  assert.match(page, /KNOWLEDGE COMBO/);
  assert.match(page, /连续收获！/);
  assert.match(page, /重复同步不会重复获得经验/);
});

test("celebrates a completed action with focused XP and restrained pixel styling", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /QUEST CLEAR!/);
  assert.match(page, /成长已收入图鉴/);
  assert.match(page, /COMPLETION_CHEERS/);
  assert.match(page, /继续出发/);
  assert.doesNotMatch(page, /completion-confetti/);
  assert.doesNotMatch(css, /@keyframes confetti-pop/);
  assert.doesNotMatch(css, /@keyframes xp-pulse/);
  assert.match(css, /\.settlement-card--single \{ border-top: 7px solid var\(--yellow\)/);
});

test("keeps successful AI harvests read-only and removes the unused notification control", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /按当前风格重新生成/);
  assert.doesNotMatch(page, /className="harvest-regenerate"/);
  assert.doesNotMatch(page, /aria-label="通知"/);
});

test("lays out AI harvests as readable two-cell journals on wide screens", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /function HarvestJournal/);
  assert.match(page, /本期足迹/);
  assert.match(page, /成长结算/);
  assert.match(css, /\.harvest-journal \{[^}]*grid-template-columns: repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /\.harvest-journal p \{[^}]*font-size: 12px/);
});

test("opens the month calendar directly from the month dashboard", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const monthDashboard = page.slice(page.indexOf("function MonthDashboard"), page.indexOf("function CalendarView"));
  assert.match(monthDashboard, /打开月日历/);
  assert.doesNotMatch(monthDashboard, /＋ 月方向/);
  assert.match(page, /onOpenCalendar=\{\(\) => openCalendar\("month"\)\}/);
  assert.match(page, /<CalendarView plans=\{calendarContent === "timeline" \? weekUp\.view\.timelinePlans : plans\} unconfiguredPlans=\{plans\} untimedCompletionPlans=\{weekUp\.view\.timelinePlans\} settledDates=\{weekUp\.state\.dailySettlements\.map/);
});

test("offers one visually integrated quick weight entry until today is recorded", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /const hasTodayWeight = weights\.some\(\(entry\) => entry\.date === currentLocalDate\(\)\)/);
  assert.match(page, /!hasTodayWeight && <QuickWeightEntry initialValue=\{latest\?\.value\} onSave=\{onRecordWeight\} \/>/);
  assert.match(page, /className="weight-form weight-form--quick"/);
  assert.match(page, /保存记录/);
  assert.match(page, /onRecordWeight=\{addWeight\}/);
  const weightView = page.slice(page.indexOf("function WeightView"), page.indexOf("function RewardAttributeTiles"));
  assert.doesNotMatch(weightView, /className="weight-form"/);
  assert.match(css, /\.weight-form--quick \{[^}]*width: min\(100%,240px\)/);
  assert.match(css, /\.weight-form--quick input:focus, \.weight-form--quick input:focus-visible \{ outline: none; box-shadow: none; \}/);
  assert.match(css, /\.weight-form--quick \.pixel-button \{[^}]*min-height: 38px/);
});

test("allows an inline correction only for today's weight record", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  const weightView = page.slice(page.indexOf("function WeightView"), page.indexOf("function RewardAttributeTiles"));
  assert.match(weightView, /const todayKey = currentLocalDate\(\)/);
  assert.match(weightView, /const isToday = entry\.date === todayKey/);
  assert.match(weightView, /aria-label="修正今日体重"/);
  assert.match(weightView, /onCorrectToday\(Math\.round\(parsedTodayValue \* 10\) \/ 10\)/);
  assert.match(page, /onCorrectToday=\{addWeight\}/);
  assert.match(css, /\.weight-history-editor \{/);
  assert.match(css, /\.weight-history-edit \{/);
});

test("keeps unscheduled plans outside time slots and uses one clickable time ticket", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /className="unscheduled-dock"/);
  assert.match(page, /plan\.timeStatus === "unscheduled"/);
  assert.match(page, /expandCalendarSegments\(allDayPlans\.filter/);
  assert.doesNotMatch(page, /className="calendar-overflow"/);
  assert.doesNotMatch(page, /className="quick-schedule"/);
  assert.doesNotMatch(page, /onQuickSchedule=\{quickSchedulePlan\}/);
  assert.match(page, /点击时间票券直接设置/);
  assert.match(page, /plan-time--button/);
  assert.match(css, /\.unscheduled-dock/);
  assert.match(css, /\.drawer-plan__time \{[^}]*background: var\(--yellow\)/);
  assert.match(css, /button\.drawer-plan__time \{ cursor: pointer; \}/);
  assert.match(css, /button\.drawer-plan__time:hover, button\.drawer-plan__time:focus-visible/);
  assert.doesNotMatch(css, /\.drawer-plan__time\.is-unscheduled \{[^}]*font-family/);
  assert.match(css, /\.dashboard-action-list \{[^}]*grid-template-columns: repeat\(2,minmax\(0,1fr\)\)/);
});

test("shows untimed completion facts in the Timeline top area", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /\{content === "schedule" && <div className="unscheduled-dock">/);
  assert.match(page, /content === "timeline" \? "未配置时间" : "待安排"/);
  assert.match(page, /const count = unconfiguredPlansForDate\(date\.key\)\.length/);
  assert.match(page, /const countDescription = content === "timeline" \? "项未配置时间任务"/);
  assert.match(page, /content === "timeline" \? "未配置时间任务" : "待安排"/);
  assert.match(page, /unconfiguredPlans=\{plans\}/);
  assert.match(page, /selectUnconfiguredPlansForDate/);
  assert.match(page, /settledDates=\{weekUp\.state\.dailySettlements\.map/);
  assert.match(page, /selectedUnscheduled\.map\(\(plan\) => <CalendarDrawerPlan[^>]*mode=\{mode\} onEditPlan=\{onEditPlan\}/);
});

test("does not hide non-overlapping calendar plans behind a fixed-count overflow ticket", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /const visiblePlans = timedPlans\.slice\(0, 6\)/);
  assert.match(page, /const visiblePlans = timedPlans;/);
});

test("keeps weekly action card types in separate ordered rows", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /actionKindOrder = \["recurring", "single", "course"\] as const/);
  assert.match(page, /\[false, true\]\.flatMap/);
  assert.match(page, /actionEntryIsComplete\(entry\) === completed/);
  assert.match(page, /dashboard-action-list--\$\{group\.kind\}/);
  assert.match(css, /\.dashboard-action-groups \{[^}]*flex-direction: column/);
});

test("shows direct action progress on monthly directions", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  const start = page.indexOf("function MonthDashboard");
  const end = page.indexOf("function GrowthView", start);
  const monthDashboard = page.slice(start, end > start ? end : undefined);
  assert.ok(start >= 0, "MonthDashboard should exist");
  assert.match(monthDashboard, /goalIds\.includes\(goal\.id\)/);
  assert.match(monthDashboard, /个关联行动 · 完成/);
  assert.match(monthDashboard, /linkedMonthPlans/);
  assert.match(monthDashboard, /month-link-groups/);
  assert.match(monthDashboard, /selectedMonthGoalId/);
  assert.match(monthDashboard, /setSelectedMonthGoalId\(goal\.id\)/);
  assert.match(monthDashboard, /activeMonthGoal\.id/);
  assert.match(monthDashboard, /aria-controls="month-direction-links"/);
  assert.match(css, /\.dashboard-goal-card\.is-active/);
  assert.ok(monthDashboard.indexOf("WEEK QUEST") < monthDashboard.indexOf("ACTION</span><b>具体行动"), "weekly goals should render before concrete actions");
});

test("keeps one monthly growth section followed by contribution and weight", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const factsStart = page.indexOf("function PeriodFacts");
  const factsEnd = page.indexOf("function WeekDashboard", factsStart);
  const periodFacts = page.slice(factsStart, factsEnd);
  const monthStart = page.indexOf("function MonthDashboard");
  const monthEnd = page.indexOf("function GrowthView", monthStart);
  const monthDashboard = page.slice(monthStart, monthEnd > monthStart ? monthEnd : undefined);
  assert.doesNotMatch(monthDashboard, /month-growth-panel|属性成长图谱/);
  assert.match(monthDashboard, /afterGrowth=/);
  assert.ok(periodFacts.indexOf("review-gains") < periodFacts.indexOf("{afterGrowth}"), "monthly follow-up modules should follow attribute growth");
  assert.ok(periodFacts.indexOf("{afterGrowth}") < periodFacts.indexOf("review-harvest"), "monthly follow-up modules should precede the harvest");
  assert.ok(monthDashboard.indexOf("contribution-panel") < monthDashboard.indexOf("month-weight-panel"), "project contribution should precede weight trend");
});

test("opens full atlas badges into one desktop attribute analytics page", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  const analyticsStart = page.indexOf("function AttributeAnalyticsView");
  const analyticsEnd = page.indexOf("function GrowthView", analyticsStart);
  const analytics = page.slice(analyticsStart, analyticsEnd);
  assert.match(analytics, /function AttributeAnalyticsView/);
  assert.match(analytics, /projectAttributeAnalytics/);
  assert.match(analytics, /返回成就图鉴/);
  assert.match(analytics, /attribute-analytics-nav/);
  assert.doesNotMatch(analytics, /attribute-analytics-title/);
  assert.doesNotMatch(analytics, /ATTRIBUTE ANALYTICS|徽章增量分析/);
  assert.match(analytics, /30 日累计趋势/);
  assert.match(analytics, /每周增量/);
  assert.match(analytics, /来源构成/);
  assert.match(analytics, /增长节奏/);
  assert.match(analytics, /<strong>4<small>周<\/small><\/strong>/);
  assert.match(analytics, /<strong>\{analytics\.totalXp\}<small>XP<\/small><\/strong>/);
  assert.match(analytics, /<strong>\{analytics\.activeDates\.length\}<small>个活跃日<\/small><\/strong>/);
  assert.match(analytics, /comparisonMetric\.unit/);
  assert.match(css, /\.analytics-panel-heading > strong \{[^}]*font-family: "Microsoft YaHei UI","PingFang SC",sans-serif;[^}]*font-size: 16px/);
  assert.match(css, /\.analytics-panel-heading > strong small \{[^}]*font-size: 9px/);
  assert.match(analytics, /const \[visibleSourceCount, setVisibleSourceCount\] = useState\(5\)/);
  assert.match(analytics, /展开其余/);
  assert.match(analytics, /收起来源记录/);
  assert.doesNotMatch(analytics, /下一页 →/);
});

test("adds one desktop all-attribute overview beside individual badge analytics", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  const overviewStart = page.indexOf("function AttributeOverviewView");
  const overviewEnd = page.indexOf("function AttributeAnalyticsView", overviewStart);
  const overview = page.slice(overviewStart, overviewEnd);
  const growthStart = page.indexOf("function GrowthView");
  const growthEnd = page.indexOf("function WeightView", growthStart);
  const growth = page.slice(growthStart, growthEnd);
  assert.match(page, /function AttributeOverviewView/);
  assert.match(page, /projectAttributeOverview/);
  assert.equal(overview.match(/全属性数据总览/g)?.length, 1);
  assert.match(overview, /ATTRIBUTE OVERVIEW/);
  assert.ok(
    overview.indexOf('className="attribute-analytics-nav"') < overview.indexOf('className="attribute-overview-hero pixel-card"'),
    "overview back navigation should sit above the overview banner",
  );
  const overviewHero = overview.slice(
    overview.indexOf('className="attribute-overview-hero pixel-card"'),
    overview.indexOf('<div className="attribute-analytics-grid">'),
  );
  assert.doesNotMatch(overviewHero, /analytics-back/);
  assert.doesNotMatch(overview, /FULL ATTRIBUTE MAP|看见属性存量|总览使用与单枚徽章/);
  assert.match(overview, /overview-category-donut/);
  assert.match(overview, /overview-level-distribution/);
  assert.match(overview, /各项属性总 XP/);
  assert.doesNotMatch(overview, /全属性累计趋势|近 30 日增长排行/);
  assert.match(overview, /slice\(0, 8\)/);
  assert.match(overview, /展开其余/);
  assert.match(overview, /收起属性明细/);
  assert.match(css, /\.attribute-overview-hero h1 \{[^}]*font-size: clamp\(24px,2\.6vw,36px\)/);
  assert.match(overview, /const totalChartWidth = totalChartSlotCount <= 30 \? "100%" : `\$\{\(totalChartSlotCount \/ 30\) \* 100\}%`/);
  assert.match(overview, /"--chart-width": totalChartWidth/);
  assert.match(overview, /"--bar-height": `\$\{barHeight\}%`/);
  assert.match(overview, /<i style=\{\{ "--bar-height": `\$\{barHeight\}%` \} as CSSProperties\}><b>\{item\.totalXp\}<\/b><em/);
  assert.match(css, /\.overview-total-bars \{[^}]*width: var\(--chart-width\)[^}]*min-width: var\(--chart-width\)[^}]*grid-template-columns: repeat\(var\(--attribute-count\),minmax\(0,1fr\)\)[^}]*margin: 0 auto/);
  assert.match(css, /\.overview-total-bars button > i \{[^}]*width: min\(58%,44px\)/);
  assert.match(css, /\.overview-total-bars button > i > b \{[^}]*bottom: calc\(var\(--bar-height\) \+ 5px\)/);
  assert.match(growth, /category-summary-row/);
  assert.match(growth, /analyticsEnabled && section === "badges"/);
  const pageTitle = growth.slice(growth.indexOf('<div className="page-title">'), growth.indexOf('<div className="growth-subtabs"'));
  assert.doesNotMatch(pageTitle, /属性总览/);
  assert.doesNotMatch(pageTitle, /collection-count/);
});

test("renders weekly gains inside a fixed chart slot and does not draw a purple badge frame", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /<i><span style=\{\{ height:/);
  assert.match(css, /\.attribute-week-bars > div \{[^}]*grid-template-rows:/);
  assert.match(css, /\.attribute-week-bars i > span/);
  assert.doesNotMatch(css, /\.badge-card--openable:hover,[^{]*\{[^}]*outline:/);
});

test("only full atlas badges receive the analytics open action", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const growthStart = page.indexOf("function GrowthView");
  const growthEnd = page.indexOf("function WeightView", growthStart);
  const growth = page.slice(growthStart, growthEnd);
  const todayStart = page.indexOf("function TodayView");
  const todayEnd = page.indexOf("function GoalsView", todayStart);
  const today = page.slice(todayStart, todayEnd);
  assert.match(growth, /onOpen=/);
  assert.doesNotMatch(today, /onOpen=/);
});

test("shows one total attribute gain beside daily, weekly, and monthly breakdowns", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /今日总属性增长/);
  assert.match(page, /本周总属性增长/);
  assert.match(page, /本月总属性增长/);
  assert.match(page, /totalAttributeGain/);
  assert.match(page, /今日属性值<span className="growth-up-accent">UP！<\/span>/);
  assert.match(css, /\.growth-up-accent\s*\{[^}]*color:\s*var\(--pink\)[^}]*white-space:\s*nowrap/);
});

test("keeps destructive modal actions consistent and on one line", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(page, /归档项目/);
  assert.match(page, /<span>×<\/span>移除项目<\/button>/);
  assert.match(page, /className="archive-button"[^>]*><span>▣<\/span>归档属性/);
  assert.match(page, /<span>×<\/span>移除属性<\/button>/);
  assert.match(page, /归档目标/);
  assert.match(page, /移除目标/);
  assert.match(page, /归档方向/);
  assert.match(page, /移除方向/);
  assert.match(page, /<span>×<\/span>移除计划<\/button>/);
  assert.match(css, /\.modal-actions > button \{ white-space: nowrap; \}/);
  assert.match(css, /\.archive-button \{[^}]*flex: 0 0 auto;[^}]*white-space: nowrap/);
  assert.match(css, /\.series-cancel-button, \.series-update-button \{[^}]*white-space: nowrap/);
  assert.match(css, /\.project-modal \.modal-actions \{[^}]*grid-template-columns: auto minmax\(0,1fr\)/);
  assert.match(css, /\.attribute-modal \.modal-actions \{[^}]*grid-template-columns: repeat\(2,auto\) minmax\(0,1fr\)/);
});

test("switches weekly goals and shows their directly linked actions", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  const start = page.indexOf("function WeekDashboard");
  const end = page.indexOf("function monthWeekSlices", start);
  const weekDashboard = page.slice(start, end);
  assert.ok(start >= 0, "WeekDashboard should exist");
  assert.match(weekDashboard, /selectedWeekGoalId/);
  assert.match(weekDashboard, /activeWeekGoalPlans/);
  assert.match(weekDashboard, /activeWeekGoalLinkIds/);
  assert.match(weekDashboard, /activeWeekGoal\.linkedGoalIds\.filter/);
  assert.match(weekDashboard, /goal\.period === "month"/);
  assert.match(weekDashboard, /goalIds\.includes\(activeWeekGoal\.id\)/);
  assert.match(weekDashboard, /setSelectedWeekGoalId\(goal\.id\)/);
  assert.match(weekDashboard, /aria-controls="week-goal-links"/);
  assert.match(weekDashboard, /dashboard-goal-card/);
  assert.doesNotMatch(weekDashboard, /goal-action-switcher/);
  assert.match(weekDashboard, /goal-action-list/);
  assert.match(css, /\.goal-action-panel/);
  assert.doesNotMatch(css, /\.goal-action-switcher/);
  assert.match(css, /\.dashboard-goal-card\.is-active/);
  assert.match(css, /\.goal-action-list/);
});

test("prefills the selected weekly goal and its linked month directions when scheduling an action", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /initialGoalIds = \[\]/);
  assert.match(page, /new Set\(initialGoalIds\.filter/);
  assert.match(page, /setQuickAddGoalIds\(\[\.\.\.goalIds\]\)/);
  assert.match(page, /initialGoalIds=\{quickAddGoalIds\}/);
  assert.match(page, /onQuickAdd=\{\(goalIds\) => openQuickAdd\(goalIds\)\}/);
});

test("supports multiple execution segments with one final plan settlement", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /function TimeSegmentsEditor/);
  assert.match(page, /＋ 增加时间段/);
  assert.match(page, /type: "plan\.segment\.complete"/);
  assert.match(page, /分段 \{completedSegments\}\/\{segments\.length\}/);
  assert.match(page, /expandCalendarSegments/);
  assert.match(css, /\.time-segment-editor/);
  assert.match(css, /\.segment-complete-button/);
});

test("confirms execution time only for plans without configured time", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const completionFlow = page.slice(page.indexOf("const dispatchPlanCompletion ="), page.indexOf("const undoPlan ="));
  assert.match(completionFlow, /record\.timeStatus === "unscheduled"/);
  assert.match(completionFlow, /setExecutionEditor\(\{ plan: record/);
  assert.match(completionFlow, /type: "plan\.segment\.complete"/);
  assert.match(completionFlow, /type: "plan\.complete"/);
  assert.match(completionFlow, /weekUp\.dispatch\(command\)\.then/);
});

test("keeps original edit times and allows every plan editor to clear them", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  const timeEditorsAllowingUnscheduled = page.match(/<TimeSegmentsEditor[^>]*allowUnscheduled/g) ?? [];
  assert.equal(timeEditorsAllowingUnscheduled.length, 3);
  assert.match(page, /initial\.timeStatus === "unscheduled" \? "" : start\.time/);
  assert.doesNotMatch(page, /patch: \{ \.\.\.value, timeStatus: "scheduled" \}/);
  assert.match(page, /暂不安排具体时间/);
  assert.match(css, /\.clear-time-segments/);
});

test("offers recurring actions, protected series cancellation, and four visible project rewards", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /每周指定星期/);
  assert.match(page, /生成重复计划/);
  assert.match(page, /plan\.recurrence\.cancel/);
  assert.match(page, /plan\.recurrence\.update/);
  assert.match(page, /批量删除/);
  assert.match(page, /批量保存/);
  assert.match(page, /maxVisible=\{4\}/);
  assert.match(page, /function RewardChips\(\{ rewards, attributes, maxVisible = 4 \}/);
  assert.match(css, /\.manage-projects-button/);
  assert.match(css, /\.recurrence-editor/);
});

test("keeps dense data progressively disclosed without shipping a pressure-test mode", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /stressMode|压力测试|TEST MODE/);
  assert.match(page, /slice\(0, 3\)/);
  assert.match(page, /slice\(0, 5\)/);
  assert.match(page, /slice\(0, 6\)/);
  assert.match(page, /pageSize = 50/);
  assert.match(page, /downsampleEntries\(rangeEntries, 60\)/);
  assert.doesNotMatch(page, /搜索徽章|分类内排序|attribute-toolbar/);
  assert.match(page, /按属性类别筛选/);
  assert.match(page, /setSelectedCategory\("all"\)/);
  assert.match(page, /aria-pressed=\{activeCategory === category\}/);
  assert.match(page, /attribute-category-section/);
  assert.match(page, /group\.items\.slice\(0, 3\)/);
  assert.match(page, /展开本类其余/);
  assert.match(page, /mobile-agenda/);
});

test("keeps Candy Arcade and accessibility constraints", async () => {
  const [css, html, packageJson] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(css, /--pink: #ff4d9e/);
  assert.match(css, /--cyan: #85f2ff/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /min-height: 44px/);
  assert.match(html, /lang="zh-CN"/);
  assert.match(html, /Week UP — 让每一次行动都看得见/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});

test("styles linked goals as roomy selectable pixel cards", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.goal-links \{[^}]*max-height: 196px/);
  assert.match(css, /\.goal-links \{[^}]*margin-top: 22px/);
  assert.match(css, /\.goal-links \.check-row:has\(input:checked\)/);
  assert.match(css, /\.goal-links \.check-row input \{[^}]*appearance: none/);
});

test("defaults every quick-add form to a temporary plan", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /const \[projectId, setProjectId\] = useState\(""\);/);
  assert.match(page, /<option value="">临时计划（不使用项目）<\/option>/);
  assert.doesNotMatch(page, /projects\[0\]\?\.id \?\? ""/);
  assert.doesNotMatch(page, /initialProjectId|quickAddProjectId/);
});
