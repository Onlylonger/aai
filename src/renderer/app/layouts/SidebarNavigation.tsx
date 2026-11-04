import { NavLink } from '@mantine/core';
import { NavLink as RouterNavLink, useLocation } from 'react-router-dom';

import { NAVIGATION } from '@renderer/app/navigation';

export function SidebarNavigation() {
  const location = useLocation();

  return (
    <>
      {NAVIGATION.map((item) => {
        const active =
          item.path === '/chat'
            ? location.pathname.startsWith('/chat')
            : location.pathname.startsWith(item.path);

        return (
          <NavLink
            key={item.path}
            component={RouterNavLink}
            to={item.path}
            label={item.label}
            leftSection={<item.icon size={18} />}
            active={active}
          />
        );
      })}
    </>
  );
}
