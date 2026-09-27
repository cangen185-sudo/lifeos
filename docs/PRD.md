# LifeOS / Personal Execution System — V0.1 最终产品设计文档

> 2026-09-27 本地闭环修订：本文件保留早期构想供追溯。当前实现与验收以 `docs/V0.1-decisions.md` 和本轮本地交接要求为准：Goal、Commitment 可选；明确的多对多仅为 Task ↔ Desire，Goal 仍只有一个 `primaryDesireId`；本期没有 Project、任务依赖、账号、云端或应用关闭后的推送。Analytics 不汇总欲望行，实际总时长按唯一闭合 WorkSession 计算。以下旧章节提到 Goal ↔ Desire 多对多、Project、自动判断承诺违约或云端路线时，均不代表本期已实现。

**版本**：V0.1 Product Freeze  
**日期**：2026-09-13  
**定位**：个人使用的长期意志 → 今日执行 → 偏差干预 → 复盘分析系统  
**目标用户**：首期仅产品作者本人；先 dogfood，再考虑泛化

---

## 1. 产品定义

LifeOS 不是 Todo List、Habit Tracker、番茄钟、第二大脑或 AI 陪聊工具。

它解决的问题是：

> 我明明知道自己真正想要什么，也曾在清醒、理性的状态下做出决定，为什么到了具体一天、具体一刻，行为仍然会偏离这些决定？

LifeOS 的任务是保存和结构化“长期的我”已经做出的决定，在“短期的我”发生拖延、重新谈判、计划失真或主动违约时，把真实后果重新呈现出来，并把偏差记录为可以复盘的数据。

### 一句话定义

> **让清醒时的决定，对软弱时的自己保有结构化约束力。**

### 核心闭环

```text
真实欲望
  ↓
目标
  ↓
承诺 / 项目
  ↓
今日任务
  ↓
实际执行
  ↓
偏差检测
  ↓
事实型干预
  ↓
结果与原因记录
  ↓
复盘与对齐分析
  ↺
```

这不是严格树结构；节点之间允许多对多关系。

---

## 2. 产品原则

### P1. 真实欲望不道德化

顶层不是“人生使命”或漂亮口号，而是用户真正想要的结果，例如财富、家人生活、外貌、身体、能力、选择权。

### P2. 决策与执行分离

清醒时决定“做什么”；执行期原则上不重新讨论“做不做”，只讨论“怎么完成”或“如何结构化退出”。

### P3. 承诺与任务分离

任务可以调整；承诺不能被悄悄改写。改变有效承诺必须产生修订记录，关键修改默认延迟生效。

### P4. 失败是数据，不是道德判断

“没完成”必须区分：不可控事件、计划错误、估时错误、优先级变化、战略变化、主动违约。

### P5. 系统用事实施压，不用鸡汤或羞辱

干预应引用延迟时间、剩余时间、承诺风险、后续冲突和 WHY 链，而不是“加油”“你又逃跑了”。

### P6. UI 简单，逻辑在后台复杂

主界面应该冷静、短、可执行。复杂图、状态机、规则、分析尽量不让用户操作成本暴涨。

### P7. 沉默也是干预选项

系统不是提醒越多越好。默认少打扰；只有达到明确决策条件才干预。

---

## 3. V0.1 成功标准

V0.1 成功不等于“功能多”，而是以下闭环真实可用：

1. 用户能写下 1–3 个真实欲望。
2. 能创建目标并与多个欲望建立关系。
3. 能创建 Commitment，并明确其 Why、有效期和最低要求。
4. 能创建 Today 任务，分 MUST / SHOULD / OPTIONAL。
5. MUST 在当日计划确认后不能被无痕删除或降级。
6. 任务可以开始、完成、延期、缩小、拆分、取消，但关键变化必须留下原因事件。
7. 系统能根据内部事实计算“如果现在不做，会发生什么”。
8. 系统能在少数明确条件下产生事实型干预。
9. 日终能看到 MUST 完成率、计划 vs 实际、违约/计划错误原因。
10. 产品作者连续使用 7 天，不需要靠开发者身份强迫自己打开。

---

## 4. 明确不做

V0.1 不做：

- Habit streak / XP / 金币 / 等级
- 番茄钟模式
- AI 聊天教练
- 金钱惩罚
- 社交监督 / 排行榜
- 完整日历同步
- 自动排程
- 多用户 / 团队
- 第二大脑 / 笔记库
- 财务、饮食、健康全家桶
- Neo4j 或图数据库
- 系统级后台 Push（V0.1 仅应用内干预）
- ActivityWatch 集成
- 多设备云同步

---

## 5. 信息模型

V0.1 使用**类型明确的关系模型**，而不是“万物皆 Node”的无约束图。

### 5.1 Desire — 真实欲望

代表“我真正想获得的生活结果”。

关键字段：

- id
- title
- description
- importance: 1–5
- active
- createdAt / updatedAt

示例：

- 让家人拥有更好的生活
- 获得更强的经济选择权
- 拥有更好的身材与外貌

### 5.2 Goal — 可检验目标

代表朝 Desire 推进的可验证结果。

关键字段：

- id
- title
- description
- targetDate?
- status: active | achieved | dropped
- primaryDesireId?（用于分析归因；关系仍可多对多）

### 5.3 Commitment — 清醒状态下的约束

Commitment 与 Task 是不同对象。

例：

> 本周至少完成 4 次 CSP 训练，总投入不少于 360 分钟。

关键字段：

- id
- title
- rationale（为什么做）
- startAt
- endAt
- targetType / targetValue（V0.1 可简化）
- state: draft | active | fulfilled | breached | waived | expired
- lockedAt
- revisionEffectiveAt?
- createdAt

**规则：** active Commitment 不允许直接覆盖修改核心约束。修改生成 revision 事件；非紧急修改默认下一自然日生效。

### 5.4 Project — 阶段性容器

用于把目标转成阶段成果。例如 LifeOS V0.1、CSP 第一轮横扫。

字段：id、title、status、targetDate?。

### 5.5 Task — 可执行单元

Task 是用户今天实际要做的事情。

关键字段：

- id
- title
- plannedDate?
- plannedStart?
- deadline?
- priorityBand: must | should | optional
- plannedMinutes
- status: backlog | planned | in_progress | completed | cancelled
- primaryGoalId?（用于时间归因）
- createdAt / completedAt?

注意：`defer / narrow / split` **不是永久状态**，而是事件/动作。

### 5.6 WorkSession — 实际投入

- id
- taskId
- startedAt
- endedAt?
- actualMinutes

V0.1 不做专注模式，只提供轻量“开始 / 停止记录”。

### 5.7 DailyPlan — 当日决策快照

- date
- capacityMinutes
- confirmedAt?
- lockedAt?
- overloadOverrideReason?

确认当日计划后，MUST 的删除、降级、延期都必须进入结构化变更流程。

### 5.8 TaskEvent — 执行与修改审计日志

类型：

- started
- paused
- resumed
- completed
- deferred
- narrowed
- split
- priority_changed
- cancelled
- plan_overridden

记录 before / after、时间和 reasonCode。

### 5.9 未完成 / 退出原因

统一枚举：

- uncontrollable_event — 不可控事件
- plan_error — 计划本身不合理
- time_estimate_error — 时间估计错误
- priority_change — 优先级客观变化
- strategy_change — 战略发生变化
- willful_breach — 明知仍主动违约 / 拖延

### 5.10 InterventionEvent — 干预记录

- taskId
- ruleId
- interventionType
- factsSnapshot
- message
- createdAt
- taskStartedWithin15Min?（后期用于学习）

---

## 6. 关系设计

V0.1 使用 junction tables，避免图数据库和无约束 polymorphic link。

关系：

```text
Desire ↔ Goal
Goal ↔ Commitment
Goal ↔ Project
Goal ↔ Task
Project ↔ Task
Commitment ↔ Task
Task → Task dependency
```

### Primary + Supporting 关系

为了既保留多对多，又让时间分析不重复计数：

- 一个 Task 可以服务多个 Goal，但最多一个 `primaryGoal`。
- 一个 Goal 可以关联多个 Desire，但最多一个 `primaryDesire`。
- Analytics 的可加总分钟数沿 primary path 上卷。
- supporting links 只用于 WHY 链和关系图，不重复计算分钟数。

这解决“图是多对多，但统计不能把 60 分钟重复算三遍”的问题。

---

## 7. 核心状态机

### 7.1 Commitment 状态

```text
draft
  ↓ activate
active
  ├─→ fulfilled
  ├─→ breached
  ├─→ waived       （合法例外，必须有原因）
  └─→ expired
```

Commitment 修改通过 Revision，不把 `deferred/narrowed/split` 混进 Commitment 状态。

### 7.2 Task 状态

```text
backlog → planned → in_progress → completed
                    ↘ cancelled
```

`paused` 是 WorkSession 状态；`defer / narrow / split` 是 TaskEvent。

这是对早期调研稿的修正：状态和动作必须分开，否则后面统计会非常混乱。

---

## 8. Today：唯一主执行面

默认打开应用看到 Today，而不是 Dashboard 或人生大图。

### Today 页面结构

```text
TODAY · 2026-09-13

今日可支配执行时间：240 min
已规划 MUST：180 min

MUST
□ CSP 训练 90 min           17:00
  → 软件/算法能力 → 更高职业竞争力
□ LifeOS 数据模型 90 min    21:00
  → 独立开发能力 → 经济选择权

SHOULD
□ 阅读 20 min

OPTIONAL
□ 看一篇 AI 文章
```

任务卡片只保留：

- 标题
- 计划时长
- deadline / start
- 状态
- 一行 WHY 摘要
- 开始 / 完成 / 调整

### MUST 规则

- 默认建议 1–3 个 MUST。
- MUST 必须至少关联一个 active Goal 或 Commitment。
- 确认 DailyPlan 后，MUST 不允许无痕删除/降级。
- MUST 总计划时长超过 DailyPlan.capacityMinutes 时阻止直接确认；用户可以强制覆盖，但必须写原因，并进入 plan_error 分析候选。

---

## 9. WHY Chain

每个重要任务都能展开“为什么”。

例如：

```text
完成 LifeOS 数据模型
↓
交付 LifeOS V0.1
↓
建立独立 Web 产品开发能力
↓
提高职业与商业能力
↓
获得更强经济选择权
↓
让家人生活得更好
```

WHY Chain 来自真实关系，不由 LLM 编故事。

Commitment 保存 `rationale snapshot`，防止未来修改目标后历史承诺失去当时语境。

---

## 10. 结构化退出协议

用户不能被系统物理禁止改变计划，但不能“悄悄消失”。

允许动作：

### Defer 延期

输入新日期/时间 + 原因。

### Narrow 缩小范围

保留原任务，记录原范围和新范围。

### Split 拆分

原任务产生多个子任务，保留 `split_from` 关系。

### Cancel 取消

必须选择原因。若为 `willful_breach`，计入主动违约。

### Emergency Waive

对于 Commitment 层面的不可控事件允许合法豁免，但必须留原因和审计事件。

---

## 11. Consequence Engine — 后果计算引擎

这是 LifeOS 的核心差异化之一。

### 输入

- now
- plannedStart
- deadline
- priorityBand
- task status
- delayMinutes
- plannedMinutes
- actualMinutes
- active Commitment
- Task dependencies
- 当天剩余 MUST
- 明天已计划 MUST
- Goal / Desire WHY Chain

### 输出（结构化事实，不直接输出文案）

```ts
{
  delayMinutes: 80,
  remainingMinutesToday: 190,
  estimatedMinutesNeeded: 90,
  feasibleToday: true,
  commitmentAtRisk: true,
  blocksTasks: ["第二阶段训练"],
  tomorrowMustLoad: 210,
  whyPath: ["CSP", "算法能力", "职业竞争力"]
}
```

### V0.1 限制

后果只基于 LifeOS 内部数据。没有接入学校课表、系统日历或 ActivityWatch 时，不能假装知道外部世界。

---

## 12. Intervention Engine — 干预规则引擎

V0.1 不让 LLM 决定“该不该催”。

### 决策点

- plannedStart + 15 min
- plannedStart + 30 min
- deadline 前 60 min
- 日终 review
- 用户重新打开 / 聚焦应用时

### 可用干预

- SILENCE
- START_REMINDER
- CONSEQUENCE
- RESCOPE_SUGGESTION
- CONFLICT_WARNING
- REVIEW_REQUIRED

### 示例规则

```text
IF band = MUST
AND status = planned
AND delay >= 30min
AND feasibleToday = true
THEN CONSEQUENCE
```

```text
IF band = MUST
AND remainingMinutesToday < estimatedMinutesNeeded
THEN RESCOPE_SUGGESTION
```

```text
IF task 已 in_progress
THEN SILENCE
```

### 干预预算

- 单任务默认最多 2 次主动干预/日。
- 同一事实不重复提醒。
- 日终 Review 不计入主动干预预算。

### V0.1 文案

使用模板，不用 LLM：

> CSP 训练已延迟 80 分钟。完成仍需要约 90 分钟；今天剩余可执行时间约 190 分钟。若今天取消，本周 Commitment 将进入风险状态，并把后续训练挤到明天。

V0.2 再允许 LLM 在不增删事实的前提下润色。

---

## 13. Daily Planning — 清醒状态下签约

流程保持短：

1. 填“今天实际可支配执行时间”。
2. 从未完成 / 项目中挑任务。
3. 标 MUST / SHOULD / OPTIONAL。
4. 系统展示计划分钟与容量。
5. 展示每个 MUST 的 WHY。
6. 点击“确认今日计划”。

确认后生成 DailyPlan 快照。

这里不是法律合同，而是产品内部的 soft commitment。

---

## 14. 日终 Review

当日存在未完成 MUST 时，必须完成 Review 才算关闭今天。

每个未完成 MUST 选择：

- 已延期
- 已缩小并完成部分
- 已拆分
- 不可控取消
- 计划错误
- 估时错误
- 优先级变化
- 战略变化
- 主动违约

系统不输出人格评价，只形成数据。

---

## 15. Analytics V0.1

首页不做炫技大屏。V0.1 只保留 4 组有决策价值的数据。

### 15.1 MUST 完成率

按日/周显示。

### 15.2 Planned vs Actual

- 计划分钟
- 实际分钟
- 估时偏差

### 15.3 未完成原因分布

重点分成：

- Execution Problem：willful_breach
- Planning Problem：plan_error / time_estimate_error / overload override
- External Change：uncontrollable / priority / strategy

### 15.4 Alignment

按 primary path 把实际投入分钟上卷到 Goal / Desire。

V0.1 展示“实际投入”，不急着计算一个假装精确的“人生总分”。

---

## 16. 页面信息架构

V0.1 主导航只保留四项：

### Today
每日计划与执行。默认首页。

### Direction
Desire / Goal / Commitment / Project 的创建与查看。

### Review
日终 Review、历史事件、原因分析。

### Analytics
MUST 完成率、时间、原因、方向投入。

### Graph（V0.1.1 可选）

只读展示关系。编辑仍通过表单完成，避免一开始把 React Flow 做成复杂图编辑器。

---

## 17. 技术架构最终决策

### V0.1 采用

```text
React + Vite + TypeScript
Tailwind CSS + shadcn/ui
Dexie (IndexedDB)
Zod
Vitest
Recharts（Analytics 阶段再装）
React Flow / xyflow（V0.1.1 再装）
date-fns
```

### 为什么不是调研报告里的 Next.js + SQLite + node-cron

调研报告的方案对“完整 Web 服务”是合理的，但对当前 V0.1 过早引入了服务器、ORM、server/client boundary、后台调度和部署存储问题。

V0.1 只需要一个人、一台浏览器、先跑通产品闭环。Vite + Dexie 能把复杂度压在 UI、领域模型和真实产品逻辑上。

另外，本地 SQLite 文件不能直接作为 Vercel Serverless 的持久数据库；如果未来走 Next.js/Vercel，应使用外部持久数据库。持续后台调度也应使用平台 Cron / 后台工作流，而不是假设一个 node-cron 进程永久存活。

### V0.2 再引入

- Supabase / Postgres（云同步 + Auth）或 Turso/libSQL
- PWA
- 系统级 Push
- 服务器定时任务
- 可选 LLM 文案润色

### V0.3+

- ActivityWatch
- 日历读取
- 更丰富的上下文信号
- 干预效果学习

---

## 18. 代码架构

避免 Repository → Service → Facade 套娃。

建议：

```text
src/
  domain/
    types.ts
    commitment.ts
    task.ts
    reasons.ts
    consequence.ts
    intervention.ts
    analytics.ts
  db/
    db.ts
    schema.ts
  features/
    today/
    direction/
    review/
    analytics/
  components/
  pages/
  test/
```

领域函数全部尽量纯函数。

关键函数：

```ts
validateDailyPlan(plan, tasks)
transitionCommitment(state, event)
applyTaskChange(task, event)
impactIfNotDone(context)
shouldIntervene(context)
renderIntervention(facts, type)
rollupActualMinutes(...)
```

---

## 19. 必须有测试的逻辑

UI 不要求一开始全测，但以下必须单测：

1. MUST capacity 校验
2. Commitment 状态转换
3. active Commitment 修改限制
4. Task defer / cancel / split 事件
5. 未完成原因强制要求
6. impactIfNotDone
7. shouldIntervene
8. primary path 时间上卷，确保不重复计数

---

## 20. 开发路线

### Phase 0 — 冻结产品（半天）

输出：本 PRD、README、V0.1 scope、5 个验收场景。

### Phase 1 — Domain Engine（1–2 天）

只写 TypeScript 类型、状态规则、纯函数、Vitest。

验收：不用 UI 也能跑通“创建 MUST → 延迟 → 计算后果 → 记录违约”的测试。

### Phase 2 — Local Data + Today Vertical Slice（2–4 天）

接 Dexie，完成 Today 页面。

验收：刷新浏览器数据仍在；可以创建、确认、开始、完成任务。

### Phase 3 — Commitment + Structured Exit（2–4 天）

完成 Commitment、DailyPlan lock、defer/narrow/split/cancel + reason。

验收：MUST 不能无痕消失；每次退出都可在事件日志追溯。

### Phase 4 — Desire / Goal / WHY Chain（2–4 天）

完成关系创建与 WHY 展示。

验收：一个 Task 可以服务多个 Goal；一个 Goal 可以服务多个 Desire；Analytics 有唯一 primary 归因。

### Phase 5 — Consequence + Intervention（2–4 天）

实现纯规则引擎和应用内干预。

验收：对预设测试场景输出正确事实；不重复刷屏。

### Phase 6 — Review + Analytics（2–4 天）

完成日终 Review、4 组最小指标。

### Phase 7 — Dogfood（连续 7 天）

期间原则：只修阻塞问题，不新增大功能。

七天后回答：

- 哪个页面每天真的打开？
- 哪个字段从没用过？
- 哪种干预被直接忽略？
- MUST 为什么没完成？
- 数据是否改变了第二天的计划？

通过后才进入 V0.2。

---

## 21. Vibe Coding 协作协议

每一个 feature 按同一闭环开发：

1. **你先定义行为**：用户做什么、系统发生什么。
2. **写 Acceptance Criteria**：最多 3–6 条。
3. **AI 只先给实施计划，不写代码。**
4. 你检查数据模型、状态变化是否正确。
5. AI 实现一个垂直切片，不同时重构全项目。
6. 跑测试和手工验收。
7. AI 解释 diff；你必须能讲清核心逻辑。
8. Git commit。

红线：

- AI 不得“顺手”加入 AI Coach、习惯、XP、Calendar、Auth。
- AI 不得新增抽象层而解释不清原因。
- 数据模型变更必须先更新 PRD/ADR，再改代码。
- 一个 prompt 不允许同时改 domain、DB、UI 三大层的大范围逻辑，除非是明确的小型 vertical slice。

---

## 22. 第一个验收场景

### 场景 A：正常完成

- Today：LifeOS 数据模型，MUST，90min，21:00。
- 19:00 开始，20:20 完成。
- 记录实际 80min。
- 当日 MUST 完成率正常，Goal 时间 +80。

### 场景 B：拖延但仍可完成

- 计划 15:00 开始 CSP 90min。
- 15:30 未开始。
- 规则产生 CONSEQUENCE。
- 系统展示延迟、剩余时间和 Commitment 风险。
- 15:40 开始。

### 场景 C：主动违约

- MUST 未完成。
- 用户取消，选择 willful_breach。
- 任务结束，但主动违约 +1；Commitment 根据规则进入 at-risk / breached 判定。

### 场景 D：计划错误

- 今日容量 180min，却规划 300min MUST。
- 系统阻止直接确认或要求 overload override reason。
- 晚上未完成时不能全部算“意志力差”。

### 场景 E：不可控事件

- 用户因不可控事件取消 MUST。
- 记录 uncontrollable_event，不计入 willful_breach。

---

## 23. V0.1 最终产品边界

V0.1 的真正产品不是：

> 一个漂亮的人生 Dashboard。

而是：

> **一个能让我早上做出有限、可行、有 WHY 的承诺；白天不允许这些承诺悄悄消失；发生偏差时告诉我真实后果；晚上把“为什么没做到”变成数据的系统。**

如果这个闭环成立，Graph、AI、Push、ActivityWatch、日历和云同步才值得继续加。

---

## 24. 下一版本路线

### V0.2 — Remote & Push

- Auth + 云数据库
- 多端同步
- PWA
- 系统 Push
- 后端 Cron
- LLM 文案润色（只改写事实）

### V0.3 — Context Awareness

- ActivityWatch
- Calendar
- 自动获取真实可用时间
- 更准确的 consequence engine

### V0.4 — Adaptive Intervention

- 记录不同干预后的行动概率
- 学习每种规则的有效性
- 动态调节干预强度和时机

### V1.0 — Personal Execution OS

真正形成：Intent → Commitment → Execution → Deviation → Intervention → Reflection → Strategy Update 闭环。

---

## 25. 调研结论如何进入本设计

借鉴而不照搬：

- Griply：Why-first / Goal→Task 对齐
- Sunsama：有限容量、日计划确认
- Beeminder：反 akrasia、冷静期、偏航可视化
- StickK：Commitment Contract
- Forfeit：上下文干预与例外/申诉思想
- Amazing Marvin：拖延是可诊断事件
- JITAI：decision point / tailoring variables / intervention options / decision rules
- Daniel Miessler LifeOS：Current State → Ideal State 与顶层 Intent 持续进入执行上下文
- karim-coder/life-os：多节点连接和关系图的实现参考

这些都不是 LifeOS 的产品地基；V0.1 的核心领域模型自行实现。

