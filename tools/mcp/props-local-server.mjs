import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, '..', '..');
const openVikingBaseUrl = String(process.env.OPENVIKING_BASE_URL || '')
  .trim()
  .replace(/\/+$/, '');
const openVikingApiKey = String(process.env.OPENVIKING_API_KEY || '').trim();
const openVikingTimeoutMs = Number.parseInt(String(process.env.OPENVIKING_TIMEOUT_MS || '12000'), 10);

const rootDocFiles = new Set(['README.md', 'testusers.local.md']);
const allowedDocPrefixes = ['docs/', 'supabase/migrations/'];

function normalizeRelativePath(value) {
  return String(value || '').replaceAll('\\', '/').replace(/^\.\//, '').trim();
}

function isAllowedDocPath(relativePath) {
  if (rootDocFiles.has(relativePath)) {
    return true;
  }

  return allowedDocPrefixes.some((prefix) => relativePath.startsWith(prefix));
}

function safeWorkspacePath(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  const absolutePath = path.resolve(workspaceRoot, normalized);

  if (!absolutePath.startsWith(workspaceRoot)) {
    throw new Error('Path escapes the workspace.');
  }

  if (!isAllowedDocPath(normalized)) {
    throw new Error('Path is not in the allowed MCP doc scope.');
  }

  return { normalized, absolutePath };
}

async function walkFiles(relativeDir) {
  const absoluteDir = path.join(workspaceRoot, relativeDir);
  const entries = await readdir(absoluteDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryRelativePath = normalizeRelativePath(path.posix.join(relativeDir, entry.name));
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(entryRelativePath)));
      continue;
    }

    files.push(entryRelativePath);
  }

  return files;
}

async function loadPackageJson() {
  const raw = await readFile(path.join(workspaceRoot, 'package.json'), 'utf8');
  return JSON.parse(raw);
}

function toTextResult(text) {
  return {
    content: [
      {
        type: 'text',
        text,
      },
    ],
  };
}

function clipText(value, maxChars = 12000) {
  if (typeof value !== 'string') {
    return '';
  }

  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars)}\n\n[truncated]`;
}

function safeTimeoutMs() {
  if (!Number.isFinite(openVikingTimeoutMs) || openVikingTimeoutMs <= 0) {
    return 12000;
  }

  return openVikingTimeoutMs;
}

async function openVikingRequest({ method = 'GET', endpoint, queryParams, body }) {
  if (!openVikingBaseUrl) {
    throw new Error('OpenViking is not configured. Set OPENVIKING_BASE_URL.');
  }

  const normalizedEndpoint = String(endpoint || '').replace(/^\/+/, '');
  const url = new URL(`${openVikingBaseUrl}/${normalizedEndpoint}`);

  if (queryParams && typeof queryParams === 'object') {
    for (const [key, value] of Object.entries(queryParams)) {
      if (value === undefined || value === null || value === '') {
        continue;
      }

      url.searchParams.set(key, String(value));
    }
  }

  const headers = {};
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (openVikingApiKey) {
    headers['X-API-Key'] = openVikingApiKey;
  }

  const timeoutHandleMs = safeTimeoutMs();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutHandleMs);

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const rawText = await response.text();
    let parsed;
    try {
      parsed = rawText ? JSON.parse(rawText) : null;
    } catch {
      parsed = null;
    }

    if (!response.ok) {
      const detail = parsed ? JSON.stringify(parsed) : rawText;
      throw new Error(`OpenViking ${response.status}: ${clipText(detail, 4000)}`);
    }

    return {
      status: response.status,
      data: parsed,
      rawText,
    };
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`OpenViking request timed out after ${timeoutHandleMs}ms.`);
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

const server = new McpServer(
  {
    name: 'props-local',
    version: '1.0.0',
  },
  {
    capabilities: {
      logging: {},
    },
  }
);

server.registerTool(
  'project_summary',
  {
    title: 'Project Summary',
    description: 'Return a compact overview of the Props workspace, stack, and useful commands.',
  },
  async () => {
    const packageJson = await loadPackageJson();
    const scripts = Object.keys(packageJson.scripts || {});
    const smokeScripts = scripts.filter((scriptName) => scriptName.startsWith('smoke:'));

    const summary = [
      `Project: ${packageJson.name}`,
      `Version: ${packageJson.version}`,
      'Stack: Expo, React Native, React, Supabase',
      '',
      'Useful scripts:',
      ...scripts.map((scriptName) => `- npm run ${scriptName}`),
      '',
      'Low-load smoke commands:',
      ...smokeScripts.map((scriptName) => `- npm run ${scriptName}`),
      '',
      'Local MCP server:',
      '- Runs via stdio on this machine',
      '- No external paid service required',
      '- Configured through .vscode/mcp.json',
      openVikingBaseUrl
        ? `- OpenViking bridge: enabled (${openVikingBaseUrl})`
        : '- OpenViking bridge: disabled (set OPENVIKING_BASE_URL to enable)',
    ].join('\n');

    return toTextResult(summary);
  }
);

server.registerTool(
  'list_smoke_commands',
  {
    title: 'List Smoke Commands',
    description: 'List the existing smoke test commands with a note about low backend load.',
  },
  async () => {
    const packageJson = await loadPackageJson();
    const smokeScripts = Object.entries(packageJson.scripts || {})
      .filter(([scriptName]) => scriptName.startsWith('smoke:'))
      .map(([scriptName, command]) => `- ${scriptName}: ${command}`);

    const text = [
      'Smoke commands in this workspace:',
      ...smokeScripts,
      '',
      'Note:',
      '- These tests are intentionally small and intended to keep Supabase free-tier load low.',
    ].join('\n');

    return toTextResult(text);
  }
);

server.registerTool(
  'list_repo_docs',
  {
    title: 'List Repo Docs',
    description: 'List the docs and SQL migration files that this MCP server is allowed to read.',
  },
  async () => {
    const docFiles = [
      ...Array.from(rootDocFiles),
      ...(await walkFiles('docs')),
      ...(await walkFiles('supabase/migrations')),
    ].sort();

    return toTextResult(docFiles.map((filePath) => `- ${filePath}`).join('\n'));
  }
);

server.registerTool(
  'read_repo_doc',
  {
    title: 'Read Repo Doc',
    description: 'Read one allowed documentation or migration file from this workspace.',
    inputSchema: z.object({
      relativePath: z
        .string()
        .min(1)
        .describe('Workspace-relative path. Allowed: README.md, testusers.local.md, docs/**, supabase/migrations/**'),
      maxChars: z
        .number()
        .int()
        .min(200)
        .max(12000)
        .optional()
        .describe('Optional response limit. Default: 4000'),
    }),
  },
  async ({ relativePath, maxChars = 4000 }) => {
    const { normalized, absolutePath } = safeWorkspacePath(relativePath);
    const raw = await readFile(absolutePath, 'utf8');
    const clipped = raw.length > maxChars ? `${raw.slice(0, maxChars)}\n\n[truncated]` : raw;

    return toTextResult(`# ${normalized}\n\n${clipped}`);
  }
);

if (openVikingBaseUrl) {
  server.registerTool(
    'openviking_search',
    {
      title: 'OpenViking Search',
      description: 'Search indexed resources through OpenViking. Optional tool enabled by OPENVIKING_BASE_URL.',
      inputSchema: z.object({
        query: z.string().min(1).describe('Natural language query to search in indexed resources.'),
        mode: z.enum(['find', 'search']).optional().describe('find=stateless retrieval, search=session-style retrieval.'),
        maxResults: z.number().int().min(1).max(20).optional().describe('Result limit. Default: 6'),
        targetUri: z.string().min(1).optional().describe('Optional URI scope filter.'),
      }),
    },
    async ({ query, mode = 'find', maxResults = 6, targetUri }) => {
      const endpoint = mode === 'search' ? '/api/v1/search/search' : '/api/v1/search/find';
      const payload = {
        query,
        limit: maxResults,
      };

      if (targetUri) {
        payload.target_uri = targetUri;
      }

      const response = await openVikingRequest({
        method: 'POST',
        endpoint,
        body: payload,
      });

      const resultText = response.data
        ? JSON.stringify(response.data, null, 2)
        : response.rawText || 'No data returned.';

      return toTextResult(clipText(resultText));
    }
  );

  server.registerTool(
    'openviking_read',
    {
      title: 'OpenViking Read',
      description: 'Read indexed content through OpenViking by URI. Optional tool enabled by OPENVIKING_BASE_URL.',
      inputSchema: z
        .object({
          uri: z.string().min(1).describe('OpenViking URI to read from (for example viking://...).'),
          startLine: z.number().int().min(1).optional().describe('Optional start line (1-based).'),
          endLine: z.number().int().min(1).optional().describe('Optional end line (1-based).'),
        })
        .refine((input) => !input.endLine || !input.startLine || input.endLine >= input.startLine, {
          message: 'endLine must be greater than or equal to startLine',
          path: ['endLine'],
        }),
    },
    async ({ uri, startLine, endLine }) => {
      const queryParams = {
        uri,
        start_line: startLine,
        end_line: endLine,
      };

      const response = await openVikingRequest({
        method: 'GET',
        endpoint: '/api/v1/content/read',
        queryParams,
      });

      const resultText = response.data
        ? JSON.stringify(response.data, null, 2)
        : response.rawText || 'No data returned.';

      return toTextResult(clipText(resultText));
    }
  );
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Props local MCP server running on stdio');
}

async function shutdown() {
  await server.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main().catch((error) => {
  console.error('Props local MCP server failed to start:', error);
  process.exit(1);
});