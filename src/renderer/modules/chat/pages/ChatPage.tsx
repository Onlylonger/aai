import { useEffect, useRef } from 'react';

import {
  Alert,
  Box,
  Center,
  Paper,
  ScrollArea,
  Stack,
  Text,
} from '@mantine/core';

import { ChatComposer } from '../components/composer/ChatComposer';
import { ModelSelect } from '../components/ModelSelect';
import { subscribeRunEvents, useChatStore } from '../store/chatStore';

import type { ChatMessagePayload } from '../components/composer/types/message';
import type { ChatMessage } from '@shared/chat';

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const waiting =
    message.status === 'streaming' && !message.text && !message.reasoning;

  return (
    <Box
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
      }}
    >
      <Paper
        p="sm"
        radius="lg"
        maw="80%"
        bg={
          isUser
            ? 'var(--mantine-color-blue-light)'
            : 'var(--mantine-color-gray-light)'
        }
      >
        {message.reasoning && (
          <Text size="xs" c="dimmed" mb={6} style={{ whiteSpace: 'pre-wrap' }}>
            {message.reasoning}
          </Text>
        )}

        <Text
          size="sm"
          style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
        >
          {waiting ? '思考中…' : message.text}
        </Text>

        {message.status === 'error' && (
          <Text size="xs" c="red" mt={4}>
            出错了：{message.error}
          </Text>
        )}
        {message.status === 'aborted' && (
          <Text size="xs" c="dimmed" mt={4}>
            已停止
          </Text>
        )}
      </Paper>
    </Box>
  );
}

export function ChatPage() {
  const messages = useChatStore((s) => s.messages);
  const model = useChatStore((s) => s.model);
  const running = useChatStore((s) => Boolean(s.activeRunId));
  const sendError = useChatStore((s) => s.sendError);
  const setModel = useChatStore((s) => s.setModel);
  const send = useChatStore((s) => s.send);
  const abort = useChatStore((s) => s.abort);

  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    subscribeRunEvents();
  }, []);

  // 新内容到达时滚动到底部
  const lastText = messages[messages.length - 1]?.text;
  useEffect(() => {
    const el = viewportRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight });
  }, [messages.length, lastText]);

  const handleSend = (payload: ChatMessagePayload) => {
    // TODO: 附件（payload.files）在下一阶段接入多模态时处理
    void send(payload.text);
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
      <ScrollArea
        style={{ flex: 1, minHeight: 0 }}
        p="md"
        viewportRef={viewportRef}
      >
        {messages.length === 0 ? (
          <Center h={300}>
            <Text c="dimmed">有什么可以帮你的？</Text>
          </Center>
        ) : (
          <Stack gap="md">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
          </Stack>
        )}
      </ScrollArea>

      {sendError && (
        <Alert color="red" mx="md" mb="xs" py={6}>
          {sendError}
        </Alert>
      )}

      <ChatComposer
        onSend={handleSend}
        running={running}
        onStop={() => void abort()}
        toolbarLeft={
          <ModelSelect value={model} onChange={setModel} disabled={running} />
        }
      />
    </Box>
  );
}
