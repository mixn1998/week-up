# Week UP 自我觉察功能设计规格

- 日期：2026-07-31
- 状态：交互布局与功能口径已确认
- 适用端：Web 完整端
- 用户时区：Asia/Shanghai

## 1. 功能目标

在 Week UP 的行动、属性和周期复盘之外，增加一条独立的自我觉察数据链路，用于记录并分析：

1. 思想变化：直接记录当下形成的新认识、判断、原则或思考。
2. 情绪流：记录当下情绪强度及可选原因。
3. 心智模型：从思想变化和情绪流中提炼长期反复出现的触发条件、默认判断、应对规则及其变化。

自我觉察数据不产生 XP，不改变计划完成状态，也不进入现有通用周报、月报的行动完成统计。它拥有独立的录入、日整理、周期分析和历史冻结链路。

思想与情绪都采用“显著事件记录”口径：用户只会在出现强烈个人感受或值得留下的想法时主动记录。数据天然是稀疏且成簇的事件流——情绪不稳或灵感爆发时，一天可能连续记录多条；其他时候也可能多日没有记录。系统不得把它们解释为连续的日常状态采样。没有记录只表示没有主动留下显著事件，不表示当天情绪平稳、没有情绪、没有思考或没有变化。

## 2. 信息架构与入口

### 2.1 今日页

在今日页右侧信息区中，将两个快捷录入组件放在“今日属性值”下方、“体重趋势”上方：

1. 思想变化快捷录入
   - 单个文本输入框。
   - 用户直接填写内容，不要求填写“变化前／变化后”。
   - 引导语表达为“记录一个值得留下的想法”，不制造每日打卡暗示。
   - 保存后清空输入框，并以轻提示反馈保存成功。
2. 情绪流快捷录入
   - 五级情绪选择：低落、偏低、平稳、愉悦、高涨。
   - 可选填原因。
   - 引导语表达为“记录一次强烈感受”，不询问“今天感觉如何”。
   - 保存后清空原因并恢复默认未选中状态。

两个组件均沿用 Week UP 的像素视觉语言，但保持紧凑，不挤压属性和体重模块。同一天允许多次录入，每次录入自动记录实际时间。

### 2.2 主导航

主导航顺序调整为：

```text
行动配置
自我觉察
本月方向
```

“自我觉察”是独立页面，包含三个 Tab：

1. 思想变化
2. 情绪流
3. 心智模型

## 3. 当前数据与历史数据

### 3.1 当前未结算周期

- 今日尚未日结算的录入保持动态。
- 当前周的情绪流根据本周已发生的原始录入和日快照动态展示。
- 当前月的思想变化根据本月已发生的原始录入和日快照动态展示。
- 当前月的心智模型不自动生成正式版本，可显示上一个已冻结版本和“本月待结算”状态。

### 3.2 已结算历史

- 日结算冻结当天自我觉察快照。
- 周结算冻结该周情绪流复盘。
- 月结算冻结该月思想变化复盘，并生成一个新的心智模型版本。
- 冻结后的历史不会因后续录入、编辑或重排而静默变化。

## 4. 录入与编辑规则

### 4.1 原始觉察事件

每次保存产生一条独立原始事件：

```ts
type AwarenessEntry =
  | {
      id: string;
      kind: "thought";
      localDate: string;
      occurredAt: string;
      content: string;
      createdAt: string;
      updatedAt: string;
      settlementState: "open" | "frozen";
      legacySourceReference?: string;
    }
  | {
      id: string;
      kind: "emotion";
      localDate: string;
      occurredAt: string;
      level: 1 | 2 | 3 | 4 | 5;
      reason?: string;
      createdAt: string;
      updatedAt: string;
      settlementState: "open" | "frozen";
    };
```

规则：

- `localDate` 按 Asia/Shanghai 计算。
- 同一天不限制录入次数。
- 日结算前允许编辑或删除。
- 日结算后原始事件锁定；如需纠错，创建带来源引用的更正事件，不直接改写已冻结事实。
- 思想正文只做首尾空白清理，不做自动改写或摘要后覆盖。

### 4.2 今日交互

- 空思想正文不能保存。
- 情绪必须选择等级，原因可为空。
- 防止连续点击造成重复写入，命令必须幂等。
- 保存失败时保留用户尚未提交的输入内容。

## 5. 日结算

日结算在现有日结算命令内增加自我觉察快照步骤，但不调用 AI。

```ts
type DailyAwarenessSnapshot = {
  id: string;
  localDate: string;
  thoughtEntryIds: string[];
  emotionEntryIds: string[];
  thoughtDisplayBlocks: Array<{
    entryId: string;
    occurredAt: string;
    content: string;
  }>;
  emotionSummary: {
    recordedEventCount: number;
    levelDistribution: Record<"1" | "2" | "3" | "4" | "5", number>;
    minimumLevel: 1 | 2 | 3 | 4 | 5 | null;
    maximumLevel: 1 | 2 | 3 | 4 | 5 | null;
    reasons: Array<{
      entryId: string;
      occurredAt: string;
      level: 1 | 2 | 3 | 4 | 5;
      reason: string;
    }>;
  };
  frozenAt: string;
};
```

“统一整理为一条当天数据”是指生成一个日快照，而不是丢弃原始多条记录：

- 思想按发生时间排列为多个展示段落。
- 情绪只统计当天主动记录的显著事件，同时保留每条原因。
- 日快照保存全部原始事件 ID，可从分析结论回溯到原文。
- 没有录入的日期不补零、不补“平稳”记录，也不进入事件分布的分母。

## 6. 周情绪流复盘

周结算必须在该周所需日结算完成后执行。只筛选本周边界内的情绪日快照。

```ts
type WeeklyEmotionReview = {
  id: string;
  weekKey: string;
  rangeStart: string;
  rangeEnd: string;
  sourceSnapshotIds: string[];
  statistics: {
    entryCount: number;
    daysWithRecordedEvents: number;
    levelDistribution: Record<"1" | "2" | "3" | "4" | "5", number>;
  };
  analysis:
    | {
        status: "ready";
        dominantFlow: string;
        recurringTriggers: string[];
        recoveryPatterns: string[];
        notableChanges: string[];
        evidenceEntryIds: string[];
      }
    | {
        status: "pending" | "failed";
        errorCode?: string;
      };
  frozenAt: string;
};
```

情绪流 Tab 展示：

- 本周显著情绪事件时间线与五级分布。
- 有显著事件记录的日期数、录入次数和已记录事件的强度范围。
- 同一天多条记录按时间排列，可观察一次显著情绪过程中的离散变化点，但不在记录之间插值。
- 高频诱因、恢复方式、显著变化。
- 每项分析均可展开查看来源记录。
- 时间线上没有记录的日期保持空白，不用折线连接成连续情绪走势。

这里的统计只描述“用户选择记录的显著情绪事件”，不能描述本周平均心情、日常情绪基线、稳定程度或未记录日期的状态。显著事件数量也不能直接解释为情绪变好、变差或波动增加。

当同一天出现多条记录时，AI 可以把它描述为“一次集中记录中的变化序列”，但不能据此推断该情绪持续了一整天。跨越无记录日期的两个事件不得被自动解释为同一次连续情绪过程。

周报仍只记录行动完成项数；情绪流复盘是独立模块，不改变周报统计口径。

## 7. 月思想变化复盘

月结算必须在该月所需日结算完成后执行。只筛选该自然月内的思想日快照。

### 7.1 分类结构

分类采用三层结构，避免把主题、内容形态和长期模型混为一列。

#### 主要主题

每条思想只选择一个主要主题：

1. 自我认知
2. 情绪调节
3. 关系联结
4. 认知学习
5. 行动成长
6. 系统策略
7. 商业社会
8. 身体审美
9. 价值存在

#### 内容形态

每条思想选择一种内容形态：

1. 观察
2. 原则
3. 心智模型
4. 行动策略
5. 自我提醒

#### 模型标签

- 允许多个。
- 使用受控但可扩展的标签集合。
- 初始标签包括：主体性、控制感、安全感、选择权、欲望、信任、边界、权力、节奏、意义、风险、沟通、注意力。
- 相同概念优先复用已有标签，避免生成同义词碎片。

### 7.2 月度结果

```ts
type MonthlyThoughtReview = {
  id: string;
  monthKey: string;
  rangeStart: string;
  rangeEnd: string;
  sourceSnapshotIds: string[];
  classifiedEntries: Array<{
    entryId: string;
    primaryTopic: string;
    thoughtForm: string;
    modelTags: string[];
  }>;
  analysis:
    | {
        status: "ready";
        topicDistribution: Array<{
          topic: string;
          entryCount: number;
          recordedDateCount: number;
        }>;
        recordingShape: {
          entryCount: number;
          recordedDateCount: number;
          burstDates: Array<{ localDate: string; entryCount: number }>;
        };
        keyInsights: Array<{ summary: string; evidenceEntryIds: string[] }>;
        thoughtShifts: Array<{
          from: string;
          to: string;
          evidenceEntryIds: string[];
        }>;
        recurringQuestions: Array<{
          question: string;
          evidenceEntryIds: string[];
        }>;
      }
    | {
        status: "pending" | "failed";
        errorCode?: string;
      };
  frozenAt: string;
};
```

思想变化 Tab 展示：

- 当月主题分布。
- 按日期排列的日快照。
- 记录总条数、涉及日期数，以及同日多条的灵感集中记录。
- 关键洞察、思想转向和持续追问。
- 主要主题、内容形态和模型标签筛选。
- 所有摘要均能展开回到原始文字。

## 8. 月度心智模型版本

心智模型没有独立快捷录入口。每次月结算在月思想复盘之后生成一个冻结版本。

分析源限定为：

- 该月日期范围内的思想日快照。
- 该月日期范围内的情绪日快照。
- 与这些日快照相关的周情绪复盘可作为辅助摘要，但不得把跨月日期的数据带入本月模型。
- 上一个已冻结心智模型版本，用于计算变化。

心智模型只能归纳在显著事件中反复出现的判断与应对模式。它不能把事件记录频率等同于日常出现频率，也不能因为某段时间没有记录而判断模型已经消失。`retired` 必须有明确的新记录表明旧模型被放弃或替代，不能由“本月未出现”自动推断。

模型置信度不能只按原始条数计算。同一天的灵感爆发可能形成大量相近记录，因此置信度至少同时考虑：

- 支持证据条数。
- 支持证据覆盖的不同日期数。
- 是否跨越多个已冻结月份反复出现。
- 是否存在明确反例或相反的新判断。

同日多条相近记录可以增强对“该次思想爆发内部一致性”的判断，但不能等价于多个独立日期上的重复验证。

```ts
type MentalModelVersion = {
  id: string;
  monthKey: string;
  previousVersionId?: string;
  sourceThoughtReviewId: string;
  sourceEmotionSnapshotIds: string[];
  sourceEmotionReviewIds: string[];
  models: Array<{
    stableKey: string;
    name: string;
    summary: string;
    triggers: string[];
    assumptions: string[];
    defaultResponses: string[];
    currentStrategies: string[];
    supportingEntryIds: string[];
    counterEvidenceEntryIds: string[];
    confidence: "low" | "medium" | "high";
    changeType: "new" | "reinforced" | "revised" | "retired";
    previousModelKey?: string;
    changeSummary?: string;
  }>;
  frozenAt: string;
};
```

心智模型 Tab 展示：

1. 当前有效模型卡片
   - 模型名称、核心判断、触发条件和当前应对方式。
   - 置信度和来源数量。
   - 展开后查看支持证据与反例。
2. 本月变化
   - 新增、强化、修正、退出。
3. 模型张力
   - 展示长期反复出现的两极关系，例如控制与流动、真实与适应、行动与审慎。
4. 版本时间线
   - 按月查看已冻结版本。
   - 支持比较相邻月份，但不覆盖旧版本。

## 9. 结算顺序与冻结语义

```text
原始录入
→ 日结算：冻结 DailyAwarenessSnapshot
→ 周结算：冻结 WeeklyEmotionReview
→ 月结算：冻结 MonthlyThoughtReview
→ 月结算：冻结 MentalModelVersion
```

规则：

- 周、月结算前先补齐范围内必需的日结算。
- 同一周期命令必须幂等，重复执行不能产生重复版本。
- 已冻结结果不可原地重算覆盖。
- 若用户明确要求重新分析，生成带修订号的新版本，并保留旧版本。
- 周与月的筛选均按日快照的 `localDate` 判断，防止跨周、跨月污染。

## 10. AI 分析边界与失败处理

AI 只用于：

- 周情绪流的诱因、恢复模式和变化分析。
- 月思想的分类、思想转向和持续追问分析。
- 月度心智模型版本生成与版本差异分析。

AI 不用于：

- 修改原始思想内容。
- 推断或改变情绪等级。
- 生成 XP、改变属性或计划事实。
- 执行日结算的基础整理。

所有 AI 输出必须：

- 使用结构化 JSON。
- 引用真实存在的来源事件 ID。
- 对无法证明的结论降低置信度或不输出。
- 对心智模型同时允许支持证据和反例。
- 在提示词中明确说明数据来自用户主动选择记录的显著事件，存在选择性，禁止推断日常情绪基线、连续状态、真实发生频率或未记录日期。
- 主题分布同时返回原始记录条数和覆盖日期数；不能仅用条数排序后宣称某主题在日常生活中更常见。

AI 调用失败时：

1. 日、周、月数据快照照常冻结。
2. 对应分析状态标记为 `pending` 或 `failed`。
3. 用户可稍后重试分析。
4. 重试只能补齐分析结果，不改变结算范围与来源快照集合。

## 11. 历史 Excel 导入

历史文件《思想复盘历史数据.xlsx》包含 110 条思想，覆盖 55 个日期，存在同日多条长短不一的记录。

导入规则：

- “思考”映射为思想正文。
- “日期”转换为 Asia/Shanghai 下的 `localDate` 和当日缺省发生时间。
- 原“分类”列绝大多数为空；其中出现的附件文件名保存为 `legacySourceReference`，不得作为主要主题。
- 每一行导入为独立思想事件。
- 同日多条记录在补建日快照时按原行顺序排列。
- 导入后使用本规格的三层分类体系进行批量分析。
- 导入命令必须可预览、可取消、幂等，不能重复导入相同行。

## 12. 同步、隐私与存储

- 自我觉察数据属于用户数据目录，不写入应用版本目录。
- 原始文字、AI 分析和版本快照均参与现有单用户跨设备同步。
- 同步冲突以原始事件为最小单位，不以合并后的长文本覆盖另一设备的录入。
- 结算快照和心智模型版本为不可变记录。
- 调用 AI 时只发送完成分析所需的周期内数据，不发送其他用户数据、凭证或本地路径。
- 分析结果必须使用“已记录事件中”“本期留下的记录显示”等限定表达，不使用“你本周通常”“你的日常状态”等超出数据边界的表述。

## 13. 领域命令

建议增加以下领域命令：

```text
awareness.thought.record
awareness.emotion.record
awareness.entry.update
awareness.entry.remove
awareness.daily.freeze
awareness.weekly-emotion.generate
awareness.monthly-thought.generate
awareness.mental-model.generate
awareness.analysis.retry
awareness.history.import-preview
awareness.history.import
```

命令层负责验证结算状态、日期边界与幂等键；页面组件不能直接拼接或改写结算对象。

## 14. 验收标准

### 14.1 录入

- 同一天连续保存多条思想和情绪，全部成为独立事件。
- 刷新页面后输入结果仍存在。
- 日结算前可编辑；日结算后原记录锁定。
- 重复点击保存不会产生重复数据。

### 14.2 日结算

- 多条思想按时间顺序进入同一日快照。
- 情绪统计与原始五级数据一致。
- 日快照保留全部原始事件 ID。
- 无觉察录入的日期也能正常完成现有日结算。
- 无录入日期不会被补成平稳情绪、零值或无思想状态。

### 14.3 周与月

- 周情绪复盘只包含该周日期内的数据。
- 月思想和心智模型只包含该月日期内的数据。
- 跨月周不会把月外记录带入月度模型。
- 周、月重复结算不会重复生成结果。
- 冻结后新增或更正事件不会静默改变旧结果。
- 周情绪视图只展示显著事件点，空白日期不连接为连续趋势。
- 同日多条可按顺序展示，跨无记录日期不自动连接为同一情绪过程。

### 14.4 AI 与追溯

- 每条洞察和心智模型都能展开查看来源原文。
- 不存在来源 ID 的 AI 项目被拒绝保存。
- AI 失败不阻断数据结算，并可安全重试。
- 心智模型可展示与上一个月版本相比的新增、强化、修正和退出。
- AI 不会由记录缺失推断日常状态，也不会由本月未出现自动判定心智模型退出。
- 同一天大量相似思想不会被当作多个独立日期的重复证据。

### 14.5 历史导入

- 110 条历史思想可完整预览并导入。
- 同日最多 22 条记录不会丢失或合并覆盖。
- 两个附件文件名不会被识别为主题分类。
- 重复执行导入不会产生重复行。

## 15. 明确不做

- 不为思想或情绪录入奖励 XP。
- 不根据情绪提供医疗、诊断或治疗建议。
- 不把 AI 心智模型描述包装为心理学诊断。
- 不要求用户录入“变化前／变化后”。
- 不提供第三个“心智模型”手动快捷录入口。
- 不让当前周期动态数据改写已冻结历史。
- 不把思想和情绪入口设计成每日任务、连续打卡或日常状态问卷。
- 不计算“周平均心情”、连续情绪曲线或未记录日期的任何推断值。
