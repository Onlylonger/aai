/**
 * Agent 第一批只读工具（P2）。
 *
 * 全部限制在 WORKSPACE_ROOT 内，输出保持 JSON 可序列化，
 * 方便 AI SDK 传回模型，也方便落库 / 展示。
 */
import fs from 'node:fs/promises';
import path from 'node:path';

import { tool } from 'ai';
import { z } from 'zod';

import {
  IGNORED_DIRS,
  MAX_LIST_DEPTH,
  MAX_LIST_ENTRIES,
  MAX_READ_BYTES,
  MAX_SEARCH_FILES,
  MAX_SEARCH_FILE_BYTES,
  MAX_SEARCH_RESULTS,
  isBinaryExtension,
  resolveWorkspacePath,
  toWorkspaceRelative,
  WORKSPACE_ROOT,
} from './workspace';

interface DirectoryEntry {
  path: string;
  type: 'file' | 'directory';
  size?: number;
}

async function listEntries(
  absoluteDir: string,
  depth: number,
  out: DirectoryEntry[],
): Promise<void> {
  if (out.length >= MAX_LIST_ENTRIES) return;

  const entries = await fs.readdir(absoluteDir, { withFileTypes: true });

  for (const entry of entries) {
    if (out.length >= MAX_LIST_ENTRIES) return;

    const absolute = path.join(absoluteDir, entry.name);

    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      out.push({ path: toWorkspaceRelative(absolute), type: 'directory' });
      if (depth > 1) {
        await listEntries(absolute, depth - 1, out);
      }
    } else if (entry.isFile()) {
      const stat = await fs.stat(absolute).catch(() => null);
      out.push({
        path: toWorkspaceRelative(absolute),
        type: 'file',
        size: stat?.size,
      });
    }
  }
}

interface SearchHit {
  path: string;
  line: number;
  text: string;
}

async function searchDirectory(
  absoluteDir: string,
  needle: string,
  hits: SearchHit[],
  budget: { files: number },
  maxResults: number,
): Promise<void> {
  if (budget.files >= MAX_SEARCH_FILES || hits.length >= maxResults) return;

  const entries = await fs.readdir(absoluteDir, { withFileTypes: true });

  for (const entry of entries) {
    if (budget.files >= MAX_SEARCH_FILES || hits.length >= maxResults) return;

    const absolute = path.join(absoluteDir, entry.name);

    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      await searchDirectory(absolute, needle, hits, budget, maxResults);
      continue;
    }

    if (!entry.isFile() || isBinaryExtension(entry.name)) continue;

    budget.files += 1;

    const stat = await fs.stat(absolute).catch(() => null);
    if (!stat || stat.size > MAX_SEARCH_FILE_BYTES) continue;

    const content = await fs.readFile(absolute, 'utf8').catch(() => null);
    if (content === null || content.includes('\0')) continue;

    const lines = content.split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      if (lines[index].toLowerCase().includes(needle)) {
        hits.push({
          path: toWorkspaceRelative(absolute),
          line: index + 1,
          text: lines[index].trim().slice(0, 200),
        });
        if (hits.length >= maxResults) return;
      }
    }
  }
}

const listDirectoryTool = tool({
  description:
    'List files and directories under a relative path in the workspace. ' +
    'Skips dependency/build directories.',
  inputSchema: z.object({
    path: z
      .string()
      .optional()
      .describe('Relative directory path; defaults to the workspace root.'),
    depth: z
      .number()
      .int()
      .min(1)
      .max(MAX_LIST_DEPTH)
      .optional()
      .describe('Recursion depth, 1 = direct children only.'),
  }),
  execute: async ({ path: inputPath, depth = 1 }) => {
    const absolute = resolveWorkspacePath(inputPath);
    const entries: DirectoryEntry[] = [];
    await listEntries(absolute, depth, entries);

    return {
      root: toWorkspaceRelative(absolute),
      entries,
      truncated: entries.length >= MAX_LIST_ENTRIES,
    };
  },
});

const readFileTool = tool({
  description:
    'Read a UTF-8 text file (relative path). Large files are truncated; ' +
    'binary files are rejected.',
  inputSchema: z.object({
    path: z.string().min(1).describe('Relative file path.'),
    maxBytes: z
      .number()
      .int()
      .min(1)
      .max(MAX_READ_BYTES)
      .optional()
      .describe('Maximum bytes to read.'),
  }),
  execute: async ({ path: inputPath, maxBytes }) => {
    const absolute = resolveWorkspacePath(inputPath);
    const stat = await fs.stat(absolute);

    if (!stat.isFile()) {
      throw new Error(`Not a file: ${inputPath}`);
    }

    const limit = Math.min(maxBytes ?? MAX_READ_BYTES, MAX_READ_BYTES);
    const length = Math.min(stat.size, limit);
    const buffer = Buffer.alloc(length);

    const handle = await fs.open(absolute, 'r');
    try {
      await handle.read(buffer, 0, length, 0);
    } finally {
      await handle.close();
    }

    const content = buffer.toString('utf8');
    if (content.includes('\0')) {
      throw new Error(`Binary file is not readable: ${inputPath}`);
    }

    return {
      path: toWorkspaceRelative(absolute),
      size: stat.size,
      truncated: stat.size > length,
      content,
    };
  },
});

const searchTextTool = tool({
  description:
    'Search for a text query (case-insensitive) across text files in the ' +
    'workspace. Returns matching files and lines. Skips binary files and ' +
    'dependency/build directories.',
  inputSchema: z.object({
    query: z.string().min(1).max(200).describe('Text to search for.'),
    path: z
      .string()
      .optional()
      .describe('Relative directory to search in; defaults to workspace root.'),
    maxResults: z
      .number()
      .int()
      .min(1)
      .max(MAX_SEARCH_RESULTS)
      .optional()
      .describe('Maximum number of matches to return.'),
  }),
  execute: async ({ query, path: inputPath, maxResults }) => {
    const absolute = resolveWorkspacePath(inputPath);
    const limit = maxResults ?? MAX_SEARCH_RESULTS;
    const hits: SearchHit[] = [];
    const budget = { files: 0 };

    await searchDirectory(absolute, query.toLowerCase(), hits, budget, limit);

    return {
      query,
      root: toWorkspaceRelative(absolute),
      results: hits,
      filesScanned: budget.files,
      truncated: hits.length >= limit || budget.files >= MAX_SEARCH_FILES,
    };
  },
});

export const agentTools = {
  list_directory: listDirectoryTool,
  read_file: readFileTool,
  search_text: searchTextTool,
};

export { WORKSPACE_ROOT };
