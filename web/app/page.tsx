"use client";

import { FormEvent, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  levelFromTotalXp,
  movingAverage,
  downsampleEntries,
  type Attribute,
  type AttributeReward,
  type PlanItem,
  type WeightEntry,
} from "../lib/demo-model";
import { clusterCalendarPlans, projectCalendarCluster } from "../lib/calendar-layout";
import { CATEGORY_PALETTE, colorForCategory, paletteColorValue, readableTextColor } from "../lib/category-palette";
import { aggregateProjectCategoryContributions } from "../lib/project-contributions";
import { groupPlansByProjectCategory } from "../lib/plan-category-groups";
import { isLearningMoreCourseBundlePlan, isLearningMoreCourseComplete, isLearningMoreCoursePlan, takeVisibleGroupedRows } from "../lib/weekly-action-visibility";
import { comparePlansByExecution, earliestPlanByExecution } from "../lib/weekly-action-order";
import { attributeGainsForCompletedDate, sortAttributeRewardsByAmount } from "../lib/attribute-gains";
import { selectDailyPlans } from "../lib/daily-plan-selection";
import { overdueDisposition } from "../lib/overdue-policy";
import { summarizeWeekRouteDay } from "../lib/week-route-summary";
import { expandRecurrenceDates, recurrenceSummary, type RecurrenceRule } from "../lib/recurrence";
import { useWeekUp } from "../lib/use-week-up";
import { AiStatusControl } from "./ai-status-control";
import { ExecutionCompletionModal } from "./execution-completion-modal";
import { MilestoneRunner } from "./milestone-runner";
import { exportWeekUpBackup, importWeekUpBackup, type AttributeCategoryRecord, type AttributeRecord, type CompletionFact, type GoalRecord, type LearningMoreCourse, type LearningMoreLesson, type PlanRecord, type PlanTimeSegment, type PlanTimeSegmentInput, type ProjectRecord, type RewardUnit, type SettlementRecord, type SkillbookRecord, type WeekUpState } from "../lib/week-up-domain";

type TabId = "today" | "week" | "month" | "calendar" | "action-config" | "growth" | "weight";

const PAGE_META: Record<TabId, { icon: string; label: string; eyebrow: string }> = {
  today: { icon: "☀", label: "今日", eyebrow: "TODAY" },
  calendar: { icon: "▦", label: "时间轨迹", eyebrow: "TIMELINE" },
  week: { icon: "⚑", label: "本周目标", eyebrow: "WEEK QUEST" },
  month: { icon: "☾", label: "本月方向", eyebrow: "MONTH PATH" },
  "action-config": { icon: "⚙", label: "行动配置", eyebrow: "CONFIG" },
  growth: { icon: "◆", label: "成就图鉴", eyebrow: "ATLAS" },
  weight: { icon: "⌁", label: "体重趋势", eyebrow: "BODY TRACK" },
};

const NAV_ITEMS: Array<{ id: Exclude<TabId, "weight">; icon: string; label: string; eyebrow: string; desktopLabel?: string }> = [
  { id: "today", ...PAGE_META.today, desktopLabel: "立即出发！" },
  { id: "calendar", ...PAGE_META.calendar },
  { id: "week", ...PAGE_META.week },
  { id: "month", ...PAGE_META.month },
  { id: "action-config", icon: "⚙", label: "行动配置", eyebrow: "CONFIG" },
  { id: "growth", ...PAGE_META.growth },
];

const PIXEL_SYMBOL_GROUPS = [
  { name: "节点", items: [["mark-01", "单核"], ["mark-02", "双核"], ["mark-03", "三点"], ["mark-04", "分叉"], ["mark-05", "聚合"], ["mark-06", "环心"], ["mark-07", "四角"], ["mark-08", "六点"], ["mark-09", "星网"], ["mark-10", "中枢"]] },
  { name: "轨迹", items: [["mark-11", "上行"], ["mark-12", "折返"], ["mark-13", "跃迁"], ["mark-14", "回路"], ["mark-15", "交汇"], ["mark-16", "并行"], ["mark-17", "穿越"], ["mark-18", "阶梯"], ["mark-19", "往复"], ["mark-20", "远征"]] },
  { name: "网格", items: [["mark-21", "方格"], ["mark-22", "十字"], ["mark-23", "对角"], ["mark-24", "菱格"], ["mark-25", "边界"], ["mark-26", "坐标"], ["mark-27", "矩阵"], ["mark-28", "层级"], ["mark-29", "框架"], ["mark-30", "拼合"]] },
  { name: "波形", items: [["mark-31", "脉冲"], ["mark-32", "起伏"], ["mark-33", "回响"], ["mark-34", "扩散"], ["mark-35", "旋律"], ["mark-36", "节律"], ["mark-37", "涟漪"], ["mark-38", "呼吸"], ["mark-39", "共振"], ["mark-40", "流动"]] },
  { name: "方向", items: [["mark-41", "向上"], ["mark-42", "向右"], ["mark-43", "转向"], ["mark-44", "聚焦"], ["mark-45", "展开"], ["mark-46", "推进"], ["mark-47", "回望"], ["mark-48", "突破"], ["mark-49", "定位"], ["mark-50", "抵达"]] },
  { name: "组合", items: [["mark-51", "链接"], ["mark-52", "协同"], ["mark-53", "平衡"], ["mark-54", "循环"], ["mark-55", "生长"], ["mark-56", "结晶"], ["mark-57", "堆叠"], ["mark-58", "编织"], ["mark-59", "跃升"], ["mark-60", "完成"]] },
] as const;

const PIXEL_SYMBOLS = PIXEL_SYMBOL_GROUPS.flatMap((group) => group.items.map(([icon, label]) => ({ icon, label, group: group.name })));

const BADGE_GRID_POINTS = [[4, 4], [12, 4], [20, 4], [4, 12], [12, 12], [20, 12], [4, 20], [12, 20], [20, 20]] as const;

function normalizeBadgeSymbol(icon: string): string {
  if (/^mark-(?:0[1-9]|[1-5][0-9]|60)$/.test(icon)) return icon;
  let hash = 17;
  for (const character of icon) hash = (hash * 31 + (character.codePointAt(0) ?? 0)) >>> 0;
  return `mark-${String((hash % 60) + 1).padStart(2, "0")}`;
}

function badgeSymbolGeometry(icon: string): { nodes: number[]; links: Array<[number, number]>; hollow: number } {
  const index = Number(normalizeBadgeSymbol(icon).slice(5)) - 1;
  const group = Math.floor(index / 10);
  const variant = index % 10;
  if (group === 0) {
    const outerA = [0, 1, 2, 5, 8, 7, 6, 3, 0, 2][variant]!;
    const outerB = [8, 7, 6, 3, 0, 1, 2, 5, 6, 8][variant]!;
    return { nodes: [4, outerA, outerB], links: [[outerA, 4], [4, outerB]], hollow: outerB };
  }
  if (group === 1) {
    const start = [6, 3, 0, 1, 2, 5, 8, 7, 6, 3][variant]!;
    const middle = [3, 4, 1, 4, 5, 4, 7, 4, 4, 0][variant]!;
    const end = [2, 8, 8, 6, 6, 0, 0, 2, 5, 8][variant]!;
    return { nodes: [start, middle, end], links: [[start, middle], [middle, end]], hollow: end };
  }
  if (group === 2) {
    const corners = [[0, 2, 8, 6], [0, 1, 4, 3], [1, 2, 5, 4], [3, 4, 7, 6], [4, 5, 8, 7]][variant % 5]!;
    const links: Array<[number, number]> = [[corners[0], corners[1]], [corners[1], corners[2]], [corners[2], corners[3]], [corners[3], corners[0]]];
    if (variant >= 5) links.push([corners[0], corners[2]]);
    return { nodes: [...corners], links, hollow: corners[(variant + 1) % corners.length]! };
  }
  if (group === 3) {
    const nodes = [variant % 3, 4, 8 - (variant % 3), 3 + (variant % 3)];
    return { nodes, links: [[nodes[0]!, nodes[1]!], [nodes[1]!, nodes[2]!], [nodes[2]!, nodes[3]!]], hollow: nodes[3]! };
  }
  if (group === 4) {
    const tip = [1, 5, 2, 4, 0, 8, 6, 2, 4, 1][variant]!;
    const baseA = [6, 3, 0, 6, 3, 0, 7, 4, 6, 3][variant]!;
    const baseB = [8, 7, 8, 8, 5, 2, 5, 8, 2, 5][variant]!;
    return { nodes: [baseA, tip, baseB], links: [[baseA, tip], [tip, baseB]], hollow: tip };
  }
  const nodes = [6, 4, 2, (variant * 2 + 1) % 9];
  const links: Array<[number, number]> = [[nodes[0]!, nodes[1]!], [nodes[1]!, nodes[2]!], [nodes[1]!, nodes[3]!]];
  if (variant % 2 === 0) links.push([nodes[0]!, nodes[3]!]);
  return { nodes, links, hollow: nodes[2]! };
}

function BadgeSymbol({ icon }: { icon: string }) {
  const geometry = badgeSymbolGeometry(icon);
  return <svg className="badge-symbol" viewBox="0 0 24 24" aria-hidden="true" focusable="false">{geometry.links.map(([from, to], index) => { const a = BADGE_GRID_POINTS[from]!; const b = BADGE_GRID_POINTS[to]!; return <line key={`l-${index}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />; })}{geometry.nodes.map((node, index) => { const point = BADGE_GRID_POINTS[node]!; return <circle key={`n-${index}`} cx={point[0]} cy={point[1]} r={node === geometry.hollow ? 2.2 : 1.8} className={node === geometry.hollow ? "is-hollow" : ""} />; })}</svg>;
}

function badgeColorValue(color: string): string {
  return paletteColorValue(color);
}

function badgeColorLabel(color: string): string {
  return CATEGORY_PALETTE.find((option) => option.id === color)?.label ?? color;
}

const INITIAL_ATTRIBUTES: Attribute[] = [];
const INITIAL_PLANS: PlanItem[] = [];
const INITIAL_WEIGHTS: WeightEntry[] = [];

function PixelBadge({ attribute, compact = false, gain, onEdit }: { attribute: Attribute; compact?: boolean; gain?: number; onEdit?: () => void }) {
  const progress = levelFromTotalXp(attribute.totalXp);
  const badgeColor = badgeColorValue(attribute.color);
  return (
    <article className={`badge-card badge-${attribute.color}${compact ? " badge-card--compact" : ""}`} style={{ "--badge-color": badgeColor, "--badge-text": readableTextColor(badgeColor) } as CSSProperties}>
      <div className="badge-sprite" aria-hidden="true">
        <span><BadgeSymbol icon={attribute.icon} /></span>
      </div>
      <div className="badge-copy">
        <div className="badge-heading">
          <strong>{attribute.name}</strong>
          <span>{gain === undefined ? "" : `今日 +${gain} XP · `}LV.{progress.level}</span>
        </div>
        {!compact && <p>{attribute.note}</p>}
        <div className="xp-track" aria-label={`${attribute.name}升级进度 ${progress.percent}%`}>
          <span style={{ width: `${progress.percent}%` }} />
        </div>
        <small>{progress.xpInLevel} / {progress.xpForNext} XP</small>
        {onEdit && <button className="badge-edit" type="button" onClick={onEdit}>编辑徽章</button>}
      </div>
    </article>
  );
}

function RewardChips({ rewards, attributes, maxVisible = 4 }: { rewards: readonly AttributeReward[]; attributes: Attribute[]; maxVisible?: number }) {
  const [expanded, setExpanded] = useState(false);
  const sortedRewards = sortAttributeRewardsByAmount(rewards);
  const visibleRewards = expanded ? sortedRewards : sortedRewards.slice(0, maxVisible);
  return (
    <div className="reward-chips" aria-label="完成奖励">
      {rewards.length === 0 ? <span className="reward-chip reward-chip--empty">未配置属性</span> : visibleRewards.map((reward) => {
        const attribute = attributes.find((item) => item.id === reward.attributeId);
        return <span className="reward-chip" key={reward.attributeId}>{attribute?.name} +{reward.amount}</span>;
      })}
      {sortedRewards.length > maxVisible && <button className="reward-more" type="button" onClick={() => setExpanded((current) => !current)}>{expanded ? "收起" : `+${sortedRewards.length - maxVisible}`}</button>}
    </div>
  );
}

function HarvestProviderTag({ settlement }: { settlement: SettlementRecord }) {
  const provider = settlement.harvest.provider === "api" ? "自定义 API" : settlement.harvest.provider === "codex-cli" ? "Codex CLI" : "AI";
  return <span className="readonly-tag">{provider}{settlement.harvest.fallbackUsed ? " · 自动回退" : ""} · 基于结算事实</span>;
}

function HarvestJournal({ text, onRefresh }: { text: string; onRefresh?: () => void }) {
  const rawParagraphs = text.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean);
  const paragraphs = rawParagraphs.length <= 2 ? rawParagraphs : [rawParagraphs[0]!, rawParagraphs.slice(1).join("\n\n")];
  const labels = ["本期足迹", "成长结算"];
  return <>
    <div className={`harvest-journal${paragraphs.length === 1 ? " harvest-journal--single" : ""}`}>
      {paragraphs.map((paragraph, index) => <article key={`${index}-${paragraph.slice(0, 12)}`}><span>0{index + 1}</span><div><small>{labels[index] ?? "补充记录"}</small><p>{paragraph}</p></div></article>)}
    </div>
    {onRefresh && <div className="harvest-stale-note" role="status"><div><b>同步到了新的历史行动</b><small>上方仍是旧版总结，重新生成后会纳入补充内容。</small></div><button className="pixel-button pixel-button--cyan" onClick={onRefresh}>重新生成</button></div>}
  </>;
}

function PlanRow({ plan, attributes, onComplete, onEdit, onUndo, onRemove, onReschedule }: { plan: PlanItem; attributes: Attribute[]; onComplete: (id: string, segmentId?: string) => void; onEdit?: (id: string) => void; onUndo?: (id: string, segmentId?: string) => void; onRemove?: (id: string) => void; onReschedule?: (id: string) => void }) {
  const timeLabel = plan.timeStatus === "unscheduled" ? "时间待配置" : `${plan.start}—${plan.end}`;
  const segments = plan.timeSegments ?? [];
  const segmented = segments.length > 1;
  const completedSegments = segments.filter((segment) => segment.completed).length;
  const overdueMode = plan.overdue ? overdueDisposition(plan) : undefined;
  return (
    <article className={`plan-row${plan.completed ? " is-complete" : ""}${plan.overdue ? " is-overdue" : ""}`}>
      {segmented ? <div className="plan-time plan-time--segments" aria-label={`${plan.title}的执行分段`}>{segments.map((segment, index) => <div className={segment.completed ? "is-complete" : ""} key={segment.id}>
        <button type="button" className="segment-time-label" disabled={!onEdit || plan.overdue} onClick={() => onEdit?.(plan.id)}><strong>{segment.start}—{segment.end}</strong></button>
        <button type="button" className="segment-complete-button" disabled={plan.overdue || plan.source === "learning-more"} aria-label={segment.completed ? `撤销${plan.title}第${index + 1}段` : `完成${plan.title}第${index + 1}段`} onClick={() => segment.completed ? onUndo?.(plan.id, segment.id) : onComplete(plan.id, segment.id)}>{segment.completed ? "✓" : "○"}</button>
      </div>)}</div> : onEdit && !plan.overdue ? <button type="button" className={`plan-time plan-time--button${plan.timeStatus === "unscheduled" ? " plan-time--unscheduled" : ""}`} onClick={() => onEdit(plan.id)} aria-label={plan.timeStatus === "unscheduled" ? `为${plan.title}配置时间` : `修改${plan.title}的时间`}><strong>{timeLabel}</strong></button> : <div className={`plan-time${plan.timeStatus === "unscheduled" ? " plan-time--unscheduled" : ""}`}><strong>{timeLabel}</strong></div>}
      <div className="timeline-mark"><i /></div>
      <div className="plan-main">
        <div className="plan-meta"><span className="category-chip">{plan.category}</span>{plan.source === "learning-more" && <span className="source-tag">▥ Learning MORE · 已同步</span>}{plan.completedEarly && plan.completedDate && <span className="early-complete-chip">已于 {plan.completedDate.slice(5).replace("-", "/")} 提前完成</span>}{plan.overdue && <span className="overdue-chip">已逾期</span>}{plan.overdueCarried && <span className="overdue-chip overdue-chip--carried">逾期</span>}{plan.templateLabel && <span className={`template-chip template-chip--${plan.rewardMode}`}>{plan.rewardMode === "custom" ? "本次已自定义" : plan.rewardMode === "template" ? `跟随 ${plan.templateLabel}` : `${plan.templateLabel} · 等待配置`}</span>}{plan.unitLabel && <span className="unit-chip">{plan.unitLabel}</span>}{segmented && <span className="segment-progress-chip">分段 {completedSegments}/{segments.length}</span>}{plan.recurrenceSummary && <span className={`recurrence-chip${plan.recurrenceDetached ? " is-detached" : ""}`}>{plan.recurrenceDetached ? "单次调整" : `↻ ${plan.recurrenceSummary}`}</span>}</div>
        <h3>{plan.title}</h3>
        <p>{plan.detail}</p>
        <RewardChips rewards={plan.rewards} attributes={attributes} />
        {(onEdit || onUndo || onRemove || onReschedule || overdueMode === "learning-more") && <div className="plan-actions">{onEdit && !plan.overdue && <button type="button" onClick={() => onEdit(plan.id)}>编辑内容</button>}{plan.completed && onUndo && <button type="button" onClick={() => onUndo(plan.id)}>撤销完成</button>}{overdueMode === "week-up" && onReschedule && !plan.overdueRescheduled && <button className="overdue-reschedule-button" type="button" onClick={() => onReschedule(plan.id)}>重新安排</button>}{overdueMode === "learning-more" && <span className="overdue-learning-more-note" aria-disabled="true">去 Learning MORE 重新规划</span>}{plan.overdueRescheduled && <span className="overdue-rescheduled-note">已重新安排</span>}{onRemove && !plan.completed && plan.source !== "learning-more" && (!plan.overdue || overdueMode === "week-up") && <button type="button" onClick={() => onRemove(plan.id)}>移除</button>}</div>}
      </div>
      {segmented ? <div className={`complete-button complete-button--segments${plan.completed ? " is-complete" : ""}`} aria-label={`${plan.title}已完成${completedSegments}/${segments.length}段`}><b>{completedSegments}/{segments.length}</b><small>{plan.completed ? "已结算" : "分段"}</small></div> : <button className="complete-button" aria-label={plan.completed ? `${plan.title}已完成` : plan.overdue ? `${plan.title}已逾期` : `完成${plan.title}`} disabled={plan.completed || plan.overdue || plan.source === "learning-more"} onClick={() => onComplete(plan.id)}>{plan.completed ? "✓" : plan.overdue ? "!" : plan.source === "learning-more" ? "↻" : "○"}</button>}
    </article>
  );
}

type WeeklyActionEntry =
  | Readonly<{ kind: "single"; id: string; plan: PlanItem }>
  | Readonly<{ kind: "course"; id: string; plans: readonly PlanItem[]; completionPlans: readonly PlanItem[] }>
  | Readonly<{ kind: "recurring"; id: string; plans: readonly PlanItem[] }>;

function groupWeeklyActions(plans: readonly PlanItem[]): WeeklyActionEntry[] {
  const allCourseGroups = new Map<string, PlanItem[]>();
  const courseGroups = new Map<string, PlanItem[]>();
  for (const plan of plans) {
    if (!isLearningMoreCoursePlan(plan)) continue;
    const key = plan.projectId ?? plan.templateLabel ?? "learning-more-unassigned";
    allCourseGroups.set(key, [...(allCourseGroups.get(key) ?? []), plan]);
    if (!isLearningMoreCourseBundlePlan(plan)) continue;
    courseGroups.set(key, [...(courseGroups.get(key) ?? []), plan]);
  }
  const grouped = new Map<string, PlanItem[]>();
  for (const plan of plans) {
    if (plan.overdue || !plan.projectId || !plan.recurrenceGroupId || plan.recurrenceDetached || plan.timeStatus === "unscheduled") continue;
    const key = `${plan.recurrenceGroupId}|${plan.projectId}|${plan.start}|${plan.end}`;
    grouped.set(key, [...(grouped.get(key) ?? []), plan]);
  }
  const emitted = new Set<string>();
  const emittedCourses = new Set<string>();
  const result: WeeklyActionEntry[] = [];
  for (const plan of plans) {
    const courseKey = isLearningMoreCourseBundlePlan(plan)
      ? plan.projectId ?? plan.templateLabel ?? "learning-more-unassigned"
      : undefined;
    if (courseKey) {
      if (emittedCourses.has(courseKey)) continue;
      emittedCourses.add(courseKey);
      result.push({
        kind: "course",
        id: `course|${courseKey}`,
        plans: courseGroups.get(courseKey) ?? [plan],
        completionPlans: allCourseGroups.get(courseKey) ?? [plan],
      });
      continue;
    }
    const key = !plan.overdue && plan.projectId && plan.recurrenceGroupId && !plan.recurrenceDetached && plan.timeStatus !== "unscheduled"
      ? `${plan.recurrenceGroupId}|${plan.projectId}|${plan.start}|${plan.end}`
      : undefined;
    const matches = key ? grouped.get(key) : undefined;
    if (!key || !matches || matches.length < 2) {
      result.push({ kind: "single", id: plan.id, plan });
      continue;
    }
    if (emitted.has(key)) continue;
    emitted.add(key);
    result.push({ kind: "recurring", id: key, plans: matches });
  }
  return result;
}

function compareWeeklyActionEntries(left: WeeklyActionEntry, right: WeeklyActionEntry): number {
  const leftPlan = left.kind === "single" ? left.plan : earliestPlanByExecution(left.plans);
  const rightPlan = right.kind === "single" ? right.plan : earliestPlanByExecution(right.plans);
  return comparePlansByExecution(leftPlan, rightPlan) || left.id.localeCompare(right.id);
}

function WeeklyCourseBundleCard({ plans, completionPlans, readOnly, onEdit }: { plans: readonly PlanItem[]; completionPlans: readonly PlanItem[]; readOnly: boolean; onEdit: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const first = plans[0]!;
  const completed = completionPlans.filter((plan) => plan.completed).length;
  const overdue = completionPlans.filter((plan) => !plan.completed && plan.overdue).length;
  const allCompleted = isLearningMoreCourseComplete(completionPlans);
  const courseName = first.templateLabel ?? "Learning MORE 课程";
  const sortedPlans = [...plans].sort((left, right) => (left.scheduledDate ?? "").localeCompare(right.scheduledDate ?? "") || left.start.localeCompare(right.start));
  return <article className={`weekly-course-bundle${allCompleted ? " is-complete" : ""}`}>
    <header>
      <span className="weekly-course-bundle__book">▥</span>
      <div><small>LEARNING MORE · COURSE PACK</small><h3>{courseName}</h3><p><b>本周 {completionPlans.length} 节</b><i aria-hidden="true">|</i><span>已完成 {completed} 节</span><i aria-hidden="true">|</i><span className={overdue > 0 ? "has-overdue" : ""}>逾期 {overdue} 节</span></p></div>
      <button type="button" onClick={() => setOpen((current) => !current)}>{open ? "收起课时 ↑" : "展开课时 ↓"}</button>
    </header>
    <i className="weekly-course-bundle__progress"><em style={{ width: `${completionPlans.length ? Math.round((completed / completionPlans.length) * 100) : 0}%` }} /></i>
    {open && <div className="weekly-course-lessons">{sortedPlans.map((plan) => <div className={`${plan.completed ? "is-complete" : ""}${plan.overdue ? " is-overdue" : ""}`} key={plan.id}><span>{plan.completed ? "✓" : plan.overdue ? "!" : "○"}</span><div><b>{plan.title}</b><small>{plan.completed ? "已完成" : plan.overdue ? "已逾期 · 请在 Learning MORE 重新规划" : plan.timeStatus === "unscheduled" ? "时间待配置" : `${plan.start}–${plan.end}`}</small></div>{plan.overdue ? <em className="weekly-course-lessons__owner-note">去 Learning MORE 重新规划</em> : !readOnly && <button type="button" onClick={() => onEdit(plan.id)}>{plan.completed ? "查看" : "配置时间"}</button>}</div>)}</div>}
  </article>;
}

function WeeklyRepeatedPlanCard({ plans, dates, attributes, readOnly, onComplete, onEdit, onUndo }: { plans: readonly PlanItem[]; dates: readonly string[]; attributes: Attribute[]; readOnly: boolean; onComplete: (id: string, segmentId?: string) => void; onEdit: (id: string) => void; onUndo: (id: string, segmentId?: string) => void }) {
  const first = plans[0]!;
  const byDate = new Map(plans.map((plan) => [plan.scheduledDate, plan]));
  const completed = plans.filter((plan) => plan.completed).length;
  const cadence = first.recurrenceSummary?.split(" · 共")[0] ?? "重复行动";
  return <article className="weekly-repeat-card">
    <header>
      <span className="weekly-repeat-card__time">{first.start}–{first.end}</span>
      <div><small>{first.category}</small><h3>{first.title}</h3><RewardChips rewards={first.rewards} attributes={attributes} /></div>
      <em>↻ {cadence} · 本周 {completed}/{plans.length} 完成</em>
    </header>
    <div className="weekly-repeat-days" aria-label={`${first.title}本周重复行动`}>
      {dates.map((date, index) => {
        const plan = byDate.get(date);
        if (!plan) return <span className="weekly-repeat-day is-empty" key={date}><b>{["一", "二", "三", "四", "五", "六", "日"][index]}</b><small>{date.slice(8)}</small><i>—</i></span>;
        const locked = readOnly || plan.source === "learning-more";
        const planSegments = plan.timeSegments ?? [];
        const completedPlanSegments = planSegments.filter((segment) => segment.completed);
        const nextSegment = planSegments.find((segment) => !segment.completed);
        const lastCompletedSegment = completedPlanSegments.at(-1);
        return <span className={`weekly-repeat-day${plan.completed ? " is-complete" : ""}`} key={date}>
          <b>{["一", "二", "三", "四", "五", "六", "日"][index]}</b><small>{date.slice(8)}</small>
          <button type="button" className="weekly-repeat-day__status" disabled={locked} aria-label={plan.completed ? `撤销完成${plan.title}` : nextSegment ? `完成${plan.title}下一段` : `完成${plan.title}`} onClick={() => plan.completed ? onUndo(plan.id) : onComplete(plan.id, nextSegment?.id)}>{plan.completed ? "✓" : plan.source === "learning-more" ? "↻" : planSegments.length > 1 ? `${completedPlanSegments.length}/${planSegments.length}` : "○"}</button>
          {!locked && !plan.completed && completedPlanSegments.length > 0 && lastCompletedSegment && <button type="button" className="weekly-repeat-day__segment-undo" aria-label={`撤销${plan.title}上一段`} onClick={() => onUndo(plan.id, lastCompletedSegment.id)}>−</button>}
          {!readOnly && <button type="button" className="weekly-repeat-day__edit" onClick={() => onEdit(plan.id)}>编辑</button>}
        </span>;
      })}
    </div>
  </article>;
}

function WeightChart({ entries, target, compact = false, averageValues }: { entries: WeightEntry[]; target?: number; compact?: boolean; averageValues?: Array<number | null> }) {
  if (entries.length === 0) {
    return <div className={`empty-chart${compact ? " empty-chart--compact" : ""}`}>录入体重后，这里会显示每日值和 7 日移动平均</div>;
  }
  const averages = averageValues ?? movingAverage(entries);
  const values = [...entries.map((entry) => entry.value), ...(target === undefined ? [] : [target])];
  const min = Math.min(...values) - 0.2;
  const max = Math.max(...values) + 0.2;
  const position = (value: number) => 100 - ((value - min) / (max - min)) * 100;
  return (
    <div className={`weight-chart${compact ? " weight-chart--compact" : ""}`} aria-label="体重趋势图">
      {target !== undefined && <div className="target-line" style={{ top: `${position(target)}%` }}><span>目标 {target.toFixed(1)}</span></div>}
      <div className="chart-columns">
        {entries.map((entry, index) => (
          <div className="chart-column" key={entry.date}>
            {averages[index] !== null && <span className="average-dot" style={{ top: `${position(averages[index] as number)}%` }} />}
            <span className="weight-dot" style={{ top: `${position(entry.value)}%` }} title={`${entry.label} ${entry.value.toFixed(1)} kg`} />
            {!compact && (entries.length <= 14 || index === 0 || index === entries.length - 1 || index % 10 === 0) && <small>{entry.label}</small>}
          </div>
        ))}
      </div>
    </div>
  );
}

function TodayView({
  plans,
  attributes,
  completionFacts,
  weights,
  onComplete,
  onExternalComplete,
  onQuickAdd,
  onOpenWeight,
  onEdit,
  onUndo,
  onRemove,
  onRescheduleOverdue,
}: {
  plans: PlanItem[];
  attributes: Attribute[];
  completionFacts: readonly CompletionFact[];
  weights: WeightEntry[];
  onComplete: (id: string, segmentId?: string) => void;
  onExternalComplete: () => void;
  onQuickAdd: () => void;
  onOpenWeight: () => void;
  onEdit: (id: string) => void;
  onUndo: (id: string, segmentId?: string) => void;
  onRemove: (id: string) => void;
  onRescheduleOverdue: (id: string) => void;
}) {
  const [completedOpen, setCompletedOpen] = useState(false);
  const [overdueOpen, setOverdueOpen] = useState(false);
  const [dailyGrowthOpen, setDailyGrowthOpen] = useState(false);
  const [visiblePlanCount, setVisiblePlanCount] = useState(20);
  const shanghaiNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
  const todayDayIndex = (shanghaiNow.getDay() + 6) % 7;
  const { todayPlans, overduePlans } = selectDailyPlans(plans, currentLocalDate(), todayDayIndex);
  const completedPlans = todayPlans.filter((plan) => plan.completed).sort((left, right) => left.start.localeCompare(right.start));
  const pendingPlans = todayPlans.filter((plan) => !plan.completed).sort((left, right) => left.start.localeCompare(right.start));
  const visiblePending = pendingPlans.slice(0, visiblePlanCount);
  const planGroups = [
    { id: "now", label: "正在进行", items: visiblePending.filter((plan) => plan.scheduleGroup === "now") },
    { id: "next", label: "接下来", items: visiblePending.filter((plan) => plan.scheduleGroup === "next") },
    { id: "later", label: "稍后", items: visiblePending.filter((plan) => !plan.scheduleGroup || plan.scheduleGroup === "later") },
  ].filter((group) => group.items.length > 0);
  const completed = completedPlans.length;
  const learningPlan = todayPlans.find((plan) => plan.source === "learning-more");
  const latest = weights.at(-1);
  const averages = movingAverage(weights);
  const dailyGains = attributeGainsForCompletedDate(completionFacts, currentLocalDate())
    .map((reward) => ({ attribute: attributes.find((attribute) => attribute.id === reward.attributeId), amount: reward.amount }))
    .filter((item): item is { attribute: Attribute; amount: number } => item.attribute !== undefined)
    .sort((left, right) => right.amount - left.amount || left.attribute.name.localeCompare(right.attribute.name, "zh-CN"));
  const visibleDailyGains = dailyGrowthOpen ? dailyGains : dailyGains.slice(0, 5);
  return (
    <div className="view today-view">
      <section className="hero-card pixel-card">
        <div>
          <div className="eyebrow">TODAY · LEVEL UP!</div>
          <h1>今天也有<br /><span>新事物可以探索</span></h1>
          <p>{todayPlans.length > 0 ? `今天有 ${todayPlans.length} 项小计划，挑一件先出发吧！` : "放下一件想做的小事，今天的第一点经验就从这里开始！"}</p>
        </div>
        <div className="day-score">
          <span className="pixel-star" aria-hidden="true">✦</span>
          <strong>{completed}<small> / {todayPlans.length}</small></strong>
          <span>今日已完成</span>
        </div>
      </section>

      <section className="learning-sync pixel-card" aria-label="Learning MORE 同步状态">
        <div className="learning-sync__brand"><span className="book-pixel">▥</span><div><b>Learning MORE</b><small>课程表与完成状态直连</small></div></div>
        <div className="sync-flow">{learningPlan ? <><span>今日课表已合并</span><i>→</i><span className="is-active">{learningPlan.timeStatus === "unscheduled" ? "时间待配置" : learningPlan.syncState === "completed" ? "课节已完成" : "等待学习"}</span><i>→</i><span>{learningPlan.completed ? "成长已结算" : "等待完成状态"}</span></> : <span className="is-active">Learning MORE 今日课表会自动进入今日计划</span>}</div>
        {learningPlan && !learningPlan.completed && <button className="pixel-button pixel-button--cyan" onClick={onExternalComplete}>立即同步状态</button>}
        {learningPlan?.completed && <span className="sync-ok">✓ 自动同步完成</span>}
      </section>

      <div className="today-grid">
        <section className="pixel-card schedule-panel">
          <div className="section-heading">
            <div><span className="eyebrow">DAILY QUEST</span><h2>今日计划</h2></div>
            <button className="pixel-button pixel-button--pink" onClick={onQuickAdd}>＋ 新增计划</button>
          </div>
          <div className={`timeline${todayPlans.length > 8 ? " timeline--dense" : ""}`}>
            {overduePlans.length > 0 && <section className="plan-group overdue-group"><button className="plan-group__heading overdue-group__heading overdue-group__toggle" type="button" onClick={() => setOverdueOpen((current) => !current)} aria-expanded={overdueOpen}><div><b>逾期待处理</b><small>原记录已锁定，不计入今日与原周结算</small></div><span className="overdue-group__controls"><b>{overduePlans.length}</b><em>{overdueOpen ? "收起" : "展开"}<i aria-hidden="true">{overdueOpen ? "↑" : "↓"}</i></em></span></button>{overdueOpen && overduePlans.map((plan) => <PlanRow key={plan.id} plan={plan} attributes={attributes} onComplete={onComplete} onRemove={onRemove} onReschedule={onRescheduleOverdue} />)}</section>}
            {todayPlans.length === 0 && <div className="empty-state"><span>＋</span><h3>今天还没有计划</h3><p>点击“新增计划”创建第一项具体行动。</p><button className="pixel-button pixel-button--pink" onClick={onQuickAdd}>新增第一个计划</button></div>}
            {planGroups.map((group) => <section className="plan-group" key={group.id}><div className="plan-group__heading"><b>{group.label}</b><span>{group.items.length} 项</span></div>{group.items.map((plan) => <PlanRow key={plan.id} plan={plan} attributes={attributes} onComplete={onComplete} onEdit={onEdit} onUndo={onUndo} onRemove={onRemove} />)}</section>)}
            {pendingPlans.length > visiblePlanCount && <button className="load-more" onClick={() => setVisiblePlanCount((current) => current + 20)}>再显示 {Math.min(20, pendingPlans.length - visiblePlanCount)} 项</button>}
            {completedPlans.length > 0 && <section className="plan-group completed-group"><button className="plan-group__toggle" onClick={() => setCompletedOpen((current) => !current)}><span>已完成 {completedPlans.length} 项</span><b>{completedOpen || todayPlans.length <= 8 ? "收起" : "展开"}</b></button>{(completedOpen || todayPlans.length <= 8) && completedPlans.map((plan) => <PlanRow key={plan.id} plan={plan} attributes={attributes} onComplete={onComplete} onEdit={onEdit} onUndo={onUndo} onRemove={onRemove} />)}</section>}
          </div>
        </section>

        <aside className="today-side">
          <section className="pixel-card growth-snapshot">
            <div className="section-heading section-heading--small"><div><span className="eyebrow">GROWTH</span><h2>今日属性值UP！</h2></div>{dailyGains.length > 5 ? <button className="week-xp week-xp--button" onClick={() => setDailyGrowthOpen((current) => !current)}>{dailyGrowthOpen ? "收起" : `展开全部 ${dailyGains.length} 项`}</button> : <span className="week-xp">今日 {dailyGains.length} 项</span>}</div>
            <div className="compact-badges">{dailyGains.length === 0 ? <div className="mini-empty">今天还没有属性提升，完成行动后会在这里点亮。</div> : visibleDailyGains.map(({ attribute, amount }) => <PixelBadge key={attribute.id} attribute={attribute} compact gain={amount} />)}</div>
          </section>
          <section className="pixel-card weight-widget">
            <div className="section-heading section-heading--small"><div><span className="eyebrow">BODY TRACK</span><h2>体重趋势</h2></div><button className="text-button" onClick={onOpenWeight}>展开 →</button></div>
            {latest ? <div className="weight-stats"><strong>{latest.value.toFixed(1)}<small> kg</small></strong><div><small>7日均值</small><b>{averages.at(-1)?.toFixed(1) ?? "—"} kg</b></div></div> : <div className="mini-empty">还没有体重记录。进入体重趋势页录入第一条数据。</div>}
            <WeightChart entries={weights.slice(-14)} compact />
          </section>
        </aside>
      </div>
    </div>
  );
}

function GoalsView({ attributes, goals, projects, onNew, onEdit, onNewProject, onEditProject }: { attributes: Attribute[]; goals: readonly GoalRecord[]; projects: readonly ProjectRecord[]; onNew: (period: GoalRecord["period"]) => void; onEdit: (goal: GoalRecord) => void; onNewProject: () => void; onEditProject: (project: ProjectRecord) => void }) {
  const unitLabel = (unit: RewardUnit) => unit === "hour" ? "时" : unit === "lesson" ? "节" : "次";
  return (
    <div className="view">
      <div className="page-title"><div><span className="eyebrow">QUEST MAP</span><h1>目标与计划</h1><p>方向可以宽泛，成长只由真实完成的具体行动产生。</p></div><div className="page-title__actions"><button className="pixel-button pixel-button--cyan" onClick={() => onNew("month")}>＋ 月方向</button><button className="pixel-button pixel-button--pink" onClick={() => onNew("week")}>＋ 周目标</button></div></div>
      {goals.length === 0 ? <section className="empty-page pixel-card"><span className="empty-pixel">◆</span><h2>还没有目标</h2><p>先建立一个月度方向，再把本周目标关联进去。</p><button className="pixel-button pixel-button--pink" onClick={() => onNew("month")}>创建第一个月目标</button><small>当前属性数量：{attributes.length} 项</small></section> : <div className="goal-board">{(["month", "week"] as const).map((period) => <section className="pixel-card goal-column" key={period}><div className="section-heading"><div><span className="eyebrow">{period === "month" ? "MONTH MAP" : "WEEK QUEST"}</span><h2>{period === "month" ? "月度方向" : "周目标"}</h2></div><span>{goals.filter((goal) => goal.period === period).length} 项</span></div>{goals.filter((goal) => goal.period === period).map((goal) => <button className="goal-card" key={goal.id} onClick={() => onEdit(goal)}><b>{goal.title}</b><p>{goal.note || "还没有补充说明"}</p><small>{goal.startDate} — {goal.endDate}</small><span>编辑 →</span></button>)}</section>)}</div>}
      <section className="project-library pixel-card"><div className="section-heading"><div><span className="eyebrow">ACTION PROJECTS</span><h2>行动项目库</h2><p>配置一次，之后安排计划时直接调用。</p></div><button className="pixel-button pixel-button--cyan" onClick={onNewProject}>＋ 新项目</button></div>{projects.length === 0 ? <div className="mini-empty">还没有项目。论文、运动、舞蹈等重复行动都可以做成模板。</div> : <div className="project-grid">{projects.map((project) => <button className="project-card" key={project.id} onClick={() => onEditProject(project)}><span className="project-card__pixel">◆</span><div><b>{project.name}</b><small>{project.category} · 每{unitLabel(project.unit)}</small><RewardChips rewards={project.rewardsPerUnit} attributes={attributes} maxVisible={4} /></div><em>编辑 →</em></button>)}</div>}</section>
    </div>
  );
}

type DateRange = Readonly<{ startDate: string; endDate: string }>;

function localDateInShanghai(instant: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(instant));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function shiftLocalDate(localDate: string, days: number): string {
  const date = new Date(`${localDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function currentLocalDate(): string {
  return localDateInShanghai(new Date().toISOString());
}

function currentWeekRange(): DateRange {
  const today = currentLocalDate();
  const date = new Date(`${today}T00:00:00Z`);
  const offset = (date.getUTCDay() + 6) % 7;
  const startDate = shiftLocalDate(today, -offset);
  return { startDate, endDate: shiftLocalDate(startDate, 6) };
}

function weekRangeFor(localDate: string): DateRange {
  const date = new Date(`${localDate}T00:00:00Z`);
  const offset = (date.getUTCDay() + 6) % 7;
  const startDate = shiftLocalDate(localDate, -offset);
  return { startDate, endDate: shiftLocalDate(startDate, 6) };
}

function currentMonthRange(): DateRange {
  const today = currentLocalDate();
  const startDate = `${today.slice(0, 7)}-01`;
  const nextMonth = new Date(`${startDate}T00:00:00Z`);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  return { startDate, endDate: shiftLocalDate(nextMonth.toISOString().slice(0, 10), -1) };
}

function planDate(plan: PlanItem, records: ReadonlyMap<string, PlanRecord>, range?: DateRange): string | undefined {
  const record = records.get(plan.id);
  if (record) return localDateInShanghai(record.startAt);
  if (range && plan.dayIndex !== undefined) return shiftLocalDate(range.startDate, Math.max(0, plan.dayIndex));
  return undefined;
}

function plansWithinRange(plans: readonly PlanItem[], records: ReadonlyMap<string, PlanRecord>, range: DateRange, period: "week" | "month"): PlanItem[] {
  return plans.filter((plan) => {
    const date = planDate(plan, records, range);
    if (date) return date >= range.startDate && date <= range.endDate;
    return period === "month" || (plan.dayIndex !== undefined && plan.dayIndex >= 0 && plan.dayIndex <= 6);
  });
}

function goalsWithinRange(goals: readonly GoalRecord[], range: DateRange, period: GoalRecord["period"], includeArchived: boolean): GoalRecord[] {
  return goals.filter((goal) => goal.period === period && (includeArchived || goal.archivedAt === undefined) && goal.startDate <= range.endDate && goal.endDate >= range.startDate);
}

function gainsForPlans(plans: readonly PlanItem[], attributes: readonly Attribute[], settlement?: SettlementRecord) {
  return attributes.map((attribute) => ({
    attribute,
    amount: settlement?.attributeGains[attribute.id] ?? plans.filter((plan) => plan.completed).reduce((sum, plan) => sum + (plan.rewards.find((reward) => reward.attributeId === attribute.id)?.amount ?? 0), 0),
  })).filter((item) => item.amount > 0).sort((left, right) => right.amount - left.amount);
}

function PeriodPicker({ label, settlements, selectedId, onSelect }: { label: string; settlements: readonly SettlementRecord[]; selectedId: string | null; onSelect: (id: string | null) => void }) {
  return <div className="cycle-picker" aria-label={`${label}周期切换`}><button className={selectedId === null ? "active" : ""} onClick={() => onSelect(null)}>当前{label}</button>{settlements.map((item) => <button className={selectedId === item.id ? "active" : ""} key={item.id} onClick={() => onSelect(item.id)}>{item.startDate.slice(5)}—{item.endDate.slice(5)}</button>)}</div>;
}

function OpenPlansByCategory({ plans }: { plans: readonly PlanItem[] }) {
  const [expandedCategories, setExpandedCategories] = useState<string[]>([]);
  const [allCategoriesOpen, setAllCategoriesOpen] = useState(false);
  const groups = groupPlansByProjectCategory(plans);
  const visibleGroups = allCategoriesOpen ? groups : groups.slice(0, 5);
  const toggleCategory = (category: string) => setExpandedCategories((current) => current.includes(category) ? current.filter((item) => item !== category) : [...current, category]);

  return <div className="open-category-list">
    {visibleGroups.map((group) => {
      const expanded = expandedCategories.includes(group.category);
      const scheduleFacts = [group.scheduledCount > 0 ? `${group.scheduledCount} 项已安排` : "", group.unscheduledCount > 0 ? `${group.unscheduledCount} 项待安排` : ""].filter(Boolean).join(" · ");
      return <section className={`open-category${expanded ? " is-expanded" : ""}`} key={group.category}>
        <button className="open-category__summary" type="button" onClick={() => toggleCategory(group.category)} aria-expanded={expanded}>
          <span className="open-category__pixel">◆</span>
          <div><b>{group.category}</b><small>{group.plans.length} 项行动{scheduleFacts ? ` · ${scheduleFacts}` : ""}</small></div>
          <strong>{expanded ? "收起" : "展开"}<i>{expanded ? "↑" : "↓"}</i></strong>
        </button>
        {expanded && <div className="open-category__plans">{group.plans.map((plan) => <article key={plan.id}><span>○</span><div><b>{plan.title}</b><small>{plan.start} · {plan.templateLabel ?? plan.category}</small></div></article>)}</div>}
      </section>;
    })}
    {groups.length > 5 && <button className="load-more" type="button" onClick={() => setAllCategoriesOpen((current) => !current)}>{allCategoriesOpen ? "收起其余分类" : `查看其余 ${groups.length - 5} 类`}</button>}
  </div>;
}

function PeriodFacts({ period, plans, attributes, settlement, generatingHarvestIds, onRetryHarvest, afterGrowth }: { period: "week" | "month"; plans: readonly PlanItem[]; attributes: readonly Attribute[]; settlement?: SettlementRecord; generatingHarvestIds: readonly string[]; onRetryHarvest: (id: string) => void; afterGrowth?: ReactNode }) {
  const [completedOpen, setCompletedOpen] = useState(false);
  const [missedOpen, setMissedOpen] = useState(false);
  const [growthOpen, setGrowthOpen] = useState(false);
  const completedPlans = settlement ? plans.filter((plan) => settlement.completedPlanIds.includes(plan.id)) : plans.filter((plan) => plan.completed);
  const missedPlans = settlement ? plans.filter((plan) => settlement.incompletePlanIds.includes(plan.id)) : plans.filter((plan) => !plan.completed && !plan.overdue);
  const attributeGains = gainsForPlans(completedPlans, attributes, settlement);
  const xp = settlement ? Object.values(settlement.attributeGains).reduce((sum, value) => sum + value, 0) : attributeGains.reduce((sum, item) => sum + item.amount, 0);
  const visible = (items: readonly PlanItem[], open: boolean) => open ? items : items.slice(0, 5);
  return <section className="period-review-zone">
    <div className={`review-summary pixel-card review-summary--${period}`}><div><span>{settlement ? "FROZEN FACTS" : "LIVE PROGRESS"}</span><h2>{settlement ? "周期行动已经结算" : period === "week" ? "这周的行动正在积累" : "这个月的成长正在发生"}</h2></div><div className="review-numbers"><div><b>{completedPlans.length}</b><span>完成行动</span></div><div><b>{missedPlans.length}</b><span>待完成</span></div><div><b>{xp}</b><span>属性 XP</span></div></div></div>
    <div className="review-grid">
      <section className="review-list pixel-card"><div className="section-heading section-heading--small"><div><span className="eyebrow">DONE</span><h2>完成内容</h2></div><span>{completedPlans.length} 项</span></div>{visible(completedPlans, completedOpen).map((plan) => <article key={plan.id}><span>✓</span><div><b>{plan.title}</b><small>{plan.start} · {plan.category}</small></div></article>)}{completedPlans.length === 0 && <div className="mini-empty">完成第一项行动后，这里会亮起来。</div>}{completedPlans.length > 5 && <button className="load-more" onClick={() => setCompletedOpen((current) => !current)}>{completedOpen ? "收起" : `查看其余 ${completedPlans.length - 5} 项`}</button>}</section>
      <section className="review-list pixel-card"><div className="section-heading section-heading--small"><div><span className="eyebrow">OPEN</span><h2>{settlement ? "未完成内容" : "接下来可以完成"}</h2></div><span>{missedPlans.length} 项</span></div>{settlement ? <>{visible(missedPlans, missedOpen).map((plan) => <article key={plan.id}><span>○</span><div><b>{plan.title}</b><small>{plan.start} · {plan.category}</small></div></article>)}{missedPlans.length > 5 && <button className="load-more" onClick={() => setMissedOpen((current) => !current)}>{missedOpen ? "收起" : `查看其余 ${missedPlans.length - 5} 项`}</button>}</> : <OpenPlansByCategory plans={missedPlans} />}{missedPlans.length === 0 && <div className="mini-empty">目前没有待完成的行动。</div>}</section>
      <section className="review-gains pixel-card"><div className="section-heading section-heading--small"><div><span className="eyebrow">GROWTH</span><h2>属性增长</h2></div><span>{attributeGains.length > 10 ? `前 10 项 · 共 ${attributeGains.length} 项` : `${attributeGains.length} 项`}</span></div>{(growthOpen ? attributeGains : attributeGains.slice(0, 10)).map(({ attribute, amount }) => <div key={attribute.id}><span><BadgeSymbol icon={attribute.icon} /></span><b>{attribute.name}</b><strong>+{amount} XP</strong></div>)}{attributeGains.length > 10 && <button className="load-more" type="button" onClick={() => setGrowthOpen((current) => !current)}>{growthOpen ? "收起属性" : `展开其余 ${attributeGains.length - 10} 项`}</button>}{attributeGains.length === 0 && <div className="mini-empty">本期暂无属性增长</div>}</section>
      {afterGrowth}
      {settlement ? <section className={`review-harvest pixel-card review-harvest--${settlement.harvest.status}`}><div className="section-heading section-heading--small"><div><span className="eyebrow">AI HARVEST</span><h2>{period === "week" ? "本周收获" : "本月收获"}</h2></div><HarvestProviderTag settlement={settlement} /></div>{settlement.harvest.status === "ready" || settlement.harvest.status === "stale" ? <HarvestJournal text={settlement.harvest.text ?? ""} onRefresh={settlement.harvest.status === "stale" ? () => onRetryHarvest(settlement.id) : undefined} /> : generatingHarvestIds.includes(settlement.id) || settlement.harvest.status === "pending" ? <div className="harvest-loading" role="status"><span className="harvest-spark">✦</span><div><b>正在整理这段时间的闪光点…</b><small>只会使用目标、行动、属性成长和收藏事实。</small></div></div> : <div className="harvest-failed" role="status"><div><b>收获总结暂时没有生成</b><small>事实记录已经保存，服务恢复后可以重新生成。</small></div><button className="pixel-button pixel-button--cyan" onClick={() => onRetryHarvest(settlement.id)}>重新生成</button></div>}</section> : <section className="review-harvest review-harvest--preview pixel-card"><div><span className="eyebrow">NEXT HARVEST</span><h2>{period === "week" ? "周一结算后生成本周收获" : "月末结算后生成本月收获"}</h2><p>先安心行动，目标、完成内容、未完成内容和属性成长会自动整理。</p></div><span className="harvest-spark">✦</span></section>}
    </div>
  </section>;
}

function WeekDashboard({ attributes, plans, planRecords, goals, dailySettlements, settlements, initialRange, generatingHarvestIds, onRetryHarvest, onNewGoal, onEditGoal, onQuickAdd, onOpenCalendar, onOpenGrowth, onComplete, onEditPlan, onUndoPlan, onRemovePlan, onRescheduleOverdue }: { attributes: Attribute[]; plans: PlanItem[]; planRecords: readonly PlanRecord[]; goals: readonly GoalRecord[]; dailySettlements: WeekUpState["dailySettlements"]; settlements: readonly SettlementRecord[]; initialRange?: DateRange; generatingHarvestIds: readonly string[]; onRetryHarvest: (id: string) => void; onNewGoal: () => void; onEditGoal: (goal: GoalRecord) => void; onQuickAdd: (goalIds?: readonly string[]) => void; onOpenCalendar: () => void; onOpenGrowth: () => void; onComplete: (id: string, segmentId?: string) => void; onEditPlan: (id: string) => void; onUndoPlan: (id: string, segmentId?: string) => void; onRemovePlan: (id: string) => void; onRescheduleOverdue: (id: string) => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rangeOverride, setRangeOverride] = useState<DateRange | undefined>(initialRange);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [selectedWeekGoalId, setSelectedWeekGoalId] = useState<string | null>(null);
  const recordMap = useMemo(() => new Map(planRecords.map((plan) => [plan.id, plan])), [planRecords]);
  const periodSettlements = settlements.filter((item) => item.period === "week").sort((left, right) => right.endDate.localeCompare(left.endDate));
  const selectedSettlement = periodSettlements.find((item) => item.id === selectedId);
  useEffect(() => {
    if (!initialRange) return;
    const matching = periodSettlements.find((item) => item.startDate === initialRange.startDate && item.endDate === initialRange.endDate);
    setSelectedId(matching?.id ?? null);
    setRangeOverride(matching ? undefined : initialRange);
  }, [initialRange?.startDate, initialRange?.endDate]);
  const range = selectedSettlement ? { startDate: selectedSettlement.startDate, endDate: selectedSettlement.endDate } : rangeOverride ?? currentWeekRange();
  const periodPlans = plansWithinRange(plans, recordMap, range, "week");
  const countedPlans = periodPlans.filter((plan) => plan.completed || !plan.overdue);
  const weekGoals = goalsWithinRange(goals, range, "week", Boolean(selectedSettlement));
  const activeWeekGoal = weekGoals.find((goal) => goal.id === selectedWeekGoalId) ?? weekGoals[0];
  const activeWeekGoalLinkIds = activeWeekGoal
    ? [activeWeekGoal.id, ...activeWeekGoal.linkedGoalIds.filter((linkedId) => goals.some((goal) => goal.id === linkedId && goal.period === "month" && goal.archivedAt === undefined))]
    : [];
  const activeWeekGoalPlans = activeWeekGoal
    ? periodPlans
      .filter((plan) => recordMap.get(plan.id)?.goalIds.includes(activeWeekGoal.id))
      .sort((left, right) => Number(left.completed) - Number(right.completed) || left.start.localeCompare(right.start))
    : [];
  const activeWeekGoalDone = activeWeekGoalPlans.filter((plan) => plan.completed).length;
  const gains = gainsForPlans(periodPlans, attributes, selectedSettlement);
  const days = Array.from({ length: 7 }, (_, index) => shiftLocalDate(range.startDate, index));
  const actionPlans = [...periodPlans].sort((left, right) => Number(left.completed) - Number(right.completed) || comparePlansByExecution(left, right));
  const actionEntries = groupWeeklyActions(actionPlans);
  const actionKindOrder = ["recurring", "single", "course"] as const;
  const actionEntryIsComplete = (entry: WeeklyActionEntry) => entry.kind === "single"
    ? entry.plan.completed
    : entry.kind === "course"
      ? isLearningMoreCourseComplete(entry.completionPlans)
      : entry.plans.every((plan) => plan.completed);
  const orderedActionEntries = [false, true].flatMap((completed) => actionKindOrder.flatMap((kind) =>
    actionEntries.filter((entry) => entry.kind === kind && actionEntryIsComplete(entry) === completed).sort(compareWeeklyActionEntries),
  ));
  const visibleActions = actionsOpen
    ? orderedActionEntries
    : takeVisibleGroupedRows(
      orderedActionEntries,
      8,
      2,
      (entry) => `${actionEntryIsComplete(entry) ? "done" : "open"}:${entry.kind}`,
    );
  const hiddenActionEntryCount = orderedActionEntries.length - visibleActions.length;
  const visibleActionGroups = [false, true].flatMap((completed) => actionKindOrder.map((kind) => ({
    kind,
    completed,
    entries: visibleActions.filter((entry) => entry.kind === kind && actionEntryIsComplete(entry) === completed),
  })))
    .filter((group) => group.entries.length > 0);
  const renderActionEntry = (entry: WeeklyActionEntry) => entry.kind === "single"
    ? <PlanRow key={entry.id} plan={entry.plan} attributes={attributes} onComplete={selectedSettlement ? () => undefined : onComplete} onReschedule={onRescheduleOverdue} {...(!selectedSettlement ? { onEdit: onEditPlan, onUndo: onUndoPlan, onRemove: onRemovePlan } : {})} />
    : entry.kind === "course"
      ? <WeeklyCourseBundleCard key={entry.id} plans={entry.plans} completionPlans={entry.completionPlans} readOnly={Boolean(selectedSettlement)} onEdit={onEditPlan} />
      : <WeeklyRepeatedPlanCard key={entry.id} plans={entry.plans} dates={days} attributes={attributes} readOnly={Boolean(selectedSettlement)} onComplete={onComplete} onEdit={onEditPlan} onUndo={onUndoPlan} />;
  const completedActionCount = countedPlans.filter((plan) => plan.completed).length;
  const actionProgress = countedPlans.length ? Math.round((completedActionCount / countedPlans.length) * 100) : 0;
  return <div className="view period-dashboard week-dashboard">
    <div className="page-title period-page-title"><div><span className="eyebrow">WEEK CAMP</span><h1>本周行动营地</h1><p>{range.startDate} — {range.endDate}</p></div><div className="page-title__actions"><button className="pixel-button pixel-button--cyan" onClick={onOpenCalendar}>打开周日历</button></div></div>
    <PeriodPicker label="周" settlements={periodSettlements} selectedId={selectedId} onSelect={setSelectedId} />
    <section className="week-hero pixel-card"><div><span className="week-hero__sprite">▥</span><div><span className="eyebrow">SEVEN DAY ROUTE</span><h2>{selectedSettlement ? "这一周已经装进成长档案" : "今天走一小格，这周就会很不一样"}</h2><p>{completedActionCount} / {countedPlans.length} 项行动完成 · {gains.reduce((sum, item) => sum + item.amount, 0)} XP 已收集</p></div></div><button className="week-hero__growth" onClick={onOpenGrowth}><b>{gains.length}</b><span>项属性成长</span></button></section>
    <section className="week-route" aria-label="七日行动地图">{days.map((date, index) => { const dayPlans = periodPlans.filter((plan) => planDate(plan, recordMap, range) === date); const frozen = dailySettlements.find((item) => item.localDate === date); const summary = summarizeWeekRouteDay(dayPlans, frozen); return <button className={`day-tile${summary.lit ? " is-lit" : ""}${date === currentLocalDate() ? " is-today" : ""}`} key={date} onClick={onOpenCalendar}><span>{["一", "二", "三", "四", "五", "六", "日"][index]}</span><b>{date.slice(8)}</b><i style={{ width: `${summary.progress}%` }} /><small>{summary.label}</small></button>; })}</section>
    <div className="week-dashboard-grid">
      <section className="pixel-card dashboard-panel goal-direction-panel"><div className="section-heading"><div><span className="eyebrow">WEEK QUEST</span><h2>本周目标</h2></div>{!selectedSettlement && <div className="section-heading__actions"><button className="pixel-button pixel-button--pink" onClick={() => onQuickAdd(activeWeekGoalLinkIds)}>＋ 安排行动</button><button className="pixel-button pixel-button--cyan" onClick={onNewGoal}>＋ 新目标</button></div>}</div>{weekGoals.length === 0 ? <div className="mini-empty">这周还没有目标。目标可以宽泛，具体成长仍由完成的计划产生。</div> : <div className="dashboard-goal-list" role="tablist" aria-label="切换本周目标">{weekGoals.map((goal) => { const linked = periodPlans.filter((plan) => recordMap.get(plan.id)?.goalIds.includes(goal.id)); const done = linked.filter((plan) => plan.completed).length; const active = goal.id === activeWeekGoal?.id; return <article className={`dashboard-goal-card${active ? " is-active" : ""}`} key={goal.id}><button className="dashboard-goal-select" type="button" role="tab" aria-selected={active} aria-controls="week-goal-links" onClick={() => setSelectedWeekGoalId(goal.id)}><span>◆</span><div><b>{goal.title}</b><p>{goal.note || "给这一周一个想推进的目标"}</p><small>{linked.length ? `${done}/${linked.length} 个关联行动完成` : "尚未关联具体行动"}</small></div></button>{!selectedSettlement && <button className="dashboard-goal-edit" type="button" onClick={() => onEditGoal(goal)}>编辑 →</button>}</article>; })}</div>}</section>
      <section className="pixel-card dashboard-panel goal-action-panel" id="week-goal-links" role="tabpanel" aria-label={activeWeekGoal ? `${activeWeekGoal.title}的关联行动` : "目标关联"}><div className="section-heading section-heading--small"><div><span className="eyebrow">GOAL LINKS</span><h2>目标关联</h2></div><span>{activeWeekGoal ? `${activeWeekGoalDone}/${activeWeekGoalPlans.length}` : "0 项"}</span></div>{weekGoals.length === 0 ? <div className="mini-empty">创建本周目标后，可以在这里查看它关联的具体行动。</div> : activeWeekGoalPlans.length === 0 ? <div className="mini-empty">“{activeWeekGoal?.title}”尚未关联具体行动。</div> : <div className="goal-action-list">{activeWeekGoalPlans.map((plan) => <button type="button" key={plan.id} className={plan.completed ? "is-complete" : ""} onClick={() => !selectedSettlement && onEditPlan(plan.id)}><span>{plan.completed ? "✓" : "○"}</span><div><b>{plan.title}</b><small>{plan.timeStatus === "unscheduled" ? "时间待配置" : `${plan.start}—${plan.end}`} · {plan.category}</small></div><em>{plan.completed ? "已完成" : selectedSettlement ? "未完成" : "查看 →"}</em></button>)}</div>}</section>
    </div>
    <section className="pixel-card dashboard-panel week-actions-panel"><div className="section-heading"><div><span className="eyebrow">ACTION QUEUE</span><h2>本周行动</h2></div><div className="week-actions-summary"><strong>{completedActionCount}/{countedPlans.length}</strong><small>已完成</small><i><em style={{ width: `${actionProgress}%` }} /></i></div></div>{visibleActions.length === 0 ? <div className="mini-empty">本周还没有安排。选择项目和时间，就能放下第一项行动。</div> : <div className="dashboard-action-groups">{visibleActionGroups.map((group) => <div className={`dashboard-action-list dashboard-action-list--${group.kind}${group.completed ? " dashboard-action-list--completed" : ""}`} key={`${group.completed ? "completed" : "open"}-${group.kind}`}>{group.entries.map(renderActionEntry)}</div>)}</div>}{orderedActionEntries.length > 8 && <button className="load-more" onClick={() => setActionsOpen((current) => !current)}>{actionsOpen ? "收起行动" : `展开其余 ${hiddenActionEntryCount} 组`}</button>}</section>
    <PeriodFacts period="week" plans={periodPlans} attributes={attributes} settlement={selectedSettlement} generatingHarvestIds={generatingHarvestIds} onRetryHarvest={onRetryHarvest} />
  </div>;
}

function monthWeekSlices(range: DateRange): DateRange[] {
  const first = new Date(`${range.startDate}T00:00:00Z`);
  const offset = (first.getUTCDay() + 6) % 7;
  let cursor = shiftLocalDate(range.startDate, -offset);
  const result: DateRange[] = [];
  while (cursor <= range.endDate) {
    const end = shiftLocalDate(cursor, 6);
    result.push({ startDate: cursor < range.startDate ? range.startDate : cursor, endDate: end > range.endDate ? range.endDate : end });
    cursor = shiftLocalDate(cursor, 7);
  }
  return result;
}

function MonthDashboard({ attributes, plans, planRecords, goals, projects, projectCategories, settlements, weights, generatingHarvestIds, onRetryHarvest, onNewGoal, onEditGoal, onOpenWeek, onOpenCalendar, onOpenWeight }: { attributes: Attribute[]; plans: PlanItem[]; planRecords: readonly PlanRecord[]; goals: readonly GoalRecord[]; projects: readonly ProjectRecord[]; projectCategories: readonly AttributeCategoryRecord[]; settlements: readonly SettlementRecord[]; weights: WeightEntry[]; generatingHarvestIds: readonly string[]; onRetryHarvest: (id: string) => void; onNewGoal: () => void; onEditGoal: (goal: GoalRecord) => void; onOpenWeek: (range?: DateRange) => void; onOpenCalendar: () => void; onOpenWeight: () => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedMonthGoalId, setSelectedMonthGoalId] = useState<string | null>(null);
  const recordMap = useMemo(() => new Map(planRecords.map((plan) => [plan.id, plan])), [planRecords]);
  const periodSettlements = settlements.filter((item) => item.period === "month").sort((left, right) => right.endDate.localeCompare(left.endDate));
  const selectedSettlement = periodSettlements.find((item) => item.id === selectedId);
  const range = selectedSettlement ? { startDate: selectedSettlement.startDate, endDate: selectedSettlement.endDate } : currentMonthRange();
  const periodPlans = selectedSettlement ? plans.filter((plan) => selectedSettlement.completedPlanIds.includes(plan.id) || selectedSettlement.incompletePlanIds.includes(plan.id)) : plansWithinRange(plans, recordMap, range, "month");
  const monthGoals = goalsWithinRange(goals, range, "month", Boolean(selectedSettlement));
  const weekGoals = goalsWithinRange(goals, range, "week", Boolean(selectedSettlement));
  const activeMonthGoal = monthGoals.find((goal) => goal.id === selectedMonthGoalId) ?? monthGoals[0];
  const linkedWeekGoals = activeMonthGoal ? weekGoals.filter((weekGoal) => weekGoal.linkedGoalIds.includes(activeMonthGoal.id)) : [];
  const linkedMonthPlans = activeMonthGoal ? periodPlans
    .filter((plan) => recordMap.get(plan.id)?.goalIds.includes(activeMonthGoal.id))
    .sort((left, right) => Number(left.completed) - Number(right.completed) || left.start.localeCompare(right.start))
    : [];
  const gains = gainsForPlans(periodPlans, attributes, selectedSettlement);
  const slices = monthWeekSlices(range);
  const periodWeights = weights.filter((entry) => entry.date >= range.startDate && entry.date <= range.endDate);
  const contributions = aggregateProjectCategoryContributions(periodPlans, planRecords, projects, projectCategories);
  const completed = periodPlans.filter((plan) => plan.completed).length;
  const rate = periodPlans.length ? Math.round((completed / periodPlans.length) * 100) : 0;
  return <div className="view period-dashboard month-dashboard">
    <div className="page-title period-page-title"><div><span className="eyebrow">MONTH ATLAS</span><h1>本月成长图鉴</h1><p>{range.startDate} — {range.endDate}</p></div><div className="page-title__actions"><button className="pixel-button pixel-button--cyan" onClick={() => onOpenWeek()}>查看本周目标</button><button className="pixel-button pixel-button--pink" onClick={onOpenCalendar}>打开月日历</button></div></div>
    <PeriodPicker label="月" settlements={periodSettlements} selectedId={selectedId} onSelect={setSelectedId} />
    <section className="month-hero pixel-card"><div className="month-hero__copy"><span className="month-hero__sprite">✦</span><div><span className="eyebrow">GROWTH ATLAS</span><h2>{selectedSettlement ? "这个月的每一点经验都留在这里" : "本月图鉴正在被你的行动点亮"}</h2><p>{completed} 项完成 · {gains.reduce((sum, item) => sum + item.amount, 0)} XP · {gains.length} 项属性成长</p></div></div><div className="month-rate"><b>{rate}%</b><span>行动完成率</span><i><em style={{ width: `${rate}%` }} /></i></div></section>
    <section className="month-week-route" style={{ "--month-week-count": slices.length } as CSSProperties}>{slices.map((slice, index) => { const slicePlans = periodPlans.filter((plan) => { const date = planDate(plan, recordMap, range); return date !== undefined && date >= slice.startDate && date <= slice.endDate; }); const done = slicePlans.filter((plan) => plan.completed).length; return <button key={slice.startDate} onClick={() => onOpenWeek(weekRangeFor(slice.startDate))}><span>W{index + 1}</span><b>{slice.startDate.slice(5)}—{slice.endDate.slice(5)}</b><i><em style={{ width: `${slicePlans.length ? Math.round((done / slicePlans.length) * 100) : 0}%` }} /></i><small>{slicePlans.length ? `${done}/${slicePlans.length} 完成` : "等待行动"}</small></button>; })}</section>
    <div className="month-dashboard-grid">
      <section className="pixel-card dashboard-panel month-goal-panel"><div className="section-heading"><div><span className="eyebrow">MONTH DIRECTION</span><h2>本月方向</h2></div>{!selectedSettlement && <button className="pixel-button pixel-button--cyan" onClick={onNewGoal}>＋ 新方向</button>}</div>{monthGoals.length === 0 ? <div className="mini-empty">先给这个月放下一个长期方向，周目标和具体行动都可以继续关联进来。</div> : <div className="dashboard-goal-list" role="tablist" aria-label="切换本月方向">{monthGoals.map((goal) => { const linkedWeeks = weekGoals.filter((weekGoal) => weekGoal.linkedGoalIds.includes(goal.id)); const linkedPlans = periodPlans.filter((plan) => recordMap.get(plan.id)?.goalIds.includes(goal.id)); const done = linkedPlans.filter((plan) => plan.completed).length; const progress = linkedPlans.length ? Math.round((done / linkedPlans.length) * 100) : 0; const active = goal.id === activeMonthGoal?.id; return <article className={`dashboard-goal-card${active ? " is-active" : ""}`} key={goal.id}><button className="dashboard-goal-select" type="button" role="tab" aria-selected={active} aria-controls="month-direction-links" onClick={() => setSelectedMonthGoalId(goal.id)}><span>✦</span><div><b>{goal.title}</b><p>{goal.note || "本月想持续推进的方向"}</p><div className="goal-link-stats"><span>{linkedWeeks.length} 个周目标</span><span>{linkedPlans.length ? `${linkedPlans.length} 个关联行动 · 完成 ${done}/${linkedPlans.length}` : "0 个关联行动"}</span></div><i className="goal-link-progress"><em style={{ width: `${progress}%` }} /></i></div></button>{!selectedSettlement && <button className="dashboard-goal-edit" type="button" onClick={() => onEditGoal(goal)}>编辑 →</button>}</article>; })}</div>}</section>
      <section className="pixel-card dashboard-panel linked-week-panel month-links-panel" id="month-direction-links" role="tabpanel" aria-label={activeMonthGoal ? `${activeMonthGoal.title}的方向关联` : "方向关联"}><div className="section-heading section-heading--small"><div><span className="eyebrow">DIRECTION LINKS</span><h2>方向关联</h2></div><span>{linkedWeekGoals.length + linkedMonthPlans.length} 项</span></div>{!activeMonthGoal ? <div className="mini-empty">创建本月方向后，可以在这里查看它关联的周目标和具体行动。</div> : linkedWeekGoals.length === 0 && linkedMonthPlans.length === 0 ? <div className="mini-empty">“{activeMonthGoal.title}”暂时没有关联周目标或具体行动。</div> : <div className="month-link-groups">{linkedWeekGoals.length > 0 && <section><div className="month-link-group-title"><span>WEEK QUEST</span><b>周目标</b><em>{linkedWeekGoals.length}</em></div><div className="linked-week-list">{linkedWeekGoals.map((goal) => { const linkedPlans = periodPlans.filter((plan) => recordMap.get(plan.id)?.goalIds.includes(goal.id)); const done = linkedPlans.filter((plan) => plan.completed).length; return <button className="month-link-card month-link-card--goal" key={goal.id} onClick={() => onOpenWeek(weekRangeFor(goal.startDate))}><span>◆</span><div><b>{goal.title}</b><small>{goal.startDate.slice(5)}—{goal.endDate.slice(5)} · {linkedPlans.length ? `${done}/${linkedPlans.length} 个行动完成` : "尚未关联行动"}</small></div><em>去对应周 →</em></button>; })}</div></section>}{linkedMonthPlans.length > 0 && <section><div className="month-link-group-title"><span>ACTION</span><b>具体行动</b><em>{linkedMonthPlans.length}</em></div><div className="month-linked-action-list">{linkedMonthPlans.map((plan) => <article className={`month-link-card month-link-card--action${plan.completed ? " is-complete" : ""}`} key={plan.id}><span>{plan.completed ? "✓" : "○"}</span><div><b>{plan.title}</b><small>{plan.timeStatus === "unscheduled" ? "时间待配置" : `${plan.start}—${plan.end}`} · {plan.category}</small></div><em>{plan.completed ? "已完成" : "待完成"}</em></article>)}</div></section>}</div>}</section>
    </div>
    <PeriodFacts period="month" plans={periodPlans} attributes={attributes} settlement={selectedSettlement} generatingHarvestIds={generatingHarvestIds} onRetryHarvest={onRetryHarvest} afterGrowth={<><section className="pixel-card dashboard-panel contribution-panel"><div className="section-heading section-heading--small"><div><span className="eyebrow">CATEGORY → XP</span><h2>项目贡献</h2></div><span>按项目类别汇总</span></div>{contributions.length === 0 ? <div className="mini-empty">本月完成行动后，会按项目类别汇总经验来源。</div> : <div className="contribution-list">{contributions.slice(0, 8).map((contribution) => <div key={contribution.categoryId}><span aria-hidden="true">◆</span><b>{contribution.label}</b><i><em style={{ width: `${Math.round((contribution.xp / contributions[0]!.xp) * 100)}%` }} /></i><strong>+{contribution.xp} XP</strong></div>)}</div>}</section><section className="pixel-card dashboard-panel month-weight-panel"><div className="section-heading section-heading--small"><div><span className="eyebrow">BODY TRACK</span><h2>本月体重趋势</h2></div><button className="text-button" onClick={onOpenWeight}>详细看板 →</button></div><WeightChart entries={periodWeights} target={undefined} compact /></section></>} />
  </div>;
}

function CalendarDrawerPlan({ plan, mode, onEditPlan }: { plan: PlanItem; mode: "week" | "month"; onEditPlan: (id: string) => void }) {
  const unscheduled = mode === "week" && plan.timeStatus === "unscheduled";
  return <div className={`drawer-plan${unscheduled ? " drawer-plan--unscheduled" : ""}`}>
    <button className={`drawer-plan__time${unscheduled ? " is-unscheduled" : ""}`} onClick={() => onEditPlan(plan.calendarSourceId ?? plan.id)}>{mode === "month" ? "✓ 已完成" : unscheduled ? "时间待配置" : (plan.timeSegments?.length ?? 0) > 1 ? `${plan.timeSegments!.length} 个时段` : `${plan.start}—${plan.end}`}</button>
    <div className="drawer-plan__copy"><b>{plan.title}</b><span>{plan.category}{plan.source === "learning-more" ? " · Learning MORE" : ""}</span></div>
  </div>;
}

function expandCalendarSegments(plans: readonly PlanItem[]): PlanItem[] {
  return plans.flatMap((plan) => (plan.timeSegments?.length ?? 0) > 1
    ? plan.timeSegments!.map((segment) => ({ ...plan, id: `${plan.id}::${segment.id}`, calendarSourceId: plan.id, start: segment.start, end: segment.end }))
    : [plan]);
}

function CalendarView({ plans, initialMode, content, onEditPlan }: { plans: PlanItem[]; initialMode: "week" | "month"; content: "timeline" | "schedule"; onEditPlan: (id: string) => void }) {
  const todayKey = currentLocalDate();
  const weekRange = currentWeekRange();
  const todayIndex = Math.max(0, Math.min(6, Math.round((Date.parse(`${todayKey}T00:00:00Z`) - Date.parse(`${weekRange.startDate}T00:00:00Z`)) / 86_400_000)));
  const weekdays = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
  const dayDates = weekdays.map((weekday, index) => {
    const key = shiftLocalDate(weekRange.startDate, index);
    const date = new Date(`${key}T00:00:00Z`);
    return { key, weekday, day: date.getUTCDate(), month: date.getUTCMonth() + 1 };
  });
  const rangeLabel = `${dayDates[0]!.month}月${dayDates[0]!.day}日—${dayDates[6]!.month}月${dayDates[6]!.day}日`;
  const [mode, setMode] = useState<"week" | "month">(initialMode);
  const [monthAnchor, setMonthAnchor] = useState(todayKey.slice(0, 7));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [expandedDays, setExpandedDays] = useState<number[]>([]);
  const planDateKey = (plan: PlanItem) => plan.scheduledDate ?? shiftLocalDate(weekRange.startDate, plan.dayIndex ?? 0);
  const plansForDate = (dateKey: string) => plans
    .filter((plan) => planDateKey(plan) === dateKey)
    .sort((left, right) => left.start.localeCompare(right.start));
  const monthStart = `${monthAnchor}-01`;
  const monthStartDate = new Date(`${monthStart}T00:00:00Z`);
  const monthGridStart = shiftLocalDate(monthStart, -((monthStartDate.getUTCDay() + 6) % 7));
  const monthCells = Array.from({ length: 42 }, (_, index) => {
    const key = shiftLocalDate(monthGridStart, index);
    const date = new Date(`${key}T00:00:00Z`);
    return { key, day: date.getUTCDate(), inMonth: key.startsWith(monthAnchor), today: key === todayKey, plans: plansForDate(key).filter((plan) => plan.completed) };
  });
  const monthLabel = `${monthStartDate.getUTCFullYear()}年${monthStartDate.getUTCMonth() + 1}月`;
  const shiftMonth = (offset: number) => {
    const next = new Date(`${monthAnchor}-01T00:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + offset);
    setMonthAnchor(next.toISOString().slice(0, 7));
    setSelectedDate(null);
  };
  const selectedPlans = selectedDate ? plansForDate(selectedDate).filter((plan) => mode === "week" || plan.completed) : [];
  const selectedUnscheduled = selectedPlans.filter((plan) => plan.timeStatus === "unscheduled");
  const selectedTimed = selectedPlans.filter((plan) => mode === "month" || plan.timeStatus !== "unscheduled");
  const selectedDateLabel = selectedDate ? `${Number(selectedDate.slice(5, 7))}月${Number(selectedDate.slice(8, 10))}日` : "";
  return (
    <div className="view">
      <div className="page-title"><div><span className="eyebrow">{content === "timeline" ? "TIMELINE" : "CALENDAR"}</span><h1>{content === "timeline" ? "时间轨迹" : "日程表"}</h1><p>{mode === "week" ? rangeLabel : monthLabel} · Asia/Shanghai</p></div><div className="segmented"><button className={mode === "week" ? "active" : ""} onClick={() => { setMode("week"); setSelectedDate(null); }}>周</button><button className={mode === "month" ? "active" : ""} onClick={() => { setMode("month"); setSelectedDate(null); }}>月</button></div></div>
      {mode === "week" ? <section className="calendar-card pixel-card">
        <div className="calendar-head"><span>时间</span>{dayDates.map((date, index) => <div className={index === todayIndex ? "today" : ""} key={date.key}>{date.weekday}<b>{date.day}</b></div>)}</div>
        {content === "schedule" && <div className="unscheduled-dock"><div className="unscheduled-dock__label"><span>POCKET</span><b>待安排</b></div>{dayDates.map((date, dayIndex) => { const count = plansForDate(date.key).filter((plan) => plan.timeStatus === "unscheduled").length; return <button className={`${dayIndex === todayIndex ? "is-today" : ""}${count > 0 ? " has-items" : ""}`} key={date.key} disabled={count === 0} onClick={() => setSelectedDate(date.key)} aria-label={`${date.weekday}有${count}项待安排计划`}>{count > 0 ? <><strong>+{count}</strong><small>展开待安排</small></> : <span>—</span>}</button>; })}</div>}
        <div className="calendar-body"><div className="time-axis">{["06:00", "08:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00", "22:00"].map((time) => <span key={time}>{time}</span>)}</div>{dayDates.map((date, dayIndex) => {
          const allDayPlans = plansForDate(date.key);
          const timedPlans = expandCalendarSegments(allDayPlans.filter((plan) => plan.timeStatus !== "unscheduled"));
          const visiblePlans = timedPlans;
          const clusters = clusterCalendarPlans(visiblePlans);
          return <div className={`day-column${dayIndex === todayIndex ? " today" : ""}`} key={date.key}>{clusters.map((cluster) => {
            const position = projectCalendarCluster(cluster);
            const firstPlan = cluster.plans[0]!;
            const clustered = cluster.plans.length > 1;
            return <button className={`calendar-event${clustered ? " calendar-event--cluster" : ""}`} style={{ top: `${position.topPercent}%`, height: `${position.heightPercent}%`, "--category-color": firstPlan.categoryColor, "--category-text": firstPlan.categoryTextColor } as CSSProperties} key={cluster.id} onClick={() => setSelectedDate(date.key)} aria-label={clustered ? `${firstPlan.start} 有 ${cluster.plans.length} 项重叠日程，查看当天全部计划` : `查看 ${firstPlan.title}`}><b>{firstPlan.start}{clustered ? ` · ${cluster.plans.length} 项` : ""}</b><span>{firstPlan.title}</span>{clustered ? <small>堆叠日程 +{cluster.plans.length - 1} · 查看全部</small> : firstPlan.source === "learning-more" && <small>▥ 已同步</small>}</button>;
          })}</div>;
        })}</div>
        {plans.length === 0 && <div className="calendar-empty">{content === "timeline" ? "本周还没有实际完成记录" : "本周没有已安排的计划"}</div>}
        <div className="mobile-agenda">{dayDates.map((date, dayIndex) => {
          const dayPlans = plansForDate(date.key);
          const unscheduledPlans = dayPlans.filter((plan) => plan.timeStatus === "unscheduled");
          const timedPlans = expandCalendarSegments(dayPlans.filter((plan) => plan.timeStatus !== "unscheduled"));
          const expanded = expandedDays.includes(dayIndex);
          const shown = expanded ? timedPlans : timedPlans.slice(0, 6);
          return <section className="agenda-day" key={date.key}><header><b>{date.weekday} {date.day}</b><span>{timedPlans.length} 已排 · {unscheduledPlans.length} 待安排</span></header>{unscheduledPlans.length > 0 && <button className="agenda-unscheduled" onClick={() => setSelectedDate(date.key)}><strong>+{unscheduledPlans.length}</strong><span>展开待安排计划</span><em>→</em></button>}{shown.map((plan) => <div className="agenda-row" key={plan.id}><button className="agenda-row__time" onClick={() => onEditPlan(plan.calendarSourceId ?? plan.id)}>{plan.start}—{plan.end}</button><span>{plan.title}</span><small>{plan.completed ? "已完成" : plan.source === "learning-more" ? "LM 同步" : plan.category}</small></div>)}{dayPlans.length === 0 && <p>没有安排</p>}{timedPlans.length > 6 && <button className="load-more" onClick={() => setExpandedDays((current) => expanded ? current.filter((item) => item !== dayIndex) : [...current, dayIndex])}>{expanded ? "收起" : `再显示 ${timedPlans.length - 6} 项`}</button>}</section>;
        })}</div>
      </section> : <section className="month-calendar pixel-card">
        <div className="month-calendar__toolbar"><button onClick={() => shiftMonth(-1)} aria-label="上个月">←</button><b>{monthLabel}</b><button onClick={() => shiftMonth(1)} aria-label="下个月">→</button><button className="month-calendar__today" onClick={() => setMonthAnchor(todayKey.slice(0, 7))}>回到本月</button></div>
        <div className="month-calendar__weekdays">{weekdays.map((day) => <b key={day}>{day}</b>)}</div>
        <div className="month-calendar__grid">{monthCells.map((cell) => <div className={`month-day${cell.inMonth ? "" : " is-outside"}${cell.today ? " is-today" : ""}`} key={cell.key}><button className="month-day__number" onClick={() => setSelectedDate(cell.key)} aria-label={`查看${cell.key}完成内容`}><span>{cell.day}</span>{cell.plans.length > 0 ? <small>{cell.plans.length} 项完成</small> : cell.today && <small>今天</small>}</button><div className="month-day__plans">{cell.plans.slice(0, 3).map((plan) => <button className="month-plan-chip" style={{ "--category-color": plan.categoryColor, "--category-text": plan.categoryTextColor } as CSSProperties} key={plan.id} onClick={() => setSelectedDate(cell.key)}><i>✓</i><span>{plan.title}</span></button>)}</div>{cell.plans.length > 3 && <button className="month-day__more" onClick={() => setSelectedDate(cell.key)}>另有 {cell.plans.length - 3} 项完成</button>}</div>)}</div>
      </section>}
      {selectedDate !== null && <div className="agenda-drawer pixel-card"><div className="section-heading"><div><span className="eyebrow">{mode === "month" ? "DONE TODAY" : "DAY AGENDA"}</span><h2>{selectedDateLabel} · {mode === "month" ? "完成内容" : "计划口袋"}</h2></div><button className="modal-close" onClick={() => setSelectedDate(null)}>×</button></div>{selectedPlans.length > 0 ? <>{mode === "week" && selectedUnscheduled.length > 0 && <section className="drawer-plan-group drawer-plan-group--unscheduled"><div className="drawer-plan-group__title"><b>待安排</b><span>{selectedUnscheduled.length} 项 · 点击时间票券直接设置</span></div>{selectedUnscheduled.map((plan) => <CalendarDrawerPlan key={plan.id} plan={plan} mode={mode} onEditPlan={onEditPlan} />)}</section>}{selectedTimed.length > 0 && <section className="drawer-plan-group"><div className="drawer-plan-group__title"><b>{mode === "month" ? "完成内容" : "已安排"}</b><span>{selectedTimed.length} 项 · 点击时间可再次修改</span></div>{selectedTimed.map((plan) => <CalendarDrawerPlan key={plan.id} plan={plan} mode={mode} onEditPlan={onEditPlan} />)}</section>}</> : <div className="mini-empty">{mode === "month" ? "这一天还没有完成记录。" : "这一天还没有计划。"}</div>}</div>}
    </div>
  );
}

function ReviewView({ attributes, plans, settlements, generatingHarvestIds, onRetryHarvest }: { attributes: Attribute[]; plans: PlanItem[]; settlements: readonly SettlementRecord[]; generatingHarvestIds: readonly string[]; onRetryHarvest: (id: string) => void }) {
  const [period, setPeriod] = useState<"week" | "month">("week");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [completedOpen, setCompletedOpen] = useState(false);
  const [missedOpen, setMissedOpen] = useState(false);
  const [growthOpen, setGrowthOpen] = useState(false);
  const periodSettlements = settlements.filter((item) => item.period === period).sort((left, right) => right.endDate.localeCompare(left.endDate));
  const selectedSettlement = periodSettlements.find((item) => item.id === selectedId) ?? periodSettlements[0];
  const completedPlans = selectedSettlement ? plans.filter((plan) => selectedSettlement.completedPlanIds.includes(plan.id)) : plans.filter((plan) => plan.completed);
  const missedPlans = selectedSettlement ? plans.filter((plan) => selectedSettlement.incompletePlanIds.includes(plan.id)) : plans.filter((plan) => !plan.completed && !plan.overdue);
  const totalXp = completedPlans.reduce((sum, plan) => sum + plan.rewards.reduce((rewardSum, reward) => rewardSum + reward.amount, 0), 0);
  const attributeGains = attributes.map((attribute) => ({
    attribute,
    amount: selectedSettlement?.attributeGains[attribute.id] ?? completedPlans.reduce((sum, plan) => sum + (plan.rewards.find((reward) => reward.attributeId === attribute.id)?.amount ?? 0), 0),
  })).filter((item) => item.amount > 0).sort((left, right) => right.amount - left.amount);
  const factList = (items: PlanItem[], expanded: boolean) => (expanded ? items : items.slice(0, 5));
  return (
    <div className="view">
      <div className="page-title"><div><span className="eyebrow">ACTION LOG</span><h1>周月回顾</h1><p>行动事实自动结算，AI 帮你发现值得记住的成长。</p></div><div className="segmented"><button className={period === "week" ? "active" : ""} onClick={() => { setPeriod("week"); setSelectedId(null); }}>本周</button><button className={period === "month" ? "active" : ""} onClick={() => { setPeriod("month"); setSelectedId(null); }}>本月</button></div></div>
      {periodSettlements.length > 0 && <div className="review-history-strip" aria-label="历史结算">{periodSettlements.map((item) => <button className={item.id === selectedSettlement?.id ? "active" : ""} key={item.id} onClick={() => setSelectedId(item.id)}>{item.startDate.slice(5)} — {item.endDate.slice(5)}</button>)}</div>}
      <div className="review-summary pixel-card"><div><span>{selectedSettlement ? "FROZEN FACTS" : period === "week" ? "CURRENT WEEK" : "CURRENT MONTH"}</span><h2>{selectedSettlement ? `${selectedSettlement.startDate} — ${selectedSettlement.endDate}` : period === "week" ? "本周行动记录" : "本月成长总结"}</h2></div><div className="review-numbers"><div><b>{completedPlans.length}</b><span>完成行动</span></div><div><b>{missedPlans.length}</b><span>未完成</span></div><div><b>{selectedSettlement ? Object.values(selectedSettlement.attributeGains).reduce((sum, value) => sum + value, 0) : totalXp}</b><span>属性 XP</span></div></div></div>
      {plans.length === 0 ? <section className="empty-page pixel-card review-empty"><span className="empty-pixel">▧</span><h2>还没有可回顾的行动事实</h2><p>完成计划后，目标结果、完成内容、未完成内容和属性增长会自动汇总到这里。</p><small>当前属性数量：{attributes.length}</small></section> : <div className="review-grid">
        <section className="review-list pixel-card"><div className="section-heading section-heading--small"><div><span className="eyebrow">DONE</span><h2>完成内容</h2></div><span>{completedPlans.length} 项</span></div>{factList(completedPlans, completedOpen).map((plan) => <article key={plan.id}><span>✓</span><div><b>{plan.title}</b><small>{plan.start} · {plan.category}</small></div></article>)}{completedPlans.length > 5 && <button className="load-more" onClick={() => setCompletedOpen((current) => !current)}>{completedOpen ? "收起" : `查看其余 ${completedPlans.length - 5} 项`}</button>}</section>
        <section className="review-list pixel-card"><div className="section-heading section-heading--small"><div><span className="eyebrow">OPEN</span><h2>未完成内容</h2></div><span>{missedPlans.length} 项</span></div>{factList(missedPlans, missedOpen).map((plan) => <article key={plan.id}><span>○</span><div><b>{plan.title}</b><small>{plan.start} · {plan.category}</small></div></article>)}{missedPlans.length > 5 && <button className="load-more" onClick={() => setMissedOpen((current) => !current)}>{missedOpen ? "收起" : `查看其余 ${missedPlans.length - 5} 项`}</button>}</section>
        <section className="review-gains pixel-card"><div className="section-heading section-heading--small"><div><span className="eyebrow">GROWTH</span><h2>属性增长</h2></div><span>{attributeGains.length > 10 ? `前 10 项 · 共 ${attributeGains.length} 项` : `${attributeGains.length} 项`}</span></div>{(growthOpen ? attributeGains : attributeGains.slice(0, 10)).map(({ attribute, amount }) => <div key={attribute.id}><span><BadgeSymbol icon={attribute.icon} /></span><b>{attribute.name}</b><strong>+{amount} XP</strong></div>)}{attributeGains.length > 10 && <button className="load-more" type="button" onClick={() => setGrowthOpen((current) => !current)}>{growthOpen ? "收起属性" : `展开其余 ${attributeGains.length - 10} 项`}</button>}{attributeGains.length === 0 && <div className="mini-empty">本期暂无属性增长</div>}</section>
        {selectedSettlement && <section className={`review-harvest pixel-card review-harvest--${selectedSettlement.harvest.status}`}><div className="section-heading section-heading--small"><div><span className="eyebrow">AI HARVEST</span><h2>{period === "week" ? "本周收获" : "本月收获"}</h2></div><HarvestProviderTag settlement={selectedSettlement} /></div>{selectedSettlement.harvest.status === "ready" || selectedSettlement.harvest.status === "stale" ? <HarvestJournal text={selectedSettlement.harvest.text ?? ""} onRefresh={selectedSettlement.harvest.status === "stale" ? () => onRetryHarvest(selectedSettlement.id) : undefined} /> : generatingHarvestIds.includes(selectedSettlement.id) || selectedSettlement.harvest.status === "pending" ? <div className="harvest-loading" role="status"><span className="harvest-spark">✦</span><div><b>正在整理这段时间的闪光点…</b><small>只会使用目标、行动、属性成长和收藏事实。</small></div></div> : <div className="harvest-failed" role="status"><div><b>收获总结暂时没有生成</b><small>事实记录已经安全保存，服务恢复后可以重新生成。</small></div><button className="pixel-button pixel-button--cyan" onClick={() => onRetryHarvest(selectedSettlement.id)}>重新生成</button></div>}</section>}
      </div>}
    </div>
  );
}

function AttributeCategoryManagerBody({ categories, attributes, onCreate, onRename, onDelete }: { categories: readonly AttributeCategoryRecord[]; attributes: readonly Attribute[]; onCreate: (name: string) => void; onRename: (id: string, name: string) => void; onDelete: (id: string) => void }) {
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const normalizedNewName = newName.trim();
  const newNameExists = categories.some((category) => category.name === normalizedNewName);
  const create = (event: FormEvent) => {
    event.preventDefault();
    if (!normalizedNewName || newNameExists) return;
    onCreate(normalizedNewName);
    setNewName("");
  };
  const rename = (category: AttributeCategoryRecord) => {
    const name = editingName.trim();
    if (!name || name === category.name || categories.some((item) => item.id !== category.id && item.name === name)) return;
    onRename(category.id, name);
    setEditingId(null);
    setEditingName("");
  };
  return <section className="pixel-card config-section attribute-category-manager"><div className="section-heading"><div><span className="eyebrow">BADGE CATEGORIES</span><h2>徽章类别管理</h2><p>先整理类别，再从下拉框为每枚徽章选择归属。</p></div><span className="readonly-tag">{categories.length} 个类别</span></div><form className="attribute-category-create" onSubmit={create}><label><span>新增类别</span><input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="例如：思维类" /></label><button className="pixel-button pixel-button--cyan" type="submit" disabled={!normalizedNewName || newNameExists}>＋ 添加类别</button>{newNameExists && <small>这个类别已经存在。</small>}</form><div className="attribute-category-grid">{categories.map((category) => { const count = attributes.filter((attribute) => (attribute.category || "未分类") === category.name).length; const editing = editingId === category.id; const confirming = pendingDeleteId === category.id; return <article className={category.system ? "is-system" : ""} key={category.id}>{editing ? <div className="attribute-category-edit"><input autoFocus value={editingName} aria-label={`重命名${category.name}`} onChange={(event) => setEditingName(event.target.value)} /><button type="button" onClick={() => rename(category)}>保存</button><button type="button" onClick={() => setEditingId(null)}>取消</button></div> : <><span className="attribute-category-icon">▦</span><div><b>{category.name}</b><small>{count} 枚徽章{category.system ? " · 系统保底" : ""}</small></div>{category.system ? <em>不可删除</em> : <div className="attribute-category-actions"><button type="button" onClick={() => { setEditingId(category.id); setEditingName(category.name); setPendingDeleteId(null); }}>重命名</button><button className="danger-link" type="button" onClick={() => setPendingDeleteId(category.id)}>删除</button></div>}</>}{confirming && <div className="attribute-category-confirm"><span>{count > 0 ? `${count} 枚徽章将移入“未分类”` : "确认删除这个空类别？"}</span><button className="danger-button" type="button" onClick={() => { onDelete(category.id); setPendingDeleteId(null); }}>确认删除</button><button type="button" onClick={() => setPendingDeleteId(null)}>取消</button></div>}</article>; })}</div></section>;
}

function AttributeCategoryManager(props: { categories: readonly AttributeCategoryRecord[]; attributes: readonly Attribute[]; onCreate: (name: string) => void; onRename: (id: string, name: string) => void; onDelete: (id: string) => void }) {
  return <details className="pixel-card category-manager-collapse"><summary><span><small>BADGE CATEGORIES</small><b>徽章类别管理</b></span><em>{props.categories.length} 个类别</em><strong>展开管理 ＋</strong></summary><AttributeCategoryManagerBody {...props} /></details>;
}

function ProjectCategoryManager(props: { categories: readonly AttributeCategoryRecord[]; projects: readonly ProjectRecord[]; onCreate: (name: string, color: string) => void; onRename: (id: string, name: string, color: string) => void; onDelete: (id: string) => void }) {
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("cyan");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingColor, setEditingColor] = useState("cyan");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const normalizedNewName = newName.trim();
  const duplicate = props.categories.some((category) => category.name === normalizedNewName);
  const create = (event: FormEvent) => {
    event.preventDefault();
    if (!normalizedNewName || duplicate) return;
    props.onCreate(normalizedNewName, newColor);
    setNewName("");
  };
  const colorSelect = (value: string, onChange: (value: string) => void, label: string) => <label className="category-color-field"><span>色块颜色</span><div><i style={{ background: paletteColorValue(value) }} /><select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>{CATEGORY_PALETTE.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></div></label>;
  return <details className="pixel-card category-manager-collapse"><summary><span><small>PROJECT CATEGORIES</small><b>项目类别管理</b></span><em>{props.categories.length} 个类别</em><strong>展开管理 ＋</strong></summary><div className="category-manager-body"><form className="attribute-category-create project-category-create" onSubmit={create}><label><span>新增类别</span><input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="例如：研究工作" /></label>{colorSelect(newColor, setNewColor, "新增类别色块颜色")}<button className="pixel-button pixel-button--cyan" type="submit" disabled={!normalizedNewName || duplicate}>＋ 添加类别</button>{duplicate && <small>这个类别已经存在。</small>}</form><div className="attribute-category-grid">{props.categories.map((category) => { const count = props.projects.filter((project) => (project.category || "未分类") === category.name).length; const editing = editingId === category.id; const confirming = pendingDeleteId === category.id; const save = () => { const name = editingName.trim(); if (!name || props.categories.some((item) => item.id !== category.id && item.name === name) || (name === category.name && editingColor === category.color)) return; props.onRename(category.id, name, editingColor); setEditingId(null); setEditingName(""); }; const beginEdit = () => { setEditingId(category.id); setEditingName(category.name); setEditingColor(category.color); setPendingDeleteId(null); }; return <article className={category.system || category.integrationKey ? "is-system" : ""} key={category.id}>{editing ? <div className="attribute-category-edit project-category-edit"><input autoFocus={!category.system} disabled={category.system} value={editingName} aria-label={`重命名${category.name}`} onChange={(event) => setEditingName(event.target.value)} />{colorSelect(editingColor, setEditingColor, `${category.name}色块颜色`)}<button type="button" onClick={save}>保存</button><button type="button" onClick={() => setEditingId(null)}>取消</button></div> : <><span className="attribute-category-icon" style={{ background: paletteColorValue(category.color), color: readableTextColor(paletteColorValue(category.color)) }}>◆</span><div><b>{category.name}</b><small>{count} 个项目 · {badgeColorLabel(category.color)}{category.system ? " · 系统保底" : category.integrationKey ? " · 同步分类" : ""}</small></div><div className="attribute-category-actions"><button type="button" onClick={beginEdit}>{category.system ? "配色" : "编辑"}</button>{!category.system && !category.integrationKey && <button className="danger-link" type="button" onClick={() => setPendingDeleteId(category.id)}>删除</button>}</div></>}{confirming && <div className="attribute-category-confirm"><span>{count > 0 ? `${count} 个项目将移入“未分类”` : "确认删除这个空类别？"}</span><button className="danger-button" type="button" onClick={() => { props.onDelete(category.id); setPendingDeleteId(null); }}>确认删除</button><button type="button" onClick={() => setPendingDeleteId(null)}>取消</button></div>}</article>; })}</div></div></details>;
}

function ActionConfigView({ attributes, attributeCategories, projectCategories, projects, courses, courseProjects, onNewAttribute, onEditAttribute, onNewProject, onEditProject, onConfigureCourse, onCreateCategory, onRenameCategory, onDeleteCategory, onCreateProjectCategory, onRenameProjectCategory, onDeleteProjectCategory }: { attributes: Attribute[]; attributeCategories: readonly AttributeCategoryRecord[]; projectCategories: readonly AttributeCategoryRecord[]; projects: readonly ProjectRecord[]; courses: readonly LearningMoreCourse[]; courseProjects: readonly ProjectRecord[]; onNewAttribute: () => void; onEditAttribute: (attribute: Attribute) => void; onNewProject: () => void; onEditProject: (project: ProjectRecord) => void; onConfigureCourse: (project: ProjectRecord) => void; onCreateCategory: (name: string) => void; onRenameCategory: (id: string, name: string) => void; onDeleteCategory: (id: string) => void; onCreateProjectCategory: (name: string, color: string) => void; onRenameProjectCategory: (id: string, name: string, color: string) => void; onDeleteProjectCategory: (id: string) => void }) {
  const [section, setSection] = useState<"projects" | "courses" | "attributes">("projects");
  const unitLabel = (unit: RewardUnit) => unit === "hour" ? "时" : unit === "lesson" ? "节" : "次";
  const activeCourseCount = courses.filter((course) => course.status === "active").length;
  return <div className="view action-config-view">
    <div className="page-title"><div><span className="eyebrow">ACTION CONFIG</span><h1>行动配置</h1></div></div>
    <div className="action-config-tabs" role="tablist" aria-label="行动配置分类"><button role="tab" aria-selected={section === "projects"} className={section === "projects" ? "active" : ""} onClick={() => setSection("projects")}><span>◆</span><div><small>ACTION PROJECTS</small><b>行动项目</b></div><em>{projects.length}</em></button><button role="tab" aria-selected={section === "courses"} className={section === "courses" ? "active" : ""} onClick={() => setSection("courses")}><span>▥</span><div><small>COURSE SETUP</small><b>课程设置</b></div><em>{courseProjects.length}</em></button><button role="tab" aria-selected={section === "attributes"} className={section === "attributes" ? "active" : ""} onClick={() => setSection("attributes")}><span>✦</span><div><small>BADGE SETUP</small><b>属性徽章</b></div><em>{attributes.length}</em></button></div>
    {section === "projects" && <ProjectCategoryManager categories={projectCategories} projects={projects} onCreate={onCreateProjectCategory} onRename={onRenameProjectCategory} onDelete={onDeleteProjectCategory} />}
    {section === "projects" && <section className="project-library pixel-card"><div className="section-heading"><div><span className="eyebrow">ACTION PROJECTS</span><h2>行动项目模板</h2></div><button className="pixel-button pixel-button--cyan" onClick={onNewProject}>＋ 新项目</button></div>{projects.length === 0 ? <div className="mini-empty">还没有普通项目。创建后，新增计划只需选择项目和开始时间。</div> : <div className="project-grid">{projects.map((project) => <button className="project-card" key={project.id} onClick={() => onEditProject(project)}><span className="project-card__pixel">◆</span><div><b>{project.name}</b><small>{project.category} · 每{unitLabel(project.unit)}</small><RewardChips rewards={project.rewardsPerUnit} attributes={attributes} maxVisible={4} /></div><em>编辑 →</em></button>)}</div>}</section>}
    {section === "courses" && <section className="course-config-section pixel-card"><div className="section-heading"><div><span className="eyebrow">LEARNING MORE SYNC</span><h2>Learning MORE 课程属性配置</h2></div><span className="readonly-tag">{activeCourseCount} 门进行中 · 共 {courses.length} 门</span></div>{courseProjects.length === 0 ? <div className="mini-empty">连接 Learning MORE 后，全部课程会出现在这里等待配置。</div> : <div className="course-config-grid">{courseProjects.map((project) => { const course = courses.find((item) => item.courseId === project.sourceCourseId); const configured = project.rewardsPerUnit.length > 0; return <button className={`course-config-card${configured ? " is-configured" : ""}`} key={project.id} onClick={() => onConfigureCourse(project)}><span className="book-pixel">▥</span><div><b>{project.name}</b><small>{course?.status === "closed" ? "课程已结课" : configured ? "每节属性已配置" : "等待配置每节属性"}</small><RewardChips rewards={project.rewardsPerUnit} attributes={attributes} maxVisible={4} /></div><em>{configured ? "修改 →" : "去配置 →"}</em></button>; })}</div>}</section>}
    {section === "attributes" && <><AttributeCategoryManager categories={attributeCategories} attributes={attributes} onCreate={onCreateCategory} onRename={onRenameCategory} onDelete={onDeleteCategory} /><section className="pixel-card config-section attribute-config-section"><div className="section-heading"><div><span className="eyebrow">ATTRIBUTE SETUP</span><h2>属性徽章定义</h2></div><div className="section-heading__actions"><span className="readonly-tag">{attributes.length} 枚已定义</span><button className="pixel-button pixel-button--pink" onClick={onNewAttribute}>＋ 新属性</button></div></div>{attributes.length === 0 ? <div className="mini-empty">先创建一个属性，项目和课程才能把完成奖励配置到它。</div> : <div className="config-attribute-grid">{attributes.map((attribute) => <button key={attribute.id} style={{ "--category-accent": badgeColorValue(attribute.color) } as CSSProperties} onClick={() => onEditAttribute(attribute)}><span><BadgeSymbol icon={attribute.icon} /></span><div><b>{attribute.name}</b><small>{attribute.category ?? "未分类"} · {badgeColorLabel(attribute.color)}</small></div><em>编辑 →</em></button>)}</div>}</section></>}
  </div>;
}

function GrowthView({ attributes, skillbooks, goals }: { attributes: Attribute[]; skillbooks: readonly SkillbookRecord[]; goals: readonly GoalRecord[] }) {
  const [section, setSection] = useState<"badges" | "skillbooks" | "milestones">("badges");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [expandedCategories, setExpandedCategories] = useState<string[]>([]);
  const preferredCategories = ["学习", "研究", "身体", "表达", "生活", "未分类"];
  const categories = Array.from(new Set(attributes.map((attribute) => attribute.category ?? "未分类"))).sort((left, right) => {
    const leftIndex = preferredCategories.indexOf(left);
    const rightIndex = preferredCategories.indexOf(right);
    if (leftIndex === -1 && rightIndex === -1) return left.localeCompare(right, "zh-CN");
    if (leftIndex === -1) return 1;
    if (rightIndex === -1) return -1;
    return leftIndex - rightIndex;
  });
  const activeCategory = selectedCategory === "all" || categories.includes(selectedCategory) ? selectedCategory : "all";
  const catalogAttributes = [...attributes].sort((left, right) => {
    return Number(Boolean(right.pinned)) - Number(Boolean(left.pinned)) || (right.lastGainedAt ?? "").localeCompare(left.lastGainedAt ?? "");
  });
  const groupedAttributes = categories.filter((category) => activeCategory === "all" || category === activeCategory).map((category) => ({
    category,
    items: catalogAttributes.filter((attribute) => (attribute.category ?? "未分类") === category),
    total: attributes.filter((attribute) => (attribute.category ?? "未分类") === category).length,
  }));
  return (
    <div className="view">
      <div className="page-title"><div><span className="eyebrow">PIXEL ATLAS</span><h1>成就图鉴</h1></div><div className="page-title__actions"><span className="collection-count">{section === "badges" ? `${attributes.length} 枚徽章` : section === "skillbooks" ? `${skillbooks.length} 本技能书` : `${goals.filter((goal) => goal.archivedAt).length} 个里程碑`}</span></div></div>
      <div className="growth-subtabs" role="tablist" aria-label="成就图鉴分类"><button role="tab" aria-selected={section === "badges"} className={section === "badges" ? "active" : ""} onClick={() => setSection("badges")}><span>◆</span><div><small>ATTRIBUTE BADGES</small><b>属性徽章</b></div><em>{attributes.length}</em></button><button role="tab" aria-selected={section === "skillbooks"} className={section === "skillbooks" ? "active" : ""} onClick={() => setSection("skillbooks")}><span>▥</span><div><small>SKILLBOOKS</small><b>技能书架</b></div><em>{skillbooks.length}</em></button><button role="tab" aria-selected={section === "milestones"} className={section === "milestones" ? "active" : ""} onClick={() => setSection("milestones")}><span>⌁</span><div><small>JOURNEY MAP</small><b>里程地图</b></div><em>{goals.filter((goal) => goal.period === "month" || Boolean(goal.archivedAt)).length}</em></button></div>
      {section === "badges" ? <>{attributes.length > 0 && <div className="category-summary" aria-label="按属性类别筛选"><button className={`category-summary__item category-summary__item--all${activeCategory === "all" ? " active" : ""}`} type="button" aria-pressed={activeCategory === "all"} onClick={() => setSelectedCategory("all")}><i />全部<b>{attributes.length}</b></button>{categories.map((category) => <button className={`category-summary__item${activeCategory === category ? " active" : ""}`} type="button" aria-pressed={activeCategory === category} style={{ "--category-accent": colorForCategory(category) } as CSSProperties} key={category} onClick={() => setSelectedCategory(category)}><i />{category}<b>{attributes.filter((attribute) => (attribute.category ?? "未分类") === category).length}</b></button>)}</div>}
      {attributes.length > 0 ? <div className="attribute-catalog">{groupedAttributes.map((group, index) => {
        const expanded = expandedCategories.includes(group.category);
        const visibleItems = expanded ? group.items : group.items.slice(0, 3);
        const headingId = `attribute-category-${index}`;
        return <section className="attribute-category-section pixel-card" style={{ "--category-accent": colorForCategory(group.category) } as CSSProperties} key={group.category} aria-labelledby={headingId}><header className="attribute-category-heading"><div><span className="category-pixel" aria-hidden="true" /><div><span className="eyebrow">ATTRIBUTE CLASS</span><h2 id={headingId}>{group.category}</h2></div></div><span>{group.total} 枚徽章</span></header><div className="badge-grid">{visibleItems.map((attribute) => <PixelBadge key={attribute.id} attribute={attribute} />)}</div>{group.items.length > 3 && <button className="category-expand" onClick={() => setExpandedCategories((current) => expanded ? current.filter((item) => item !== group.category) : [...current, group.category])}>{expanded ? `收起${group.category}分类` : `展开本类其余 ${group.items.length - 3} 枚`}</button>}</section>;
      })}</div> : <section className="empty-page pixel-card"><span className="empty-pixel">✦</span><h2>还没有属性徽章</h2><p>在“行动配置”中创建属性后，完成计划获得的经验会陈列在这里。</p></section>}</> : section === "skillbooks" ? <section className="skillbook-section skillbook-section--standalone pixel-card" role="tabpanel"><div className="section-heading"><div><span className="eyebrow">LEARNING MORE</span><h2>技能书收藏架</h2><p>课程正式结课后自动收录，只作永久收藏展示。</p></div><span className="readonly-tag">永久收藏 · 无数值效果</span></div><div className="bookshelf">{skillbooks.length === 0 ? <article className="empty-book"><span>＋</span><p>完成 Learning MORE 正式课程后<br />技能书会出现在这里</p></article> : skillbooks.map((book) => <article className="skillbook-card" key={book.id}><span>▥</span><b>{book.title}</b><small>{book.acquiredAt.slice(0, 10)} 收集</small></article>)}</div></section> : <MilestoneRunner goals={goals} />}
    </div>
  );
}

function WeightView({ entries, target, onAdd, onTarget }: { entries: WeightEntry[]; target?: number; onAdd: (value: number) => void; onTarget: (value: number) => void }) {
  const [value, setValue] = useState(entries.at(-1)?.value.toFixed(1) ?? "");
  const [range, setRange] = useState<7 | 30 | 90 | 365>(30);
  const [page, setPage] = useState(1);
  const [targetValue, setTargetValue] = useState(target?.toFixed(1) ?? "");
  const averages = movingAverage(entries);
  const latest = entries.at(-1);
  const previous = entries.at(-2);
  const rangeEntries = entries.slice(-range);
  const chartEntries = downsampleEntries(rangeEntries, 60);
  const averageByDate = new Map(entries.map((entry, index) => [entry.date, averages[index]]));
  const chartAverages = chartEntries.map((entry) => averageByDate.get(entry.date) ?? null);
  const pageSize = 50;
  const history = [...entries].reverse();
  const pageCount = Math.max(1, Math.ceil(history.length / pageSize));
  const pageEntries = history.slice((page - 1) * pageSize, page * pageSize);
  const submit = (event: FormEvent) => { event.preventDefault(); const parsed = Number(value); if (parsed >= 20 && parsed <= 300) onAdd(Math.round(parsed * 10) / 10); };
  return (
    <div className="view">
      <div className="page-title"><div><span className="eyebrow">BODY TRACK</span><h1>体重趋势</h1><p>只记录事实与趋势，不提供健康判断。</p></div><form className="weight-form" onSubmit={submit}><label htmlFor="weight">今日体重</label><div><input id="weight" type="number" min="20" max="300" step="0.1" value={value} onChange={(event) => setValue(event.target.value)} /><span>kg</span></div><button className="pixel-button pixel-button--pink">保存记录</button></form></div>
      <div className="weight-overview"><article className="stat-card pixel-card"><span>最新体重</span><strong>{latest ? latest.value.toFixed(1) : "—"} <small>kg</small></strong><em>{latest && previous ? `较上次 ${(latest.value - previous.value).toFixed(1)} kg` : "暂无历史记录"}</em></article><article className="stat-card pixel-card"><span>7 日移动平均</span><strong>{averages.at(-1)?.toFixed(1) ?? "—"} <small>kg</small></strong><em>{entries.length > 1 ? `基于 ${Math.min(entries.length, 7)} 条有效记录` : "至少需要两条记录"}</em></article><article className="stat-card pixel-card"><span>目标体重</span><form className="target-weight-form" onSubmit={(event) => { event.preventDefault(); const parsed = Number(targetValue); if (parsed >= 20 && parsed <= 300) onTarget(parsed); }}><input aria-label="目标体重" type="number" min="20" max="300" step="0.1" value={targetValue} onChange={(event) => setTargetValue(event.target.value)} /><small>kg</small><button>保存</button></form><em>{target ? `目标线 ${target.toFixed(1)} kg` : "暂未设置目标"}</em></article></div>
      <section className="weight-detail pixel-card"><div className="section-heading"><div><span className="eyebrow">{range} DAYS</span><h2>每日值与移动平均</h2></div><div className="chart-range" aria-label="图表范围">{([7, 30, 90, 365] as const).map((valueOption) => <button className={range === valueOption ? "active" : ""} key={valueOption} onClick={() => setRange(valueOption)}>{valueOption === 365 ? "全部" : `${valueOption}日`}</button>)}</div></div><div className="chart-legend"><span><i className="raw" />每日值</span><span><i className="average" />7日均值</span><span><i className="target" />目标线</span>{rangeEntries.length > chartEntries.length && <em>{rangeEntries.length} 条记录已压缩为 {chartEntries.length} 个关键点</em>}</div><WeightChart entries={chartEntries} target={target} averageValues={chartAverages} /></section>
      <section className="pixel-card weight-history"><div className="section-heading section-heading--small"><div><span className="eyebrow">HISTORY</span><h2>历史记录</h2></div><span>共 {entries.length} 条 · 每页 50 条</span></div>{entries.length === 0 ? <div className="mini-empty">暂无体重记录</div> : <><div className="history-table">{pageEntries.map((entry, index) => <div key={entry.date}><span>{entry.date} · {entry.label}</span><b>{entry.value.toFixed(1)}</b><small>{page === 1 && index === 0 ? "当前有效值" : "已同步"}</small></div>)}</div><div className="pagination"><button disabled={page === 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>← 上一页</button><span>第 {page} / {pageCount} 页</span><button disabled={page === pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>下一页 →</button></div></>}</section>
    </div>
  );
}

function RewardAttributeTiles({ attributes, values, onChange, ariaSuffix }: { attributes: readonly AttributeRecord[]; values: Record<string, string>; onChange: (values: Record<string, string>) => void; ariaSuffix: string }) {
  const categories = Array.from(new Set(attributes.map((attribute) => attribute.category || "未分类")));
  return <div className="reward-category-list">{categories.map((category) => { const items = attributes.filter((attribute) => (attribute.category || "未分类") === category); return <section className="reward-category-group" key={category}><header style={{ "--reward-category-color": colorForCategory(category) } as CSSProperties}><i /><b>{category}</b><small>{items.length} 枚</small></header><div className="reward-tile-grid">{items.map((attribute) => { const value = values[attribute.id] ?? ""; return <label className={`reward-tile${Number(value) > 0 ? " is-active" : ""}`} style={{ "--reward-color": badgeColorValue(attribute.color) } as CSSProperties} key={attribute.id}><span className="reward-tile__identity"><i><BadgeSymbol icon={attribute.icon} /></i><b>{attribute.name}</b></span><span className="reward-tile__amount"><input aria-label={`${attribute.name} ${ariaSuffix}`} type="number" min="0" max="999" step="0.1" value={value} placeholder="0" onChange={(event) => onChange({ ...values, [attribute.id]: event.target.value })} /><em>XP</em></span></label>; })}</div></section>; })}</div>;
}

function RewardInputs({ attributes, values, onChange, emptyText = "先去“行动配置”创建属性徽章。" }: { attributes: readonly AttributeRecord[]; values: Record<string, string>; onChange: (values: Record<string, string>) => void; emptyText?: string }) {
  return <fieldset className="reward-editor"><legend>每单位属性奖励</legend>{attributes.length === 0 ? <p>{emptyText}</p> : <RewardAttributeTiles attributes={attributes} values={values} onChange={onChange} ariaSuffix="每单位经验" />}</fieldset>;
}

type TimeSegmentDraft = Readonly<{ id: string; start: string; end: string; completedAt?: string }>;

function newTimeSegment(start = "20:30", end = "21:30"): TimeSegmentDraft {
  return { id: `segment-${crypto.randomUUID()}`, start, end };
}

function timeAfter(value: string, minutes: number): string {
  const [hour = 0, minute = 0] = value.split(":").map(Number);
  const total = Math.min(23 * 60 + 59, hour * 60 + minute + minutes);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function segmentsAreValid(segments: readonly TimeSegmentDraft[]): boolean {
  if (segments.length === 0 || segments.some((segment) => !segment.start || !segment.end || segment.end <= segment.start)) return false;
  const ordered = [...segments].sort((left, right) => left.start.localeCompare(right.start));
  return ordered.every((segment, index) => index === 0 || ordered[index - 1]!.end <= segment.start);
}

function segmentsAreUnscheduled(segments: readonly TimeSegmentDraft[]): boolean {
  return segments.length === 1 && !segments[0]!.start && !segments[0]!.end;
}

function quickSegmentsAreValid(segments: readonly TimeSegmentDraft[]): boolean {
  return segmentsAreUnscheduled(segments) || segmentsAreValid(segments);
}

function segmentRecordsForDate(date: string, segments: readonly TimeSegmentDraft[]): PlanTimeSegment[] {
  return [...segments].sort((left, right) => left.start.localeCompare(right.start)).map((segment) => ({
    id: segment.id,
    startAt: `${date}T${segment.start}:00+08:00`,
    endAt: `${date}T${segment.end}:00+08:00`,
    ...(segment.completedAt ? { completedAt: segment.completedAt } : {}),
  }));
}

function TimeSegmentsEditor({ segments, onChange, allowUnscheduled = false }: { segments: readonly TimeSegmentDraft[]; onChange: (segments: TimeSegmentDraft[]) => void; allowUnscheduled?: boolean }) {
  return <fieldset className="time-segment-editor"><legend>具体执行时间</legend>
    <div className="time-segment-list">{segments.map((segment, index) => <div className={`time-segment-row${segment.completedAt ? " is-complete" : ""}`} key={segment.id}>
      <input aria-label={`第 ${index + 1} 段开始时间`} type="time" required={!allowUnscheduled} value={segment.start} onChange={(event) => onChange(segments.map((item) => item.id === segment.id ? { ...item, start: event.target.value } : item))} />
      <span>—</span>
      <input aria-label={`第 ${index + 1} 段结束时间`} type="time" required={!allowUnscheduled} value={segment.end} onChange={(event) => onChange(segments.map((item) => item.id === segment.id ? { ...item, end: event.target.value } : item))} />
      {segment.completedAt && <em>已执行</em>}
      {segments.length > 1 && <button type="button" aria-label={`移除第 ${index + 1} 段`} onClick={() => onChange(segments.filter((item) => item.id !== segment.id))}>移除</button>}
    </div>)}</div>
    <div className="time-segment-actions">
      <button className="add-time-segment" type="button" disabled={!segmentsAreValid(segments) || segments.at(-1)?.end === "23:59"} onClick={() => { const start = segments.at(-1)?.end || "20:30"; onChange([...segments, newTimeSegment(start, timeAfter(start, 60))]); }}>＋ 增加时间段</button>
      {allowUnscheduled && !segmentsAreUnscheduled(segments) && <button className="clear-time-segments" type="button" onClick={() => onChange([newTimeSegment("", "")])}>暂不安排具体时间</button>}
    </div>
    {allowUnscheduled && segmentsAreUnscheduled(segments) && <small className="time-segment-hint">保持 --:--，计划会进入当天“待安排”。</small>}
    {!(allowUnscheduled ? quickSegmentsAreValid(segments) : segmentsAreValid(segments)) && <small className="time-segment-error">各时段需完整填写、结束晚于开始，且不能互相重叠。</small>}
  </fieldset>;
}

type QuickPlanInput = Readonly<{ projectId?: string; title: string; segments: readonly TimeSegmentDraft[]; date: string; goalIds: readonly string[]; sourceLessonId?: string; recurrence: RecurrenceRule }>;

function QuickAddModal({ projects, learningMoreLessons, attributes, goals, initialProjectId, initialLessonId, initialGoalIds = [], onClose, onAdd, onManageProjects }: { projects: readonly ProjectRecord[]; learningMoreLessons: readonly LearningMoreLesson[]; attributes: Attribute[]; goals: readonly GoalRecord[]; initialProjectId?: string; initialLessonId?: string; initialGoalIds?: readonly string[]; onClose: () => void; onAdd: (value: QuickPlanInput) => void; onManageProjects: () => void }) {
  const [title, setTitle] = useState("");
  const [segments, setSegments] = useState<TimeSegmentDraft[]>([newTimeSegment("", "")]);
  const [date, setDate] = useState(currentLocalDate());
  const [goalIds, setGoalIds] = useState<string[]>(() => [...new Set(initialGoalIds.filter((id) => goals.some((goal) => goal.id === id && goal.archivedAt === undefined)))]);
  const [projectId, setProjectId] = useState(initialProjectId && projects.some((project) => project.id === initialProjectId) ? initialProjectId : projects[0]?.id ?? "");
  const [repeatKind, setRepeatKind] = useState<"none" | "daily" | "weekly" | "interval">("none");
  const [repeatInterval, setRepeatInterval] = useState("2");
  const [repeatEnd, setRepeatEnd] = useState<"count" | "date">("count");
  const [repeatCount, setRepeatCount] = useState("4");
  const [repeatUntil, setRepeatUntil] = useState(shiftLocalDate(currentLocalDate(), 28));
  const initialWeekday = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  const [weekdays, setWeekdays] = useState<number[]>([initialWeekday]);
  const selected = projects.find((project) => project.id === projectId);
  const availableLessons = selected?.source === "learning-more" ? [...learningMoreLessons].filter((lesson) => lesson.courseId === selected.sourceCourseId).sort((left, right) => left.scheduledDate.localeCompare(right.scheduledDate) || left.order - right.order || left.lessonId.localeCompare(right.lessonId)) : [];
  const nextLesson = initialLessonId ? availableLessons.find((lesson) => lesson.lessonId === initialLessonId) ?? availableLessons[0] : availableLessons[0];
  const effectiveDate = nextLesson?.scheduledDate ?? date;
  const eligibleGoals = goals.filter((goal) => goal.archivedAt === undefined && goal.startDate <= effectiveDate && goal.endDate >= effectiveDate);
  const weekGoals = eligibleGoals.filter((goal) => goal.period === "week");
  const monthGoals = eligibleGoals.filter((goal) => goal.period === "month");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (selected?.source === "learning-more" && !nextLesson) return;
    const end = repeatEnd === "count"
      ? { mode: "count" as const, count: Math.min(365, Math.max(1, Number(repeatCount) || 1)) }
      : { mode: "date" as const, until: repeatUntil };
    const recurrence: RecurrenceRule = repeatKind === "none"
      ? { kind: "none" }
      : repeatKind === "weekly"
        ? { kind: "weekly", interval: 1, weekdays, end }
        : { kind: "daily", interval: repeatKind === "daily" ? 1 : Math.min(365, Math.max(1, Number(repeatInterval) || 1)), end };
    if ((projectId || title.trim()) && quickSegmentsAreValid(segments)) onAdd({ ...(projectId ? { projectId } : {}), title: title.trim(), segments, date: effectiveDate, goalIds, recurrence, ...(nextLesson ? { sourceLessonId: nextLesson.lessonId } : {}) });
  };
  const previewEnd = repeatEnd === "count" ? { mode: "count" as const, count: Math.min(365, Math.max(1, Number(repeatCount) || 1)) } : { mode: "date" as const, until: repeatUntil };
  const previewRule: RecurrenceRule = repeatKind === "none" ? { kind: "none" } : repeatKind === "weekly" ? { kind: "weekly", interval: 1, weekdays, end: previewEnd } : { kind: "daily", interval: repeatKind === "daily" ? 1 : Number(repeatInterval) || 1, end: previewEnd };
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><form className="quick-modal quick-action-modal pixel-card" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="quick-title">
    <button type="button" className="modal-close" onClick={onClose} aria-label="关闭">×</button>
    <span className="eyebrow">QUICK ADD</span><h2 id="quick-title">从项目安排行动</h2>
    {projects.length > 0 ? <label>选择项目<select autoFocus value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">临时计划（不使用项目）</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.source === "learning-more" ? "▥ " : ""}{project.name}</option>)}</select></label> : <div className="modal-note">还没有可用项目。可以先创建项目，也可以填写标题建立临时计划。</div>}
    {selected?.source === "learning-more" && <div className="modal-note">{nextLesson ? <>Learning MORE 已排课时：<b>{nextLesson.scheduledDate} · {nextLesson.title}</b><br />Week UP 只补充当天的具体执行时间。</> : "这门课当前没有已排期、未加入 Week UP 的课时。"}</div>}
    <label>计划标题（可选）<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={nextLesson ? `留空使用：${nextLesson.title}` : selected ? `留空将生成：${selected.name} 01` : "例如：整理概率论错题"} /></label>
    <label>首次日期<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><TimeSegmentsEditor segments={segments} onChange={setSegments} allowUnscheduled />
    {eligibleGoals.length > 0 && <fieldset className="goal-links"><legend>关联目标</legend>{weekGoals.length > 0 && <div className="goal-link-group"><b>周目标</b>{weekGoals.map((goal) => <label className="check-row" key={goal.id}><input type="checkbox" checked={goalIds.includes(goal.id)} onChange={(event) => setGoalIds((current) => event.target.checked ? [...current, goal.id] : current.filter((id) => id !== goal.id))} />{goal.title}</label>)}</div>}{monthGoals.length > 0 && <div className="goal-link-group"><b>月方向</b>{monthGoals.map((goal) => <label className="check-row" key={goal.id}><input type="checkbox" checked={goalIds.includes(goal.id)} onChange={(event) => setGoalIds((current) => event.target.checked ? [...current, goal.id] : current.filter((id) => id !== goal.id))} />{goal.title}</label>)}</div>}</fieldset>}
    {!nextLesson && <fieldset className="recurrence-editor"><legend>重复行动</legend><label>重复方式<select value={repeatKind} onChange={(event) => setRepeatKind(event.target.value as typeof repeatKind)}><option value="none">不重复</option><option value="daily">每天</option><option value="weekly">每周指定星期</option><option value="interval">每隔若干天</option></select></label>
      {repeatKind === "interval" && <label>间隔天数<input type="number" min="2" max="365" value={repeatInterval} onChange={(event) => setRepeatInterval(event.target.value)} /></label>}
      {repeatKind === "weekly" && <div className="weekday-picker" aria-label="选择重复星期">{["一", "二", "三", "四", "五", "六", "日"].map((label, index) => <button type="button" className={weekdays.includes(index) ? "active" : ""} aria-pressed={weekdays.includes(index)} key={label} onClick={() => setWeekdays((current) => current.includes(index) ? current.filter((day) => day !== index) : [...current, index].sort())}>周{label}</button>)}</div>}
      {repeatKind !== "none" && <div className="recurrence-end"><label>结束方式<select value={repeatEnd} onChange={(event) => setRepeatEnd(event.target.value as typeof repeatEnd)}><option value="count">重复次数</option><option value="date">结束日期</option></select></label>{repeatEnd === "count" ? <label>生成次数<input type="number" min="1" max="365" value={repeatCount} onChange={(event) => setRepeatCount(event.target.value)} /></label> : <label>结束日期<input type="date" min={date} value={repeatUntil} onChange={(event) => setRepeatUntil(event.target.value)} /></label>}</div>}
      {repeatKind !== "none" && <div className="recurrence-preview"><span>↻</span><div><b>{recurrenceSummary(previewRule)}</b><small>每次都会生成独立计划；单独编辑后不再受批量取消影响。</small></div></div>}
    </fieldset>}
    {selected && <div className="template-preview"><b>{nextLesson?.title ?? selected.name}</b><span>{nextLesson ? `${nextLesson.scheduledDate} · ` : ""}{selected.category} · 每 {selected.unit === "hour" ? "时" : selected.unit === "lesson" ? "节" : "次"}</span><RewardChips rewards={selected.rewardsPerUnit} attributes={attributes} maxVisible={4} /></div>}
    <div className="modal-actions quick-add-actions"><button className="manage-projects-button" type="button" onClick={onManageProjects}><span>◆</span><div><b>管理项目</b><small>模板与属性奖励</small></div><em>→</em></button><button className="pixel-button pixel-button--pink" type="submit" disabled={(selected?.source === "learning-more" && !nextLesson) || !quickSegmentsAreValid(segments)}>{nextLesson ? "安排这个课时" : repeatKind === "none" ? "加入计划" : "生成重复计划"}</button></div>
  </form></div>;
}

type PlanEditorValue = Pick<PlanRecord, "title" | "detail" | "category" | "startAt" | "endAt" | "timeSegments" | "timeStatus" | "goalIds" | "rewards">;

type ProjectEditorValue = Pick<ProjectRecord, "name" | "category" | "unit" | "rewardsPerUnit">;

function ProjectModal({ initial, attributes, projectCategories, onClose, onSave, onRemove }: { initial?: ProjectRecord; attributes: readonly AttributeRecord[]; projectCategories: readonly AttributeCategoryRecord[]; onClose: () => void; onSave: (value: ProjectEditorValue) => void; onRemove?: () => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState(initial?.category ?? "未分类");
  const [unit, setUnit] = useState<RewardUnit>(initial?.unit ?? "occurrence");
  const [rewards, setRewards] = useState<Record<string, string>>(Object.fromEntries((initial?.rewardsPerUnit ?? []).map((reward) => [reward.attributeId, String(reward.amount)])));
  const fromLearningMore = initial?.source === "learning-more";
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    const rewardsPerUnit = attributes.map((attribute) => ({ attributeId: attribute.id, amount: Number(rewards[attribute.id] ?? 0) })).filter((reward) => Number.isFinite(reward.amount) && reward.amount > 0);
    onSave({ name: name.trim(), category: category.trim() || "未分类", unit: fromLearningMore ? "lesson" : unit, rewardsPerUnit });
  };
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><form className="quick-modal plan-modal project-modal pixel-card" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="project-modal-title"><button type="button" className="modal-close" onClick={onClose} aria-label="关闭">×</button><span className="eyebrow">PROJECT TEMPLATE</span><h2 id="project-modal-title">{fromLearningMore ? "配置课程每节属性" : initial ? "编辑项目模板" : "创建项目模板"}</h2>{fromLearningMore && <div className="modal-note">该项目由 Learning MORE 课程表自动生成。课程名称、课节顺序和“节”单位由同步维护；具体时间在 Week UP 安排。</div>}<label>项目名称<input autoFocus value={name} disabled={fromLearningMore} onChange={(event) => setName(event.target.value)} placeholder="例如：博士论文" /></label><div className="modal-field-row project-meta-row"><label>分类{fromLearningMore ? <input value={category} disabled /> : <select value={category} onChange={(event) => setCategory(event.target.value)}>{projectCategories.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select>}</label><label>奖励单位<select value={unit} disabled={fromLearningMore} onChange={(event) => setUnit(event.target.value as RewardUnit)}><option value="hour">时</option><option value="lesson">节</option><option value="occurrence">次</option></select></label></div><RewardInputs attributes={attributes} values={rewards} onChange={setRewards} emptyText="先创建属性徽章，才能配置项目奖励。" />{onRemove && !fromLearningMore && <div className="modal-note">移除会永久删除项目模板；既有行动仍保留当时的内容快照。</div>}<div className="modal-actions">{onRemove && !fromLearningMore && <button className="archive-button archive-button--remove" type="button" onClick={() => { if (window.confirm("永久移除这个项目模板？此操作无法撤销。")) onRemove(); }}><span>×</span>移除项目</button>}<button className="pixel-button pixel-button--pink" type="submit">保存项目配置</button></div></form></div>;
}

function instantParts(instant?: string): { date: string; time: string } {
  const value = instant ? new Date(instant) : new Date();
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(value).map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

function PlanModal({ initial, attributes, goals, onClose, onSave, onRemove, onFollowTemplate, onUpdateRecurrence, onCancelRecurrence }: { initial: PlanRecord; attributes: readonly AttributeRecord[]; goals: readonly GoalRecord[]; onClose: () => void; onSave: (value: PlanEditorValue & { unitQuantity?: number }) => void; onRemove?: () => void; onFollowTemplate?: () => void; onUpdateRecurrence?: (value: PlanEditorValue & { unitQuantity?: number }) => void; onCancelRecurrence?: () => void }) {
  const monthGoals = goals;
  const start = instantParts(initial.startAt);
  const end = instantParts(initial.endAt);
  const [title, setTitle] = useState(initial.title);
  const [detail, setDetail] = useState(initial.detail);
  const [category, setCategory] = useState(initial.category);
  const [date, setDate] = useState(start.date);
  const [segments, setSegments] = useState<TimeSegmentDraft[]>(initial.timeSegments?.length
    ? initial.timeSegments.map((segment) => ({ id: segment.id, start: instantParts(segment.startAt).time, end: instantParts(segment.endAt).time, ...(segment.completedAt ? { completedAt: segment.completedAt } : {}) }))
    : [newTimeSegment(initial.timeStatus === "unscheduled" ? "" : start.time, initial.timeStatus === "unscheduled" ? "" : end.time)]);
  const [goalIds, setGoalIds] = useState<string[]>([...initial.goalIds]);
  const [unitQuantity, setUnitQuantity] = useState(String(initial.unitQuantity ?? 1));
  const [rewards, setRewards] = useState<Record<string, string>>(Object.fromEntries(initial.rewards.map((reward) => [reward.attributeId, String(reward.amount)])));
  const linkedToLearningMore = initial.source === "learning-more";
  const editorValue = (): (PlanEditorValue & { unitQuantity?: number }) | undefined => {
    const rewardList = attributes.map((attribute) => ({ attributeId: attribute.id, amount: Number(rewards[attribute.id] ?? 0) })).filter((reward) => Number.isFinite(reward.amount) && reward.amount > 0);
    if (!title.trim() || !quickSegmentsAreValid(segments)) return undefined;
    const unscheduled = segmentsAreUnscheduled(segments);
    const timeSegments = unscheduled ? [] : segmentRecordsForDate(date, segments);
    const startAt = timeSegments[0]?.startAt ?? `${date}T00:00:00+08:00`;
    const endAt = timeSegments.at(-1)?.endAt ?? `${date}T01:00:00+08:00`;
    return { title: title.trim(), detail: detail.trim(), category: category.trim() || "未分类", startAt, endAt, timeSegments, timeStatus: unscheduled ? "unscheduled" : "scheduled", goalIds, rewards: rewardList, ...(initial.unitKind && initial.unitKind !== "hour" ? { unitQuantity: Number(unitQuantity) || 1 } : {}) };
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = editorValue();
    if (value) onSave(value);
  };
  const updateRecurrence = () => {
    const value = editorValue();
    if (value && onUpdateRecurrence && window.confirm("将修改本次及后续所有未完成、且没有单独修改的重复计划，继续吗？")) onUpdateRecurrence(value);
  };
  const categoryField = <label>分类<input value={category} disabled={Boolean(initial.projectId)} onChange={(event) => setCategory(event.target.value)} /></label>;
  const quantityField = initial.unitKind && initial.unitKind !== "hour" && !linkedToLearningMore ? <label>本次数量（{initial.unitKind === "lesson" ? "节" : "次"}）<input type="number" min="0.1" max="999" step="0.1" value={unitQuantity} onChange={(event) => setUnitQuantity(event.target.value)} /></label> : undefined;
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><form className="quick-modal plan-modal pixel-card" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="plan-modal-title"><button type="button" className="modal-close" onClick={onClose} aria-label="关闭">×</button><span className="eyebrow">DAILY QUEST</span><h2 id="plan-modal-title">编辑具体行动</h2>{initial.templateKind && <div className={`template-state template-state--${initial.rewardMode}`}><b>{initial.rewardMode === "custom" ? "本次奖励已自定义" : initial.rewardMode === "template" ? "正在跟随项目模板" : "项目奖励等待配置"}</b>{initial.rewardMode === "custom" && onFollowTemplate && <button type="button" onClick={onFollowTemplate}>恢复跟随模板</button>}</div>}{initial.recurrenceGroupId && <div className={`recurrence-state${initial.recurrenceDetachedAt ? " is-detached" : ""}`}><span>↻</span><div><b>{initial.recurrenceDetachedAt ? "本次已单独修改" : initial.recurrenceSummary ?? "重复行动"}</b><small>{initial.recurrenceDetachedAt ? "批量操作会跳过这一项。" : "可只保存本次，或批量更新仍未单独修改的后续计划。"}</small></div></div>}{linkedToLearningMore && <div className="modal-note">课程、课节和排期日期来自 Learning MORE；Week UP 只补充当天的具体执行时间，完成状态继续同步。</div>}<label>计划名称<input value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>具体内容<input value={detail} onChange={(event) => setDetail(event.target.value)} /></label>{quantityField ? <div className="modal-field-row plan-category-quantity-row">{categoryField}{quantityField}</div> : categoryField}<label>排期日期<input type="date" value={date} disabled={linkedToLearningMore} onChange={(event) => setDate(event.target.value)} /></label><TimeSegmentsEditor segments={segments} onChange={setSegments} allowUnscheduled />{initial.unitKind === "hour" && <div className="modal-note">{segmentsAreUnscheduled(segments) ? "具体时间待配置后，将按全部执行分段累计时长换算。" : <>本次按全部执行分段累计时长自动换算为 {segments.reduce((total, segment) => total + (segment.end > segment.start ? (Date.parse(`2026-01-01T${segment.end}:00+08:00`) - Date.parse(`2026-01-01T${segment.start}:00+08:00`)) / 3_600_000 : 0), 0).toFixed(2)} 时。</>}</div>}{goals.length > 0 && <fieldset className="goal-links"><legend>关联目标</legend>{monthGoals.map((goal) => <label className="check-row" key={goal.id}><input type="checkbox" checked={goalIds.includes(goal.id)} onChange={(event) => setGoalIds((current) => event.target.checked ? [...current, goal.id] : current.filter((id) => id !== goal.id))} />{goal.title}</label>)}</fieldset>}<fieldset className="reward-editor"><legend>本次实际属性奖励</legend>{attributes.length === 0 ? <p>先去“行动配置”创建属性徽章。</p> : <RewardAttributeTiles attributes={attributes} values={rewards} onChange={setRewards} ariaSuffix="本次经验" />}</fieldset><div className="modal-actions">{onRemove && <button className="archive-button archive-button--remove" type="button" onClick={onRemove}><span>×</span>移除计划</button>}{onCancelRecurrence && <button className="series-cancel-button" type="button" onClick={() => { if (window.confirm("批量删除本次及后续尚未完成、且没有单独修改的重复计划？")) onCancelRecurrence(); }}>批量删除</button>}{onUpdateRecurrence && !initial.recurrenceDetachedAt && <button className="series-update-button" type="button" onClick={updateRecurrence}>批量保存</button>}<button className="pixel-button pixel-button--pink" type="submit">{initial.recurrenceGroupId ? "保存本次" : "保存计划"}</button></div></form></div>;
}

type OverdueScheduleValue = Pick<PlanRecord, "startAt" | "endAt" | "timeSegments" | "timeStatus">;

function OverdueRescheduleModal({ initial, onClose, onSave }: { initial: PlanRecord; onClose: () => void; onSave: (value: OverdueScheduleValue) => void }) {
  const originalStart = instantParts(initial.startAt);
  const durationMinutes = Math.max(1, Math.round((Date.parse(initial.endAt) - Date.parse(initial.startAt)) / 60_000));
  const [date, setDate] = useState(currentLocalDate());
  const [segments, setSegments] = useState<TimeSegmentDraft[]>(initial.timeSegments?.length
    ? initial.timeSegments.map((segment) => ({ id: segment.id, start: instantParts(segment.startAt).time, end: instantParts(segment.endAt).time }))
    : [newTimeSegment(originalStart.time, instantParts(initial.endAt).time)]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!date || !quickSegmentsAreValid(segments)) return;
    const unscheduled = segmentsAreUnscheduled(segments);
    const timeSegments = unscheduled ? [] : segmentRecordsForDate(date, segments);
    onSave({
      startAt: timeSegments[0]?.startAt ?? `${date}T00:00:00+08:00`,
      endAt: timeSegments.at(-1)?.endAt ?? `${date}T01:00:00+08:00`,
      timeSegments,
      timeStatus: unscheduled ? "unscheduled" : "scheduled",
    });
  };
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><form className="quick-modal overdue-modal pixel-card" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="overdue-modal-title"><button type="button" className="modal-close" onClick={onClose} aria-label="关闭">×</button><span className="eyebrow">OVERDUE ROUTE</span><h2 id="overdue-modal-title">重新安排行动</h2><div className="overdue-modal__source"><span>!</span><div><b>{initial.title}</b><small>原排期 {instantParts(initial.startAt).date} · {originalStart.time}，原记录会继续保留</small></div></div><label>新日期<input type="date" min={currentLocalDate()} value={date} onChange={(event) => setDate(event.target.value)} /></label><TimeSegmentsEditor segments={segments} onChange={setSegments} allowUnscheduled /><div className="modal-note">默认保留原执行时间与时长（共 {durationMinutes} 分钟），也可设为 --:-- 后进入新日期的“待安排”。新计划会显示“逾期”标签；原记录无法再完成，也不会进入原周结算。</div><div className="modal-actions"><button className="pixel-button pixel-button--pink" type="submit">重新安排</button></div></form></div>;
}

function AttributeModal({ initial, categories, onClose, onSave, onArchive, onRemove }: { initial?: AttributeRecord; categories: readonly AttributeCategoryRecord[]; onClose: () => void; onSave: (value: Omit<AttributeRecord, "id" | "createdAt" | "archivedAt">) => void; onArchive?: () => void; onRemove?: () => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState(initial?.category ?? "未分类");
  const [icon, setIcon] = useState(normalizeBadgeSymbol(initial?.icon ?? "mark-01"));
  const [color, setColor] = useState(initial?.color ?? "pink");
  const [note, setNote] = useState(initial?.note ?? "");
  const [pinned, setPinned] = useState(initial?.pinned ?? false);
  const [symbolsOpen, setSymbolsOpen] = useState(false);
  const selectedSymbol = PIXEL_SYMBOLS.find((symbol) => symbol.icon === icon);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    onSave({ name: name.trim(), category: category.trim() || "未分类", icon: normalizeBadgeSymbol(icon), color, note: note.trim(), pinned });
  };
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><form className="quick-modal attribute-modal pixel-card" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="attribute-modal-title"><button type="button" className="modal-close" onClick={onClose} aria-label="关闭">×</button><span className="eyebrow">PIXEL BADGE</span><h2 id="attribute-modal-title">{initial ? "编辑属性徽章" : "创建属性徽章"}</h2><label>属性名称<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：推理" /></label><label>徽章类别<select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((option) => <option key={option.id} value={option.name}>{option.name}</option>)}</select></label><div className={`pixel-symbol-picker${symbolsOpen ? " is-open" : ""}`}><button className="pixel-symbol-toggle" type="button" aria-expanded={symbolsOpen} onClick={() => setSymbolsOpen((current) => !current)}><span><BadgeSymbol icon={icon} /></span><div><b>点线符号</b><small>{selectedSymbol ? `${selectedSymbol.group} · ${selectedSymbol.label}` : "当前符号"}</small></div><em>{symbolsOpen ? "收起 ↑" : `展开 ${PIXEL_SYMBOLS.length} 个 ↓`}</em></button>{symbolsOpen && <div className="pixel-symbol-library">{PIXEL_SYMBOL_GROUPS.map((group) => <section key={group.name}><h3>{group.name}</h3><div>{group.items.map(([symbol, label]) => <button type="button" className={icon === symbol ? "active" : ""} aria-label={`选择${label}符号`} aria-pressed={icon === symbol} key={symbol} title={label} onClick={() => { setIcon(symbol); setSymbolsOpen(false); }}><span><BadgeSymbol icon={symbol} /></span><small>{label}</small></button>)}</div></section>)}</div>}</div><label>徽章配色<select value={color} onChange={(event) => setColor(event.target.value)}>{CATEGORY_PALETTE.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label><label>一句说明<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="这个属性记录什么行动？" /></label><label className="check-row"><input type="checkbox" checked={pinned} onChange={(event) => setPinned(event.target.checked)} />置顶显示</label><div className="modal-actions">{onArchive && <button className="archive-button" type="button" onClick={onArchive}><span>▣</span>归档属性</button>}{onRemove && <button className="archive-button archive-button--remove" type="button" onClick={() => { if (window.confirm("永久移除这个属性及其关联经验记录？此操作无法撤销。")) onRemove(); }}><span>×</span>移除属性</button>}<button className="pixel-button pixel-button--pink" type="submit">保存徽章</button></div></form></div>;
}

function GoalModal({ initial, defaultPeriod, goals, onClose, onSave, onArchive, onRemove }: { initial?: GoalRecord; defaultPeriod: GoalRecord["period"]; goals: readonly GoalRecord[]; onClose: () => void; onSave: (value: Omit<GoalRecord, "id" | "createdAt" | "archivedAt">) => void; onArchive?: () => void; onRemove?: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [period, setPeriod] = useState<GoalRecord["period"]>(initial?.period ?? defaultPeriod);
  const [startDate, setStartDate] = useState(initial?.startDate ?? today);
  const [endDate, setEndDate] = useState(initial?.endDate ?? today);
  const [linkedGoalIds, setLinkedGoalIds] = useState<string[]>([...(initial?.linkedGoalIds ?? [])]);
  const monthGoals = goals.filter((goal) => goal.period === "month" && goal.id !== initial?.id);
  const submit = (event: FormEvent) => { event.preventDefault(); if (title.trim() && endDate >= startDate) onSave({ title: title.trim(), note: note.trim(), period, startDate, endDate, linkedGoalIds: period === "week" ? linkedGoalIds : [] }); };
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><form className="quick-modal goal-modal pixel-card" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="goal-modal-title"><button type="button" className="modal-close" onClick={onClose} aria-label="关闭">×</button><span className="eyebrow">QUEST MAP</span><h2 id="goal-modal-title">{initial ? (period === "week" ? "编辑周目标" : "编辑月方向") : (period === "week" ? "新建周目标" : "新建月方向")}</h2><label>{period === "week" ? "目标名称" : "方向名称"}<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：规律推进博士论文" /></label><label>周期<select value={period} onChange={(event) => setPeriod(event.target.value as GoalRecord["period"])}><option value="week">周目标</option><option value="month">月方向</option></select></label><div className="modal-field-row"><label>开始日期<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label><label>结束日期<input type="date" min={startDate} value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label></div><label>方向说明<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="不必写得很具体，描述本期想推进的方向。" /></label>{period === "week" && monthGoals.length > 0 && <fieldset className="goal-links"><legend>关联月方向</legend>{monthGoals.map((goal) => <label className="check-row" key={goal.id}><input type="checkbox" checked={linkedGoalIds.includes(goal.id)} onChange={(event) => setLinkedGoalIds((current) => event.target.checked ? [...current, goal.id] : current.filter((id) => id !== goal.id))} />{goal.title}</label>)}</fieldset>}<div className="modal-actions">{onArchive && <button className="archive-button" type="button" onClick={onArchive}><span>▣</span>{period === "week" ? "归档目标" : "归档方向"}</button>}{onRemove && <button className="archive-button archive-button--remove" type="button" onClick={() => { if (window.confirm(`永久移除这个${period === "week" ? "周目标" : "月方向"}？关联行动不会删除，但关联关系会移除。`)) onRemove(); }}><span>×</span>{period === "week" ? "移除目标" : "移除方向"}</button>}<button className="pixel-button pixel-button--pink" type="submit">保存{period === "week" ? "目标" : "方向"}</button></div></form></div>;
}

function SettingsModal({ state, onClose, onConfigureSync, onConfigureReview, onRestore }: { state: WeekUpState; onClose: () => void; onConfigureSync: (baseUrl: string) => void; onConfigureReview: (baseUrl: string) => void; onRestore: (state: WeekUpState) => void }) {
  const [baseUrl, setBaseUrl] = useState(state.learningMore.baseUrl);
  const [reviewBaseUrl, setReviewBaseUrl] = useState(state.aiReview.apiBaseUrl);
  const [message, setMessage] = useState("");
  const downloadBackup = () => {
    const blob = new Blob([exportWeekUpBackup(state)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `week-up-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const restore = async (file?: File) => {
    if (!file) return;
    try {
      const restored = importWeekUpBackup(await file.text());
      if (!window.confirm("恢复备份会覆盖当前 Week UP 本地数据，是否继续？")) return;
      onRestore(restored);
      setMessage("备份已恢复");
    } catch { setMessage("这个文件不是可用的 Week UP 备份"); }
  };
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><div className="quick-modal settings-modal pixel-card" role="dialog" aria-modal="true" aria-labelledby="settings-title"><button type="button" className="modal-close" onClick={onClose} aria-label="关闭">×</button><span className="eyebrow">LOCAL FIRST</span><h2 id="settings-title">本地档案与同步</h2><label>Learning MORE 地址<input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} /></label><button className="pixel-button pixel-button--cyan" type="button" onClick={() => { onConfigureSync(baseUrl); setMessage("同步地址已保存"); }}>保存同步地址</button><section className="settings-block"><b>AI 回顾服务</b><p>周/月结算事实会发送到你的私有服务生成鼓励导向的收获总结，模型密钥不会保存在客户端。</p><label>服务地址<input value={reviewBaseUrl} onChange={(event) => setReviewBaseUrl(event.target.value)} /></label><button className="pixel-button pixel-button--cyan" type="button" onClick={() => { onConfigureReview(reviewBaseUrl); setMessage("AI 回顾服务地址已保存"); }}>保存 AI 服务地址</button></section><section className="settings-block"><b>备份与恢复</b><p>备份包含目标、项目、计划、完成事实、经验流水、AI 回顾、技能书与体重历史。</p><div className="modal-actions"><button className="pixel-button pixel-button--pink" type="button" onClick={downloadBackup}>导出 JSON 备份</button><label className="file-button">恢复备份<input type="file" accept="application/json,.json" onChange={(event) => void restore(event.target.files?.[0])} /></label></div></section>{message && <div className="modal-note" role="status">{message}</div>}<small>主档案保存在本机 SQLite；浏览器只保留最近一次成功读取的只读缓存。</small></div></div>;
}

type CompletionFeedback =
  | Readonly<{ kind: "single"; title: string; rewards: readonly AttributeReward[]; source?: "week-up" | "learning-more" }>
  | Readonly<{ kind: "learning-batch"; lessons: readonly string[]; rewards: readonly AttributeReward[] }>;

const COMPLETION_CHEERS = [
  "好耶！今天的你，又把想做的事变成了真正的成长。",
  "稳稳完成！每一次落地，都会让未来的自己更有底气。",
  "这一格已经点亮。不是等状态变好，而是你真的向前走了。",
  "行动留下了痕迹，成长也已经到账。继续保持这份漂亮的节奏！",
] as const;

function CompletionCelebration({ feedback, attributes, onClose }: { feedback: CompletionFeedback; attributes: Attribute[]; onClose: () => void }) {
  const totalXp = feedback.rewards.reduce((sum, reward) => sum + reward.amount, 0);
  const cheerKey = feedback.kind === "single" ? feedback.title : feedback.lessons.join("");
  const cheer = COMPLETION_CHEERS[Array.from(cheerKey).reduce((sum, character) => sum + character.charCodeAt(0), 0) % COMPLETION_CHEERS.length]!;
  const batch = feedback.kind === "learning-batch";
  return <div className="completion-stage" role="status" aria-live="polite">
    <section className={`settlement-card pixel-card${batch ? " settlement-card--batch" : " settlement-card--single"}`}>
      <button className="settlement-card__close" onClick={onClose} aria-label="关闭完成反馈">×</button>
      {feedback.kind === "single" ? <>
        <div className="completion-clear"><span>✓</span><div><small>{feedback.source === "learning-more" ? "COURSE CLEAR!" : "QUEST CLEAR!"}</small><strong>行动完成！</strong></div></div>
        <h2>{feedback.title}</h2>
        <div className="completion-xp"><span>成长已收入图鉴</span><b>+{totalXp} XP</b></div>
        <RewardChips rewards={feedback.rewards} attributes={attributes} maxVisible={4} />
        <p>{feedback.source === "learning-more" ? "课节状态已同步，学过的内容已经留下了清晰的成长痕迹。" : cheer}</p>
      </> : <>
        <small className="batch-complete__eyebrow">KNOWLEDGE COMBO × {feedback.lessons.length}</small>
        <div className="batch-complete__headline"><strong>{feedback.lessons.length}</strong><div><span>连续收获！</span><b>{feedback.lessons.length} 节课一起点亮</b></div></div>
        <div className="completion-xp completion-xp--batch"><span>本次合计成长</span><b>+{totalXp} XP</b></div>
        <ul className="batch-complete__lessons">{feedback.lessons.slice(0, 4).map((lesson) => <li key={lesson}><i>✓</i><span>{lesson}</span></li>)}</ul>
        {feedback.lessons.length > 4 && <div className="batch-complete__more">还有 {feedback.lessons.length - 4} 节课也已点亮</div>}
        <div className="batch-complete__rewards"><small>经验飞入这些徽章</small><RewardChips rewards={feedback.rewards} attributes={attributes} maxVisible={4} /></div>
        <p>这一整段学习积累都被看见了；只结算新完成课节，重复同步不会重复获得经验。</p>
      </>}
      <button className="completion-continue" onClick={onClose}>继续出发 →</button>
    </section>
  </div>;
}

export default function Home() {
  const [tab, setTab] = useState<TabId>("today");
  const [calendarInitialMode, setCalendarInitialMode] = useState<"week" | "month">("week");
  const [calendarContent, setCalendarContent] = useState<"timeline" | "schedule">("timeline");
  const [selectedWeekRange, setSelectedWeekRange] = useState<DateRange>();
  const [plans, setPlans] = useState(INITIAL_PLANS);
  const [attributes, setAttributes] = useState(INITIAL_ATTRIBUTES);
  const [weights, setWeights] = useState(INITIAL_WEIGHTS);
  const [completionFeedback, setCompletionFeedback] = useState<CompletionFeedback | null>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddProjectId, setQuickAddProjectId] = useState<string | undefined>();
  const [quickAddGoalIds, setQuickAddGoalIds] = useState<string[]>([]);
  const [attributeEditor, setAttributeEditor] = useState<"new" | AttributeRecord | null>(null);
  const [goalEditor, setGoalEditor] = useState<{ initial?: GoalRecord; period: GoalRecord["period"] } | null>(null);
  const [projectEditor, setProjectEditor] = useState<"new" | ProjectRecord | null>(null);
  const [planEditor, setPlanEditor] = useState<PlanRecord | null>(null);
  const [executionEditor, setExecutionEditor] = useState<{ plan: PlanRecord; segmentId?: string } | null>(null);
  const [overdueEditor, setOverdueEditor] = useState<PlanRecord | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const completionTimerRef = useRef<number | null>(null);
  const seenLearningCompletionsRef = useRef<Set<string> | null>(null);
  const weekUp = useWeekUp();
  const activeNav = PAGE_META[tab];
  const openCalendar = (mode: "week" | "month") => {
    setCalendarInitialMode(mode);
    setCalendarContent("schedule");
    setTab("calendar");
  };
  const navigateToTab = (nextTab: Exclude<TabId, "weight">) => {
    if (nextTab === "calendar") {
      setCalendarInitialMode("week");
      setCalendarContent("timeline");
    }
    if (nextTab === "week") setSelectedWeekRange(undefined);
    setTab(nextTab);
  };

  useEffect(() => {
    setPlans(weekUp.view.plans);
    setAttributes(weekUp.view.attributes);
    setWeights(weekUp.view.weights);
  }, [weekUp.view]);

  const showCompletionFeedback = (feedback: CompletionFeedback) => {
    if (completionTimerRef.current !== null) window.clearTimeout(completionTimerRef.current);
    setCompletionFeedback(feedback);
    completionTimerRef.current = window.setTimeout(() => setCompletionFeedback(null), feedback.kind === "learning-batch" ? 9000 : 6000);
  };

  useEffect(() => {
    if (!weekUp.ready) return;
    const activeFacts = weekUp.state.completionFacts.filter((fact) => fact.source === "learning-more" && fact.revertedAt === undefined);
    if (seenLearningCompletionsRef.current === null) {
      seenLearningCompletionsRef.current = new Set(activeFacts.map((fact) => fact.id));
      return;
    }
    const fresh = activeFacts.filter((fact) => !seenLearningCompletionsRef.current!.has(fact.id));
    activeFacts.forEach((fact) => seenLearningCompletionsRef.current!.add(fact.id));
    if (fresh.length === 0) return;
    const completedPlans = fresh.map((fact) => weekUp.state.plans.find((plan) => plan.id === fact.planId)).filter((plan): plan is PlanRecord => plan !== undefined);
    const rewardTotals = new Map<string, number>();
    completedPlans.forEach((plan) => plan.rewards.forEach((reward) => rewardTotals.set(reward.attributeId, (rewardTotals.get(reward.attributeId) ?? 0) + reward.amount)));
    const rewards = [...rewardTotals].map(([attributeId, amount]) => ({ attributeId, amount }));
    if (completedPlans.length === 1) showCompletionFeedback({ kind: "single", title: completedPlans[0]!.title, rewards, source: "learning-more" });
    else showCompletionFeedback({ kind: "learning-batch", lessons: completedPlans.map((plan) => plan.title), rewards });
  }, [weekUp.ready, weekUp.state.completionFacts, weekUp.state.plans]);

  const completedCount = useMemo(() => plans.filter((plan) => plan.completed).length, [plans]);

  const openQuickAdd = (projectId?: string, goalIds: readonly string[] = []) => {
    setQuickAddProjectId(projectId);
    setQuickAddGoalIds([...goalIds]);
    setQuickAddOpen(true);
  };

  const completePlan = (id: string, segmentId?: string) => {
    const plan = plans.find((item) => item.id === id);
    if (!plan || plan.completed) return;
    const record = weekUp.state.plans.find((item) => item.id === id && item.removedAt === undefined);
    if (!record || record.source === "learning-more") return;
    setExecutionEditor({ plan: record, ...(segmentId ? { segmentId } : {}) });
  };

  const confirmPlanCompletion = (value: { actualSegments: readonly PlanTimeSegmentInput[]; completedAt: string }) => {
    if (!executionEditor) return;
    const { plan: record, segmentId } = executionEditor;
    const plan = plans.find((item) => item.id === record.id);
    setExecutionEditor(null);
    void weekUp.dispatch(segmentId
      ? { type: "plan.segment.complete", id: record.id, segmentId, actualSegment: value.actualSegments[0]!, completedAt: value.completedAt }
      : { type: "plan.complete", id: record.id, actualSegments: value.actualSegments, completedAt: value.completedAt }
    ).then((next) => {
      const savedPlan = next.plans.find((item) => item.id === record.id);
      const completed = next.completionFacts.some((fact) => fact.planId === record.id && fact.revertedAt === undefined);
      if (!completed) return;
      showCompletionFeedback({ kind: "single", title: savedPlan?.title ?? plan?.title ?? record.title, rewards: [...(savedPlan?.rewards ?? plan?.rewards ?? record.rewards)], source: "week-up" });
    });
  };

  const undoPlan = (id: string, segmentId?: string) => {
    void weekUp.dispatch(segmentId ? { type: "plan.segment.undo", id, segmentId } : { type: "plan.undo", id });
  };

  const addPlan = async ({ projectId, title, segments, date, goalIds, recurrence, sourceLessonId }: QuickPlanInput) => {
    const dates = expandRecurrenceDates(date, recurrence);
    const unscheduled = segmentsAreUnscheduled(segments);
    const recordsByOccurrence = dates.map((occurrenceDate) => unscheduled ? [] : segmentRecordsForDate(occurrenceDate, segments.map((segment) => ({ ...segment, id: `segment-${crypto.randomUUID()}` }))));
    const inputsByOccurrence: readonly (readonly PlanTimeSegmentInput[])[] = recordsByOccurrence.map((items) => items.map(({ startAt, endAt }) => ({ startAt, endAt })));
    const startAts = recordsByOccurrence.map((items, index) => items[0]?.startAt ?? `${dates[index]}T00:00:00+08:00`);
    const endAts = recordsByOccurrence.map((items, index) => items.at(-1)?.endAt ?? `${dates[index]}T01:00:00+08:00`);
    const recurrenceGroupId = dates.length > 1 ? `recurrence-${crypto.randomUUID()}` : undefined;
    const summary = recurrenceSummary(recurrence);
    if (recurrenceGroupId) {
      await weekUp.dispatch({ type: "plan.recurrence.create", ...(projectId ? { projectId } : {}), ...(title ? { title } : {}), startAts, endAts, timeSegmentsByOccurrence: inputsByOccurrence, timeStatus: unscheduled ? "unscheduled" : "scheduled", goalIds, recurrenceGroupId, recurrenceSummary: summary ?? "重复行动" });
      setQuickAddOpen(false);
      setQuickAddProjectId(undefined);
      setQuickAddGoalIds([]);
      return;
    }
    for (const [recurrenceIndex, occurrenceDate] of dates.entries()) {
      const timeSegments = recordsByOccurrence[recurrenceIndex]!;
      const startAt = timeSegments[0]?.startAt ?? `${occurrenceDate}T00:00:00+08:00`;
      const endAt = timeSegments.at(-1)?.endAt ?? `${occurrenceDate}T01:00:00+08:00`;
      if (projectId) {
        await weekUp.dispatch({ type: "project.plan.create", projectId, startAt, endAt, timeSegments: timeSegments.map(({ startAt: segmentStartAt, endAt: segmentEndAt }) => ({ startAt: segmentStartAt, endAt: segmentEndAt })), timeStatus: unscheduled ? "unscheduled" : "scheduled", goalIds, ...(title ? { title } : {}), ...(sourceLessonId ? { sourceLessonId } : {}), ...(recurrenceGroupId ? { recurrenceGroupId, recurrenceIndex, recurrenceSummary: summary ?? "重复行动" } : {}) });
      } else {
        await weekUp.dispatch({ type: "plan.create", value: { title, detail: "快速新增 · 可继续编辑属性奖励", startAt, endAt, timeSegments, timeStatus: unscheduled ? "unscheduled" : "scheduled", category: "未分类", goalIds, rewards: [], ...(recurrenceGroupId ? { recurrenceGroupId, recurrenceIndex, recurrenceSummary: summary ?? "重复行动" } : {}) } });
      }
    }
    setQuickAddOpen(false);
    setQuickAddProjectId(undefined);
    setQuickAddGoalIds([]);
  };

  const addWeight = (value: number) => {
    const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" });
    const parts = Object.fromEntries(formatter.formatToParts(new Date()).map((part) => [part.type, part.value]));
    void weekUp.dispatch({ type: "weight.record", localDate: `${parts.year}-${parts.month}-${parts.day}`, valueKg: value });
  };

  const completeLearningPlan = () => { void weekUp.syncLearningMore(); };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setTab("today")} aria-label="Week UP 首页"><span className="brand-mark"><i /><i /><i /><i /></span><span><b>WEEK</b><strong>UP!</strong></span></button>
        <nav aria-label="主导航">{NAV_ITEMS.map((item) => <button key={item.id} className={`${tab === item.id ? "active" : ""}${item.id === "today" ? " nav-launch" : ""}`.trim()} onClick={() => navigateToTab(item.id)}><span className="nav-icon">{item.icon}</span><span><small>{item.eyebrow}</small>{item.desktopLabel ?? item.label}</span>{tab === item.id && <i className="nav-cursor">▸</i>}</button>)}</nav>
        <div className="sidebar-footer"><div className="avatar">UP</div><div><b>生活探险家</b><span>{weekUp.persistenceStatus === "online" ? "SQLite 数据已保存" : weekUp.persistenceStatus === "offline" ? "服务离线 · 当前只读" : "正在连接本地档案"}</span></div><button aria-label="打开设置" onClick={() => setSettingsOpen(true)}>⚙</button></div>
      </aside>
      <main className="main-area">
        <header className="topbar"><div className="mobile-brand">WEEK <b>UP!</b></div><div className="breadcrumb"><span>{activeNav.eyebrow}</span><b>{activeNav.label}</b></div><div className="top-actions"><button className="sync-status" onClick={() => void weekUp.syncLearningMore()} disabled={weekUp.syncing}><i />{weekUp.syncing ? "Learning MORE 同步中" : weekUp.state.learningMore.lastError ? "Learning MORE 暂时离线" : weekUp.state.learningMore.lastSyncedAt ? "Learning MORE 已同步" : "点击连接 Learning MORE"}</button><AiStatusControl config={weekUp.state.aiReview} status={weekUp.aiStatus} checking={weekUp.checkingAi} onConfigure={(value) => void weekUp.dispatch({ type: "ai-review.configure", ...value })} onRefresh={() => void weekUp.refreshAiStatus(true)} /><button className="icon-button" aria-label="设置" onClick={() => setSettingsOpen(true)}>⚙</button></div></header>
        <div className="page-wrap">
          {weekUp.persistenceStatus === "offline" && <section className="persistence-alert" role="alert"><b>本地服务暂时离线</b><span>当前展示的是最近缓存，修改操作不会生效。请重新启动 Week UP 服务后刷新页面。</span></section>}
          {tab === "today" && <TodayView plans={plans} attributes={attributes} completionFacts={weekUp.state.completionFacts} weights={weights} onComplete={completePlan} onExternalComplete={completeLearningPlan} onQuickAdd={() => openQuickAdd()} onOpenWeight={() => setTab("weight")} onEdit={(id) => setPlanEditor(weekUp.state.plans.find((plan) => plan.id === id) ?? null)} onUndo={undoPlan} onRemove={(id) => void weekUp.dispatch({ type: "plan.remove", id })} onRescheduleOverdue={(id) => setOverdueEditor(weekUp.state.plans.find((plan) => plan.id === id) ?? null)} />}
          {tab === "week" && <WeekDashboard attributes={attributes} plans={plans} planRecords={weekUp.state.plans.filter((plan) => plan.removedAt === undefined)} goals={weekUp.state.goals} dailySettlements={weekUp.state.dailySettlements} settlements={weekUp.state.settlements} initialRange={selectedWeekRange} generatingHarvestIds={weekUp.generatingHarvestIds} onRetryHarvest={(id) => void weekUp.dispatch({ type: "settlement.harvest.retry", id })} onNewGoal={() => setGoalEditor({ period: "week" })} onEditGoal={(goal) => setGoalEditor({ period: "week", initial: goal })} onQuickAdd={(goalIds) => openQuickAdd(undefined, goalIds)} onOpenCalendar={() => openCalendar("week")} onOpenGrowth={() => setTab("growth")} onComplete={completePlan} onEditPlan={(id) => setPlanEditor(weekUp.state.plans.find((plan) => plan.id === id) ?? null)} onUndoPlan={undoPlan} onRemovePlan={(id) => void weekUp.dispatch({ type: "plan.remove", id })} onRescheduleOverdue={(id) => setOverdueEditor(weekUp.state.plans.find((plan) => plan.id === id) ?? null)} />}
          {tab === "month" && <MonthDashboard attributes={attributes} plans={plans} planRecords={weekUp.state.plans.filter((plan) => plan.removedAt === undefined)} goals={weekUp.state.goals} projects={weekUp.state.projects} projectCategories={weekUp.state.projectCategories} settlements={weekUp.state.settlements} weights={weights} generatingHarvestIds={weekUp.generatingHarvestIds} onRetryHarvest={(id) => void weekUp.dispatch({ type: "settlement.harvest.retry", id })} onNewGoal={() => setGoalEditor({ period: "month" })} onEditGoal={(goal) => setGoalEditor({ period: "month", initial: goal })} onOpenWeek={(weekRange) => { setSelectedWeekRange(weekRange); setTab("week"); }} onOpenCalendar={() => openCalendar("month")} onOpenWeight={() => setTab("weight")} />}
          {tab === "calendar" && <CalendarView plans={calendarContent === "timeline" ? weekUp.view.timelinePlans : plans} initialMode={calendarInitialMode} content={calendarContent} onEditPlan={(id) => setPlanEditor(weekUp.state.plans.find((plan) => plan.id === id) ?? null)} />}
          {tab === "action-config" && <ActionConfigView attributes={attributes} attributeCategories={weekUp.state.attributeCategories} projectCategories={weekUp.state.projectCategories} projects={weekUp.state.projects.filter((project) => project.source === "week-up" && project.archivedAt === undefined)} courses={weekUp.state.learningMoreCourses} courseProjects={weekUp.state.projects.filter((project) => project.source === "learning-more" && project.archivedAt === undefined)} onNewAttribute={() => setAttributeEditor("new")} onEditAttribute={(attribute) => setAttributeEditor(weekUp.state.attributes.find((item) => item.id === attribute.id) ?? null)} onNewProject={() => setProjectEditor("new")} onEditProject={setProjectEditor} onConfigureCourse={setProjectEditor} onCreateCategory={(name) => { void weekUp.dispatch({ type: "attribute-category.create", name }); }} onRenameCategory={(id, name) => { void weekUp.dispatch({ type: "attribute-category.rename", id, name }); }} onDeleteCategory={(id) => { void weekUp.dispatch({ type: "attribute-category.delete", id }); }} onCreateProjectCategory={(name, color) => { void weekUp.dispatch({ type: "project-category.create", name, color }); }} onRenameProjectCategory={(id, name, color) => { void weekUp.dispatch({ type: "project-category.rename", id, name, color }); }} onDeleteProjectCategory={(id) => { void weekUp.dispatch({ type: "project-category.delete", id }); }} />}
          {tab === "growth" && <GrowthView attributes={weekUp.view.catalogAttributes} skillbooks={weekUp.state.skillbooks} goals={weekUp.state.goals} />}
          {tab === "weight" && <WeightView entries={weights} target={weekUp.state.preferences.targetWeightKg} onAdd={addWeight} onTarget={(valueKg) => void weekUp.dispatch({ type: "weight.target", valueKg })} />}
        </div>
      </main>
      <nav className="mobile-nav" aria-label="移动端主导航">{NAV_ITEMS.map((item) => <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => navigateToTab(item.id)}><span>{item.icon}</span><small>{item.label}</small></button>)}</nav>
      {quickAddOpen && <QuickAddModal projects={weekUp.state.projects.filter((project) => project.source === "week-up" && project.archivedAt === undefined)} learningMoreLessons={[]} attributes={attributes} goals={weekUp.state.goals.filter((goal) => goal.archivedAt === undefined)} initialProjectId={quickAddProjectId} initialGoalIds={quickAddGoalIds} onClose={() => { setQuickAddOpen(false); setQuickAddProjectId(undefined); setQuickAddGoalIds([]); }} onAdd={addPlan} onManageProjects={() => { setQuickAddOpen(false); setQuickAddProjectId(undefined); setQuickAddGoalIds([]); setTab("action-config"); }} />}
      {attributeEditor && <AttributeModal initial={attributeEditor === "new" ? undefined : attributeEditor} categories={weekUp.state.attributeCategories} onClose={() => setAttributeEditor(null)} onSave={(value) => { if (attributeEditor === "new") void weekUp.dispatch({ type: "attribute.create", value }); else void weekUp.dispatch({ type: "attribute.update", id: attributeEditor.id, patch: value }); setAttributeEditor(null); }} {...(attributeEditor === "new" ? {} : { onArchive: () => { void weekUp.dispatch({ type: "attribute.archive", id: attributeEditor.id }); setAttributeEditor(null); }, onRemove: () => { void weekUp.dispatch({ type: "attribute.remove", id: attributeEditor.id }); setAttributeEditor(null); } })} />}
      {goalEditor && <GoalModal initial={goalEditor.initial} defaultPeriod={goalEditor.period} goals={weekUp.state.goals.filter((goal) => goal.archivedAt === undefined)} onClose={() => setGoalEditor(null)} onSave={(value) => { if (goalEditor.initial) void weekUp.dispatch({ type: "goal.update", id: goalEditor.initial.id, patch: value }); else void weekUp.dispatch({ type: "goal.create", value }); setGoalEditor(null); }} {...(goalEditor.initial ? { onArchive: () => { void weekUp.dispatch({ type: "goal.archive", id: goalEditor.initial!.id }); setGoalEditor(null); }, onRemove: () => { void weekUp.dispatch({ type: "goal.remove", id: goalEditor.initial!.id }); setGoalEditor(null); } } : {})} />}
      {projectEditor && <ProjectModal initial={projectEditor === "new" ? undefined : projectEditor} attributes={weekUp.state.attributes.filter((attribute) => attribute.archivedAt === undefined)} projectCategories={weekUp.state.projectCategories} onClose={() => setProjectEditor(null)} onSave={(value) => { if (projectEditor === "new") void weekUp.dispatch({ type: "project.create", value }); else void weekUp.dispatch({ type: "project.update", id: projectEditor.id, patch: value }); setProjectEditor(null); }} {...(projectEditor !== "new" && projectEditor.source === "week-up" ? { onRemove: () => { void weekUp.dispatch({ type: "project.remove", id: projectEditor.id }); setProjectEditor(null); } } : {})} />}
      {planEditor && <PlanModal initial={planEditor} attributes={weekUp.state.attributes.filter((attribute) => attribute.archivedAt === undefined)} goals={weekUp.state.goals.filter((goal) => goal.archivedAt === undefined)} onClose={() => setPlanEditor(null)} onSave={(value) => { void weekUp.dispatch({ type: "plan.update", id: planEditor.id, patch: value }); setPlanEditor(null); }} onFollowTemplate={() => { void weekUp.dispatch({ type: "plan.follow-template", id: planEditor.id }); setPlanEditor(null); }} {...(planEditor.recurrenceGroupId ? { onUpdateRecurrence: (value: PlanEditorValue & { unitQuantity?: number }) => { void weekUp.dispatch({ type: "plan.recurrence.update", id: planEditor.id, patch: value }); setPlanEditor(null); }, onCancelRecurrence: () => { void weekUp.dispatch({ type: "plan.recurrence.cancel", id: planEditor.id }); setPlanEditor(null); } } : {})} {...(planEditor.source === "week-up" || planEditor.sourceRef?.startsWith("week-up:") ? { onRemove: () => { void weekUp.dispatch({ type: "plan.remove", id: planEditor.id }); setPlanEditor(null); } } : {})} />}
      {executionEditor && <ExecutionCompletionModal plan={executionEditor.plan} {...(executionEditor.segmentId ? { segmentId: executionEditor.segmentId } : {})} onClose={() => setExecutionEditor(null)} onConfirm={confirmPlanCompletion} />}
      {overdueEditor && <OverdueRescheduleModal initial={overdueEditor} onClose={() => setOverdueEditor(null)} onSave={(value) => { void weekUp.dispatch({ type: "plan.overdue.reschedule", id: overdueEditor.id, ...value }); setOverdueEditor(null); }} />}
      {settingsOpen && <SettingsModal state={weekUp.state} onClose={() => setSettingsOpen(false)} onConfigureSync={(baseUrl) => void weekUp.dispatch({ type: "learning-more.configure", baseUrl })} onConfigureReview={(apiBaseUrl) => void weekUp.dispatch({ type: "ai-review.configure", preferredProvider: "api", apiBaseUrl })} onRestore={(state) => void weekUp.replace(state)} />}
      {completionFeedback && <CompletionCelebration feedback={completionFeedback} attributes={attributes} onClose={() => setCompletionFeedback(null)} />}
      <div className="screen-grain" aria-hidden="true" />
      <span className="sr-only" aria-live="polite">已完成 {completedCount} 项计划</span>
    </div>
  );
}
