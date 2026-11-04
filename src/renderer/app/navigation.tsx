import { ROUTES } from '@renderer/app/router/routes';

import { ChatCircleIcon } from '@phosphor-icons/react/dist/icons/ChatCircle';
import { CloudIcon } from '@phosphor-icons/react/dist/icons/Cloud';
import { GearIcon } from '@phosphor-icons/react/dist/icons/Gear';

export const NAVIGATION = [
  {
    label: '聊天',
    path: ROUTES.CHAT,
    icon: ChatCircleIcon,
  },
  {
    label: '模型供应商',
    path: ROUTES.PROVIDERS,
    icon: CloudIcon,
  },
  {
    label: '通用设置',
    path: ROUTES.GENERAL,
    icon: GearIcon,
  },
  {
    label: 'test',
    path: 'demo',
    icon: GearIcon,
  },
] as const;
