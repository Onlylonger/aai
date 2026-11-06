import '@mantine/core/styles.css';
import { MantineProvider } from '@mantine/core';
import { theme } from './theme';
import { AppRouter } from './router';

// /chat 聊天
// /chat/:id 历史会话
// /settings/providers 模型供应商
// /settings/general 通用设置
//
export default function App() {
  return (
    <MantineProvider theme={theme}>
      <AppRouter />
    </MantineProvider>
  );
}
