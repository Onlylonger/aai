/**
 * 业务模块统一注册入口（组合根），main.ts 只需要调用 registerModules()。
 * 新增模块时在这里加一行。
 *
 * 约定：不做 barrel 再导出，各模块的 IPC 注册入口按文件名直接引用。
 */
import { registerAgentIpc } from './agent/agentIpc';
import { registerChatIpc } from './chat/chatIpc';
import { registerConversationIpc } from './conversation/conversationIpc';
import { registerProviderIpc } from './provider/providerIpc';

export function registerModules() {
  registerProviderIpc();
  registerConversationIpc();
  registerChatIpc();
  registerAgentIpc();
}
