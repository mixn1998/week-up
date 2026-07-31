"use client";

import { useState } from "react";

import {
  MENTAL_MODEL_DIMENSIONS,
  type MentalModelDimensionProfile,
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
  new: "新变化",
  stable: "延续",
  strengthened: "更明确",
  weakened: "变弱",
  reframed: "新理解",
};

const PLAIN_LANGUAGE: readonly Readonly<[string, string]>[] = [
  ["将安全感和控制感主要建立在管理注意力", "面对不确定时，更关注自己能控制的部分：管理注意力、承担责任，并从一个小行动开始。"],
  ["倾向于把人格、关系与行为理解为由处境参数", "人的行为会受到环境、关系和互动方式影响。相比给人贴固定标签，更关注具体处境发生了什么。"],
  ["把成熟的主体性理解为既保持真实", "既重视真实、自我认同和选择权，也愿意在分歧中理解他人、寻找合作并建立共同规则。"],
  ["将高质量关系理解为独立主体之间持续流动", "好的关系需要双方保持独立，也能持续理解彼此、共同成长。亲密不是消除差异，而是一起容纳变化。"],
  ["倾向于用选择权、资源、叙事、规则和谈判能力分析权力", "权力不仅是控制，也来自选择权、资源、规则和谈判能力。真正的力量是始终保有行动方案和重新协商的空间。"],
  ["重视基本功、节奏和过程质量", "重视基本功、节奏和过程质量。理解一件事之后，还需要通过实践、反馈和复盘把它做实。"],
  ["偏好先把握整体结构、源头问题和共同机制", "学习时先看整体结构和核心问题，再用定义、条件、反例和实践验证理解。重点不是堆知识，而是筛选和提炼信息。"],
  ["不追求与环境全面一致", "不会要求自己完全适应环境，而会判断这里有什么值得投入、代价是什么，以及它是否有助于成长和保持活力。"],
  ["追求丰盛、好奇、欲望和爆发力", "既珍惜好奇、欲望和爆发力，也重视克制、边界和休息，让精力可以长期持续。"],
  ["倾向于同时观察短期成效和长期价值迭代", "既看短期结果，也看长期价值。希望通过创造、获取和合理分配价值，形成可持续的共同利益。"],
  ["外部结果无法被完全控制", "很多外部结果无法完全控制"],
  ["安全感来自对应对挑战能力的信心", "安全感来自“我有能力应对”"],
  ["主体仍可选择注意什么以及如何回应", "仍然可以选择关注什么、如何回应"],
  ["具体的小行动能够恢复能动性", "一个具体的小行动能帮助自己重新动起来"],
  ["行为会随关系参数和环境条件变化", "人的行为会随环境和关系变化"],
  ["适合与否取决于双方对参数变化的匹配", "是否合适，要看双方能否适应变化"],
  ["关系应服务于具体个体的成长与存在", "一段关系应让双方都能成长并做自己"],
  ["他者能够暴露投射并扩展自我", "与他人相处会照见自己的期待和盲点"],
  ["虚假适应可能造成选择权和生命力的损耗", "一味迎合会消耗自主感和活力"],
  ["防御性对抗并不是唯一的主权表达", "保护自己不只靠对抗"],
  ["资产价值与可支配的选择空间密切相关", "能自由调动的资源和选择越多，主动权越大"],
  ["权力不只来自正式授权", "权力也来自资源、规则、关系网络和表达方式"],
  ["缺乏谈判能力会加剧关系非对称", "不会协商，会让双方更不平等"],
  ["好的结果更可能来自可持续的好过程", "稳定、可持续的过程更容易带来好结果"],
  ["实践既是思考的材料，也是检验标准", "实践既帮助思考，也用来检验想法"],
  ["错误能够暴露边界并推动认知更新", "错误会暴露问题，也能帮助修正认识"],
  ["概念只有进入关系网络才更容易被理解", "把概念放进知识关系中，才更容易理解"],
  ["抽象需要语义支撑", "抽象概念需要具体含义支撑"],
  ["直觉可以作为入口但不能替代边界验证", "可以从直觉开始，但还要检查适用范围"],
  ["长期优势需要价值创造、获取和分配相互匹配", "长期优势需要兼顾创造价值、获得回报和合理分配"],
  ["不可替代价值能够形成定价权与稳定位置", "独特价值会带来更强的议价能力和稳定位置"],
  ["深度合作需要共同投资于共享未来", "深度合作需要双方共同投入未来"],
  ["欲望可以推动探索、自我更新和表达", "好奇和欲望可以推动探索、更新和表达"],
  ["未经调节的欲望可能转化为焦虑或自毁", "失控的欲望可能变成焦虑或自我伤害"],
  ["克制不是压抑", "克制不是压抑，而是选择如何使用力量"],
  ["任何环境都会筛选并塑造参与者", "环境会影响并改变身处其中的人"],
  ["局部价值可以与整体认同分离", "可以吸收环境中有用的部分，不必认同全部"],
  ["时间应优先投入能放大核心价值和成长潜力的连接", "时间应优先投入真正有助于成长的关系和机会"],
  ["问题具体化与风险量化", "把问题说具体，判断真实风险"],
  ["物理中断和注意力管理", "先暂停，再把注意力拉回来"],
  ["执行最小、最有效的一步", "先做最小但最有效的一步"],
  ["识别系统结构、条件与触发机制", "找出环境、条件和触发点"],
  ["通过改变处境参数调整行为概率", "调整环境，让理想行为更容易发生"],
  ["放弃理想化客体但保留理想", "不把对方想得完美，但仍保留对好关系的期待"],
  ["在投射、破裂、理解的循环中更新认识", "在误解、冲突和重新理解中更新彼此认识"],
  ["逐轮博弈并保持谈判能力", "分步骤协商，并保留继续谈判的空间"],
  ["控制关键节点并提高资源调动速度", "抓住关键环节，提高调动资源的速度"],
  ["构建不可替代价值和支持网络", "建立独特价值和可靠的支持网络"],
  ["谋定后行动并核实信息", "想清楚再行动，并先核实信息"],
  ["用复述、反例和边界检查压实理解", "用复述、反例和适用范围检查理解"],
  ["对实用经验进行复盘留痕", "记录并复盘有效经验"],
  ["用理解检查和复述验证掌握程度", "用复述和自测检查是否真正理解"],
  ["区分逻辑、实证、诠释、实用与规范模型", "根据问题选择逻辑、证据、解释或实践标准"],
  ["从经验和实践中形成可动摇既有认识的认知", "用经验和实践修正原有认识"],
  ["围绕核心需求、共同资产、增长和风险建模", "围绕核心需求、共同投入、增长和风险做规划"],
  ["构建高价值思想与行动节点", "持续产出有价值的想法和行动"],
  ["设计产品、渠道、市场与生态", "协调产品、渠道、市场和合作关系"],
  ["在放松中爆发、在爆发中控制", "保持放松，同时控制发力"],
  ["通过运动观察胜负心、急躁和恐惧", "在运动中观察自己的好胜、急躁和恐惧"],
  ["先感知再发力，避免系统过载", "先感受身体状态，再决定如何发力"],
  ["明确目标、收益与代价", "先说清目标、收益和代价"],
  ["保持低绑定和撤退能力", "避免过度绑定，并保留退出空间"],
  ["谨慎建立信任并延迟强判断", "逐步建立信任，不急着下结论"],
  ["在冲突中寻求合作并创造规则", "冲突时先寻找合作和共同规则"],
  ["选择性介入、接纳、回馈和创造", "有选择地投入、接受、回馈和创造"],
];

function plainText(value: string, maxLength = 88): string {
  const sentences = value
    .replace(/[；;]+/g, "。")
    .split("。")
    .map((item) => item.trim())
    .filter(Boolean);
  const joined = sentences.slice(0, 2).join("。");
  const rewrite = PLAIN_LANGUAGE.find(([source]) => value.includes(source));
  if (rewrite) return rewrite[1];
  return joined.length > maxLength ? `${joined.slice(0, maxLength)}…` : joined;
}

function plainList(items: readonly string[]): string {
  const visible = items.slice(0, 3).map((item) => plainText(item, 30)).filter(Boolean);
  return visible.length > 0 ? visible.join("、") : "暂无";
}

export function MentalModelRadar({ profile }: {
  profile: readonly MentalModelDimensionProfile[];
}) {
  const [selectedDimension, setSelectedDimension] = useState(
    MENTAL_MODEL_DIMENSIONS[0].key,
  );
  const byDimension = profileByDimension(profile);
  const values = MENTAL_MODEL_DIMENSIONS.map((definition) => byDimension.get(definition.key)?.strength ?? 0);
  const hasEvidence = values.some((value) => value > 0);
  const selectedDefinition = MENTAL_MODEL_DIMENSIONS.find(
    (definition) => definition.key === selectedDimension,
  ) ?? MENTAL_MODEL_DIMENSIONS[0];
  const selectedProfile = byDimension.get(selectedDefinition.key);
  return <div className="mental-radar-layout">
    <figure className="mental-radar-figure">
      <svg className="mental-radar" viewBox="0 0 640 520" role="img" aria-labelledby="mental-radar-title mental-radar-description">
        <title id="mental-radar-title">当前心智模型八维雷达图</title>
        <desc id="mental-radar-description">展示自我观、人际观、权力观、行动观、学习观、价值观、生命观和世界观。</desc>
        {[.2, .4, .6, .8, 1].map((scale) => <polygon
          className="mental-radar__grid"
          key={scale}
          points={polygonPoints(() => scale)}
        />)}
        {MENTAL_MODEL_DIMENSIONS.map((definition, index) => {
          const [endX, endY] = radarPoint(index, 1);
          const [labelX, labelY] = radarPoint(index, 1.18);
          const anchor = labelX < RADAR_CENTER_X - 18 ? "end" : labelX > RADAR_CENTER_X + 18 ? "start" : "middle";
          const active = definition.key === selectedDimension;
          return <g
            aria-label={`查看${definition.label}`}
            aria-pressed={active}
            className={`mental-radar__dimension${active ? " is-active" : ""}`}
            key={definition.key}
            onClick={() => setSelectedDimension(definition.key)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setSelectedDimension(definition.key);
              }
            }}
            role="button"
            tabIndex={0}
          >
            <line className="mental-radar__axis" x1={RADAR_CENTER_X} y1={RADAR_CENTER_Y} x2={endX} y2={endY} />
            <circle className="mental-radar__label-hit" cx={labelX} cy={labelY - 5} r="32" />
            <text className="mental-radar__label" x={labelX} y={labelY} textAnchor={anchor}>
              {definition.label}
            </text>
          </g>;
        })}
        {hasEvidence && <>
          <polygon className="mental-radar__profile" points={polygonPoints((index) => values[index] / 100)} />
          {values.map((value, index) => {
            const [x, y] = radarPoint(index, value / 100);
            const definition = MENTAL_MODEL_DIMENSIONS[index];
            return <g
              className={`mental-radar__point-target${definition.key === selectedDimension ? " is-active" : ""}`}
              key={definition.key}
              onClick={() => setSelectedDimension(definition.key)}
            >
              <circle className="mental-radar__point-hit" cx={x} cy={y} r="15" />
              <rect className="mental-radar__point" x={x - 4} y={y - 4} width="8" height="8" />
            </g>;
          })}
        </>}
        {!hasEvidence && <text className="mental-radar__empty" x={RADAR_CENTER_X} y={RADAR_CENTER_Y}>当前证据不足</text>}
      </svg>
    </figure>
    <aside className="mental-radar-summary" aria-live="polite">
      <span className="eyebrow">DIMENSION READING</span>
      <div className="mental-radar-summary__heading">
        <div>
          <h3>{selectedDefinition.label}</h3>
          <p>{selectedDefinition.description}</p>
        </div>
        {selectedProfile && <span className={`mental-dimension-change mental-dimension-change--${selectedProfile.changeDirection}`}>
          {CHANGE_LABELS[selectedProfile.changeDirection]}
        </span>}
      </div>
      {selectedProfile ? <div className="mental-radar-summary__body">
        <section>
          <small>核心看法</small>
          <p>{plainText(selectedProfile.summary)}</p>
        </section>
        <section>
          <small>常见判断</small>
          <p>{plainList(selectedProfile.defaultJudgments)}</p>
        </section>
        <section>
          <small>行动方式</small>
          <p>{plainList(selectedProfile.currentStrategies)}</p>
        </section>
      </div> : <div className="mini-empty">这个维度还没有足够记录。</div>}
      <p className="mental-radar-summary__note">点击雷达图中的维度查看说明。</p>
    </aside>
  </div>;
}
