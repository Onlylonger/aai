import { ROUTES } from '@/app/router/routes';

import { ChatCircleIcon } from '@phosphor-icons/react/dist/icons/ChatCircle';
import { CloudIcon } from '@phosphor-icons/react/dist/icons/Cloud';
import { BrainIcon } from '@phosphor-icons/react/dist/icons/Brain';
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
    label: '模型管理',
    path: ROUTES.MODELS,
    icon: BrainIcon,
  },
  {
    label: '通用设置',
    path: ROUTES.GENERAL,
    icon: GearIcon,
  },
] as const;
