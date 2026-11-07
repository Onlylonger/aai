# Run 事件投递方式：定向发送 vs 全局广播（最终结论）

> 结论先行：**采用 `event.sender` 定向发送**。它是请求级流式事件的正确默认方式；
> 全局广播只在真正需要"广播给所有窗口"的场景保留。
> 但事件只是通知，**任务状态的可靠来源必须是数据库 / main 进程内的 RunManager**，
> 不能把"renderer 收到了事件"当作任务存活的依据。
>
> **实施状态（2026-11-07）**：4.1–4.5 已落地：
> `handle`/`handleValidated` 暴露 event、chat/conversation IPC 边界校验、
> 按 sender 定向发送、`RuntimeManager`（`src/main/modules/runtime/runtimeManager.ts`）、
> `ChatService` 无状态化、renderer `chatStore.runs` 按 runId 建模。
> 后续在 P0/P1 中把 run/step 状态落库，并在 `RuntimeManager` 上补 attach / 重新订阅。

---

## 1. 事实核对

### 1.1 Electron 确实提供了 `event.sender`

`ipcMain.handle(channel, (event, args) => ...)` 中的 `event` 是 `IpcMainInvokeEvent`：

- `event.sender`：发起本次 invoke 的 `WebContents`
- `event.senderFrame`：发起调用的 frame（如需校验来源）
- `event.sender.send(channel, payload)`：只发送给该 renderer

当前项目的 `handle` 封装把 `_event` 丢掉了：

```ts
ipcMain.handle(channel, async (_event, args) => {
  const res = await handler(args); // event 没有传给业务
});
```

所以问题不是"能不能定向"，而是"封装没把能力暴露出来"。修复成本很低。

### 1.2 当前实现的问题

`chatIpc.ts`：

```ts
const chatService = new ChatService((event) =>
  broadcast(CHAT_CHANNELS.runEvent, event),
);
```

- 任何窗口发起的 run，事件都会广播给**所有窗口**
- 多窗口时会出现：A 窗口的任务进度出现在 B 窗口
- 窗口关闭后仍可能向无效 webContents 发送（`broadcast` 里有 `isDestroyed` 保护，但语义上仍是错的）
- ChatService 通过构造函数持有全局 emitter，隐含了"一个 Service 只对应一种投递方式"的假设

---

## 2. 对 GPT 方案的评估

### 同意

1. **把 `event` 暴露给 handler，按 `sender` 定向发送**：正确，且改动小。
2. **`ChatService.send(req, emit)` 每次传入 emitter**：正确。Service 继续不依赖 IPC / BrowserWindow。
3. **任务生命周期不依赖 renderer**：正确且关键。事件只是通知，状态必须可重建。
4. **`activeRunId` 单值不够，未来需要按 runId 管理**：正确。见第 5 节。

### 需要补充/修正

1. **"窗口重载 = sender 失效"不完全准确**
   - 页面 reload / 导航不会销毁 `webContents`，`sender` 仍然有效；
   - 真正失效是**窗口关闭 / renderer 崩溃**。
   - 但无论哪种，断线期间的事件会丢失，恢复必须靠数据库，不能靠 sender。

2. **"不需要额外设计事件转发机制"说得略满**
   - 请求级事件用 sender 够了；
   - 一旦有**后台任务 / 多窗口共享同一任务 / 托盘模式**，就需要 main 侧的 **RunManager + 重新订阅（attach）** 机制。
   - 建议现在就把 RunManager 的"最小形态"留出来，避免以后推翻。

3. **关闭窗口的行为要按平台区分**
   - 当前代码遵循 macOS 惯例：`window-all-closed` 在 darwin 上不退出应用；
   - Windows/Linux 关闭窗口即退出应用；
   - "关闭窗口后任务是否继续"必须先定义产品策略，不能由 Electron 默认行为决定。

4. **安全性补充**
   - 如果未来加载远程内容，应校验 `event.senderFrame` 的来源；
   - 当前应用只加载本地页面，风险低，但定向发送本身也是缩小攻击面的做法。

---

## 3. 推荐架构

```
Renderer (window A)
   │ invoke(chat:send)
   ▼
IPC 边界（handle 拿到 event）
   │ sender = event.sender
   ▼
RuntimeManager（main，长期存活）
   ├── runId → { abortController, ownerWebContentsId, status }
   ├── 调用 ChatService / AgentRuntime
   └── 事件回调 → sender.send(runEvent)
                     │
                     └── 仅 window A 收到
                     
Database（messages / agent_runs / agent_steps）
   └── 任务状态的唯一可靠来源；窗口重开时从这里恢复
```

三条职责线：

| 层 | 职责 |
| --- | --- |
| IPC | 从 `event.sender` 生成"只发给调用方"的 emitter；校验入参 |
| RuntimeManager | 持有运行中的 Run、AbortController、状态与归属窗口；决定事件投递给谁 |
| ChatService / AgentRuntime | 只产出 `RunEvent` 与持久化状态，不知道窗口存在 |
| DB | 消息、Run、Step 的可靠状态；重连/重开后的恢复来源 |

---

## 4. 具体改动（落地清单）

### 4.1 `infrastructure/ipc.ts`：暴露 event

```ts
export function handle<C extends IpcInvokeChannel>(
  channel: C,
  handler: (
    args: IpcArgs<C>,
    event: Electron.IpcMainInvokeEvent,
  ) => IpcResult<C> | Promise<IpcResult<C>>,
) {
  ipcMain.handle(channel, async (event, args: IpcArgs<C>) => {
    try {
      const res = await handler(args, event);
      log.debug('[ipc]', channel, args, res);
      return res;
    } catch (error) {
      log.error('[ipc]', channel, error);
      throw error;
    }
  });
}
```

现有只接收 `args` 的 handler 类型兼容，无需全部改签名。

新增一个小的发送工具，集中处理销毁保护：

```ts
export function sendTo<C extends IpcEventChannel>(
  sender: Electron.WebContents,
  channel: C,
  payload: IpcEventMap[C],
) {
  if (!sender.isDestroyed()) sender.send(channel, payload);
}
```

`handleValidated` 同样需要把 event 透传给 handler：

```ts
export function handleValidated<
  C extends IpcInvokeChannel,
  S extends IpcArgs<C>,
>(
  channel: C,
  schema: ZodType<S>,
  handler: (
    args: S,
    event: IpcMainInvokeEvent,
  ) => IpcResult<C> | Promise<IpcResult<C>>,
) {
  handle(channel, (args, event) => handler(parsePayload(schema, args), event));
}
```

### 4.2 `chatIpc.ts`：按调用方发送 + 边界校验

接收外部输入的 channel 必须用 `handleValidated`（schema 来自 shared），
只有无参 channel（如 `provider:list`、`conversation:list`）才用 `handle`。

```ts
export function registerChatIpc() {
  const chatService = new ChatService(); // 不再在构造时注入全局 emitter

  handleValidated(CHAT_CHANNELS.send, chatSendSchema, (req, event) => {
    const sender = event.sender;
    return chatService.send(req, (payload) =>
      sendTo(sender, CHAT_CHANNELS.runEvent, payload),
    );
  });

  handleValidated(CHAT_CHANNELS.abort, chatAbortSchema, ({ runId }) =>
    chatService.abort(runId),
  );
}
```

`src/shared/chat.ts` 补充 schema（原先完全没有）：

```ts
export const modelRefSchema = z.object({
  providerId: z.string().min(1),
  modelId: z.string().min(1),
});

export const chatSendSchema = z.object({
  conversationId: z.string().min(1).optional(),
  text: z.string().trim().min(1, '消息不能为空').max(100_000, '消息过长'),
  model: modelRefSchema,
});

export const chatAbortSchema = z.object({ runId: z.string().min(1) });

export const conversationMessagesSchema = z.object({
  conversationId: z.string().min(1),
});
```

### 4.3 `ChatService.send()`：emitter 每次传入

```ts
send(req: SendMessageRequest, emit: RunEventEmitter): SendMessageResponse {
  // 现有逻辑不变
  const emitEvent = (payload: RunEventPayload) => emit({ ...payload, runId, ... });
  void this.execute({ ..., emit: emitEvent });
  return { ... };
}
```

`ChatService` 依旧不 import Electron，只依赖 `RunEventEmitter` 类型。

### 4.4 `RunManager`（建议本轮就建最小版）

```ts
class RuntimeManager {
  private runs = new Map<string, {
    abort: AbortController;
    ownerWebContentsId: number;
    status: RunStatus;
  }>();

  startChat(req, owner: WebContents, emit: RunEventEmitter) { ... }
  abort(runId) { ... }
  /** 窗口重开 / 切换后重新绑定事件接收方（后续） */
  attach(runId, owner) { ... }
}
```

已实现于 `src/main/modules/runtime/runtimeManager.ts`：`start(kind, sender, execute)`
创建 runId / AbortController，并把事件定向发给对应窗口；`abort` / `abortAll` 由它统一管理。
Chat / Agent 共用同一个 `runtimeManager` 实例。

### 4.5 renderer 状态：从单 run 到 run map

当前 `chatStore`：

- `activeRunId` 只记录一个 run
- `applyRunEvent` 只按 `conversationId` 过滤

建议：

```ts
interface RunState {
  runId: string;
  status: 'running' | 'done' | 'error' | 'aborted';
  steps: AgentStepView[];
  ...
}

runs: Record<string, RunState>;          // 按 runId 存
activeRunByConversation: Record<string, string>; // 当前会话的活跃 run
```

已实现于 `chatStore`：`runs: Record<runId, RunState>` 记录所有已知 run；
`activeRunId` 只作为当前会话的快捷引用。即使第一版限制"同一会话同时一个 run"，
按 runId 建模也让 Agent 多步骤事件、未来并行任务、重新订阅都更自然。

### 4.6 Service 形态：普通对象 vs class

结论：**按「是否有跨调用状态」选择形态；状态抽离完成后，无状态服务自然统一为普通对象。**

当前最终形态：

| | providerService | chatService | RuntimeManager |
| --- | --- | --- | --- |
| 跨调用状态 | 无 | 无（run 状态已抽走） | 有（`Map<runId, ActiveRun>`） |
| 形态 | 普通对象 | 普通对象 | class（单例 `runtimeManager`） |
| 理由 | 只读写 DB | 只执行一次 Chat | 持有 controller / 状态 / 归属窗口 |

演进过程：

1. 最初 ChatService 持有 `Map<runId, AbortController>`，因此是 class；
2. 把 run 状态抽到 `RuntimeManager` 后，ChatService 变成无状态执行器；
3. 无状态后改为普通对象导出，与 providerService 保持一致。

规则：**有状态 / 有生命周期资源的组件用 class（或闭包工厂）；无状态的领域服务用普通对象。**
不需要为了视觉统一强行改造，而是先把状态放到正确的位置。

---

## 5. 边界情况与策略

| 场景 | 行为 | 事件投递 | 状态恢复 |
| --- | --- | --- | --- |
| 窗口最小化 / 被遮挡 | 任务继续 | sender 有效，正常发送 | 无需 |
| 页面 reload | 任务继续 | webContents 未销毁，sender 仍有效；断线期间事件丢失 | 重新 fetch DB |
| 切换会话 | 任务继续 | 事件仍发送给当前窗口，renderer 按 conversationId/runId 分流 | 切回时从 DB 读取 |
| 关闭窗口（macOS） | 应用不退出；任务是否继续按产品策略 | sender 销毁，停止投递 | 重开窗口后从 DB 恢复 |
| 关闭窗口（Win/Linux） | 默认退出应用 | 停止投递 | — |
| 退出应用 | `before-quit` 取消所有 Run | — | Run 状态落库为 cancelled/aborted |
| 未来：托盘/后台任务 | 任务继续 | 需要 `run:attach` 重新绑定窗口 | DB + RunManager |
| 多窗口 | 各自只收自己的事件 | 定向发送 | 各自从 DB 读取 |

**关闭窗口是否继续任务，建议第一版明确为：**

- macOS：关闭窗口 ≠ 退出应用；**Agent 任务继续在 main 执行**，事件停止投递，DB 记录状态；
  重开窗口从 DB 恢复；用户明确退出应用时提示并取消。
- Win/Linux：关闭窗口 = 退出应用，任务随之取消（后续可加托盘改变）。

---

## 6. 与「统一会话」计划的关系

这份结论是 `docs/unified-conversation-plan.md` 中 P0/P1 的前置优化：

- P0 落库（messages / conversations）让"窗口重开后恢复"成为可能
- P1 的 AgentRuntime 直接复用 `RunManager` 的 runId → owner / abort 映射
- 事件协议不变，仍然是 `RunEvent`；只是投递范围从"所有窗口"缩小到"发起窗口"

**数据库才是任务状态的可靠来源**：
`conversation:messages` 返回消息 + runs/steps；renderer 打开会话时先读 DB，
再接收后续事件。事件丢失不会导致状态不一致。

---

## 7. 实施步骤与验收

1. `handle` 暴露 `event`（不改现有 handler）
2. `chatIpc` 改为按 `event.sender` 定向发送；`ChatService.send(req, emit)`
3. 移除 chat 模块对 `broadcast` 的使用（保留 `broadcast` 供真正的全局通知）
4. renderer `chatStore` 的 run 状态按 `runId` 建模（可与 P1 一起做）
5. 验证：
   - 单窗口：行为与现在一致
   - 双窗口（临时创建）：A 发起任务，B 收不到事件
   - 窗口 reload：任务继续，恢复后消息状态正确（依赖 P0 落库）
   - 退出应用：所有 Run 被取消并落库

---

## 8. 最终结论

**采用 `event.sender` 定向发送，不做全局广播。**

- 这是请求级流式事件的正确模型：谁发起，谁接收
- 改动小：暴露 event + 每次 send 传 emitter
- 不破坏现有 Service 分层：Service 仍只产出事件，IPC 决定投递
- 为多窗口、Agent 长任务、后台/托盘模式留好了演进路径

同时必须坚持：

1. **事件是通知，DB 是状态**
2. **Run 的生命周期由 main 的 RunManager 管理，不依赖窗口**
3. **renderer 按 `runId` 管理运行状态，而不是单个 `activeRunId`**
4. **关闭窗口/退出应用的策略要显式定义**，不要依赖 Electron 默认行为

一句话：**定向投递解决"发给谁"，持久化 + RunManager 解决"任务还在不在"。两者要一起做。**
