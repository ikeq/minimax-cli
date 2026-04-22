import { Command } from 'commander';
import { showHelpOnError } from '../../utils/command.js';
import { loadConfig } from '../../utils/config.js';
import { webSearch } from './api.js';

interface SearchCommandOptions {
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
async function runSearch(
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

  console.log(JSON.stringify(result, null, 2));
}

export default function (program: Command): void {
  const cmd = program
    .command('search')
    .description('Web search via the coding-plan endpoint')
    .argument('<query>', 'Search query; 3-5 keywords work best (Required)')
    .option('--debug', 'Print HTTP request/response for debugging')
    .action(async (query: string, opts) => {
      try {
        await runSearch(query, { debug: opts.debug });
      } catch (err) {
        console.error(
          'Search failed:',
          err instanceof Error ? err.message : err,
        );
        process.exit(1);
      }
    });

  showHelpOnError(cmd);
}
