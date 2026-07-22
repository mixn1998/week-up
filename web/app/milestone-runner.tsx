import { useMemo, useState, type CSSProperties } from "react";
import type { GoalRecord } from "../lib/week-up-domain";
import { getFullWidthMilestoneRoute, milestoneNodeX, milestoneRouteY, resolveMilestoneNodePositions, selectMilestoneMapGoals } from "../lib/milestone-layout";

type MonthCell = Readonly<{ key: string; label: string; short: string; year: number; month: number }>;
type MapItem = Readonly<{
  id: string;
  kind: "start" | "week" | "finish";
  title: string;
  note: string;
  period: string;
  date: string;
  y: number;
  lane: number;
  parentCount: number;
  parentTitles: readonly string[];
  parentLanes: readonly number[];
}>;

const SHANGHAI_OFFSET = "+08:00";

function dateValue(value: string): number {
  const normalized = value.length === 10 ? `${value}T12:00:00${SHANGHAI_OFFSET}` : value;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function monthKey(value: string): string {
  return value.slice(0, 7);
}

function monthSequence(start: string, end: string): MonthCell[] {
  const [startYear, startMonth] = start.split("-").map(Number);
  const [endYear, endMonth] = end.split("-").map(Number);
  if (!startYear || !startMonth || !endYear || !endMonth) return [];
  const result: MonthCell[] = [];
  let year = startYear;
  let month = startMonth;
  while (year < endYear || (year === endYear && month <= endMonth)) {
    result.push({ key: `${year}-${String(month).padStart(2, "0")}`, label: `${year}年${month}月`, short: `${month}月`, year, month });
    month += 1;
    if (month === 13) { year += 1; month = 1; }
    if (result.length >= 18) break;
  }
  return result;
}

function PixelMarker({ kind }: { kind: MapItem["kind"] }) {
  return <span className={`journey-marker journey-marker--${kind}`} aria-hidden="true"><i/><i/><i/></span>;
}

function formatPeriod(goal: GoalRecord): string {
  return `${goal.startDate.slice(5).replace("-", ".")}—${goal.endDate.slice(5).replace("-", ".")}`;
}

export function MilestoneRunner({ goals }: { goals: readonly GoalRecord[] }) {
  const milestoneGoals = useMemo(() => selectMilestoneMapGoals(goals), [goals]);
  const directions = useMemo(() => [...milestoneGoals.directions].sort((a, b) => dateValue(a.startDate) - dateValue(b.startDate)), [milestoneGoals.directions]);
  const weeklyGoals = useMemo(() => [...milestoneGoals.weeklyGoals].sort((a, b) => dateValue(a.archivedAt!) - dateValue(b.archivedAt!)), [milestoneGoals.weeklyGoals]);
  const timelineDates = [...directions, ...weeklyGoals].flatMap((goal) => [goal.startDate, goal.archivedAt?.slice(0, 10) ?? goal.endDate]);
  const fallbackMonth = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
  const firstMonth = timelineDates.length ? timelineDates.map(monthKey).sort()[0]! : fallbackMonth;
  const lastMonth = timelineDates.length ? timelineDates.map(monthKey).sort().at(-1)! : fallbackMonth;
  const months = monthSequence(firstMonth, lastMonth);
  const laneY = (index: number) => directions.length <= 1 ? 50 : 18 + (index * 64 / (directions.length - 1));

  const items = useMemo<MapItem[]>(() => {
    const directionItems = directions.flatMap((goal, lane): MapItem[] => {
      const endDate = goal.archivedAt?.slice(0, 10) ?? goal.endDate;
      return [
        { id: `${goal.id}-start`, kind: "start", title: goal.title, note: goal.note, period: `${goal.startDate} 启程`, date: goal.startDate, y: laneY(lane), lane, parentCount: 1, parentTitles: [goal.title], parentLanes: [lane] },
        ...(goal.archivedAt ? [{ id: `${goal.id}-finish`, kind: "finish" as const, title: goal.title, note: goal.note, period: `${endDate} 归档`, date: endDate, y: laneY(lane), lane, parentCount: 1, parentTitles: [goal.title], parentLanes: [lane] }] : []),
      ];
    });
    const weekItems = weeklyGoals.map((goal, standaloneIndex): MapItem => {
      const parents = directions.filter((direction) => goal.linkedGoalIds.includes(direction.id));
      const parentLanes = parents.map((parent) => directions.findIndex((direction) => direction.id === parent.id)).filter((lane) => lane >= 0);
      const lane = parentLanes[0] ?? (directions.length + standaloneIndex);
      const y = parentLanes.length ? parentLanes.reduce((sum, value) => sum + laneY(value), 0) / parentLanes.length : 50;
      const archivedDate = goal.archivedAt?.slice(0, 10) ?? goal.endDate;
      return { id: goal.id, kind: "week", title: goal.title, note: goal.note, period: `${formatPeriod(goal)} 归档`, date: archivedDate, y, lane, parentCount: parents.length, parentTitles: parents.map((parent) => parent.title), parentLanes };
    });
    return [...directionItems, ...weekItems];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directions, weeklyGoals]);

  const initialMonthKey = months.some((month) => month.key === fallbackMonth) ? fallbackMonth : lastMonth;
  const [selectedMonthKey, setSelectedMonthKey] = useState(initialMonthKey);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const requestedMonthIndex = months.findIndex((month) => month.key === selectedMonthKey);
  const activeMonthIndex = requestedMonthIndex >= 0 ? requestedMonthIndex : Math.max(0, months.length - 1);
  const activeMonth = months[activeMonthIndex] ?? { key: fallbackMonth, label: fallbackMonth, short: fallbackMonth, year: Number(fallbackMonth.slice(0, 4)), month: Number(fallbackMonth.slice(5, 7)) };
  const activeMonthStart = dateValue(`${activeMonth.key}-01`);
  const nextMonthKey = activeMonth.month === 12
    ? `${activeMonth.year + 1}-01`
    : `${activeMonth.year}-${String(activeMonth.month + 1).padStart(2, "0")}`;
  const activeMonthEnd = dateValue(`${nextMonthKey}-01`);
  const activeMonthSpan = Math.max(1, activeMonthEnd - activeMonthStart);
  const xForMonthDate = (value: string) => Math.max(8, Math.min(92, ((dateValue(value) - activeMonthStart) / activeMonthSpan) * 84 + 8));
  const monthItemInputs = items
    .filter((item) => monthKey(item.date) === activeMonth.key)
    .map((item) => ({ ...item, x: milestoneNodeX(item.kind, xForMonthDate(item.date)) }));
  const monthItems = resolveMilestoneNodePositions(monthItemInputs).map((item) => {
    if (item.kind === "week") return item;
    const source = monthItemInputs.find((candidate) => candidate.id === item.id);
    return source ? { ...item, x: source.x, y: source.y } : item;
  });
  const activeDirections = directions.filter((direction) => {
    const finish = direction.archivedAt?.slice(0, 10) ?? direction.endDate;
    return monthKey(direction.startDate) <= activeMonth.key && monthKey(finish) >= activeMonth.key;
  });
  const selected = monthItems.find((item) => item.id === selectedId) ?? monthItems.find((item) => item.kind === "finish") ?? monthItems.find((item) => item.kind === "week") ?? monthItems[0];
  const tabStart = Math.max(0, Math.min(activeMonthIndex - 1, Math.max(0, months.length - 3)));
  const visibleMonths = months.slice(tabStart, tabStart + 3);
  const mapHeight = Math.max(500, Math.max(directions.length, 1) * 150 + 210);

  const changeMonth = (index: number) => {
    const nextMonth = months[index];
    if (!nextMonth) return;
    setSelectedMonthKey(nextMonth.key);
    const nextItem = items.find((item) => monthKey(item.date) === nextMonth.key && item.kind === "finish")
      ?? items.find((item) => monthKey(item.date) === nextMonth.key && item.kind === "week")
      ?? items.find((item) => monthKey(item.date) === nextMonth.key);
    setSelectedId(nextItem?.id ?? null);
  };

  if (directions.length === 0 && weeklyGoals.length === 0) return <section className="journey-empty pixel-card" role="tabpanel"><div className="journey-empty__screen"><span className="journey-empty__flag"><i/><i/></span><div><span className="eyebrow">NEW JOURNEY</span><h2>第一段旅程还在前方</h2><p>创建月方向后会立即出现旅程起点；归档周目标后会增加沿途检查点。</p></div><span className="journey-empty__horizon" aria-hidden="true"/></div></section>;

  return <section className="journey-atlas" role="tabpanel" aria-label="目标里程地图">
    <div className="milestone-month-controls" aria-label="切换里程地图月份">
      <button type="button" disabled={activeMonthIndex === 0} onClick={() => changeMonth(activeMonthIndex - 1)} aria-label="上一个月">←</button>
      <div role="tablist" aria-label="里程地图月份章节">{visibleMonths.map((month) => { const index = months.findIndex((candidate) => candidate.key === month.key); return <button type="button" role="tab" aria-selected={month.key === activeMonth.key} className={month.key === activeMonth.key ? "is-active" : ""} onClick={() => changeMonth(index)} key={month.key}><small>CHAPTER {String(index + 1).padStart(2, "0")}</small><b>{month.label}</b></button>; })}</div>
      <button type="button" disabled={activeMonthIndex === months.length - 1} onClick={() => changeMonth(activeMonthIndex + 1)} aria-label="下一个月">→</button>
    </div>
    <div className="journey-scroll journey-scroll--single" aria-label={`${activeMonth.label}里程地图`}>
      <div className="journey-map journey-map--single" style={{ height: `${mapHeight}px` } as CSSProperties}>
        <div className="journey-sky" aria-hidden="true"><i/><i/><i/><i/><i/></div>
        <div className="journey-hills journey-hills--back" aria-hidden="true"/><div className="journey-hills journey-hills--front" aria-hidden="true"/>
        <svg className="journey-platform-svg" viewBox={`0 0 1200 ${mapHeight}`} preserveAspectRatio="none" aria-hidden="true">
          {activeDirections.map((direction) => {
            const index = directions.findIndex((candidate) => candidate.id === direction.id);
            const y = milestoneRouteY(mapHeight, laneY(index));
            const route = getFullWidthMilestoneRoute(index, y);
            return <g className={`journey-platform journey-platform--${index % 3}`} key={direction.id}><path d={route.path}/></g>;
          })}
          {monthItems.filter((item) => item.kind === "week" && item.parentLanes.length > 1).map((item) => {
            const x = item.x * 12;
            const routeYs = item.parentLanes.map((lane) => milestoneRouteY(mapHeight, laneY(lane)));
            const minimumY = Math.min(...routeYs);
            const maximumY = Math.max(...routeYs);
            return <g className="journey-route-link" key={`${item.id}-link`}><path className="journey-route-link__shadow" d={`M${x} ${minimumY}V${maximumY}`}/><path d={`M${x} ${minimumY}V${maximumY}`}/>{routeYs.map((routeY) => <rect x={x - 5} y={routeY - 5} width="10" height="10" key={routeY}/>)}</g>;
          })}
        </svg>
        <div className="journey-direction-signs">{activeDirections.map((direction) => { const index = directions.findIndex((candidate) => candidate.id === direction.id); return <span style={{ top: `${laneY(index) - 9}%` }} key={direction.id}><b>Q{index + 1}</b>{direction.title}</span>; })}</div>
        <div className="journey-route-gates">{activeDirections.map((direction) => { const index = directions.findIndex((candidate) => candidate.id === direction.id); const finishDate = direction.archivedAt?.slice(0, 10) ?? direction.endDate; return <span style={{ top: `${laneY(index)}%` }} key={direction.id}>{monthKey(direction.startDate) < activeMonth.key && activeMonthIndex > 0 ? <button type="button" className="is-left" onClick={() => changeMonth(activeMonthIndex - 1)} aria-label={`查看${direction.title}的上月路线`}>{"←"}</button> : null}{monthKey(finishDate) > activeMonth.key && activeMonthIndex < months.length - 1 ? <button type="button" className="is-right" onClick={() => changeMonth(activeMonthIndex + 1)} aria-label={`查看${direction.title}的下月路线`}>{"→"}</button> : null}</span>; })}</div>
        {monthItems.map((item) => <button className={`journey-node journey-node--${item.kind}${item.parentCount > 1 ? " journey-node--shared" : ""}${selected?.id === item.id ? " is-selected" : ""}`} style={{ left: `${item.x}%`, top: `${item.y}%` }} type="button" onClick={() => setSelectedId(item.id)} key={item.id} aria-label={`${item.title}，${item.period}`}><PixelMarker kind={item.kind}/>{item.parentCount > 1 ? <em>×{item.parentCount}</em> : null}</button>)}
        <div className="journey-avatar" aria-hidden="true"><i/><i/><i/><i/><i/></div>
      </div>
      <footer className="journey-month-caption">
        <div className="journey-month-caption__summary"><b>{activeMonth.label}</b><span>{monthItems.filter((item) => item.kind !== "start").length} 个归档节点</span><span className="journey-month-caption__direction">{activeDirections.length} 条方向</span><span className="journey-month-caption__goal">{monthItems.filter((item) => item.kind === "week").length} 个周目标</span><small>边缘箭头可切换跨月路线</small></div>
        <div className="journey-month-caption__hud" aria-hidden="true"><span>CHAPTER {String(activeMonthIndex + 1).padStart(2, "0")}</span><b>◆ ◆ ◆</b><em>{monthItems.length.toString().padStart(2, "0")} NODES</em></div>
      </footer>
    </div>
    {selected && <article className={`journey-detail journey-detail--${selected.kind}`} aria-live="polite"><div><PixelMarker kind={selected.kind}/></div><section><span>{selected.kind === "start" ? "DIRECTION START" : selected.kind === "finish" ? "DIRECTION LANDMARK" : selected.parentCount > 1 ? "SHARED WEEK GOAL" : "WEEK CHECKPOINT"}</span><h3>{selected.title}</h3><p>{selected.note || "这段旅程已经收入里程地图。"}</p></section><aside><span>{selected.period}</span><b>{selected.parentTitles.length ? selected.parentTitles.join(" · ") : "独立周目标"}</b></aside></article>}
  </section>;
}
