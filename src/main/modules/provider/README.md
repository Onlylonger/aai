# Provider 模块（示范模块）

用户自建模型供应商的配置管理：CRUD、API Key 加密存储、模型列表、连接测试。
本模块同时作为其他业务模块的结构范本，新增模块时按这里的分层和边界来抄。

**协议约定**：所有 provider 统一使用 OpenAI API 格式（国内厂商 DeepSeek / 智谱 /
通义 / Kimi 等均提供该端点），厂商差异只通过 `baseUrl` 表达，不设协议字段。

## 文件分层

| 文件 | 职责 | 对外可见 |
| --- | --- | --- |
| `src/shared/api/provider.ts` | 类型、zod schema、IPC channel 与契约 | ✅ renderer + main 共用 |
| `providerTable.ts` | drizzle 表定义 | ❌ 模块私有 |
| `providerRepo.ts` | 数据访问（SQL / drizzle 查询） | ❌ 模块私有 |
| `providerService.ts` | 业务规则（校验、归一化、加解密、视图组装） | ✅ 其他 main 模块按文件名直接引用 |
| `providerRegistry.ts` | 模型适配：`ModelRef` → AI SDK `LanguageModel` | ✅ chat / 未来的 agent 模块使用 |
| `providerTest.ts` | 连接测试（发一次极小的真实请求） | ⚠️ 仅 `providerIpc` 内部使用 |
| `providerIpc.ts` | IPC 注册（声明式接线，校验由基础设施完成） | ⚠️ 仅 `registerProviderIpc()` 供组合根调用 |
| `provider.constant.ts` | 参考常量（不参与运行时，测试/演示用） | ✅ 按需引用 |

**不使用 barrel（`index.ts` 汇总导出）**：跨模块引用直接指向具体文件，
依赖关系在 import 语句上一眼可见，也不会意外把私有实现带进公共出口。

## 其他模块可以用什么

### 1. 共享契约（renderer 和 main 都用）

```ts
import type { ModelRef, ProviderView } from '@shared/api/provider';
```

- `ModelRef`：一次请求用哪个模型（`providerId + modelId`），chat / agent 都以此引用模型
- `ProviderView`：渲染层看到的配置（不含密钥明文）
- `providerCreateSchema` / `providerUpdateSchema` / `providerIdSchema`：IPC 边界的运行期校验
- `PROVIDER_CHANNELS` / `ProviderIpcContract`：IPC 通道与契约

### 2. main 进程内（按文件名直接引用）

```ts
import { getLanguageModel } from '@main/modules/provider/providerRegistry';

const model = await getLanguageModel({ providerId, modelId });
```

- `getLanguageModel({ providerId, modelId })`：把配置解析成 AI SDK 的 `LanguageModel`，
  chat / 未来的 agent 模块只需依赖这个函数，不关心具体厂商
- `providerService.getRuntimeConfig(id)`：解密后的运行配置（baseURL、apiKey、默认模型），
  供本模块的 `providerRegistry`、`providerTest` 使用
- `ProviderRuntimeConfig`：上述返回值的类型
- 模块注册入口：组合根 `main/modules/registerModules.ts` 直接引用 `providerIpc` 的
  `registerProviderIpc()`
- `list / create / update / delete` 主要供 `providerIpc` 使用；其他 main 模块一般不需要

### 3. renderer 进程内

- 数据统一走 `@shared/api/provider` 的类型与 channel；组件不直接碰 IPC
- `providerStore.ts` 是 provider 模块在 renderer 侧的单一数据源（zustand）：
  组件直接使用 `useProviderStore`；`load()` 由 `Main` 布局在应用启动时触发一次，
  store 内部按 `loading` / `loaded` 去重。chat 的 `ModelSelect` 也消费同一份数据，
  修改状态结构或 actions 时需同步检查

## 不要这样做

- ❌ 其他模块直接 import `providerRepo` / `providerTable` —— 持久化实现是模块私有
- ❌ 用 `index.ts` barrel 汇总导出模块 API —— 直接引用具体文件
- ❌ 在业务模块里自己写 safeStorage 加解密 —— 用 `@main/infrastructure/security/secretStorage`
- ❌ 把表定义塞回 `infrastructure/database/schema.ts` —— 那里只做汇总 re-export
- ❌ 把 apiKey 明文或密文传给 renderer —— `ProviderView` 只暴露 `hasApiKey`
- ❌ 让 renderer 直接决定业务规则（如 defaultModel 是否合法）—— 校验在 main 的 service 完成
- ❌ 在模块 IPC 文件里重复实现 zod 校验逻辑 —— 用 `handleValidated()`

## 新增一个业务模块的清单

1. `src/shared/api/<module>.ts`：类型 + zod schema + channel + IPC 契约
2. `src/main/modules/<module>/<module>Table.ts`：drizzle 表定义（含 `created_at` / `updated_at` / `deleted_at` 约定）
3. `<module>Repo.ts`：数据访问，只做 SQL，不写业务规则
4. `<module>Service.ts`：业务规则 + 对外视图组装；需要密钥时用 `secretStorage`
5. `<module>Ipc.ts`：用 `handle()` / `handleValidated()` 注册 channel（schema 来自 shared）
6. `src/main/infrastructure/database/schema.ts`：加一行 `export * from '../../modules/<module>/<module>Table'`
7. `src/main/modules/registerModules.ts`：调用 `register<Module>Ipc()`
8. `src/renderer/modules/<module>/`：hook（封装 invoke）+ 页面/组件
9. 需要落库时在 `drizzle.config.ts` 覆盖的库里跑 `npm run db:generate` / `db:push`

## 校验职责划分

```
renderer 表单 schema            → UX 即时反馈（@mantine/form + schemaResolver）
        ↓ window.api.invoke（不可信边界）
infrastructure/ipc.handleValidated → shared zod schema 校验形状/类型/范围
        ↓
providerService                 → 业务规则（归一化、跨字段约束、不存在的行 → 报错）
        ↓
providerRepo                    → 纯数据访问
```

schema 只管单值形状，跨字段/跨表规则留在 service，不要塞进 schema。
