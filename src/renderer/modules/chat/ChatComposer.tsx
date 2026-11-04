import { useCallback, useRef, useState } from 'react';

import {
  ActionIcon,
  Box,
  Combobox,
  Group,
  Text,
  Textarea,
  useCombobox,
} from '@mantine/core';

import { AtIcon } from '@phosphor-icons/react/dist/icons/At';
import { FileTextIcon } from '@phosphor-icons/react/dist/icons/FileText';
import { DatabaseIcon } from '@phosphor-icons/react/dist/icons/Database';
import { RobotIcon } from '@phosphor-icons/react/dist/icons/Robot';
import { MagnifyingGlassIcon } from '@phosphor-icons/react/dist/icons/MagnifyingGlass';
import { CodeIcon } from '@phosphor-icons/react/dist/icons/Code';
import { PaperPlaneTiltIcon } from '@phosphor-icons/react/dist/icons/PaperPlaneTilt';

type TriggerType = '@' | '/';

interface TriggerOption {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  type: string;
}

interface TriggerMatch {
  type: TriggerType;
  query: string;
  start: number;
  end: number;
}

const triggerOptions: Record<TriggerType, TriggerOption[]> = {
  '@': [
    {
      id: 'file',
      label: '本地文件',
      description: '引用本地 PDF、Word 等文件',
      icon: <FileTextIcon size={18} />,
      type: 'file',
    },
    {
      id: 'knowledge',
      label: '知识库',
      description: '搜索你的知识库',
      icon: <DatabaseIcon size={18} />,
      type: 'knowledge',
    },
    {
      id: 'agent',
      label: 'Agent',
      description: '选择一个智能体',
      icon: <RobotIcon size={18} />,
      type: 'agent',
    },
  ],

  '/': [
    {
      id: 'search',
      label: '联网搜索',
      description: '搜索互联网内容',
      icon: <MagnifyingGlassIcon size={18} />,
      type: 'search',
    },
    {
      id: 'code',
      label: '代码执行',
      description: '执行代码任务',
      icon: <CodeIcon size={18} />,
      type: 'code',
    },
  ],
};

// 检测光标前的 @ 或 /
function getTriggerMatch(value: string, cursor: number): TriggerMatch | null {
  const text = value.slice(0, cursor);

  const match = text.match(/(?:^|\s)([@/])([^\s@/]*)$/);

  if (!match) return null;

  const trigger = match[1] as TriggerType;

  return {
    type: trigger,
    query: match[2],
    start: cursor - match[0].length + match[0].indexOf(trigger),
    end: cursor,
  };
}

export default function ChatComposer() {
  const [value, setValue] = useState('');
  const [trigger, setTrigger] = useState<TriggerMatch | null>(null);

  const [selectedType, setSelectedType] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });

  const options = trigger
    ? triggerOptions[trigger.type].filter((item) => {
        const query = trigger.query.toLowerCase();

        return (
          item.label.toLowerCase().includes(query) ||
          item.id.toLowerCase().includes(query)
        );
      })
    : [];

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextValue = event.currentTarget.value;
    const cursor = event.currentTarget.selectionStart;

    setValue(nextValue);

    const match = getTriggerMatch(nextValue, cursor);

    setTrigger(match);

    if (match) {
      combobox.openDropdown();
      combobox.updateSelectedOptionIndex('active');
    } else {
      combobox.closeDropdown();
    }
  };

  // 选择 @ 或 / 菜单项
  const handleSelect = useCallback(
    (option: TriggerOption) => {
      if (!trigger) return;

      const before = value.slice(0, trigger.start);
      const after = value.slice(trigger.end);

      const insertedText = trigger.type === '@' ? `@${option.label} ` : '';

      const nextValue = before + insertedText + after;

      const nextCursor = before.length + insertedText.length;

      setValue(nextValue);
      setSelectedType(option.type);
      setTrigger(null);

      combobox.closeDropdown();

      requestAnimationFrame(() => {
        const textarea = textareaRef.current;

        if (!textarea) return;

        textarea.focus();
        textarea.setSelectionRange(nextCursor, nextCursor);
      });

      if (trigger.type === '/') {
        handleCommand(option);
      }
    },
    [trigger, value, combobox],
  );

  // 命令处理
  const handleCommand = (option: TriggerOption) => {
    console.log('执行命令:', option.type);

    // 在这里实现联网搜索、代码执行等功能
  };

  // 键盘事件
  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;

    if (combobox.dropdownOpened) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        combobox.selectNextOption();
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        combobox.selectPreviousOption();
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        combobox.closeDropdown();
        return;
      }

      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();

        const selected = options[combobox.selectedOptionIndex];

        if (selected) {
          handleSelect(selected);
        }

        return;
      }
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  // 发送消息
  const handleSend = () => {
    if (!value.trim()) return;

    console.log({
      message: value,
      selectedType,
    });

    setValue('');
    setSelectedType(null);
    setTrigger(null);
    combobox.closeDropdown();
  };

  return (
    <Box
      pos="relative"
      style={{
        border: '1px solid var(--mantine-color-default-border)',
        borderRadius: 16,
        padding: 12,
      }}
    >
      <Combobox
        store={combobox}
        onOptionSubmit={(id) => {
          const option = options.find((item) => item.id === id);

          if (option) handleSelect(option);
        }}
        // withinPortal={false}
      >
        <Combobox.Dropdown>
          <Combobox.Options>
            {options.length > 0 ? (
              options.map((option) => (
                <Combobox.Option
                  key={option.id}
                  value={option.id}
                  active={
                    options[combobox.selectedOptionIndex]?.id === option.id
                  }
                >
                  <Group gap="sm" wrap="nowrap">
                    {option.icon}

                    <Box flex={1}>
                      <Text size="sm" fw={500}>
                        {option.label}
                      </Text>

                      <Text size="xs" c="dimmed">
                        {option.description}
                      </Text>
                    </Box>
                  </Group>
                </Combobox.Option>
              ))
            ) : (
              <Combobox.Empty>没有找到相关选项</Combobox.Empty>
            )}
          </Combobox.Options>
        </Combobox.Dropdown>
        <Combobox.Target>
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="输入消息，使用 @ 引用资源，/ 使用命令..."
            autosize
            minRows={2}
            maxRows={8}
            variant="unstyled"
            styles={{
              input: {
                padding: '8px',
                fontSize: 15,
              },
            }}
          />
        </Combobox.Target>
      </Combobox>

      <Group justify="space-between" mt="xs">
        <Text size="xs" c="dimmed">
          {selectedType ? `已选择：${selectedType}` : '@ 引用 · / 命令'}
        </Text>

        <ActionIcon
          variant="filled"
          color="blue"
          radius="md"
          onClick={handleSend}
          disabled={!value.trim()}
        >
          <PaperPlaneTiltIcon size={18} />
        </ActionIcon>
      </Group>
    </Box>
  );
}
