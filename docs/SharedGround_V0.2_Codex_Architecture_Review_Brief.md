# SharedGround V0.2 — Codex Architecture Review Brief

## 0. 当前状态

项目路径：

```text
/Users/franklin/Documents/ShareGround/ShareGround_project
```

当前版本：

```text
v0.1.0
```

V0.1 已完成并通过：

```bash
npm run typecheck
npm run test
npm run build
```

当前核心能力：

- 单一共享 WorkspaceState
- Source / Evidence / Note / Claim / Brief
- Human 与 Agent 共用结构化 Action
- reducer 层权限校验
- REQUEST_HUMAN_INPUT / WAIT
- Activity Log
- Mock Agent
- Real Agent API fallback
- Outcome / Process / Traceability Evaluation
- JSON / Markdown export

V0.1 的问题不是工程不完整，而是交互仍然偏“人工点击 Run Agent 的回合制演示”。Mock Agent 轨迹较固定，Human 修改虽然被记录，但没有充分改变 Agent 后续研究行为。用户难以理解 Agent 当前在做什么，也难以感受到真正的人机协作。

---

# 1. V0.2 的产品目标

一句话：

> 用户上传若干 Markdown 研究材料，Agent 真实读取材料、提取 Evidence、形成 Claims，并在 Human 随时修改后基于最新共享状态继续工作，最终共同生成可追溯 Brief。

V0.2 不做“全自动联网研究”，而是先证明：

1. Agent 能真实读取用户上传的文档正文；
2. 一个 Source 可以产生多条 Evidence；
3. Evidence 可以支持或反驳多个 Claim；
4. Human 可以随时修改 Evidence、Claim 和 Brief；
5. Agent 能检测并响应 Human 的最新修改；
6. Agent 不再依赖严格的一轮 Agent、一轮 Human；
7. Agent 可以持续小步工作，并在每个原子动作后重新读取最新状态；
8. 同一对象发生冲突时，Human 修改优先；
9. 最终 Brief 只能基于经过 Human 审查的 Claims；
10. 全过程仍可审计、可追溯、可评估。

---

# 2. 核心概念

## Source

用户上传的原始材料，例如一份 Markdown 文档、政策文件、研究报告或网页正文。

## Evidence

从 Source 中提取出来、可以支持或反驳某个 Claim 的具体事实、原文或发现。

关系必须支持：

```text
1 Source -> many Evidence
1 Evidence -> many Claims
1 Claim -> many supporting / counter Evidence
```

Evidence 不是“证明 Source 的证据”，而是“从 Source 中提取、用于支撑或反驳 Claim 的证据”。

## Note / Working Note

Agent 或 Human 在研究中的中间观察、线索、跨文档联系、疑问或证据缺口。

Note 不是正式判断，不要求进入最终报告。V0.2 可以弱化、折叠或重命名为 `Working Notes`。

## Claim

基于 Evidence 形成、需要 Human 审查的正式判断。

建议状态：

```text
ai_proposed
human_confirmed
human_revised
contested
evidence_insufficient
final
```

## Brief

基于已审查 Claims 生成的最终研究表达。Brief 中的关键判断必须能追溯到 Claim 和 Evidence。

---

# 3. 交互协议：弱异步，而非严格轮转

V0.1 当前模式：

```text
Human clicks Run Agent
-> Agent executes up to N actions
-> Agent stops
-> Human acts
-> Human clicks Run Agent again
```

V0.2 目标模式：

```text
Agent can continue working in small atomic steps
Human can modify workspace at any time
Each agent step re-reads the latest state
Human changes enter an event queue
Agent handles recent human changes before continuing
Conflicts on the same object are rejected in favor of Human
```

“弱异步”定义：

- Human 与 Agent 不必严格轮流；
- Agent 可以连续执行多个原子动作；
- Human 始终可以修改 Workspace；
- Agent 每个原子动作前后都读取最新状态；
- 不要求真正多线程同时写同一对象；
- 若 Agent 基于旧版本提交，reducer 拒绝该动作并要求重读；
- Human 修改优先。

V0.2 不要求完整复刻 Collaborative Gym 的 Redis / 多进程异步架构。

---

# 4. 必须新增的能力

## 4.1 Markdown 多文件上传

支持一次上传多份 `.md`。

建议 Source 增加：

```ts
type Source = {
  id: string;
  title: string;
  publisher?: string;
  url?: string;
  fileName?: string;
  content: string;
  summary?: string;
  addedBy: Actor;
  createdAt: string;
  updatedAt: string;
  version: number;
};
```

上传后：

- 浏览器使用 `File.text()` 读取正文；
- 每个文件生成一个 Source；
- 不需要数据库；
- 不需要云存储；
- localStorage 是否继续使用，请评估容量风险并给出方案。

## 4.2 Evidence 定位信息

Evidence 建议增加：

```ts
type Evidence = {
  id: string;
  sourceId: string;
  quoteOrFinding: string;
  relevance: string;
  section?: string;
  startLine?: number;
  endLine?: number;
  polarity?: "supporting" | "counter" | "context";
  addedBy: Actor;
  createdAt: string;
  updatedAt: string;
  version: number;
};
```

要求：

- 每份 Source 可有多条 Evidence；
- Evidence 必须能定位回原文；
- Human 可修改、删除或新增 Evidence；
- Agent 不得引用不存在的 Source 或 Evidence。

## 4.3 Recent Human Changes

Agent context 中必须显式加入：

```text
Recent Human Changes
- Evidence E3 edited by Human
- Claim C2 revised by Human
- Claim C4 contested by Human
- Brief edited by Human
```

每条变更至少包含：

- object type
- object id
- before
- after
- reason
- timestamp
- version

Agent 每次决策时，必须优先响应尚未处理的 Human change。

## 4.4 对象版本与冲突检测

Source / Evidence / Note / Claim / Brief 增加：

```ts
version: number
updatedBy: Actor
updatedAt: string
```

Agent 更新对象时 action payload 带：

```ts
expectedVersion: number
```

若当前版本不匹配：

```text
ACTION_REJECTED
reason: STALE_OBJECT_VERSION
```

规则：

- Human 修改优先；
- Agent 不得覆盖 Human 的新版本；
- Agent 收到拒绝后重新读取 Workspace；
- 不做复杂自动 merge。

## 4.5 Agent 后台小步执行

需要评估一种最小实现：

- 浏览器端循环；
- API route 一次返回一个或少量原子动作；
- 每次动作应用后重新读取 state；
- 有 Human change 时优先处理；
- 没有合理动作时进入 WAIT；
- Human 修改或发送消息后唤醒。

请比较以下方案：

1. 浏览器端 event loop；
2. Server-Sent Events；
3. WebSocket；
4. 简单 polling；
5. 仅前端定时触发。

优先选择 V0.2 最小、稳定、单用户可运行的方案，不要引入 Redis、数据库或多进程，除非有不可替代的理由。

## 4.6 协作动作

在现有协议基础上评估新增：

```text
READ_DOCUMENTS
ANALYZE_COVERAGE
EXTRACT_EVIDENCE
UPDATE_EVIDENCE
PROPOSE_CLAIM
UPDATE_CLAIM
SEND_TEAMMATE_MESSAGE
WAIT_TEAMMATE_CONTINUE
DRAFT_BRIEF
UPDATE_BRIEF
PAUSE_AGENT
RESUME_AGENT
```

不要为了动作数量而增加复杂度。请判断哪些动作应保留、合并或只作为内部 goal。

## 4.7 UI 阶段与当前 Agent 目标

不要继续只显示：

```text
Run Agent
```

页面应显示：

```text
Agent status: Working / Waiting / Paused
Current goal: Extract evidence from 3 remaining documents
Latest action: Added 2 evidence items from source-004
Pending human decisions: 1 contested claim
```

Human 应始终可以：

- Add Source
- Add / Edit / Delete Evidence
- Add / Edit Note
- Confirm / Revise / Contest / Mark Insufficient Claim
- Edit Brief
- Send Message
- Pause / Resume Agent

Activity Log 保留，但可以降低视觉权重。

---

# 5. 建议的 V0.2 用户流程

## Step 1: Create Task

用户输入：

- Research Question
- Expected Output
- 上传若干 Markdown 文件

## Step 2: Agent Reads Documents

Agent 输出：

- 已读取文档数量
- 主题覆盖
- 证据缺口
- 尚未处理的文档

Human 不需要等待全部完成，可以随时查看和修改已生成 Evidence。

## Step 3: Evidence Extraction

Agent 从 Source 中持续提取多条 Evidence。

Human 可以：

- 删除断章取义的 Evidence
- 修改 relevance
- 添加遗漏 Evidence
- 添加新 Source

Agent 检测变更后调整后续处理。

## Step 4: Claim Formation

Agent 基于当前有效 Evidence 提出 Claims。

每个 Claim 显示：

- supporting Evidence
- counter Evidence
- reasoning
- confidence
- status

## Step 5: Human Review

Human 可以批量或随时：

- Confirm
- Revise
- Contest
- Evidence insufficient

不要求每改一条就点一次按钮。

## Step 6: Agent Responds

Agent 必须明确说明：

- 接受了哪些 Human 修改；
- 重查了哪些 Source；
- 哪些 Claim 被调整；
- 哪些 Evidence 被补充；
- 哪些结论被降级或放弃。

## Step 7: Draft Brief

关键 Claims 完成 Human 审查后，Agent生成 Brief。

如果 Human 修改 Brief 后又回到 Claim：

- 系统标记 Brief stale；
- Agent 重新生成或局部更新；
- 不从头跑全部流程。

---

# 6. Evaluation

保留 V0.1 的：

- Outcome
- Process
- Traceability
- Permission / control checks

V0.2 增加系统行为指标：

- Human change response rate
- Stale write rejection count
- Human override preservation
- Evidence source-location completeness
- Claim support coverage
- Brief stale detection
- Agent wait / wake correctness

暂时不要求正式建立完整研究质量 benchmark。

但请在方案中说明未来可如何加入：

- Evidence extraction precision / recall
- Unsupported claim rate
- Claim grounding rate
- Citation accuracy
- Brief coverage
- Human revision compliance

---

# 7. 明确不做

V0.2 暂不做：

- Live web search
- PDF / OCR
- Vector database
- RAG pipeline
- Multi-user
- Login
- Redis
- Database
- Docker
- Multi-agent
- Full real-time collaborative editing
- CRDT
- Rich text editor
- Complex automatic merge
- Large benchmark
- LLM-as-a-judge

---

# 8. 需要 Codex 先完成的任务

请不要立即修改代码。

先阅读：

```text
README.md
docs/ARCHITECTURE.md
docs/PROJECT_REVIEW.md
docs/OPEN_SOURCE_ATTRIBUTION.md
core/types.ts
core/reducer.ts
core/permissions.ts
core/schemas.ts
agent/action-schema.ts
agent/build-context.ts
agent/execute-agent-turn.ts
agent/mock-agent.ts
agent/system-prompt.ts
app/api/agent/route.ts
store/workspace-store.ts
components/workspace/*
components/agent/*
eval/*
tests/*
```

然后输出一份架构审阅报告，回答：

1. 当前 V0.1 哪些模块可以直接复用？
2. 哪些模块必须重构？
3. 当前数据模型对多 Evidence、全文 Source、对象 version 是否兼容？
4. 当前 localStorage 是否适合保存多份 Markdown 正文？
5. 弱异步最小实现应选择什么技术方案？
6. 如何避免引入 Redis / WebSocket 仍能实现 Human 随时修改、Agent 小步继续？
7. Agent context 如何突出 recent human changes？
8. 如何实现 expectedVersion / stale write rejection？
9. 哪些现有测试应保留？
10. V0.2 应拆成哪些 phases？
11. 每个 phase 的完成标准和测试是什么？
12. 哪些需求存在范围过大或不必要复杂化的风险？

输出内容必须包括：

- Current Architecture Assessment
- Proposed V0.2 Architecture
- Data Model Changes
- Event / Agent Loop Design
- Human-Agent Conflict Rules
- UI Changes
- Migration Plan
- Phased Implementation Plan
- Test Plan
- Risks And Trade-offs
- Recommended First Phase

最后只给出方案，不要改代码，等待 Franklin 确认。
