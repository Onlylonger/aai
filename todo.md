你是 electron + ai 客户端开发专家.

当前项目是根据 electron-react-bioler这个星最多的模版项目克隆的，然后我需要实现 Chat+Agent Work双模式。边做边学习

然后我之前和 gpt 沟通：

```
6. 我建议你的学习和落地顺序
如果让我来规划技术路线，我会这样安排：

第一阶段：先理解 LangGraph

实现一个简单 Agent，包含 LLM、Tool、State、Checkpoint。

第二阶段：建立统一模型适配层

接入 OpenAI、Claude、Gemini、DeepSeek，保证 Agent Runtime 不依赖具体模型厂商。

第三阶段：建立统一事件协议

把 LLM 输出、工具调用、任务状态、执行步骤统一成事件，推送到客户端。

第四阶段：实现 Chat + Agent 双模式

Chat 直接调用 LLM；Agent Work 通过 Agent Runtime 执行，两者共享 Conversation。

第五阶段：增加持久化和任务管理

实现暂停、恢复、审批、取消、后台执行和任务历史。
```
