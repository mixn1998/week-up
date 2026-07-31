"use client";

import { useState } from "react";

import {
  MENTAL_MODEL_DIMENSIONS,
  type MentalModelDimensionProfile,
  type MentalModelItem,
} from "../lib/awareness.ts";

const RADAR_CENTER_X = 320;
const RADAR_CENTER_Y = 236;
const RADAR_RADIUS = 166;

function radarPoint(index: number, scale: number): readonly [number, number] {
  const angle = -Math.PI / 2 + index * Math.PI * 2 / MENTAL_MODEL_DIMENSIONS.length;
  return [
    RADAR_CENTER_X + Math.cos(angle) * RADAR_RADIUS * scale,
    RADAR_CENTER_Y + Math.sin(angle) * RADAR_RADIUS * scale,
  ];
}

function polygonPoints(scaleForIndex: (index: number) => number): string {
  return MENTAL_MODEL_DIMENSIONS
    .map((_, index) => radarPoint(index, scaleForIndex(index)).map((value) => value.toFixed(1)).join(","))
    .join(" ");
}

function profileByDimension(profile: readonly MentalModelDimensionProfile[]) {
  return new Map(profile.map((item) => [item.dimension, item]));
}

const CHANGE_LABELS: Readonly<Record<MentalModelDimensionProfile["changeDirection"], string>> = {
  new: "新形成",
  stable: "延续",
  strengthened: "强化",
  weakened: "减弱",
  reframed: "重构",
};

export function MentalModelRadar({ profile }: {
  profile: readonly MentalModelDimensionProfile[];
}) {
  const byDimension = profileByDimension(profile);
  const values = MENTAL_MODEL_DIMENSIONS.map((definition) => byDimension.get(definition.key)?.strength ?? 0);
  const hasEvidence = values.some((value) => value > 0);
  const strongest = [...profile]
    .filter((item) => item.strength > 0)
    .sort((left, right) => right.strength - left.strength)
    .slice(0, 3);
  return <div className="mental-radar-layout">
    <figure className="mental-radar-figure">
      <svg className="mental-radar" viewBox="0 0 640 520" role="img" aria-labelledby="mental-radar-title mental-radar-description">
        <title id="mental-radar-title">当前心智模型八维雷达图</title>
        <desc id="mental-radar-description">展示自我观、人际观、权力观、行动观、学习观、价值观、生命观和世界观的记录证据强度。</desc>
        {[.2, .4, .6, .8, 1].map((scale) => <polygon
          className="mental-radar__grid"
          key={scale}
          points={polygonPoints(() => scale)}
        />)}
        {MENTAL_MODEL_DIMENSIONS.map((definition, index) => {
          const [endX, endY] = radarPoint(index, 1);
          const [labelX, labelY] = radarPoint(index, 1.18);
          const value = byDimension.get(definition.key)?.strength ?? 0;
          const anchor = labelX < RADAR_CENTER_X - 18 ? "end" : labelX > RADAR_CENTER_X + 18 ? "start" : "middle";
          return <g key={definition.key}>
            <line className="mental-radar__axis" x1={RADAR_CENTER_X} y1={RADAR_CENTER_Y} x2={endX} y2={endY} />
            <text className="mental-radar__label" x={labelX} y={labelY} textAnchor={anchor}>
              <tspan x={labelX} dy="0">{definition.label}</tspan>
              <tspan className="mental-radar__value" x={labelX} dy="17">{value}</tspan>
            </text>
          </g>;
        })}
        {hasEvidence && <>
          <polygon className="mental-radar__profile" points={polygonPoints((index) => values[index] / 100)} />
          {values.map((value, index) => {
            const [x, y] = radarPoint(index, value / 100);
            return <rect className="mental-radar__point" key={MENTAL_MODEL_DIMENSIONS[index].key} x={x - 4} y={y - 4} width="8" height="8" />;
          })}
        </>}
        {!hasEvidence && <text className="mental-radar__empty" x={RADAR_CENTER_X} y={RADAR_CENTER_Y}>当前证据不足</text>}
      </svg>
      <figcaption>数值表示记录证据强度，不代表优劣</figcaption>
    </figure>
    <aside className="mental-radar-summary">
      <span className="eyebrow">CURRENT STRUCTURE</span>
      <h3>当前结构最清晰的维度</h3>
      {strongest.length > 0 ? <ol>{strongest.map((item) => {
        const definition = MENTAL_MODEL_DIMENSIONS.find((candidate) => candidate.key === item.dimension);
        return <li key={item.dimension}><span>{definition?.label}</span><b>{item.strength}</b><p>{item.summary}</p></li>;
      })}</ol> : <div className="mini-empty">还没有足够记录形成维度判断。</div>}
      <p className="mental-radar-summary__note">画像会在新的思想与显著情绪记录上持续发展；没有新证据的部分保持原状。</p>
    </aside>
  </div>;
}

export function MentalModelDimensionList({
  profile,
  models,
}: {
  profile: readonly MentalModelDimensionProfile[];
  models: readonly MentalModelItem[];
}) {
  const [expanded, setExpanded] = useState(false);
  const modelNames = new Map(models.map((model) => [model.stableKey, model.name]));
  const ordered = [...profile].sort((left, right) => right.strength - left.strength);
  const visible = expanded ? ordered : ordered.slice(0, 4);
  return <section className="mental-dimensions">
    <header><div><span className="eyebrow">DIMENSION READING</span><h3>八维心智结构</h3></div><span>{profile.filter((item) => item.strength > 0).length} / 8 有证据</span></header>
    <div className="mental-dimension-list">{visible.map((item, index) => {
      const definition = MENTAL_MODEL_DIMENSIONS.find((candidate) => candidate.key === item.dimension)!;
      const supportNames = item.supportingModelKeys.map((key) => modelNames.get(key)).filter((name): name is string => Boolean(name));
      return <details className="mental-dimension-row" key={item.dimension} open={index < 4}>
        <summary>
          <span className="mental-dimension-row__rank">{String(index + 1).padStart(2, "0")}</span>
          <span className="mental-dimension-row__identity"><b>{definition.label}</b><small>{definition.description}</small></span>
          <span className="mental-dimension-row__meter"><i><em style={{ width: `${item.strength}%` }} /></i><strong>{item.strength}</strong></span>
          <span className={`mental-dimension-change mental-dimension-change--${item.changeDirection}`}>{CHANGE_LABELS[item.changeDirection]}</span>
        </summary>
        <div className="mental-dimension-row__body">
          <div><small>核心信念</small><p>{item.summary}</p></div>
          <div><small>默认判断</small><p>{item.defaultJudgments.length > 0 ? item.defaultJudgments.join(" · ") : "当前没有足够证据"}</p></div>
          <div><small>当前策略</small><p>{item.currentStrategies.length > 0 ? item.currentStrategies.join(" · ") : "当前没有足够证据"}</p></div>
          {(item.changeSummary || supportNames.length > 0) && <div className="mental-dimension-row__provenance">
            {item.changeSummary && <p>{item.changeSummary}</p>}
            {supportNames.length > 0 && <small>结构来源：{supportNames.join("、")}</small>}
          </div>}
        </div>
      </details>;
    })}</div>
    {ordered.length > 4 && <button className="mental-dimensions__toggle" type="button" onClick={() => setExpanded((value) => !value)}>
      {expanded ? "收起次要维度 ↑" : `展开全部维度（另有 ${ordered.length - 4} 项）↓`}
    </button>}
  </section>;
}
