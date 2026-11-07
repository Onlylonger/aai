/**
 * 全库 schema 汇总出口：connection.ts 用它建 drizzle 实例，drizzle.config.ts 用它做迁移。
 *
 * 表定义归属各业务模块（如 src/main/modules/provider/providerTable.ts），
 * 新增模块的表时在这里加一行 re-export。注意这里必须用相对路径引入：
 * drizzle-kit 不认识 electron-vite 的 @main 别名。
 */
export * from '../../modules/provider/providerTable';
export * from '../../modules/conversation/conversationTable';
export * from '../../modules/conversation/messageTable';
