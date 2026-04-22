import type { Region } from '../../utils/config.js';
import { getBaseUrl, postJson } from '../../utils/http.js';

/**
 * Call the MiniMax coding-plan web search endpoint.
 * Mirrors what the official MCP server (`minimax-coding-plan-mcp`) does:
 * POST /v1/coding_plan/search with `{ q }` and the `MM-API-Source` header.
 * Returns the raw JSON response as-is so the caller can pretty-print it.
 */
export async function webSearch(opts: {
  region: Region;
  token: string;
  query: string;
  debug?: boolean;
}): Promise<unknown> {
  const { region, token, query, debug } = opts;
  return await postJson<unknown>({
    url: `${getBaseUrl(region)}/v1/coding_plan/search`,
    token,
    body: { q: query },
    headers: { 'MM-API-Source': 'Minimax-MCP' },
    debug,
  });
}
