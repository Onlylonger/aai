import { useEffect } from 'react';

import {
  Avatar,
  Box,
  Splitter,
  Group,
  Button,
  ActionIcon,
} from '@mantine/core';

import { Outlet } from 'react-router-dom';

import { CaretRightIcon } from '@phosphor-icons/react/dist/icons/CaretRight';
import { GearIcon } from '@phosphor-icons/react/dist/icons/Gear';

import { useProviderStore } from '@renderer/modules/providers/providerStore';

import { SidebarNavigation } from './SidebarNavigation';

import classes from './Main.module.css';

export function Main() {
  // 应用启动时加载一次供应商配置（store 内部已去重）
  useEffect(() => {
    void useProviderStore.getState().load();
  }, []);

  return (
    <Splitter className={classes.layout} withHandle={false}>
      {/* 左侧 Sidebar */}
      <Splitter.Pane defaultSize="220px" min="220px" max="500px">
        <aside className={classes.sidebar}>
          {/* 导航区域 */}
          <Box className={classes.navigation}>
            <SidebarNavigation />
          </Box>

          {/* 底部用户区域 */}
          <Box className={classes.footer}>
            <Group justify="space-between" wrap="nowrap">
              <Button
                variant="subtle"
                color="gray"
                leftSection={<Avatar size="sm" radius="xl" />}
                rightSection={<CaretRightIcon size={12} />}
              >
                Name
              </Button>

              <ActionIcon variant="subtle" color="gray" aria-label="设置">
                <GearIcon size={20} />
              </ActionIcon>
            </Group>
          </Box>
        </aside>
      </Splitter.Pane>

      {/* 右侧页面区域 */}
      <Splitter.Pane defaultSize="100%">
        <main className={classes.content}>
          <Outlet />
        </main>
      </Splitter.Pane>
    </Splitter>
  );
}
