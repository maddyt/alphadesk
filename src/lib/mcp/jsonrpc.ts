import { z } from 'zod';

// Minimal MCP (Model Context Protocol) server over Streamable HTTP, JSON responses only.
// Pure: the tool set is passed in, so the protocol handling is unit-testable without SEC access.

export interface McpTool {
  name: string;
  description: string;
  schema: z.ZodType;
  run: (input: never) => Promise<string>;
}

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export const SERVER_INFO = { name: 'dealpulse-sec-edgar', version: '1.0.0' };
const SUPPORTED = ['2025-06-18', '2025-03-26', '2024-11-05'];

const ok = (id: JsonRpcRequest['id'], result: unknown) => ({ jsonrpc: '2.0' as const, id: id ?? null, result });
const fail = (id: JsonRpcRequest['id'], code: number, message: string) => ({ jsonrpc: '2.0' as const, id: id ?? null, error: { code, message } });

export function toolListing(tools: readonly McpTool[]) {
  return tools.map((t) => {
    const { $schema: _drop, ...inputSchema } = z.toJSONSchema(t.schema) as Record<string, unknown>;
    return { name: t.name, description: t.description, inputSchema, annotations: { readOnlyHint: true, openWorldHint: true } };
  });
}

/** Handle one JSON-RPC message. Returns null for notifications (no response body). */
export async function handleRpc(msg: JsonRpcRequest, tools: readonly McpTool[]): Promise<object | null> {
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return fail(null, -32600, 'Invalid Request');
  const isNotification = msg.id === undefined;
  switch (msg.method) {
    case 'initialize': {
      const asked = String(msg.params?.protocolVersion ?? '');
      return ok(msg.id, {
        protocolVersion: SUPPORTED.includes(asked) ? asked : SUPPORTED[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions:
          'Read-only tools over public SEC EDGAR data: XBRL financials, filing lists, 10-K/20-F/DEF 14A sections and full-text search, governance flags, Form 4 insider trades, 13D/13G ownership and segment revenue. Cite accession numbers when quoting filings.',
      });
    }
    case 'ping':
      return isNotification ? null : ok(msg.id, {});
    case 'tools/list':
      return ok(msg.id, { tools: toolListing(tools) });
    case 'tools/call': {
      const name = String(msg.params?.name ?? '');
      const tool = tools.find((t) => t.name === name);
      if (!tool) return fail(msg.id, -32602, `Unknown tool: ${name}`);
      const parsed = tool.schema.safeParse(msg.params?.arguments ?? {});
      if (!parsed.success) return ok(msg.id, { content: [{ type: 'text', text: `Invalid arguments: ${parsed.error.message}` }], isError: true });
      try {
        const text = await tool.run(parsed.data as never);
        return ok(msg.id, { content: [{ type: 'text', text }], isError: false });
      } catch (e) {
        return ok(msg.id, { content: [{ type: 'text', text: `Tool error: ${(e as Error).message}` }], isError: true });
      }
    }
    default:
      if (isNotification) return null; // notifications/initialized, notifications/cancelled, ...
      return fail(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}
