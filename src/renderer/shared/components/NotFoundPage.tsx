import { Button } from '@mantine/core';
import { useNavigate } from 'react-router-dom';

import { HouseIcon } from '@phosphor-icons/react/dist/icons/House';

import { ROUTES } from '@/app/router/routes';

export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <Button
      leftSection={<HouseIcon size={18} />}
      onClick={() => navigate(ROUTES.CHAT, { replace: true })}
    >
      返回首页
    </Button>
  );
}
