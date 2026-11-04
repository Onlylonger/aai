import { ROUTES, isRestorableRoute } from './routes';

const LAST_ROUTE_KEY = 'last-route';

/**
 * 恢复上一次访问的路由
 */
export function restoreLastRoute() {
  const currentHash = window.location.hash;

  // 已经存在有效路由时，不覆盖
  if (currentHash && currentHash !== '#' && currentHash !== '#/') {
    return;
  }

  const lastRoute = localStorage.getItem(LAST_ROUTE_KEY);

  if (lastRoute && isRestorableRoute(lastRoute)) {
    window.location.hash = `#${lastRoute}`;
    return;
  }

  window.location.hash = `#${ROUTES.CHAT}`;
}
