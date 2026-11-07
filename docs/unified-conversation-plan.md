# 统一会话（Chat + Agent）设计与实施计划

> 目标：一个会话容器，支持 Chat / Agent 两种工作模式；消息与 Agent 执行记录在内部分开存储，UI 上保持连续体验。
>
> **实施状态（2026-11-07）**：P0 / P1 已落地。
> P0：conversations / messages 表与 repo/service、ChatService 改走 conversationService、
> `conversation:messages` 读库、启动恢复上次会话。
> P1：agent_runs / agent_steps 表与 repo/service、AgentRuntime（P1 为固定计划 + 单次模型调用）、
> `chat:send` 支持 mode='agent'、step 事件、渲染层 AgentRunCard 与 Chat/Agent 切换。
> P2（只读工具与审批）待开始。

## 0. 现状盘点

已经有、可以直接复用的部分：

- `src/shared/chat.ts` 已定义 `ConversationMode = 'chat' | 'agent'`、`Conversation`、`ChatMessage`、`RunEvent`
- `RunEvent` 预留了扩展位（注释写明后续追加 step / tool 事件）
- `ChatService` 采用「先返回 runId，事件异步推送」模型
- `conversationRepo` 目前是**内存实现**，接口与目标结构基本一致
- provider 模块可作为分层/表结构/校验的参考范本

缺口：

- conversations / messages 未落库（重启即丢）
- 没有 agent_runs / agent_steps 表
- 没有 Agent 模块与工具执行循环
- 渲染层只有单一 chat 消息流，没有 Run 卡片
- 会话列表 UI 尚未接入（当前侧边栏只有导航）

---

## 1. 设计原则

1. **一个会话，两种模式**：会话不分裂；`mode` 记录在消息和 Run 上，而不是把会话分成两套。
2. **UI 连续，内部有边界**：聊天消息与 Agent 执行步骤分开存储；执行步骤默认折叠，不污染正文。
3. **模式不是「有没有工具」**：Chat 也可以调工具；区别在于目标与自主程度。第一版先做到「Agent = 多步执行 + 可追踪」。
4. **Agent 运行可追踪、可取消、可重试**：一次执行 = 一条 `agent_runs` + N 条 `agent_steps`。
5. **事件驱动渲染**：main 产出 `RunEvent`，renderer 只消费事件，不关心底层模型和工具细节。
6. **模块边界照抄 provider 示范**：表定义归业务模块、repo 私有、service 公共、IPC 只做边界校验。

---

## 2. 领域模型

```
Conversation 1 ── N Message
Conversation 1 ── N AgentRun
AgentRun     1 ── N AgentStep
Message (assistant) 1 ── 0..1 AgentRun   // 该 Run 最终回答挂在哪条 assistant 消息上
```

### Conversation

- 统一容器，不做模式区分
- `lastMode`：仅用于输入框的默认模式（上次使用），不是会话属性
- `lastModel`：仅用于输入框默认模型

### Message

- 所有用户消息 / assistant 回复（含 Chat 与 Agent 的最终回答）
- `mode`：产生该消息时使用的模式，用于 UI 标记
- Agent 的**中间步骤不写入 messages**，只写 `agent_steps`

### AgentRun

- 一次 Agent 任务的执行实例
- 一个会话可以有多个 Run（连续追问 / 多个任务）
- 状态机：`pending → running → completed | failed | cancelled`

### AgentStep

- Run 内部的步骤记录：规划、LLM 调用、工具调用、审批、验证
- `seq` 保证展示顺序稳定（同一毫秒内也能排序）

---

## 3. 数据库设计（SQLite + drizzle）

沿用 provider 的约定：`id` 为 uuid（TEXT），时间为 epoch ms（INTEGER），JSON 用 drizzle 的 `text({ mode: 'json' })`，表定义放业务模块内，`infrastructure/database/schema.ts` 汇总 re-export。

### 3.1 conversations

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | TEXT PK | uuid |
| title | TEXT NOT NULL | 默认取首条消息前 30 字 |
| last_mode | TEXT NOT NULL DEFAULT 'chat' | 仅输入框默认值 |
| last_model_provider_id | TEXT | 上次使用模型（仅默认值） |
| last_model_id | TEXT | 同上 |
| created_at | INTEGER NOT NULL | |
| updated_at | INTEGER NOT NULL | |

索引：`updated_at DESC`（会话列表排序）

### 3.2 messages

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | TEXT PK | uuid |
| conversation_id | TEXT NOT NULL FK → conversations(id) ON DELETE CASCADE | |
| seq | INTEGER NOT NULL | 会话内单调递增，排序用 |
| role | TEXT NOT NULL | `user` / `assistant` / `system` |
| content | TEXT NOT NULL DEFAULT '' | 正文 |
| reasoning | TEXT | 推理内容（可选） |
| status | TEXT NOT NULL | `streaming` / `done` / `error` / `aborted` |
| mode | TEXT NOT NULL | `chat` / `agent` |
| error | TEXT | |
| model_provider_id | TEXT | |
| model_id | TEXT | |
| created_at | INTEGER NOT NULL | |
| updated_at | INTEGER NOT NULL | |

约束/索引：

- `UNIQUE (conversation_id, seq)`
- `INDEX (conversation_id, seq)`

### 3.3 agent_runs

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | TEXT PK | uuid，同时也是事件里的 runId |
| conversation_id | TEXT NOT NULL FK → conversations(id) ON DELETE CASCADE | |
| message_id | TEXT NOT NULL FK → messages(id) ON DELETE CASCADE | 最终回答挂载的 assistant 消息 |
| status | TEXT NOT NULL | `pending` / `running` / `completed` / `failed` / `cancelled` |
| plan | TEXT | 任务计划（可 JSON 或 Markdown） |
| result | TEXT | 最终结果摘要 |
| error | TEXT | |
| started_at | INTEGER | |
| completed_at | INTEGER | |
| created_at | INTEGER NOT NULL | |

索引：`(conversation_id, created_at)`

### 3.4 agent_steps

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | TEXT PK | uuid |
| run_id | TEXT NOT NULL FK → agent_runs(id) ON DELETE CASCADE | |
| seq | INTEGER NOT NULL | Run 内顺序 |
| type | TEXT NOT NULL | `plan` / `llm` / `tool` / `approval` / `note` |
| tool_name | TEXT | 工具调用时填写 |
| input | TEXT (JSON) | 工具入参 / 步骤输入 |
| output | TEXT (JSON) | 工具结果 / 步骤输出 |
| status | TEXT NOT NULL | `pending` / `running` / `done` / `error` |
| created_at | INTEGER NOT NULL | |
| completed_at | INTEGER | |

约束/索引：

- `UNIQUE (run_id, seq)`
- `INDEX (run_id, seq)`

### 3.5 暂不建表（后续按需）

- `attachments`（附件）
- `conversation_files`（会话工作区文件）
- `scheduled_tasks`（定时/后台任务）

---

## 4. 模块划分

### 4.1 main 进程

```
src/main/modules/
├── conversation/                  # 会话与消息的唯一持久化入口
│   ├── conversationTable.ts       # conversations
│   ├── messageTable.ts            # messages
│   ├── conversationRepo.ts        # 纯数据访问（替换现有内存实现）
│   ├── messageRepo.ts
│   ├── conversationService.ts     # 创建/列出/查询消息/追加消息/更新流式状态
│   ├── conversationIpc.ts         # list / messages / rename / delete（后续）
│   └── README.md                  # 模块边界说明（可选）
│
├── chat/                          # Chat 模式执行器（本轮改造）
│   ├── chatService.ts             # 写消息改走 conversationService
│   └── chatIpc.ts
│
└── agent/                         # 新增：Agent 模式
    ├── agentRunTable.ts
    ├── agentStepTable.ts
    ├── agentRepo.ts
    ├── agentRuntime.ts            # 多步循环：规划 → 工具 → LLM → 结果
    ├── toolRegistry.ts            # 工具注册与执行
    ├── tools/                     # 第一批工具（只读）
    ├── agentService.ts            # start / abort / listRuns / getRun
    └── agentIpc.ts
```

依赖方向：

```
agent  → conversation, provider
chat   → conversation, provider
conversation → （无业务依赖）
```

`registerModules.ts` 依次注册 conversation / provider / chat / agent 的 IPC。

### 4.2 shared 契约

现有 `src/shared/chat.ts` 保留并演进，新增：

```
src/shared/api/conversation.ts   # 会话/消息类型 + channel + 契约
src/shared/api/agent.ts          # AgentRun/AgentStep + channel + 契约
```

迁移策略：先把 `chat.ts` 中会话/消息相关类型移到 `api/conversation.ts` 并 re-export，避免一次性改所有 import；稳定后再清理旧路径。

### 4.3 renderer

```
src/renderer/modules/chat/
├── store/chatStore.ts             # 当前会话：messages + runs + 活跃 run
├── store/conversationStore.ts     # 会话列表（左侧）
├── components/
│   ├── MessageList.tsx
│   ├── AgentRunCard.tsx           # 折叠的执行过程 / 状态 / 步骤
│   └── composer/                  # 现有输入框，增加模式切换
```

数据来源：

- `conversationStore`：`conversation:list`（zustand，参考 providerStore）
- `chatStore`：`conversation:messages` + `run:event` 事件合并
- Agent 步骤：事件直接更新 `chatStore.runs[runId].steps`，不额外拉取；打开历史会话时随消息一次性返回 runs/steps（见 5.3）

---

## 5. IPC 与事件协议

### 5.1 会话

```
conversation:list        → ConversationSummary[]
conversation:messages    → { messages, runs }   // 历史会话一次取全
conversation:rename      （后续）
conversation:delete      （后续）
```

### 5.2 发送与执行

```
chat:send   { conversationId?, text, model, mode: 'chat' | 'agent' }
chat:abort  { runId }
```

- `mode='chat'`：走现有 ChatService（单次流式）
- `mode='agent'`：创建 assistant 消息 + agent_run，交给 AgentRuntime
- 响应仍先返回 `{ conversationId, runId, userMessage, assistantMessage }`

### 5.3 RunEvent 扩展

保留现有基础字段 `{ runId, conversationId, messageId, ts }`，新增：

```ts
| { type: 'run-start'; mode; model; runKind: 'chat' | 'agent' }
| { type: 'agent-plan'; plan: string }
| { type: 'step-start'; step: AgentStepView }
| { type: 'step-update'; stepId: string; patch: Partial<AgentStepView> }
| { type: 'step-finish'; stepId: string; status; output?: unknown }
| { type: 'tool-call'; stepId: string; toolName: string; input: unknown }
| { type: 'tool-result'; stepId: string; output: unknown }
| { type: 'approval-request'; stepId: string; summary: string }
| { type: 'text-delta'; delta: string }            // 最终回答仍复用
| { type: 'run-finish'; finishReason; usage? }
| { type: 'run-error'; error }
| { type: 'run-abort' }
```

历史加载时 `conversation:messages` 返回 `runs: AgentRunView[]`（含 steps），渲染层与实时事件使用同一个视图结构。

---

## 6. 关键实现细节

### 6.1 流式写入策略

不要在每个 text-delta 都 UPDATE SQLite：

- 内存累积正文
- 每 300–500ms 或每 N 个 delta 节流落库一次
- `finish / error / abort` 时强制落库最终状态
- renderer 依赖事件渲染，不依赖 DB 实时性

### 6.2 消息排序

使用 `messages.seq`（会话内单调递增，服务端分配），不要依赖 `created_at`（user + assistant 可能同毫秒）。

### 6.3 并发与取消

- 同一会话同一时间最多一个活跃 Run（服务端校验）
- `runId → AbortController` 映射放在 Agent/Chat 服务内
- 取消后：run.status = `cancelled`，assistant 消息 status = `aborted`，发 `run-abort`
- 应用退出时 `abortAll()`（现有 `before-quit` 逻辑沿用）

### 6.4 上下文构建

- Chat：取历史 user/assistant 完成消息
- Agent：历史消息 + 当前任务指令；工具中间结果**不回灌**成普通消息，必要时由 Runtime 摘要后作为下一步输入
- 默认不把 reasoning 传给下一轮模型

### 6.5 Agent 第一版范围（建议）

只读工具，先跑通链路：

- `list_directory`
- `read_file`
- `search_text`（rg / 简单递归）
- （后续）`write_file`、`run_command`、审批流

Runtime 循环：`plan → tool → observe → llm → ... → final`，上限步数/超时保护。

---

## 7. 实施阶段与验收

### P0：会话与消息落库（不改 UI 体验）✅

- [x] 新增 conversation/message 表 + repo/service
- [x] `conversationRepo` 内存实现替换为 SQLite
- [x] ChatService 改为通过 conversationService 读写
- [x] `conversation:messages` 返回历史
- [x] drizzle 迁移生成，重启后历史仍在
- [x] renderer 记住上次会话并在启动时恢复（`chat:lastConversation`）

验收：新建会话 → 发消息 → 重启应用 → 历史消息完整恢复。

### P1：Agent 骨架（无真实工具）✅

- [x] agent_runs / agent_steps 表 + repo/service
- [x] `chat:send` 支持 `mode='agent'`
- [x] AgentRuntime 第一步只做「LLM 单步 + 记录 plan/step 记录」（P1 使用固定计划）
- [x] RunEvent 增加 step 事件
- [x] 渲染层 AgentRunCard（折叠卡片 + 状态）
- [x] 输入区 Chat / Agent 模式切换
- [x] 打开历史会话时加载 runs / steps

验收：同一会话内先 Chat 后 Agent 再 Chat，消息连续；Agent 卡片显示执行记录；取消可用。

### P2：只读工具与审批

- [ ] toolRegistry + 第一批只读工具
- [ ] tool-call / tool-result 事件与步骤落库
- [ ] 超时、步数上限、错误重试策略
- [ ] （可选）审批按钮

验收：让 Agent 扫描项目并生成报告；步骤可展开；失败可见、可取消。

### P3：体验完善

- [ ] 左侧会话列表（zustand）
- [ ] 历史会话加载 runs/steps
- [ ] Run 重试 / 继续执行
- [ ] 右侧执行面板（工具、产出）
- [ ] 模式自动判断提示（「要开始执行吗？」）

---

## 8. 待确认的决策点

1. **Chat Run 是否也落库？**
   建议：第一版不落，只有 AgentRun 持久化；Chat 继续保持轻量。
2. **对话级还是消息级模式？**
   建议：消息级 `mode` 为准，会话只存 `last_mode` 作为输入框默认值。
3. **Agent 第一版工具范围？**
   建议：只读三个工具，写文件/执行命令放到 P3 并配审批。
4. **执行过程展示位置？**
   建议：第一版全部内联折叠在消息流中；右侧面板后置。
5. **会话删除策略？**
   建议：硬删除 + 级联（本地数据，无需软删）；若担心误删，后续加归档。
6. **同一会话多 Run 并行？**
   建议：第一版禁止并行，一个会话同时最多一个活跃 Run。

---

## 9. 风险与注意事项

- **SQLite 写入频率**：严格遵守节流落库，否则流式输出会拖慢主进程。
- **drizzle CHECK 变更不被 push 识别**：涉及 CHECK 时用 `db:generate` + 手动迁移校验（本项目已踩过）。
- **事件丢失**：renderer 未就绪时的事件需要缓冲（现有 chatStore 的 `pendingEvents` 机制保留）。
- **上下文膨胀**：Agent 多步任务的中间结果不能全部塞回下一轮对话；需要摘要/截断策略。
- **安全**：工具执行（尤其文件写入/命令执行）必须限制工作目录，并在 P3 前明确权限模型。

---

## 10. 一句话总结

用户看到的是「一条连续的对话」，底层是 `Conversation / Message / AgentRun / AgentStep` 四张表；Chat 与 Agent 只是同一条消息流上的两种执行方式，执行过程以可折叠的 Run 卡片呈现。
