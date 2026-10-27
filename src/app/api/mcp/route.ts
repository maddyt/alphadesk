import { NextResponse } from 'next/server';
import { handleRpc } from '@/lib/mcp/jsonrpc';
import { SEC_TOOLS } from '@/lib/mcp/tools';

// SEC EDGAR MCP server (Streamable HTTP transport, stateless, JSON responses).
// Connect from Claude Code:  claude mcp add --transport http sec-edgar https://<your-app>/api/mcp

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version',
};

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, { status: 400, headers: CORS });
  }
  const batch = Array.isArray(body);
  const msgs = (batch ? body : [body]) as Parameters<typeof handleRpc>[0][];
  const out = (await Promise.all(msgs.map((m) => handleRpc(m, SEC_TOOLS)))).filter((r) => r !== null);
  if (!out.length) return new Response(null, { status: 202, headers: CORS });
  return NextResponse.json(batch ? out : out[0], { headers: CORS });
}

export function GET() {
  // No server-initiated stream: this server is stateless request/response.
  return new Response('Method Not Allowed', { status: 405, headers: { ...CORS, Allow: 'POST, OPTIONS' } });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
