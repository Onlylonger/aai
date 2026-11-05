/**
 * Provider 模块的 IPC 注册，契约见 @shared/api/provider 的 ProviderIpcContract。
 *
 * renderer 是不可信侧：接收外部输入的 channel 用 handleValidated() 注册，
 * schema 来自 shared，校验由基础设施统一完成；本文件只做声明式接线，
 * service 只负责业务规则。
 */
import {
  PROVIDER_CHANNELS,
  providerCreateSchema,
  providerIdSchema,
  providerUpdateSchema,
} from '@shared/api/provider';
import { handle, handleValidated } from '@main/infrastructure/ipc';

import { testProviderConnection } from '../llm/providerTest';
import { providerService } from './providerService';

export function registerProviderIpc() {
  handle(PROVIDER_CHANNELS.list, () => providerService.list());

  handleValidated(PROVIDER_CHANNELS.create, providerCreateSchema, (input) =>
    providerService.create(input),
  );

  handleValidated(PROVIDER_CHANNELS.update, providerUpdateSchema, (patch) =>
    providerService.update(patch),
  );

  handleValidated(PROVIDER_CHANNELS.delete, providerIdSchema, (id) =>
    providerService.delete(id),
  );

  handleValidated(PROVIDER_CHANNELS.test, providerIdSchema, (id) =>
    testProviderConnection(id),
  );
}
