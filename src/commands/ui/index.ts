import { readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { openBrowser } from '../../utils/open.js';
import { VERSION } from '../../utils/version.js';

interface CommandNode {
  name: string;
  fullCommand: string;
  description: string;
  args: {
    name: string;
    required: boolean;
    description: string;
    type?: string;
    enum?: string[];
  }[];
  options: {
    flags: string;
    /** The canonical flag to pass on the command line (e.g. `--output`, `-n`). */
    flag: string;
    description: string;
    defaultValue?: string;
    type?: string;
    enum?: string[];
  }[];
  subcommands: CommandNode[];
  interactive: boolean;
}

/** Recursively extract the Commander command tree. */
function extractCommands(cmd: Command, parentPath = ''): CommandNode[] {
  return cmd.commands
    .filter((c: Command) => c.name() !== 'ui')
    .map((c: Command) => {
      const fullCommand = parentPath ? `${parentPath} ${c.name()}` : c.name();
      const cmdArgs =
        (
          c as unknown as {
            _args: { _name: string; required: boolean; description: string }[];
          }
        )._args ?? [];
      const meta = (
        c as unknown as {
          _meta?: {
            args?: Record<string, { type?: string; enum?: string[] }>;
            options?: Record<string, { type?: string; enum?: string[] }>;
          };
        }
      )._meta;

      const options = c.options
        .filter((o: { hidden?: boolean }) => !o.hidden)
        .filter(
          (o: { long?: string }) =>
            o.long !== '--help' && o.long !== '--version',
        )
        .map(
          (o: {
            flags: string;
            description: string;
            defaultValue?: unknown;
            long?: string;
            short?: string;
            argChoices?: string[];
          }) => {
            const optKey = o.long ?? o.flags;
            const optMeta = meta?.options?.[optKey];
            // commander stores `.choices()` values on `argChoices`;
            // merge them into `enum` so the UI renders a <select>.
            const enumValues = optMeta?.enum ?? o.argChoices;
            const flag = o.long ?? o.short ?? '';
            return {
              flags: o.flags,
              flag,
              description: o.description,
              defaultValue:
                o.defaultValue !== undefined ? String(o.defaultValue) : undefined,
              type: optMeta?.type,
              enum: enumValues,
            };
          },
        );

      return {
        name: c.name(),
        fullCommand,
        description: c.description(),
        args: cmdArgs.map(
          (a: { _name: string; required: boolean; description: string }) => {
            const argMeta = meta?.args?.[a._name];
            return {
              name: a._name,
              required: a.required,
              description: a.description,
              type: argMeta?.type,
              enum: argMeta?.enum,
            };
          },
        ),
        options,
        subcommands: extractCommands(c, fullCommand),
        interactive: !!(c as unknown as { _uiInteractive?: boolean })
          ._uiInteractive,
      };
    });
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

/** Spawn the CLI as a child process with stdin closed. */
function execCommand(
  args: string[],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const here = dirname(fileURLToPath(import.meta.url));
  const cliPath = resolve(here, 'index.js');

  return new Promise((resolve) => {
    const proc = execFile(
      'node',
      [cliPath, ...args],
      {
        timeout: 120_000,
        env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
      },
      (err, stdout, stderr) => {
        resolve({
          stdout: stripAnsi(stdout ?? ''),
          stderr: stripAnsi(stderr ?? ''),
          exitCode:
            err && 'code' in err ? (err as { code: number }).code : err ? 1 : 0,
        });
      },
    );
    proc.stdin?.end();
  });
}

function stripAnsi(str: string): string {
  return str.replace(
    /\x1b\[[0-9;]*[a-zA-Z]|\x1b\][^\x07]*\x07|\x1b\[\?[0-9;]*[a-zA-Z]/g,
    '',
  );
}

function jsonResponse(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}

function htmlResponse(res: ServerResponse, html: string): void {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

/**
 * Load `template.html` and substitute `__VERSION__`.
 *
 * The template sits next to this file in both layouts:
 *   - dev:  src/commands/ui/template.html
 *   - prod: dist/template.html (copied by tsup.config.ts)
 * so `resolve(here, 'template.html')` works uniformly.
 */
function loadHtml(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const tpl = readFileSync(resolve(here, 'template.html'), 'utf-8');
  return tpl.replace(/__VERSION__/g, VERSION);
}

export default function (program: Command): void {
  program
    .command('ui')
    .description('Launch the Web UI')
    .option('-p, --port <port>', 'Port to listen on')
    .option('--no-open', 'Do not open the browser automatically')
    .action(async (opts: { port?: string; open?: boolean }) => {
      const port = opts.port ? Number(opts.port) : 0;
      const shouldOpen = opts.open !== false;
      const commandTree = extractCommands(program);
      const html = loadHtml();

      const server = createServer(
        async (req: IncomingMessage, res: ServerResponse) => {
          const url = new URL(req.url ?? '/', `http://127.0.0.1`);

          if (req.method === 'OPTIONS') {
            res.writeHead(204, {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type',
            });
            res.end();
            return;
          }

          if (url.pathname === '/' && req.method === 'GET') {
            htmlResponse(res, html);
          } else if (url.pathname === '/api/commands' && req.method === 'GET') {
            jsonResponse(res, commandTree);
          } else if (url.pathname === '/api/exec' && req.method === 'POST') {
            try {
              const body = JSON.parse(await readBody(req));
              const args: string[] = body.args ?? [];

              const result = await execCommand(args);
              jsonResponse(res, result);
            } catch (err) {
              jsonResponse(res, { error: String(err) }, 400);
            }
          } else {
            res.writeHead(404);
            res.end('Not Found');
          }
        },
      );

      server.listen(port, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          const url = `http://127.0.0.1:${addr.port}`;
          console.log(`Web UI started: ${url}`);
          console.log('Press Ctrl+C to exit\n');
          if (shouldOpen) {
            openBrowser(url).catch(() => {
              console.log(
                `Could not open browser automatically. Visit ${url} manually.`,
              );
            });
          }
        }
      });
    });
}
