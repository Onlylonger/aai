import { Box, Textarea } from '@mantine/core';

export function Chat() {
  return (
    <Box
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      <Box
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
        }}
      >
        Show Content Lorem ipsum dolor, sit amet consectetur adipisicing elit.
        Veniam nulla quos repellat ullam explicabo nesciunt laborum, quibusdam
        quisquam voluptatem adipisci. Reiciendis, blanditiis rem. Iusto
        consequatur harum voluptatum voluptates facere obcaecati! Lorem ipsum
        dolor, sit amet consectetur adipisicing elit. Veniam nulla quos repellat
        ullam explicabo nesciunt laborum, quibusdam quisquam voluptatem
        adipisci. Reiciendis, blanditiis rem. Iusto consequatur harum voluptatum
        voluptates facere obcaecati! Lorem ipsum dolor, sit amet consectetur
        adipisicing elit. Veniam nulla quos repellat ullam explicabo nesciunt
        laborum, quibusdam quisquam voluptatem adipisci. Reiciendis, blanditiis
        rem. Iusto consequatur harum voluptatum voluptates facere obcaecati!
        Lorem ipsum dolor, sit amet consectetur adipisicing elit. Veniam nulla
        quos repellat ullam explicabo nesciunt laborum, quibusdam quisquam
      </Box>
      <Box
        style={{
          minHeight: '150px',
          maxHeight: '360px',
          flexShrink: 0,
          borderTop: '1px solid var(--mantine-color-gray-3)',
          display: 'flex',
          flexDirection: 'column',
          padding: '4px 10px',
        }}
      >
        <Box style={{ flexShrink: 0 }}>Attacnments block</Box>
        <Box style={{ flexShrink: 0 }}>Input Content</Box>
        <Box
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'auto',
          }}
        >
          <Textarea
            autosize
            minRows={2}
            placeholder="给 AI 发送消息..."
            variant="unstyled"
          />
        </Box>
        <Box style={{ flexShrink: 0 }}>Action Block</Box>
      </Box>
    </Box>
  );
}
