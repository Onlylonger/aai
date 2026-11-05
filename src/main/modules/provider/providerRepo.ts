import { eq, isNull } from 'drizzle-orm';

import { getDb } from '@main/infrastructure/database/connection';

import { providers } from './providerTable';

import type { NewProviderRecord, ProviderRecord } from './providerTable';

export const providerRepo = {
  /** 只返回未删除的行 */
  findAll() {
    return getDb()
      .select()
      .from(providers)
      .where(isNull(providers.deletedAt))
      .all();
  },

  findById(id: string) {
    return (
      getDb().select().from(providers).where(eq(providers.id, id)).get() ?? null
    );
  },

  insert(row: NewProviderRecord): ProviderRecord {
    return getDb().insert(providers).values(row).returning().get();
  },

  /**
   * 按 id 更新字段并返回更新后的行（SQLite RETURNING，省去二次查询）。
   * id / createdAt 不允许修改。
   */
  update(
    id: string,
    values: Partial<Omit<NewProviderRecord, 'id' | 'createdAt'>>,
  ): ProviderRecord | null {
    return (
      getDb()
        .update(providers)
        .set(values)
        .where(eq(providers.id, id))
        .returning()
        .get() ?? null
    );
  },

  /** 软删除：只标记 deletedAt，行保留（用户配置不丢，列表/运行时都过滤） */
  softDelete(id: string) {
    getDb()
      .update(providers)
      .set({ deletedAt: Date.now() })
      .where(eq(providers.id, id))
      .run();
  },
};
