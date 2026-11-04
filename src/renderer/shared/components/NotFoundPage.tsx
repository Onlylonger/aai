import { Button, Center, Stack, Text, Title, ThemeIcon } from '@mantine/core';

import { useNavigate } from 'react-router-dom';

import { WarningCircleIcon } from '@phosphor-icons/react/dist/csr/WarningCircle';
import { HouseIcon } from '@phosphor-icons/react/dist/csr/House';
import { ROUTES } from '@/app/router/routes';

export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <Center h="100%">
      <Stack align="center" gap="md">
        <ThemeIcon size={72} radius="xl" variant="light" color="gray">
          <WarningCircleIcon size={38} />
        </ThemeIcon>

        <Title order={1} size={48}>
          404
        </Title>

        <Title order={3} fw={500}>
          页面不存在
        </Title>

        <Text c="dimmed" size="sm">
          抱歉，你访问的页面不存在或已被移除。
        </Text>

        <Button
          leftSection={<HouseIcon size={18} />}
          onClick={() => navigate(ROUTES.CHAT, { replace: true })}
        >
          返回首页
        </Button>
      </Stack>
    </Center>
  );
}
