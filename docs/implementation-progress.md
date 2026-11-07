# 实现进度与交接文档

> 快照日期：2026-11-07
> 分支：`step0`，最近提交：`3f056b8 sql-tmp`
> 用途：暂停开发后，按本文档恢复上下文并继续实施。

---

## 0. 当前工作区状态

**未提交的改动**（继续开发前建议先提交）：

```
M  docs/unified-conversation-plan.md
M  src/main/modules/agent/agentRuntime.ts
M  src/renderer/modules/chat/components/AgentRunCard.tsx
?? src/main/modules/agent/agentStream.ts
?? src/main/modules/agent/tools/          (workspace.ts / index.ts)
```

**开发库数据**（`dev-data/aai.db`，请勿随意清空）：

| 表 | 行数 |
| --- | --- |
| providers | 1（deepseek，已配置 Key） |
| conversations | 2 |
| messages | 14 |
| agent_runs | 3 |
| agent_steps | 8 |

这些是实际联调产生的数据，可用于继续验证历史会话 / Agent 卡片恢复。

---

## 1. 已完成功能总览

### 1.1 基础设施：drizzle-kit 与数据库

- `drizzle.config.ts`：schema 指向 `src/main/infrastructure/database/schema.ts`，默认库 `dev-data/aai.db`
- 脚本：`db:generate` / `db:push` / `db:studio`
- 开发流程：`drizzle-kit push`（启动时跳过迁移）
- 发布流程：`drizzle-kit generate` + 启动时 `migrate()`（`app.isPackaged` 时执行）
- `electron.vite.config.ts` 构建时把迁移目录拷到 `dist/main/migrations`
- **迁移已压成单个初始版本**（`0000_*.sql`），包含全部 5 张表，并在全新库验证过
- ⚠️ 已知坑：`drizzle-kit push` **不检测 CHECK 约束变更**；改 CHECK 时需重建表或用 generate/手动迁移

### 1.2 Provider 模块（示范模块）

- 表：`providers`（无内置预置数据，用户自建）
- 字段：`id / name / enabled / base_url / api_key / models / default_model / created_at / updated_at / deleted_at`
- `api_key` 使用 Electron safeStorage 异步 API 加密（`infrastructure/security/secretStorage.ts`）
- `models` 使用 drizzle JSON mode（`ProviderModelId[]`），DB 层 CHECK 保证是 JSON 数组
- **统一 OpenAI API 格式**，无协议字段；厂商差异靠 baseURL
- IPC：`provider:list/create/update/delete/test`，全部走 zod 边界校验
- 连接测试：真实 `generateText` ping，15s 超时
- renderer：`providerStore.ts`（zustand）；供应商列表（启用蓝框、默认模型 Autocomplete、启用开关、编辑/删除）；新建/编辑共用抽屉；模型列表内联增删改 + 默认选择；名称在标题处点击编辑
- 模型候选列表 `modelSuggestions.ts` 仅作输入提示（非权威，允许自由输入）

### 1.3 IPC 与 Run 运行时

- `handle` / `handleValidated` 会把 `IpcMainInvokeEvent` 传给 handler
- `sendTo(sender, channel, payload)`：事件**定向发送**给发起窗口，不再全局广播
- `RuntimeManager`（`src/main/modules/runtime/runtimeManager.ts`）：
  - 创建 runId / AbortController
  - 记录 kind / status / ownerWebContentsId
  - 根据 `run-finish / run-error / run-abort` 自动收尾
  - `abort` / `abortAll`
- `ChatService` 已无状态化，作为普通对象导出（与 providerService 一致）
- renderer `chatStore`：`runs: Record<runId, RunState>` 按 runId 管理；`activeRunId` 只是当前会话快捷引用

### 1.4 会话与消息落库（P0）

- 表：`conversations` / `messages`
- `conversationRepo` 已从内存实现替换为 SQLite；`conversationService` 作为模块公共入口
- `messages.seq` 事务内分配，排序不依赖 createdAt
- ChatService 全部走 conversationService；消息写入带 `mode`
- `conversation:messages` 返回历史消息
- renderer 记住上次会话（localStorage `chat:lastConversation`），启动时恢复

### 1.5 Agent 骨架与工具（P1 / P2）

- 表：`agent_runs` / `agent_steps`
- `chat:send` 支持 `mode: 'chat' | 'agent'`（zod 默认 chat）
- `AgentRuntime`（P2）：规划步骤 + AI SDK 多步工具循环（最多 8 步）
- 只读工具：
  - `list_directory`（最多 200 条，跳过 node_modules/.git/dist 等）
  - `read_file`（≤64KB，拒绝二进制）
  - `search_text`（≤2000 文件 / 50 结果 / 单文件 256KB）
- workspace 边界：`AAI_AGENT_WORKSPACE` 或 `process.cwd()`；拒绝 `../` 越界
- 事件：`agent-plan` / `step-start` / `step-finish`（工具调用信息随 step 携带）
- 渲染：AgentRunCard（计划、步骤、工具输出预览、折叠）、Chat/Agent 切换
- 打开历史会话时同时加载 runs / steps

---

## 2. 当前数据库结构

```
providers       供应商配置（含加密 Key、模型 JSON、默认模型、软删除）
conversations   会话容器（last_mode / last_model 仅默认值）
messages        用户消息与 assistant 最终回复（seq 会话内递增）
agent_runs      一次 Agent 执行（status / plan / result / 时间）
agent_steps     执行步骤（plan / llm / tool / approval / note，input/output JSON）
```

关系：

```
conversations 1─N messages
conversations 1─N agent_runs
agent_runs    1─N agent_steps
messages      1─0..1 agent_runs（message_id）
```

---

## 3. 关键文件地图

### main

```
src/main/infrastructure/
├── database/
│   ├── schema.ts            # 汇总 re-export 各模块表
│   ├── connection.ts        # drizzle 实例；dev 跳过迁移 / packaged 执行迁移
│   ├── migrate.ts           # drizzle migrator
│   └── migrations/          # 版本化迁移（单个 0000）
├── ipc.ts                   # handle / handleValidated / sendTo / broadcast
└── security/secretStorage.ts

src/main/modules/
├── provider/                # 示范模块：Table/Repo/Service/Registry/Test/Ipc/README
├── conversation/            # Table/Repo/Service/Ipc（会话与消息持久化）
├── chat/
│   ├── chatService.ts       # Chat 执行器（无状态对象）
│   ├── streamAssistant.ts   # 通用模型流式调用
│   ├── messageHistory.ts    # 历史消息 → ModelMessage
│   └── chatIpc.ts           # 定向发送 + mode 分发
├── agent/
│   ├── agentRunTable.ts / agentStepTable.ts
│   ├── agentRepo.ts / agentService.ts
│   ├── agentRuntime.ts      # 规划 + 步骤落库 + 事件
│   ├── agentStream.ts       # AI SDK 多步工具循环
│   ├── tools/               # workspace.ts / index.ts（只读工具）
│   └── agentIpc.ts          # agent:runs
└── runtime/runtimeManager.ts
```

### shared

```
src/shared/chat.ts           # Conversation/Message/ChatMessage/RunEvent/chatSendSchema
src/shared/api/provider.ts   # Provider 类型/schema/契约
src/shared/api/agent.ts      # AgentRun/Step 类型、AGENT_CHANNELS、契约
```

### renderer

```
src/renderer/modules/providers/    # providerStore / ProvidersPage / ProviderRow / DetailDrawer
src/renderer/modules/chat/
├── store/chatStore.ts             # 消息 + runs + mode + 会话恢复
├── pages/ChatPage.tsx             # 消息流 / Agent 卡片 / 模式切换
└── components/AgentRunCard.tsx
```

### docs

```
docs/unified-conversation-plan.md       # P0-P3 总体规划
docs/run-event-delivery-conclusion.md   # 事件定向投递结论
docs/agent-permissions.md               # 工作区与权限设计（下一步实施依据）
docs/implementation-progress.md         # 本文档
```

---

## 4. 验证状态与已知问题

### 已通过的验证

- `npm run build` 通过
- `tsc --noEmit`：**src 下零错误**（node_modules 自带 .d.ts 仍有既有报错，不影响）
- eslint：本次开发涉及的文件零错误
- 工具冒烟测试：列目录 / 读文件 / 搜索 / 路径越界拒绝
- 全新空库迁移：5 张表、seq 唯一约束、级联删除均验证
- 应用启动：DB 连接、provider:list 正常

### 已知问题 / 技术债

| 问题 | 说明 | 优先级 |
| --- | --- | --- |
| workspace 未由用户授权 | 当前是 cwd/环境变量，见 `agent-permissions.md` | 高 |
| 无审批机制 | 只读工具暂无风险；写/执行工具必须先做审批 | 高 |
| 流式文本未节流落库 | 只在 finish/error/abort 写库；崩溃会丢部分文本 | 中 |
| 无会话列表 UI | 只能恢复上次会话，不能浏览/切换历史会话 | 中 |
| Chat run 不持久化 | 设计如此；刷新后 Chat 的 run 状态消失 | 低 |
| 无 retry / 右侧面板 / 自动判断 | 计划 P3 | 中 |
| `drizzle-kit push` 不识别 CHECK 变更 | 需 generate/手动迁移 | 中 |
| 无自动化测试 | conversation/agent 模块没有单测 | 中 |
| ChatEditor.tsx lint 既有错误 | `no-shadow` 3 处，非本次引入 | 低 |
| preload 每次 IPC 都 console.log | 噪音大，建议移除或加开关 | 低 |
| jest 既有失败 | `updates.test.ts` 路径过期、`App.test.tsx` 模块解析 | 低 |

---

## 5. 如何运行 / 调试

```bash
npm start                      # dev：electron-vite，dev 库 dev-data/aai.db

npm run db:push                # 开发阶段同步 schema
npm run db:generate            # 发布阶段生成迁移
npm run db:studio              # 查看数据

# 指定 Agent 工作区（否则用进程 cwd）
AAI_AGENT_WORKSPACE=/path/to/project npm start
```

测试路径：

1. 普通聊天：选择模型 → Chat 模式发送 → 重启应用验证历史恢复
2. Agent：切到 Agent 模式，发送「看一下这个项目的目录结构，找出入口文件」
   → 卡片中出现模型调用 / 工具步骤 / 输出预览
3. 审核：刷新后历史会话中的 Agent 卡片应从 `agent_runs` / `agent_steps` 恢复

localStorage 键：`chat:lastModel`、`chat:lastMode`、`chat:lastConversation`

---

## 6. 下一步路线（恢复开发时按此顺序）

### 立即

1. **提交当前未提交改动**（见第 0 节）
2. 阅读 `docs/agent-permissions.md`，确认第 8 节的产品决策
3. 实施权限步骤 1：workspaces 表 + 原生目录选择 + 会话绑定 + 工具工厂化
4. 实施权限步骤 2：审批门（事件 + IPC + pending 管理 + 卡片展示）

### 随后

5. 写工具（`write_file` 等）+ 审批；命令执行最后做
6. P3 UI：会话列表、历史 Run 重试、右侧执行面板、模式自动判断
7. 技术债：流式落库节流、模块测试、清理 preload 日志、修 ChatEditor lint

### 验收提示

- 每个新阶段保持 `npm run build` + `tsc`（只看 src）+ 全新库迁移验证
- 改 CHECK 约束时不要依赖 `db:push` 自动识别
- 新增模块沿用 provider 的结构：Table/Repo/Service/Ipc + shared schema + zod 边界校验

---

## 7. 交接备忘

- 当前所有改动都在工作区，**没有提交**；建议 `git add -A && git commit` 后再暂停
- `dev-data/aai.db` 中有真实联调数据（见第 0 节），不要清库；如需重置请先备份
- 迁移目录已压缩为单个 `0000_*.sql`；如果之后发布过版本，不要再压缩，改为追加新迁移
- Agent 工具的工作区目前是 `process.cwd()`；打包后 cwd 可能不同，务必在权限步骤中替换为用户授权目录
