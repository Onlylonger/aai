import { matchPath } from 'react-router-dom';

/**
 * 应用路由常量
 */
export const ROUTES = {
  HOME: '/',

  CHAT: '/chat',
  CHAT_DETAIL: '/chat/:id',

  PROVIDERS: '/settings/providers',
  MODELS: '/settings/models',
  GENERAL: '/settings/general',
} as const;

/**
 * 动态路由生成器
 */
export const ROUTE_PATHS = {
  chat: () => ROUTES.CHAT,

  chatDetail: (id: string) =>
    `/chat/${encodeURIComponent(id)}`,

  providers: () => ROUTES.PROVIDERS,

  models: () => ROUTES.MODELS,

  general: () => ROUTES.GENERAL,
} as const;

/**
 * 允许恢复的路由
 *
 * 不包含 HOME，因为首页会自动跳转到 CHAT。
 */
export const RESTORABLE_ROUTES = [
  ROUTES.CHAT,
  ROUTES.CHAT_DETAIL,
  ROUTES.PROVIDERS,
  ROUTES.MODELS,
  ROUTES.GENERAL,
] as const;

/**
 * 判断路由是否允许恢复
 */
export function isRestorableRoute(pathname: string): boolean {
  return RESTORABLE_ROUTES.some((route) =>
    matchPath(
      {
        path: route,
        end: true,
        caseSensitive: true,
      },
      pathname,
    ),
  );
}
