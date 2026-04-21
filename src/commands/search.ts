import { loadConfig } from '../utils/config.js';
import { webSearch } from '../utils/api.js';

export interface SearchCommandOptions {
  debug?: boolean;
}

/**
 * Implementation of `minimax search <query>`.
 *
 * Calls the MiniMax coding-plan web_search endpoint (the same one the
 * official `minimax-coding-plan-mcp` package exposes as an MCP tool) and
 * prints the raw JSON response to stdout.
 *
 * The server accepts a single field `q`; per the tool doc, good queries
 * are 3-5 keywords and should include a year for time-sensitive topics.
 */
export async function runSearch(
  query: string,
  opts: SearchCommandOptions,
): Promise<void> {
  const config = await loadConfig();
  if (!config.region || !config.token) {
    throw new Error(
      'Config is incomplete. Run `minimax init` first to set region / token.',
    );
  }

  if (!query || query.trim() === '') {
    throw new Error('query must not be empty');
  }

  const result = await webSearch({
    region: config.region,
    token: config.token,
    query: query.trim(),
    debug: opts.debug === true,
  });

  // Raw JSON, as requested.
  console.log(JSON.stringify(result, null, 2));
}
