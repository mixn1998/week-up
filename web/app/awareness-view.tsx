"use client";

import { FormEvent, useMemo, useState, type CSSProperties } from "react";

import {
  EMOTION_INTENSITIES,
  EMOTION_TYPES,
  emotionIntensityFromLegacyLevel,
  emotionTypeFromLegacyLevel,
  legacyLevelForEmotionType,
  type EmotionIntensity,
  type EmotionType,
  AwarenessEntry,
  type EmotionLevel,
  MentalModelVersion,
  MonthlyThoughtReview,
  WeeklyEmotionReview,
} from "../lib/awareness.ts";
import { MentalModelDimensionList, MentalModelRadar } from "./mental-model-radar.tsx";

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
  onRecordEmotion: (emotionType: EmotionType, intensity: EmotionIntensity, reason?: string) => Promise<unknown>;
  onExplore: () => void;
}) {
  const today = shanghaiToday();
  const todayEntries = entries.filter((entry) => entry.localDate === today && entry.removedAt === undefined);
  const [thought, setThought] = useState("");
  const [emotionType, setEmotionType] = useState<EmotionType>();
  const [intensity, setIntensity] = useState<EmotionIntensity>();
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
    if (!emotionType || !intensity || saving) return;
    setSaving("emotion");
    setError("");
    try {
      await onRecordEmotion(emotionType, intensity, reason.trim() || undefined);
      setEmotionType(undefined);
      setIntensity(undefined);
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
        <label><b>情绪流</b><small>记录一次强烈感受</small></label>
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
        <div className="emotion-intensity" role="radiogroup" aria-label="选择感受强度">
          <small>感受强度</small>{EMOTION_INTENSITIES.map((item) => <button
            className={intensity === item.value ? "is-selected" : ""}
            key={item.value}
            type="button"
            role="radio"
            aria-checked={intensity === item.value}
            onClick={() => setIntensity(item.value)}
          >{item.label}</button>)}
        </div>
        <input aria-label="情绪原因（选填）" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="发生了什么？可选填" />
        <button className="pixel-button pixel-button--pink" type="submit" disabled={!emotionType || !intensity || Boolean(saving)}>
          {saving === "emotion" ? "保存中…" : "保存感受"}
        </button>
      </form>
    </div>
    <div className="awareness-quick__foot">
      <span>今日已留下 <b>{todayEntries.length}</b> 条显著事件</span>
      <small>不需要每日填写；没有记录不会被解释为平稳或空白状态。</small>
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
  onUpdate: (entry: AwarenessEntry, value: string, level?: EmotionLevel, emotionType?: EmotionType, intensity?: EmotionIntensity) => Promise<unknown>;
  onRemove: (id: string) => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(entry.kind === "thought" ? entry.content : entry.reason ?? "");
  const [emotionType, setEmotionType] = useState<EmotionType>(entry.kind === "emotion" ? entry.emotionType ?? emotionTypeFromLegacyLevel(entry.level) : "complex");
  const [intensity, setIntensity] = useState<EmotionIntensity>(entry.kind === "emotion" ? entry.intensity ?? emotionIntensityFromLegacyLevel(entry.level) : 2);
  const frozen = entry.settlementState === "frozen";
  const save = async () => {
    await onUpdate(
      entry,
      value,
      entry.kind === "emotion" ? legacyLevelForEmotionType(emotionType) : undefined,
      entry.kind === "emotion" ? emotionType : undefined,
      entry.kind === "emotion" ? intensity : undefined,
    );
    setEditing(false);
  };
  return <article className={`awareness-entry awareness-entry--${entry.kind}${frozen ? " is-frozen" : ""}`}>
    <div className="awareness-entry__meta">
      <span>{eventTime(entry.occurredAt)}</span>
      {entry.kind === "emotion" && <b>{EMOTION_TYPES.find((item) => item.key === (entry.emotionType ?? emotionTypeFromLegacyLevel(entry.level)))?.label} · {EMOTION_INTENSITIES.find((item) => item.value === (entry.intensity ?? emotionIntensityFromLegacyLevel(entry.level)))?.label}</b>}
      <em>{frozen ? "已冻结" : "未结算"}</em>
    </div>
    {editing ? <div className="awareness-entry__editor">
      {entry.kind === "emotion" && <>
        <div className="emotion-picker emotion-picker--mini">{EMOTION_TYPES.map((item) => <button type="button" className={emotionType === item.key ? "is-selected" : ""} key={item.key} onClick={() => setEmotionType(item.key)}>{item.label}</button>)}</div>
        <div className="emotion-intensity emotion-intensity--mini">{EMOTION_INTENSITIES.map((item) => <button type="button" className={intensity === item.value ? "is-selected" : ""} key={item.value} onClick={() => setIntensity(item.value)}>{item.label}</button>)}</div>
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
    <small>原始记录与冻结范围已经保存，不会因分析失败而丢失。</small>
    {status === "failed" && onRetry && <button className="pixel-button pixel-button--cyan" onClick={onRetry}>重新分析</button>}
  </div>;
}

function ThoughtReviewCard({ review, generating, onRetry }: { review: MonthlyThoughtReview; generating: boolean; onRetry: () => void }) {
  return <section className="pixel-card awareness-review-card">
    <div className="section-heading section-heading--small"><div><span className="eyebrow">MONTHLY THOUGHT</span><h2>{review.monthKey} 思想复盘</h2></div><span>{review.sourceThoughtEntryIds.length} 条</span></div>
    <AnalysisStatus status={review.analysis.status} generating={generating} onRetry={onRetry} />
    {review.analysis.status === "ready" && <>
      <div className="topic-distribution">{review.analysis.value.topicDistribution.map((item) => <div key={item.topic}><b>{item.topic}</b><i><em style={{ width: `${Math.min(100, item.recordedDateCount * 18)}%` }} /></i><span>{item.entryCount} 条 · {item.recordedDateCount} 日</span></div>)}</div>
      <div className="awareness-insights">{review.analysis.value.keyInsights.map((item, index) => <article key={`${item.summary}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><p>{item.summary}</p><small>{item.evidenceEntryIds.length} 条来源</small></article>)}</div>
    </>}
  </section>;
}

function EmotionReviewCard({ review, generating, onRetry }: { review: WeeklyEmotionReview; generating: boolean; onRetry: () => void }) {
  return <section className="pixel-card awareness-review-card">
    <div className="section-heading section-heading--small"><div><span className="eyebrow">WEEKLY EMOTION</span><h2>{review.rangeStart.slice(5)}—{review.rangeEnd.slice(5)}</h2></div><span>{review.statistics.entryCount} 次显著事件</span></div>
    <AnalysisStatus status={review.analysis.status} generating={generating} onRetry={onRetry} />
    {review.analysis.status === "ready" && <div className="awareness-analysis-copy">
      <h3>{review.analysis.value.dominantFlow}</h3>
      {review.analysis.value.recurringTriggers.length > 0 && <p><b>已记录诱因：</b>{review.analysis.value.recurringTriggers.join("、")}</p>}
      {review.analysis.value.recoveryPatterns.length > 0 && <p><b>回应方式：</b>{review.analysis.value.recoveryPatterns.join("、")}</p>}
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
  if (!version) return <section className="pixel-card awareness-empty"><b>还没有心智模型版本</b><p>历史材料分析后会直接形成基线；之后在月结算时更新。</p></section>;
  const ready = version.analysis.status === "ready" ? version.analysis : undefined;
  const updateState = updateVersion && updateVersion.id !== version.id ? updateVersion.analysis : version.analysis;
  const updatedAt = ready?.generatedAt ?? version.frozenAt;
  return <section className="mental-model-panel">
    <div className="mental-model-banner pixel-card">
      <div><span className="eyebrow">CURRENT MENTAL MAP</span><h2>当前心智模型</h2><p>在新记录上持续发展</p></div>
      <span>更新于 {updatedAt.slice(0, 10)}</span>
    </div>
    {updateState.status !== "ready" && <AnalysisStatus status={updateState.status} generating={generating} onRetry={onRetry} />}
    {ready && <>
      <MentalModelRadar profile={ready.dimensionProfile} />
      <MentalModelDimensionList profile={ready.dimensionProfile} models={ready.models} />
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
  onUpdate: (entry: AwarenessEntry, value: string, level?: EmotionLevel, emotionType?: EmotionType, intensity?: EmotionIntensity) => Promise<unknown>;
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
    <div className="page-title"><div><span className="eyebrow">SELF AWARENESS</span><h1>自我觉察</h1><p>只保存值得留下的显著感受与想法，不把空白日期解释成日常状态。</p></div></div>
    <div className="awareness-tabs" role="tablist">
      <button className={tab === "thought" ? "active" : ""} onClick={() => setTab("thought")}><span>01</span><b>思想变化</b><small>{thoughtEntries.length} 条记录</small></button>
      <button className={tab === "emotion" ? "active" : ""} onClick={() => setTab("emotion")}><span>02</span><b>情绪流</b><small>{emotionEntries.length} 次事件</small></button>
      <button className={tab === "mental-model" ? "active" : ""} onClick={() => setTab("mental-model")}><span>03</span><b>心智模型</b><small>持续画像</small></button>
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
      <section className="pixel-card awareness-stream"><div className="section-heading section-heading--small"><div><span className="eyebrow">SIGNIFICANT EVENTS</span><h2>显著情绪事件</h2></div><span>空白日期不补值</span></div>
        {groupEntries(emotionEntries).length === 0 ? <div className="mini-empty">还没有留下显著情绪事件。</div> : groupEntries(emotionEntries).map(([date, dayEntries]) => <section className="awareness-day awareness-day--emotion" key={date}><header><b>{date}</b><span>{dayEntries.length > 1 ? `同日变化 · ${dayEntries.length} 个离散点` : "1 个事件点"}</span></header><div className="emotion-event-line">{dayEntries.map((entry) => <i key={entry.id} style={{ "--emotion-level": entry.kind === "emotion" ? entry.intensity ?? emotionIntensityFromLegacyLevel(entry.level) : 2 } as CSSProperties} />)}</div>{dayEntries.map((entry) => <EditableEntry key={entry.id} entry={entry} onUpdate={onUpdate} onRemove={onRemove} />)}</section>)}
      </section>
      {weeklyReviews.length > 0 && <div className="awareness-review-list">{[...weeklyReviews].reverse().map((review) => <EmotionReviewCard key={review.id} review={review} generating={generatingIds.includes(review.id)} onRetry={() => void onRetryWeekly(review.id)} />)}</div>}
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
