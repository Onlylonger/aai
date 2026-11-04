# Agent 工作区与权限设计

> 目标：Agent 只能访问用户显式授权的工作区；不同操作按风险分级授权；
> 高风险操作在执行前逐次审批，决策与审计都在 main 进程完成。
>
> 当前实现（P2）只完成了第一层的一部分：workspace 根目录固定为
> `AAI_AGENT_WORKSPACE` 或 `process.cwd()`，工具只读，无审批。

---

## 1. 三层权限模型

```
1. 工作区授权（用户选目录）        → 决定「能碰哪些文件」
2. 工具 / 操作授权（read/write/exec）→ 决定「能做什么操作」
3. 单次审批（human-in-the-loop）    → 高风险操作逐次确认
```

| 层级 | 由谁决定 | 存储位置 | 生效范围 |
| --- | --- | --- | --- |
| 工作区授权 | 用户通过系统目录选择器 | `workspaces` 表 | 会话 / 任务 |
| 操作授权 | 产品默认策略 + 用户 grant | `workspace_grants`（可选） | workspace 级 |
| 单次审批 | 用户逐次确认 | `agent_steps`（type=approval） | 单次工具调用 |

---

## 2. 工作区授权

### 2.1 原则

- **不要让 Agent 猜目录**：不使用 `process.cwd()` / 家目录作为默认值上线
- **路径只由 main 解析**：renderer 只传相对路径；workspace 根由 `workspace_id` 在 main 中查出
- **选择动作即授权**：用户通过 Electron 原生对话框选择目录，视为对该目录的授权

### 2.2 选择流程

```
renderer: 点击「选择工作区」
   │ invoke('workspace:pick')
   ▼
main: dialog.showOpenDialog({ properties: ['openDirectory'] })
   │ 用户选择目录
   ▼
main: workspaceService.create({ path, label })
   │ 存入 workspaces
   ▼
renderer: 把 workspaceId 绑定到当前 conversation
```

代码示意：

```ts
// main/modules/workspace/workspaceIpc.ts
handle(WORKSPACE_CHANNELS.pick, async (_, event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(window!, {
    title: '选择 Agent 工作区',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths[0]) return null;

  return workspaceService.create({ path: result.filePaths[0] });
});
```

> 不要把「输入路径」做成文本框。文本框等于允许 renderer 指定任意路径，
> 失去了用户授权语义。

### 2.3 会话绑定

- `conversations.workspace_id` 指向当前工作区
- 同一会话内多次 Agent 任务共用该 workspace
- 切换工作区需要用户显式操作（新会话或修改会话设置）
- 无 workspace 的会话：Agent 模式不可用，Chat 模式不受影响

### 2.4 工具按 run 绑定 workspace

当前工具是模块级单例，根目录固定。应改为**每个 run 创建工具集**：

```ts
// main/modules/agent/tools/index.ts
export function createAgentTools(workspaceRoot: string) {
  const resolve = (p?: string) => resolveWithin(workspaceRoot, p);

  return {
    list_directory: tool({ ... execute: ({ path }) => list(resolve(path)) }),
    read_file: tool({ ... }),
    search_text: tool({ ... }),
  };
}
```

`AgentRuntime` 在启动时读取会话绑定的 workspace，再传给 `streamAgent`。

---

## 3. 操作分级与授权

| 级别 | 工具示例 | 默认策略 | 说明 |
| --- | --- | --- | --- |
| read | list_directory / read_file / search_text | 工作区内自动允许 | 只读，风险低 |
| write | write_file / create_directory / delete_file | 每次审批，或该 workspace 首次授权后记住 | 可能破坏用户文件 |
| execute | run_command / shell | 每次审批 + 命令白名单 | 风险最高，建议始终逐次确认 |

### 3.1 grant 记忆（可选）

```sql
workspace_grants (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  action TEXT NOT NULL,           -- read | write | exec
  scope TEXT NOT NULL,            -- session | always
  created_at INTEGER NOT NULL
)
```

建议：

- `read`：workspace 内默认 allow，不弹窗
- `write`：首次询问，可选「本工作区始终允许写入」
- `exec`：始终逐次审批（即使有 grant，也要求确认）

---

## 4. 单次审批流程

### 4.1 流程

```
模型决定调用 write_file
  │
  ▼
main 不执行，创建 approval step（pending）
  │ emit { type: 'approval-request', stepId, toolName, input, reason }
  ▼
renderer 弹确认框：[允许一次] [始终允许] [拒绝]
  │ invoke('agent:approve', { approvalId, decision })
  ▼
main 继续执行 / 拒绝并把错误返回给模型
  │ 更新 step 状态，继续 run
```

### 4.2 事件与契约

```ts
// shared/api/agent.ts
export type ApprovalDecision = 'allow_once' | 'allow_always' | 'deny';

export interface ApprovalRequest {
  approvalId: string;
  runId: string;
  stepId: string;
  toolName: string;
  input: unknown;
  reason?: string;
  expiresAt: number;
}

// RunEvent 增加
| { type: 'approval-request'; request: ApprovalRequest }
| { type: 'approval-resolved'; approvalId: string; decision: ApprovalDecision }

// IPC
AGENT_CHANNELS.approve = 'agent:approve'
{ approvalId: string; decision: ApprovalDecision } → void
```

### 4.3 main 侧实现要点

- `AgentRuntime` 中维护 `pendingApprovals: Map<approvalId, { resolve, reject, timer }>`
- 工具执行前 `await requestApproval(...)`；超时（如 5 分钟）自动 deny
- 窗口关闭 / 用户停止 → 全部 pending 以 deny 收尾，run 标记 cancelled
- 决策写入 `agent_steps`（`type='approval'`），保证可审计
- 审批必须由 main 执行决策；renderer 只是 UI，不能直接调用工具

### 4.4 与 AI SDK 的关系

AI SDK v7 自带 `needsApproval` / `toolApproval` 机制，可以复用；
也可以像现在这样在工具外面包一层 gate。自建 gate 更容易接入现有的
`RunEvent`、`agent_steps` 和 UI，建议第一版自建，后续再考虑与 SDK 对齐。

---

## 5. 数据模型建议

```sql
CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,      -- 绝对路径（realpath）
  label TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER
);

ALTER TABLE conversations ADD COLUMN workspace_id TEXT
  REFERENCES workspaces(id) ON DELETE SET NULL;

CREATE TABLE workspace_grants (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  scope TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(workspace_id, action)
);
```

审批记录复用 `agent_steps`：

```json
{
  "type": "approval",
  "title": "审批：write_file",
  "input": { "toolName": "write_file", "toolInput": { "path": "..." }, "reason": "..." },
  "output": { "decision": "allow_once" },
  "status": "done"
}
```

---

## 6. 安全清单

- [ ] 路径规范化：`fs.realpath` 后再做包含性校验，防 symlink 逃逸
- [ ] 大小写不敏感文件系统（macOS）下的路径比较
- [ ] 拒绝 `..`、绝对路径、NUL 字节
- [ ] 敏感文件 deny-list：`.env`、`.ssh`、密钥、`*.pem`、`.git/config`
- [ ] 读文件大小上限、搜索文件数/结果数上限（已实现）
- [ ] 写文件：限制单次写入大小、先写临时文件再原子 rename
- [ ] 执行命令：`spawn(cmd, args)` 不走 shell；工作目录固定；超时；输出截断
- [ ] 子进程环境变量过滤，绝不把 API Key 传给子进程
- [ ] 所有工具调用与审批写入 `agent_steps`，可回溯
- [ ] 退出应用时取消所有 pending approval / run
- [ ] 若上架 Mac App Store：使用 security-scoped bookmarks 持久化授权

---

## 7. 实施顺序与验收

### 步骤 1：workspace 落地（地基）

- [ ] `workspaces` 表 + repo/service
- [ ] `workspace:pick` IPC（原生目录选择器）
- [ ] `conversations.workspace_id` + 会话绑定
- [ ] Agent 启动时读取 workspace；无 workspace 时拒绝 Agent 模式并给出提示
- [ ] `createAgentTools(workspaceRoot)` 工厂化

验收：两个不同目录的会话各自只能访问自己的 workspace；越界访问被拒绝。

### 步骤 2：审批门

- [ ] `ApprovalRequest` 事件与 `agent:approve` IPC
- [ ] AgentRuntime pending approval 管理（超时 / 取消）
- [ ] AgentRunCard 展示审批步骤与结果
- [ ] 先用一个「危险但无副作用」的示例工具验证链路（如 `read_file` 模拟需审批）

验收：审批请求出现 → 拒绝则工具不执行 → 允许则继续；步骤可回溯。

### 步骤 3：写工具

- [ ] `write_file` / `create_directory`（先不做删除）
- [ ] 写操作默认审批；支持「本工作区始终允许写入」
- [ ] 原子写、大小限制、敏感路径拒绝

### 步骤 4：命令执行（可选，最后做）

- [ ] `run_command` + 命令白名单
- [ ] 每次审批、超时、输出截断、环境变量过滤

---

## 8. 待确认的产品决策

1. 一个会话绑定一个 workspace，还是允许中途切换？
   - 建议：绑定一个；切换需新建会话或显式修改
2. 是否支持多 workspace 挂载（如项目 + 文档目录）？
   - 建议：P3 先单 workspace，后续再加
3. `write` 的「始终允许」是否按 sessions 还是永久？
   - 建议：永久但可在设置中撤销；`exec` 不做永久授权
4. 审批超时时间：建议 5 分钟，超时视为拒绝并终止该工具调用
