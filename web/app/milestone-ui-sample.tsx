import { useMemo, useState, type CSSProperties, type ReactNode } from "react";

type VariantId = "world" | "stars" | "runner";
type Accent = "violet" | "pink" | "cyan";
type MilestoneKind = "start" | "week" | "finish" | "future";

type Milestone = Readonly<{
  id: string;
  kind: MilestoneKind;
  title: string;
  eyebrow: string;
  period: string;
  note: string;
  progress: string;
  xp?: string;
  month: 0 | 1 | 2;
  x: number;
  y: number;
  accent: Accent;
  route: string;
  shared?: boolean;
}>;

const MONTHS = [
  { name: "2026年7月", short: "七月", chapter: "CHAPTER 01", subtitle: "起航原野" },
  { name: "2026年8月", short: "八月", chapter: "CHAPTER 02", subtitle: "回声群岛" },
  { name: "2026年9月", short: "九月", chapter: "CHAPTER 03", subtitle: "抵达之境" },
] as const;

const ROUTES = [
  { id: "explore", title: "持续探索新的生活可能", accent: "violet" as Accent, summary: "未设置结束月份 · 持续延伸" },
  { id: "thesis", title: "完成博士论文", accent: "pink" as Accent, summary: "持续 3 个月 · 4 个周目标" },
  { id: "fitness", title: "减脂至 55kg", accent: "cyan" as Accent, summary: "持续 1 个月 · 3 个周目标" },
] as const;

const MILESTONES: readonly Milestone[] = [
  { id: "start-explore", kind: "start", title: "持续探索新的生活可能", eyebrow: "DIRECTION START", period: "2026.07 启程", note: "未设置结束月份，这条方向会持续向右探索；归档时才确定实际终点。", progress: "方向起点", month: 0, x: 7, y: 18, accent: "violet", route: "explore" },
  { id: "start-thesis", kind: "start", title: "完成博士论文", eyebrow: "DIRECTION START", period: "2026.07 启程", note: "计划用三个月完成博士论文。起点只记录方向意图，终点才汇总完整旅程。", progress: "方向起点", month: 0, x: 7, y: 48, accent: "pink", route: "thesis" },
  { id: "start-fitness", kind: "start", title: "减脂至 55kg", eyebrow: "DIRECTION START", period: "2026.07 启程", note: "单月方向，从七月开始；归档后在当月形成一个完整地标。", progress: "方向起点", month: 0, x: 7, y: 78, accent: "cyan", route: "fitness" },
  { id: "goal-cardio", kind: "week", title: "完成三次有氧训练", eyebrow: "ARCHIVED WEEK GOAL", period: "07.01—07.05", note: "第一枚已经归档的周目标站牌。", progress: "3/3 行动完成", xp: "+8 XP", month: 0, x: 19, y: 78, accent: "cyan", route: "fitness" },
  { id: "goal-chapter", kind: "week", title: "收尾博士论文第三章", eyebrow: "ARCHIVED WEEK GOAL", period: "07.13—07.19", note: "七月论文路线上的第一处营地。", progress: "4/4 行动完成", xp: "+15 XP", month: 0, x: 23, y: 48, accent: "pink", route: "thesis" },
  { id: "goal-diet", kind: "week", title: "连续记录七天饮食", eyebrow: "ARCHIVED WEEK GOAL", period: "07.06—07.12", note: "第二枚健康方向周目标。", progress: "7/7 行动完成", xp: "+7 XP", month: 0, x: 34, y: 78, accent: "cyan", route: "fitness" },
  { id: "goal-weight", kind: "week", title: "完成阶段体重复盘", eyebrow: "ARCHIVED WEEK GOAL", period: "07.13—07.19", note: "抵达单月方向终点前的最后一站。", progress: "1/1 行动完成", xp: "+9 XP", month: 0, x: 48, y: 78, accent: "cyan", route: "fitness" },
  { id: "end-fitness", kind: "finish", title: "减脂至 55kg", eyebrow: "MONTH DIRECTION LANDMARK", period: "2026.07 归档", note: "方向已经归档。终点展示目标说明、关联周目标和整段旅程的成长收获。", progress: "3 个周目标 · 单月路线", xp: "+24 XP", month: 0, x: 59, y: 78, accent: "cyan", route: "fitness" },
  { id: "goal-analysis", kind: "week", title: "完成论文数据分析", eyebrow: "SHARED WEEK GOAL", period: "08.03—08.09", note: "同时归属于“持续探索新的生活可能”和“完成博士论文”。地图只陈列一次，并作为两条路线的交汇点。", progress: "5/5 行动完成 · 关联 2 个方向", xp: "+12 XP", month: 1, x: 44, y: 33, accent: "violet", route: "thesis", shared: true },
  { id: "goal-revise", kind: "week", title: "完成核心章节修订", eyebrow: "ARCHIVED WEEK GOAL", period: "08.17—08.23", note: "八月论文主线上的修订站。", progress: "4/4 行动完成", xp: "+9 XP", month: 1, x: 61, y: 48, accent: "pink", route: "thesis" },
  { id: "goal-submit", kind: "week", title: "提交博士论文初稿", eyebrow: "ARCHIVED WEEK GOAL", period: "09.14—09.20", note: "九月抵达终点前的最终检查点。", progress: "1/1 行动完成", xp: "+6 XP", month: 2, x: 81, y: 48, accent: "pink", route: "thesis" },
  { id: "end-thesis", kind: "finish", title: "完成博士论文", eyebrow: "MONTH DIRECTION LANDMARK", period: "2026.09 归档", note: "跨越三个月的方向终点，汇总 4 个周目标、关联行动和完整成长记录。", progress: "4 个周目标 · 三个月主线", xp: "+42 XP", month: 2, x: 93, y: 48, accent: "pink", route: "thesis" },
  { id: "future-explore", kind: "future", title: "继续探索", eyebrow: "OPEN DIRECTION", period: "终点未设置", note: "尚未归档的方向继续向右延伸，不提前生成大型终点。", progress: "路线仍在展开", month: 2, x: 93, y: 18, accent: "violet", route: "explore" },
] as const;

const VARIANTS: ReadonlyArray<{ id: VariantId; code: string; title: string; summary: string }> = [
  { id: "world", code: "A", title: "章节世界地图", summary: "城镇、营地与关卡组成的 8-bit 世界" },
  { id: "stars", code: "B", title: "电玩任务星图", summary: "方向化作星轨，目标成为可点亮星体" },
  { id: "runner", code: "C", title: "横向卷轴冒险", summary: "三个月是一段持续展开的平台关卡" },
];

function Glyph({ kind }: { kind: MilestoneKind }) {
  if (kind === "start") return <span className="ml-glyph ml-glyph--flag" aria-hidden="true"><i /><i /></span>;
  if (kind === "finish") return <span className="ml-glyph ml-glyph--castle" aria-hidden="true"><i /><i /><i /></span>;
  if (kind === "future") return <span className="ml-glyph ml-glyph--portal" aria-hidden="true"><i /><i /></span>;
  return <span className="ml-glyph ml-glyph--camp" aria-hidden="true"><i /><i /><i /></span>;
}

function MapNode({ item, selectedId, onSelect, variant }: { item: Milestone; selectedId: string; onSelect: (id: string) => void; variant: VariantId }) {
  return <button
    className={`ml-node ml-node--${variant} ml-node--${item.kind} ml-node--${item.accent}${item.shared ? " ml-node--shared" : ""}${selectedId === item.id ? " is-selected" : ""}`}
    style={{ left: `${item.x}%`, top: `${item.y}%` } as CSSProperties}
    type="button"
    onClick={() => onSelect(item.id)}
    aria-label={`${item.title}，${item.period}`}
  ><Glyph kind={item.kind}/>{item.shared ? <em>×2</em> : null}<b>{item.kind === "finish" ? item.title : item.kind === "future" ? "?" : ""}</b></button>;
}

function MonthRuler({ dark = false }: { dark?: boolean }) {
  return <div className={`ml-month-ruler${dark ? " ml-month-ruler--dark" : ""}`}>{MONTHS.map((month) => <div key={month.name}><small>{month.chapter}</small><b>{month.name}</b><span>{month.subtitle}</span></div>)}</div>;
}

function WorldVariant({ selectedId, onSelect }: { selectedId: string; onSelect: (id: string) => void }) {
  return <section className="ml-stage ml-world" aria-label="章节世界地图方案">
    <MonthRuler />
    <div className="ml-world__map">
      <svg viewBox="0 0 1200 560" preserveAspectRatio="none" aria-hidden="true">
        <defs><pattern id="worldTiles" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24"/></pattern></defs>
        <rect className="world-paper" width="1200" height="560"/><rect className="world-tiles" width="1200" height="560" fill="url(#worldTiles)"/>
        <path className="world-zone world-zone--meadow" d="M0 0h390v125h-58v96h79v120h-96v219H0z"/>
        <path className="world-zone world-zone--water" d="M397 0h397v94h-62v93h49v151h-84v222H397z"/>
        <path className="world-zone world-zone--mount" d="M800 0h400v560H800V438h76V296h-64V152h71V68h-83z"/>
        <g className="world-decoration"><path d="M98 110l18-28 18 28h-9l12 21h-42l12-21zM326 405l16-25 16 25h-8l11 20h-38l11-20zM716 442l18-28 18 28h-9l12 21h-42l12-21z"/><path d="M505 96h12v12h-12zM535 125h12v12h-12zM685 82h12v12h-12z"/><path d="M1008 105l22-42 22 42zM1085 410l18-35 18 35z"/></g>
        <g className="world-roads">
          <path className="route route--violet" d="M84 102C225 62 285 155 425 114S650 55 780 102s215-55 340 0"/>
          <path className="route route--pink" d="M84 270C230 326 315 222 455 268s184-92 320-65 190 114 340 67"/>
          <path className="route route--cyan" d="M84 438C180 382 246 475 340 430s190 28 364-8"/>
          <path className="route route--join" d="M525 187C520 165 520 138 528 115"/>
        </g>
      </svg>
      <div className="ml-route-labels" aria-hidden="true">{ROUTES.map((route, index) => <span className={`is-${route.accent}`} style={{ top: `${12 + index * 30}%` }} key={route.id}><i />{route.title}</span>)}</div>
      {MILESTONES.map((item) => <MapNode key={item.id} item={item} selectedId={selectedId} onSelect={onSelect} variant="world"/>)}
      <div className="ml-player" aria-hidden="true"><i/><i/><i/><i/></div>
    </div>
    <footer className="ml-stage-caption"><b>地图语义</b><span>起点是小旗 · 周目标是营地 · 月方向终点是城堡 · 共享目标是双路线关卡</span><em>适合“生活探险家”的主世界感</em></footer>
  </section>;
}

function StarsVariant({ selectedId, onSelect }: { selectedId: string; onSelect: (id: string) => void }) {
  return <section className="ml-stage ml-stars" aria-label="电玩任务星图方案">
    <MonthRuler dark />
    <div className="ml-stars__board">
      <div className="ml-stars__scan" aria-hidden="true"/>
      <div className="ml-stars__dust" aria-hidden="true">{Array.from({ length: 36 }, (_, index) => <i key={index}/>)}</div>
      <svg viewBox="0 0 1200 560" preserveAspectRatio="none" aria-hidden="true">
        <g className="star-orbits"><path className="orbit orbit--violet" d="M84 102C215 34 318 175 443 105S683 45 790 102s213-37 330 0"/><path className="orbit orbit--pink" d="M84 270C221 336 330 195 455 270s180-89 320-67 214 121 340 67"/><path className="orbit orbit--cyan" d="M84 438C202 355 298 510 407 431s178 26 297-9"/><path className="orbit orbit--shared" d="M525 188C506 158 514 128 528 105"/></g>
      </svg>
      <div className="ml-stars__route-key">{ROUTES.map((route, index) => <span className={`is-${route.accent}`} key={route.id}><i />Q{index + 1} {route.title}</span>)}</div>
      {MILESTONES.map((item) => <MapNode key={item.id} item={item} selectedId={selectedId} onSelect={onSelect} variant="stars"/>)}
      <span className="ml-stars__cursor" aria-hidden="true">+</span>
    </div>
    <footer className="ml-stage-caption"><b>星图语义</b><span>方向是星轨 · 周目标是星体 · 终点是行星核心 · 共享目标形成双环恒星</span><em>游戏感最强，信息密度最高</em></footer>
  </section>;
}

function RunnerVariant({ selectedId, onSelect }: { selectedId: string; onSelect: (id: string) => void }) {
  return <section className="ml-stage ml-runner" aria-label="横向卷轴冒险方案">
    <MonthRuler />
    <div className="ml-runner__screen">
      <div className="runner-sky" aria-hidden="true"><i/><i/><i/><i/><i/></div>
      <div className="runner-hills runner-hills--back" aria-hidden="true"/><div className="runner-hills runner-hills--front" aria-hidden="true"/>
      <svg viewBox="0 0 1200 560" preserveAspectRatio="none" aria-hidden="true"><g className="runner-platforms"><path className="platform platform--violet" d="M58 130h190v-25h108v25h164v-18h125v18h180v-28h140v28h190v22H58z"/><path className="platform platform--pink" d="M58 292h130v20h170v-18h156v18h105v-28h156v28h148v-18h232v40H58z"/><path className="platform platform--cyan" d="M58 478h115v-24h170v24h176v-31h185v31h72v36H58z"/></g></svg>
      <div className="ml-runner__signs">{ROUTES.map((route, index) => <span className={`is-${route.accent}`} style={{ top: `${14 + index * 30}%` }} key={route.id}><b>Q{index + 1}</b>{route.title}</span>)}</div>
      {MILESTONES.map((item) => <MapNode key={item.id} item={item} selectedId={selectedId} onSelect={onSelect} variant="runner"/>)}
      <div className="runner-avatar" aria-hidden="true"><i/><i/><i/><i/><i/></div>
      <div className="runner-hud" aria-hidden="true"><span>LV.12</span><b>◆ ◆ ◆</b><em>XP 0840</em></div>
    </div>
    <footer className="ml-stage-caption"><b>关卡语义</b><span>方向占据不同高度的关卡层 · 周目标是检查点 · 月终点是大型关底建筑</span><em>最像传统电玩，横向旅程感最直观</em></footer>
  </section>;
}

function DetailCard({ item }: { item: Milestone }) {
  const route = ROUTES.find((candidate) => candidate.id === item.route);
  return <section className={`ml-detail ml-detail--${item.accent}`} aria-live="polite">
    <div className="ml-detail__icon"><Glyph kind={item.kind}/></div>
    <div className="ml-detail__copy"><span>{item.eyebrow}</span><h2>{item.title}</h2><p>{item.note}</p></div>
    <div className="ml-detail__meta"><span>{item.period}</span><b>{item.progress}</b>{item.xp ? <strong>{item.xp}</strong> : null}<small>所属方向 · {route?.title}</small></div>
  </section>;
}

function Sidebar() {
  return <aside className="milestone-sample-sidebar ml-sidebar">
    <a className="brand milestone-sample-brand" href="/" aria-label="返回 Week UP"><span className="brand-mark"><i/><i/><i/><i/></span><span><b>WEEK</b><strong>UP!</strong></span></a>
    <nav aria-label="成就图鉴栏目"><a href="/"><span>◇</span><b>属性徽章</b><small>BADGES</small></a><a href="/"><span>▥</span><b>技能书架</b><small>SKILLBOOKS</small></a><button className="is-active" type="button"><span>⌁</span><b>里程地图</b><small>JOURNEY MAP</small></button></nav>
    <div className="ml-sidebar__tip"><small>UI COMPARISON</small><b>三版视觉提案</b><p>使用上方切换器比较同一组旅程数据。</p></div>
    <a className="milestone-back-link" href="/">← 返回正式版</a>
  </aside>;
}

export default function MilestoneUiSamplePage() {
  const [variant, setVariant] = useState<VariantId>("runner");
  const [selectedId, setSelectedId] = useState("goal-analysis");
  const selected = useMemo(() => MILESTONES.find((item) => item.id === selectedId) ?? MILESTONES[0]!, [selectedId]);
  const activeVariant = VARIANTS.find((item) => item.id === variant)!;
  const renderVariant: Record<VariantId, ReactNode> = {
    world: <WorldVariant selectedId={selectedId} onSelect={setSelectedId}/>,
    stars: <StarsVariant selectedId={selectedId} onSelect={setSelectedId}/>,
    runner: <RunnerVariant selectedId={selectedId} onSelect={setSelectedId}/>,
  };

  return <div className="milestone-sample-shell ml-lab-shell">
    <Sidebar/>
    <main className="milestone-sample-main ml-lab-main">
      <header className="ml-lab-header"><div><span className="eyebrow">JOURNEY MAP PREVIEW</span><h1>里程地图 · 三个月预览</h1><p>七月至九月连续横向展开；方向、周目标与跨月终点共同构成一段电玩旅程。</p></div><span className="milestone-level">三个月 · 3 条方向 · 8 个目标</span></header>

      <div className="ml-variant-switch" role="tablist" aria-label="里程碑视觉方案切换">{VARIANTS.map((item) => <button className={variant === item.id ? "is-active" : ""} type="button" role="tab" aria-selected={variant === item.id} key={item.id} onClick={() => setVariant(item.id)}><em>{item.code}</em><span><b>{item.title}</b><small>{item.summary}</small></span><i>{variant === item.id ? "NOW" : "VIEW"}</i></button>)}</div>

      <div className="ml-current-variant"><span>当前方案 {activeVariant.code}</span><b>{activeVariant.title}</b><small>{activeVariant.summary}</small></div>
      {renderVariant[variant]}
      <DetailCard item={selected}/>

      <section className="ml-compare-hints" aria-label="三版侧重点"><article><b>A · 主世界</b><span>最贴近“生活探险家”叙事</span></article><article><b>B · 星图</b><span>电玩冲击力与容量最好</span></article><article><b>C · 卷轴</b><span>时间推进感最直观</span></article></section>
    </main>
  </div>;
}

function WebMonthStage({
  monthIndex,
  selectedId,
  onSelect,
  onMonthChange,
}: {
  monthIndex: 0 | 1 | 2;
  selectedId: string;
  onSelect: (id: string) => void;
  onMonthChange: (index: 0 | 1 | 2) => void;
}) {
  const month = MONTHS[monthIndex];
  const monthItems = MILESTONES.filter((item) => item.month === monthIndex);
  const localItems = monthItems.map((item) => {
    const routeItems = monthItems.filter((candidate) => candidate.route === item.route);
    const routeIndex = routeItems.findIndex((candidate) => candidate.id === item.id);
    const x = routeItems.length === 1
      ? (item.kind === "future" ? 82 : 22)
      : 13 + (routeIndex * 74) / (routeItems.length - 1);
    return { ...item, x } as Milestone;
  });

  const changeMonth = (next: number) => {
    if (next < 0 || next > MONTHS.length - 1) return;
    const nextIndex = next as 0 | 1 | 2;
    const nextItems = MILESTONES.filter((item) => item.month === nextIndex);
    const nextSelected = nextItems.find((item) => item.kind === "week") ?? nextItems[0];
    if (nextSelected) onSelect(nextSelected.id);
    onMonthChange(nextIndex);
  };

  return <section className="ml-web-month-stage" aria-label={`${month.name}单月里程地图`}>
    <header className="ml-web-month-toolbar">
      <button type="button" className="ml-web-month-step" disabled={monthIndex === 0} onClick={() => changeMonth(monthIndex - 1)}>← 上一月</button>
      <div className="ml-web-month-tabs" role="tablist" aria-label="月份章节">
        {MONTHS.map((item, index) => <button
          type="button"
          role="tab"
          aria-selected={monthIndex === index}
          className={monthIndex === index ? "is-active" : ""}
          key={item.name}
          onClick={() => changeMonth(index)}
        ><small>{item.chapter}</small><b>{item.name}</b></button>)}
      </div>
      <button type="button" className="ml-web-month-step" disabled={monthIndex === 2} onClick={() => changeMonth(monthIndex + 1)}>下一月 →</button>
    </header>

    <div className="ml-web-month-screen">
      <div className="runner-sky" aria-hidden="true"><i/><i/><i/><i/><i/></div>
      <div className="runner-hills runner-hills--back" aria-hidden="true"/>
      <div className="runner-hills runner-hills--front" aria-hidden="true"/>
      <svg viewBox="0 0 1200 620" preserveAspectRatio="none" aria-hidden="true">
        <g className="runner-platforms">
          <path className="platform platform--violet" d="M55 145h170v-24h168v24h188v-18h172v18h190v-28h202v50H55z"/>
          <path className="platform platform--pink" d="M55 326h145v22h186v-20h186v20h152v-30h185v30h236v42H55z"/>
          <path className="platform platform--cyan" d="M55 510h166v-25h174v25h186v-30h190v30h174v-20h200v56H55z"/>
        </g>
      </svg>
      <div className="ml-runner__signs ml-web-month-signs">{ROUTES.map((route, index) => <span className={`is-${route.accent}`} style={{ top: `${14 + index * 30}%` }} key={route.id}><b>Q{index + 1}</b>{route.title}</span>)}</div>
      {ROUTES.map((route, routeIndex) => {
        const routeItems = MILESTONES.filter((item) => item.route === route.id);
        const hasEarlier = routeItems.some((item) => item.month < monthIndex);
        const hasLater = routeItems.some((item) => item.month > monthIndex) || (route.id === "explore" && monthIndex === 2);
        return <div className="ml-web-route-gates" style={{ top: `${18 + routeIndex * 30}%` }} key={route.id} aria-hidden="true">
          {hasEarlier ? <span className="is-left">←</span> : null}
          {hasLater ? <span className="is-right">→</span> : null}
        </div>;
      })}
      {localItems.map((item) => <MapNode key={item.id} item={item} selectedId={selectedId} onSelect={onSelect} variant="runner"/>)}
      <div className="runner-avatar ml-web-month-avatar" aria-hidden="true"><i/><i/><i/><i/><i/></div>
      <div className="runner-hud" aria-hidden="true"><span>{month.chapter}</span><b>◆ ◆ ◆</b><em>{localItems.length.toString().padStart(2, "0")} NODES</em></div>
    </div>

    <footer className="ml-web-month-caption">
      <div><small>NOW PLAYING</small><b>{month.name}</b></div>
      <p>宽屏一次只展示一个月；路线边缘箭头表示方向从上月延续或将进入下月。</p>
      <span>{monthItems.length} 个旅程节点</span>
    </footer>
  </section>;
}

export function MilestoneWebPreviewPage() {
  const [monthIndex, setMonthIndex] = useState<0 | 1 | 2>(0);
  const [selectedId, setSelectedId] = useState("goal-chapter");
  const selected = useMemo(() => MILESTONES.find((item) => item.id === selectedId) ?? MILESTONES[0]!, [selectedId]);
  return <div className="ml-web-shell">
    <header className="ml-web-topbar">
      <a className="brand milestone-sample-brand" href="/" aria-label="返回 Week UP"><span className="brand-mark"><i/><i/><i/><i/></span><span><b>WEEK</b><strong>UP!</strong></span></a>
      <nav aria-label="成就图鉴栏目"><a href="/">属性徽章</a><a href="/">技能书架</a><button type="button" className="is-active">里程地图</button></nav>
      <div className="ml-web-profile"><span>UP</span><div><b>生活探险家</b><small>WEB · DESKTOP</small></div></div>
    </header>
    <main className="ml-web-main">
      <section className="ml-web-hero"><div><span className="eyebrow">JOURNEY MAP · WEB PREVIEW</span><h1>一次进入一个月的生活关卡</h1><p>宽屏聚焦当前月份；通过章节按钮切换七月至九月，跨月方向会从关卡边缘继续衔接。</p></div><div className="ml-web-stats"><article><b>03</b><span>月份章节</span></article><article><b>03</b><span>并行方向</span></article><article><b>08</b><span>归档目标</span></article></div></section>
      <section className="ml-web-route-deck" aria-label="三条月方向">{ROUTES.map((route,index) => <article className={`is-${route.accent}`} key={route.id}><span>Q{index + 1}</span><div><small>MONTH DIRECTION</small><b>{route.title}</b><p>{route.summary}</p></div><em>{index === 0 ? "探索中" : index === 1 ? "跨 3 月" : "已归档"}</em></article>)}</section>
      <WebMonthStage monthIndex={monthIndex} selectedId={selectedId} onSelect={setSelectedId} onMonthChange={setMonthIndex}/>
      <section className="ml-web-lower"><DetailCard item={selected}/><aside className="ml-web-guide"><span className="eyebrow">MAP LEGEND</span><h2>如何阅读这张地图</h2><div><i className="is-start"/><p><b>方向起点</b><small>记录方向标题与启程说明</small></p></div><div><i className="is-week"/><p><b>周目标检查点</b><small>仅在归档后进入路线</small></p></div><div><i className="is-finish"/><p><b>月方向终点</b><small>完整汇总目标和沿途收获</small></p></div></aside></section>
    </main>
  </div>;
}
