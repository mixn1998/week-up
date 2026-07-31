"use client";

import { FormEvent, useMemo, useState, type CSSProperties } from "react";

import {
  EMOTION_TYPES,
  MENTAL_MODEL_DIMENSIONS,
  emotionTypeFromLegacyLevel,
  legacyLevelForEmotionType,
  type EmotionType,
  AwarenessEntry,
  type EmotionLevel,
  MentalModelVersion,
  MonthlyThoughtReview,
  WeeklyEmotionReview,
} from "../lib/awareness.ts";
import { MentalModelRadar } from "./mental-model-radar.tsx";

function shanghaiToday() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function eventTime(occurredAt: string) {
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(occurredAt));
}

function groupEntries(entries: readonly AwarenessEntry[]) {
  const groups = new Map<string, AwarenessEntry[]>();
  for (const entry of [...entries].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))) {
    const group = groups.get(entry.localDate) ?? [];
    group.push(entry);
    groups.set(entry.localDate, group);
  }
  return [...groups.entries()];
}

export function AwarenessQuickCapture({
  entries,
  onRecordThought,
  onRecordEmotion,
  onExplore,
}: {
  entries: readonly AwarenessEntry[];
  onRecordThought: (content: string) => Promise<unknown>;
  onRecordEmotion: (emotionType: EmotionType, reason?: string) => Promise<unknown>;
  onExplore: () => void;
}) {
  const today = shanghaiToday();
  const todayEntries = entries.filter((entry) => entry.localDate === today && entry.removedAt === undefined);
  const [thought, setThought] = useState("");
  const [emotionType, setEmotionType] = useState<EmotionType>();
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState<"thought" | "emotion">();
  const [error, setError] = useState("");

  const submitThought = async (event: FormEvent) => {
    event.preventDefault();
    if (!thought.trim() || saving) return;
    setSaving("thought");
    setError("");
    try {
      await onRecordThought(thought.trim());
      setThought("");
    } catch {
      setError("思想记录暂时没有保存，请稍后再试。");
    } finally {
      setSaving(undefined);
    }
  };

  const submitEmotion = async (event: FormEvent) => {
    event.preventDefault();
    if (!emotionType || saving) return;
    setSaving("emotion");
    setError("");
    try {
      await onRecordEmotion(emotionType, reason.trim() || undefined);
      setEmotionType(undefined);
      setReason("");
    } catch {
      setError("情绪记录暂时没有保存，请稍后再试。");
    } finally {
      setSaving(undefined);
    }
  };

  return <section className="awareness-quick">
    <div className="section-heading section-heading--small">
      <div><span className="eyebrow">SELF AWARENESS</span><h2>此刻值得留下</h2></div>
      <button className="text-button" type="button" onClick={onExplore}>查看存档 →</button>
    </div>
    <div className="awareness-quick__grid">
      <form className="pixel-card awareness-capture awareness-capture--thought" onSubmit={submitThought}>
        <label htmlFor="quick-thought"><b>思想变化</b><small>记录一个值得留下的想法</small></label>
        <textarea id="quick-thought" value={thought} onChange={(event) => setThought(event.target.value)} rows={3} placeholder="直接写下此刻形成的想法…" />
        <button className="pixel-button pixel-button--yellow" type="submit" disabled={!thought.trim() || Boolean(saving)}>
          {saving === "thought" ? "保存中…" : "保存思想"}
        </button>
      </form>
      <form className="pixel-card awareness-capture awareness-capture--emotion" onSubmit={submitEmotion}>
        <label><b>情绪流动</b><small>记录一次强烈感受</small></label>
        <div className="emotion-picker emotion-picker--types" role="radiogroup" aria-label="选择情绪类型">
          {EMOTION_TYPES.map((item) => <button
            className={emotionType === item.key ? "is-selected" : ""}
            key={item.key}
            type="button"
            role="radio"
            aria-checked={emotionType === item.key}
            onClick={() => setEmotionType(item.key)}
          ><i>{item.mark}</i><span>{item.label}</span></button>)}
        </div>
        <input aria-label="情绪原因（选填）" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="发生了什么？可选填" />
        <button className="pixel-button pixel-button--pink" type="submit" disabled={!emotionType || Boolean(saving)}>
          {saving === "emotion" ? "保存中…" : "保存感受"}
        </button>
      </form>
    </div>
    <div className="awareness-quick__foot">
      <span>今日已留下 <b>{todayEntries.length}</b> 条显著事件</span>
    </div>
    {error && <div className="awareness-error" role="alert">{error}</div>}
  </section>;
}

function EditableEntry({
  entry,
  onUpdate,
  onRemove,
}: {
  entry: AwarenessEntry;
  onUpdate: (entry: AwarenessEntry, value: string, level?: EmotionLevel, emotionType?: EmotionType) => Promise<unknown>;
  onRemove: (id: string) => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(entry.kind === "thought" ? entry.content : entry.reason ?? "");
  const [emotionType, setEmotionType] = useState<EmotionType>(entry.kind === "emotion" ? entry.emotionType ?? emotionTypeFromLegacyLevel(entry.level) : "complex");
  const frozen = entry.settlementState === "frozen";
  const save = async () => {
    await onUpdate(
      entry,
      value,
      entry.kind === "emotion" ? legacyLevelForEmotionType(emotionType) : undefined,
      entry.kind === "emotion" ? emotionType : undefined,
    );
    setEditing(false);
  };
  return <article className={`awareness-entry awareness-entry--${entry.kind}${frozen ? " is-frozen" : ""}`}>
    <div className="awareness-entry__meta">
      <span>{eventTime(entry.occurredAt)}</span>
      {entry.kind === "emotion" && <b>{EMOTION_TYPES.find((item) => item.key === (entry.emotionType ?? emotionTypeFromLegacyLevel(entry.level)))?.label}</b>}
      <em>{frozen ? "已冻结" : "未结算"}</em>
    </div>
    {editing ? <div className="awareness-entry__editor">
      {entry.kind === "emotion" && <>
        <div className="emotion-picker emotion-picker--mini">{EMOTION_TYPES.map((item) => <button type="button" className={emotionType === item.key ? "is-selected" : ""} key={item.key} onClick={() => setEmotionType(item.key)}>{item.label}</button>)}</div>
      </>}
      <textarea value={value} onChange={(event) => setValue(event.target.value)} rows={3} />
      <div><button className="pixel-button pixel-button--cyan" type="button" onClick={() => void save()}>保存</button><button className="text-button" type="button" onClick={() => setEditing(false)}>取消</button></div>
    </div> : <p>{entry.kind === "thought" ? entry.content : entry.reason || "没有补充原因"}</p>}
    {!frozen && !editing && <div className="awareness-entry__actions"><button type="button" onClick={() => setEditing(true)}>编辑</button><button type="button" onClick={() => void onRemove(entry.id)}>删除</button></div>}
  </article>;
}

function AnalysisStatus({ status, generating, onRetry }: { status: "pending" | "failed" | "ready"; generating: boolean; onRetry?: () => void }) {
  if (status === "ready") return null;
  return <div className={`awareness-analysis-state awareness-analysis-state--${status}`}>
    <b>{generating ? "正在整理显著事件…" : status === "failed" ? "分析暂时未生成" : "等待分析"}</b>
    {status === "failed" && onRetry && <button className="pixel-button pixel-button--cyan" onClick={onRetry}>重新分析</button>}
  </div>;
}

function ThoughtReviewCard({ review, generating, onRetry }: { review: MonthlyThoughtReview; generating: boolean; onRetry: () => void }) {
  const analysis = review.analysis.status === "ready" ? review.analysis.value : undefined;
  const repeatedThemes = analysis?.repeatedThemes ?? analysis?.keyInsights.slice(0, 2) ?? [];
  const emergingSignals = analysis?.emergingSignals
    ?? analysis?.thoughtShifts?.map((item) => ({ summary: item.to, evidenceEntryIds: item.evidenceEntryIds }))
    ?? [];
  const openObservations = analysis?.openObservations ?? analysis?.recurringQuestions ?? [];
  return <section className="pixel-card awareness-review-card awareness-review-card--thought">
    <div className="awareness-review-head"><div className="awareness-review-head__icon" aria-hidden="true">✦</div><div><span className="eyebrow">MONTHLY THOUGHT</span><h2>思想演化图谱</h2></div><span><b>{review.monthKey}</b>{review.sourceThoughtEntryIds.length} 条思想变化</span></div>
    <AnalysisStatus status={review.analysis.status} generating={generating} onRetry={onRetry} />
    {analysis && <>
      <div className="awareness-report-label">THOUGHT CONSTELLATION / 本月主题</div>
      <div className="awareness-topic-map">
        {analysis.topicDistribution.slice(0, 7).map((item, index) => <span className={index === 0 ? "is-primary" : ""} key={item.topic} style={{ "--topic-weight": Math.min(1, .45 + item.entryCount * .14) } as CSSProperties}>{item.topic}<small>{item.entryCount}</small></span>)}
      </div>
      <div className="awareness-report-label">MONTHLY SIGNALS / 本月思想信号</div>
      <div className="awareness-thought-signals">
        <section><small>反复出现的主线</small>{repeatedThemes.length > 0 ? repeatedThemes.slice(0, 2).map((item) => <p key={item.summary}>{item.summary}</p>) : <p>本月记录暂未形成重复主线。</p>}</section>
        <section className="is-new"><small>新出现的线索</small>{emergingSignals.length > 0 ? emergingSignals.slice(0, 2).map((item) => <p key={item.summary}>{item.summary}</p>) : <p>本月暂未识别出新的思想线索。</p>}</section>
      </div>
      <div className="awareness-insights awareness-insights--thought">{analysis.keyInsights.slice(0, 3).map((item, index) => <article key={`${item.summary}-${index}`}><b>{index === 0 ? "本月发现" : "相关发现"}</b><p>{item.summary}</p></article>)}</div>
      {openObservations.length > 0 && <div className="awareness-pending"><b>有待观察</b><p>{openObservations[0].question}</p></div>}
      <div className="awareness-model-update"><b>心智模型 · 新的发展</b><span>思想信号将作为增量证据</span></div>
    </>}
  </section>;
}

function EmotionReviewCard({ review, events, generating, onRetry }: { review: WeeklyEmotionReview; events: readonly Extract<AwarenessEntry, { kind: "emotion" }>[]; generating: boolean; onRetry: () => void }) {
  const analysis = review.analysis.status === "ready" ? review.analysis.value : undefined;
  const triggerChains = analysis?.triggerChains ?? [];
  const primaryChain = triggerChains[0];
  return <section className="pixel-card awareness-review-card awareness-review-card--emotion">
    <div className="awareness-review-head"><div className="awareness-review-head__icon" aria-hidden="true">◆</div><div><span className="eyebrow">WEEKLY EMOTION</span><h2>情绪触发实验室</h2></div><span><b>{review.rangeStart.slice(5)}—{review.rangeEnd.slice(5)}</b>{review.statistics.entryCount} 次显著事件</span></div>
    <AnalysisStatus status={review.analysis.status} generating={generating} onRetry={onRetry} />
    {analysis && <div className="awareness-analysis-copy">
      <div className="awareness-report-label">EVENT SIGNAL / 事件流</div>
      <div className="awareness-event-rail">{events.map((entry) => <div key={entry.id}><time>{entry.localDate.slice(5)} {eventTime(entry.occurredAt)}</time><b>{EMOTION_TYPES.find((item) => item.key === (entry.emotionType ?? emotionTypeFromLegacyLevel(entry.level)))?.label}</b><span>{entry.reason || "未补充事件"}</span></div>)}</div>
      <h3>{analysis.dominantFlow}</h3>
      <div className="awareness-report-label">POSSIBLE TRIGGER MECHANISM / 可能的触发机制</div>
      {primaryChain ? <div className="awareness-trigger-chain">
        <section><small>01 / 事件</small><b>{primaryChain.eventSummary}</b></section>
        <section><small>02 / 当时的理解</small><b>{primaryChain.interpretation}</b></section>
        <section><small>03 / 被触及的需要</small><b>{primaryChain.underlyingNeeds.join("、")}</b></section>
        <section className="is-result"><small>04 / 情绪结果</small><b>{primaryChain.emotionalResponse}</b></section>
        <p><b>为什么可能被触发？</b>{primaryChain.possibleMechanism}</p>
      </div> : <div className="awareness-trigger-fallback">
        {analysis.recurringTriggers.length > 0 && <p><b>已记录诱因：</b>{analysis.recurringTriggers.join("、")}</p>}
        {analysis.recoveryPatterns.length > 0 && <p><b>回应方式：</b>{analysis.recoveryPatterns.join("、")}</p>}
      </div>}
      <div className="awareness-hypotheses">
        {analysis.alternativeExplanations?.[0] && <section><b>另一种解释</b><p>{analysis.alternativeExplanations[0].summary}</p></section>}
        {analysis.pendingValidations?.[0] && <section><b>有待验证</b><p>{analysis.pendingValidations[0].question}</p></section>}
      </div>
      {(analysis.mentalModelSignals?.length ?? 0) > 0 && <div className="awareness-model-update"><b>心智模型 · 增量证据</b><div>{analysis.mentalModelSignals!.slice(0, 3).map((signal) => <span key={`${signal.dimension}-${signal.summary}`}>{MENTAL_MODEL_DIMENSIONS.find((item) => item.key === signal.dimension)?.label ?? signal.dimension}</span>)}</div></div>}
    </div>}
  </section>;
}

function MentalModelPanel({
  version,
  updateVersion,
  generating,
  onRetry,
}: {
  version?: MentalModelVersion;
  updateVersion?: MentalModelVersion;
  generating: boolean;
  onRetry: () => void;
}) {
  if (!version) return <section className="pixel-card awareness-empty"><b>还没有心智模型</b><p>有了记录后会逐步形成。</p></section>;
  const ready = version.analysis.status === "ready" ? version.analysis : undefined;
  const updateState = updateVersion && updateVersion.id !== version.id ? updateVersion.analysis : version.analysis;
  const updatedAt = ready?.generatedAt ?? version.frozenAt;
  return <section className="mental-model-panel">
    <div className="mental-model-banner pixel-card">
      <div><span className="eyebrow">CURRENT MENTAL MAP</span><h2>当前心智模型</h2><p>随新记录更新</p></div>
      <span>更新于 {updatedAt.slice(0, 10)}</span>
    </div>
    {updateState.status !== "ready" && <AnalysisStatus status={updateState.status} generating={generating} onRetry={onRetry} />}
    {ready && <>
      <MentalModelRadar profile={ready.dimensionProfile} />
    </>}
  </section>;
}

export function AwarenessView({
  entries,
  weeklyReviews,
  monthlyReviews,
  mentalModels,
  generatingIds,
  onUpdate,
  onRemove,
  onRetryWeekly,
  onRetryMonthly,
}: {
  entries: readonly AwarenessEntry[];
  weeklyReviews: readonly WeeklyEmotionReview[];
  monthlyReviews: readonly MonthlyThoughtReview[];
  mentalModels: readonly MentalModelVersion[];
  generatingIds: readonly string[];
  onUpdate: (entry: AwarenessEntry, value: string, level?: EmotionLevel, emotionType?: EmotionType) => Promise<unknown>;
  onRemove: (id: string) => Promise<unknown>;
  onRetryWeekly: (id: string) => Promise<unknown>;
  onRetryMonthly: (version: MentalModelVersion) => Promise<unknown>;
}) {
  const [tab, setTab] = useState<"thought" | "emotion" | "mental-model">("thought");
  const activeEntries = entries.filter((entry) => entry.removedAt === undefined);
  const thoughtEntries = activeEntries.filter((entry) => entry.kind === "thought");
  const emotionEntries = activeEntries.filter((entry) => entry.kind === "emotion");
  const latestModel = mentalModels.at(-1);
  const currentModel = useMemo(
    () => [...mentalModels].reverse().find((version) => version.analysis.status === "ready") ?? latestModel,
    [mentalModels, latestModel],
  );
  return <div className="view awareness-view">
    <div className="page-title"><div><span className="eyebrow">SELF AWARENESS</span><h1>自我觉察</h1></div></div>
    <div className="awareness-tabs" role="tablist">
      <button className={tab === "thought" ? "active" : ""} onClick={() => setTab("thought")}><span aria-hidden="true">✦</span><b>思想变化</b><small>{thoughtEntries.length} 条记录</small></button>
      <button className={tab === "emotion" ? "active" : ""} onClick={() => setTab("emotion")}><span aria-hidden="true">≋</span><b>情绪流动</b><small>{emotionEntries.length} 次事件</small></button>
      <button className={tab === "mental-model" ? "active" : ""} onClick={() => setTab("mental-model")}><span aria-hidden="true">◉</span><b>心智模型</b><small>持续更新</small></button>
    </div>

    {tab === "thought" && <div className={`awareness-columns${monthlyReviews.length === 0 ? " awareness-columns--single" : ""}`}>
      <section className="pixel-card awareness-stream"><div className="section-heading section-heading--small"><div><span className="eyebrow">THOUGHT EVENT STREAM</span><h2>思想存档</h2></div><span>{groupEntries(thoughtEntries).length} 个记录日期</span></div>
        {groupEntries(thoughtEntries).length === 0 ? <div className="mini-empty">还没有留下思想变化。</div> : groupEntries(thoughtEntries).map(([date, dayEntries]) => <section className="awareness-day" key={date}><header><b>{date}</b><span>{dayEntries.length > 1 ? `灵感集中 · ${dayEntries.length} 条` : "1 条显著记录"}</span></header>{dayEntries.map((entry) => <EditableEntry key={entry.id} entry={entry} onUpdate={onUpdate} onRemove={onRemove} />)}</section>)}
      </section>
      {monthlyReviews.length > 0 && <div className="awareness-review-list">{[...monthlyReviews].reverse().map((review) => <ThoughtReviewCard key={review.id} review={review} generating={generatingIds.includes(review.id)} onRetry={() => {
        const model = mentalModels.find((version) => version.sourceThoughtReviewId === review.id);
        if (model) void onRetryMonthly(model);
      }} />)}</div>}
    </div>}

    {tab === "emotion" && <div className={`awareness-columns${weeklyReviews.length === 0 ? " awareness-columns--single" : ""}`}>
      <section className="pixel-card awareness-stream"><div className="section-heading section-heading--small"><div><span className="eyebrow">SIGNIFICANT EVENTS</span><h2>显著情绪事件</h2></div></div>
        {groupEntries(emotionEntries).length === 0 ? <div className="mini-empty">还没有留下显著情绪事件。</div> : groupEntries(emotionEntries).map(([date, dayEntries]) => <section className="awareness-day awareness-day--emotion" key={date}><header><b>{date}</b><span>{dayEntries.length > 1 ? `同日变化 · ${dayEntries.length} 个离散点` : "1 个事件点"}</span></header><div className="emotion-event-line">{dayEntries.map((entry) => <i key={entry.id} />)}</div>{dayEntries.map((entry) => <EditableEntry key={entry.id} entry={entry} onUpdate={onUpdate} onRemove={onRemove} />)}</section>)}
      </section>
      {weeklyReviews.length > 0 && <div className="awareness-review-list">{[...weeklyReviews].reverse().map((review) => <EmotionReviewCard key={review.id} review={review} events={emotionEntries.filter((entry) => entry.localDate >= review.rangeStart && entry.localDate <= review.rangeEnd)} generating={generatingIds.includes(review.id)} onRetry={() => void onRetryWeekly(review.id)} />)}</div>}
    </div>}

    {tab === "mental-model" && <>
      <MentalModelPanel
        version={currentModel}
        updateVersion={latestModel}
        generating={latestModel ? generatingIds.includes(latestModel.id) : false}
        onRetry={() => latestModel && void onRetryMonthly(latestModel)}
      />
    </>}
  </div>;
}
