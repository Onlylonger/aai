import { createHashRouter, Navigate, RouterProvider } from 'react-router-dom';

import { Main } from '@/app/layouts/Main';

import { ROUTES } from './routes';

import { ChatPage } from '@/modules/chat/pages/ChatPage';
import { ProvidersPage } from '@/modules/models/pages/ProvidersPage';
import { ModelsPage } from '@/modules/models/pages/ModelsPage';
import { GeneralSettingsPage } from '@/modules/settings/pages/GeneralSettingsPage';

import { NotFoundPage } from '@/shared/components/NotFoundPage';

/**
 * 应用路由配置
 */
const router = createHashRouter([
  {
    path: ROUTES.HOME,
    element: <Main />,

    children: [
      // 默认首页
      {
        index: true,
        element: <Navigate to={ROUTES.CHAT} replace />,
      },

      // 聊天
      {
        path: ROUTES.CHAT,
        element: <ChatPage />,
      },
      {
        path: ROUTES.CHAT_DETAIL,
        element: <ChatPage />,
      },

      // 模型供应商
      {
        path: ROUTES.PROVIDERS,
        element: <ProvidersPage />,
      },

      // 模型管理
      {
        path: ROUTES.MODELS,
        element: <ModelsPage />,
      },

      // 通用设置
      {
        path: ROUTES.GENERAL,
        element: <GeneralSettingsPage />,
      },

      // 404
      {
        path: '*',
        element: <NotFoundPage />,
      },
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
