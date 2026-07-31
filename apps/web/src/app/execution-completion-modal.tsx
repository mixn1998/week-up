"use client";

import { FormEvent, useState } from "react";

import {
  executionDraftForPlan,
  executionDraftIsValid,
  executionSegmentsForDate,
  shanghaiDate,
  type ExecutionTimeDraft,
} from "../lib/execution-policy.ts";
import type { PlanRecord, PlanTimeSegmentInput } from "../lib/week-up-domain.ts";

type ExecutionCompletionValue = Readonly<{
  actualSegments: readonly PlanTimeSegmentInput[];
  completedAt: string;
}>;

function newDraft(after?: string): ExecutionTimeDraft {
  const start = after ?? "20:30";
  const [hour = 0, minute = 0] = start.split(":").map(Number);
  const total = Math.min(23 * 60 + 59, hour * 60 + minute + 60);
  return {
    id: `actual-${crypto.randomUUID()}`,
    start,
    end: `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`,
  };
}

export function ExecutionCompletionModal({
  plan,
  segmentId,
  onClose,
  onConfirm,
}: {
  plan: PlanRecord;
  segmentId?: string;
  onClose: () => void;
  onConfirm: (value: ExecutionCompletionValue) => void;
}) {
  const [date, setDate] = useState(() => shanghaiDate(new Date().toISOString()));
  const [segments, setSegments] = useState<ExecutionTimeDraft[]>(() => executionDraftForPlan(plan, segmentId));
  const valid = executionDraftIsValid(segments);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    const actualSegments = executionSegmentsForDate(date, segments);
    onConfirm({
      actualSegments,
      completedAt: actualSegments.at(-1)!.endAt,
    });
  };
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <form className="quick-modal execution-completion-modal pixel-card" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="execution-completion-title">
      <button type="button" className="modal-close" onClick={onClose} aria-label="关闭">×</button>
      <span className="eyebrow">ACTUAL EXECUTION</span>
      <h2 id="execution-completion-title">确认实际执行时间</h2>
      <p className="execution-completion-intro">排期保持不变；这里记录的实际时间只进入 Timeline 与属性增长。</p>
      <label>实际执行日期<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
      <fieldset className="time-segment-editor">
        <legend>实际执行时间</legend>
        <div className="time-segment-list">{segments.map((segment, index) => <div className="time-segment-row" key={segment.id}>
          <input aria-label={`第 ${index + 1} 段实际开始时间`} type="time" required value={segment.start} onChange={(event) => setSegments((current) => current.map((item) => item.id === segment.id ? { ...item, start: event.target.value } : item))} />
          <span>—</span>
          <input aria-label={`第 ${index + 1} 段实际结束时间`} type="time" required value={segment.end} onChange={(event) => setSegments((current) => current.map((item) => item.id === segment.id ? { ...item, end: event.target.value } : item))} />
          {segments.length > 1 && <button type="button" onClick={() => setSegments((current) => current.filter((item) => item.id !== segment.id))}>移除</button>}
        </div>)}</div>
        {!segmentId && <div className="time-segment-actions"><button className="add-time-segment" type="button" disabled={!valid} onClick={() => setSegments((current) => [...current, newDraft(current.at(-1)?.end)])}>＋ 增加实际时间段</button></div>}
        {!valid && <small className="time-segment-error">时间段需完整填写、结束晚于开始，且不能互相重叠。</small>}
      </fieldset>
      <div className="modal-actions">
        <button type="button" onClick={onClose}>取消</button>
        <button className="pixel-button pixel-button--pink" type="submit" disabled={!valid}>确认完成</button>
      </div>
    </form>
  </div>;
}
