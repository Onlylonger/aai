import {
  Avatar,
  Box,
  NavLink,
  Splitter,
  Group,
  Button,
  ActionIcon,
} from '@mantine/core';
import { CaretRightIcon } from '@phosphor-icons/react/dist/icons/CaretRight';
import { FingerprintIcon } from '@phosphor-icons/react/dist/icons/Fingerprint';
import { GaugeIcon } from '@phosphor-icons/react/dist/icons/Gauge';
import { GearIcon } from '@phosphor-icons/react/dist/icons/Gear';
import { Chat } from './Chat';

export function Main() {
  return (
    <div>
      <Splitter h="100vh" withHandle={false}>
        <Splitter.Pane
          defaultSize="220px"
          min="220px"
          max="500px"
          bg="var(--mantine-color-gray-1)"
          style={{ position: 'relative' }}
        >
          <Box style={{ padding: '5px' }}>
            <NavLink
              href="#required-for-focus"
              label="First parent link"
              leftSection={<GaugeIcon size={16} />}
              childrenOffset={28}
            >
              <NavLink href="#required-for-focus" label="First child link" />
              <NavLink label="Second child link" href="#required-for-focus" />
              <NavLink
                label="Nested parent link"
                childrenOffset={28}
                href="#required-for-focus"
              >
                <NavLink label="First child link" href="#required-for-focus" />
                <NavLink label="Second child link" href="#required-for-focus" />
                <NavLink label="Third child link" href="#required-for-focus" />
              </NavLink>
            </NavLink>

            <NavLink
              href="#required-for-focus"
              label="Second parent link"
              leftSection={<FingerprintIcon size={16} />}
              childrenOffset={28}
              defaultOpened
            >
              <NavLink label="First child link" href="#required-for-focus" />
              <NavLink label="Second child link" href="#required-for-focus" />
              <NavLink label="Third child link" href="#required-for-focus" />
            </NavLink>
          </Box>
          <Box
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              width: '100%',
              borderTop: '1px solid var(--mantine-color-gray-4)',
              padding: '4px 10px',
            }}
          >
            <Group justify="space-between">
              <Button
                variant="subtle"
                leftSection={<Avatar size="sm" radius="xl" />}
                rightSection={
                  <CaretRightIcon
                    size={12}
                    color="var(--mantine-color-gray-5)"
                  />
                }
              >
                Name
              </Button>

              <ActionIcon variant="subtle" aria-label="Settings">
                <GearIcon size={20} />
              </ActionIcon>
            </Group>
          </Box>
        </Splitter.Pane>
        <Splitter.Pane defaultSize="100%">
          <Chat />
        </Splitter.Pane>
      </Splitter>
    </div>
  );
}
