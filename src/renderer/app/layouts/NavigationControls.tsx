import { ActionIcon, Group, Tooltip } from '@mantine/core';
import { useNavigate } from 'react-router-dom';

import { ArrowLeftIcon } from '@phosphor-icons/react/dist/csr/ArrowLeft';
import { ArrowRightIcon } from '@phosphor-icons/react/dist/csr/ArrowRight';

export function NavigationControls() {
  const navigate = useNavigate();

  return (
    <Group gap={4}>
      <Tooltip label="后退">
        <ActionIcon
          variant="subtle"
          color="gray"
          size="lg"
          aria-label="后退"
          onClick={() => navigate(-1)}
        >
          <ArrowLeftIcon size={18} />
        </ActionIcon>
      </Tooltip>

      <Tooltip label="前进">
        <ActionIcon
          variant="subtle"
          color="gray"
          size="lg"
          aria-label="前进"
          onClick={() => navigate(1)}
        >
          <ArrowRightIcon size={18} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}
