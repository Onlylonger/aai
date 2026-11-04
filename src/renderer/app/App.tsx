import '@mantine/core/styles.css';
import { MantineProvider } from '@mantine/core';
import { theme } from './theme';
import { AppRouter } from './router';

// /chat 聊天列表
// /chat/:id? 历史聊天页面
// /settings/providers 供应商列表页
// /settings/general 模型列表页（本地还是云端模型）
//
export default function App() {
  return (
    <MantineProvider theme={theme}>
      <AppRouter />
    </MantineProvider>
  );
}
