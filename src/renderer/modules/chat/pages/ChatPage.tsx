import { useState } from 'react';

import { Box, Paper, ScrollArea, Stack, Text } from '@mantine/core';

import { ChatComposer } from '../components/composer/ChatComposer';

import type { ChatMessagePayload } from '../components/composer/types/message';

interface Message {
  id: string;
  text: string;
  role: 'user' | 'assistant';
}

export function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);

  const handleSend = (payload: ChatMessagePayload) => {
    console.log('Message Payload:', payload);

    console.log('附件元数据:', payload.attachments);

    console.log('本地文件对象:', payload.files);

    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        text: payload.text,
        role: 'user',
      },
    ]);
  };

  return (
    <Box
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
      }}
    >
      {/* 消息列表：占据剩余空间 */}
      <ScrollArea
        style={{
          flex: 1,
          minHeight: 0,
        }}
        p="md"
      >
        <Stack gap="md">
          {messages.map((message) => (
            <Box
              key={message.id}
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
              }}
            >
              <Paper
                p="sm"
                radius="lg"
                bg="var(--mantine-color-blue-light)"
                maw="80%"
              >
                <Text size="sm">{message.text}</Text>
              </Paper>
            </Box>
          ))}
        </Stack>
      </ScrollArea>

      {/* 输入框：始终固定在底部 */}
      <ChatComposer onSend={handleSend} />
    </Box>
  );
}
