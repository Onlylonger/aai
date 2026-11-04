import { Box } from '@mantine/core';

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
        Show Content
      </Box>
      <Box
        style={{
          height: '150px',
          flexShrink: 0,
        }}
      >
        Input Content
      </Box>
    </Box>
  );
}
