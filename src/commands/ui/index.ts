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

const HTML_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>MiniMax CLI</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    .cmd-item.active { background: #eff6ff; border-color: #3b82f6; }
    pre.result { white-space: pre-wrap; word-break: break-all; }
  </style>
</head>
<body class="bg-gray-50 text-gray-900 h-screen flex flex-col">
  <!-- Header -->
  <header class="bg-white border-b px-6 py-3 flex items-center justify-between shrink-0">
    <h1 class="text-lg font-semibold">MiniMax CLI</h1>
    <span class="text-sm text-gray-400" id="status"></span>
  </header>

  <div class="flex flex-1 overflow-hidden">
    <!-- Sidebar -->
    <aside class="w-72 border-r bg-white overflow-y-auto shrink-0 p-4" id="sidebar">
      <div class="text-xs text-gray-400 uppercase tracking-wide mb-3">Commands</div>
      <div id="command-tree"></div>
    </aside>

    <!-- Main -->
    <main class="flex-1 overflow-y-auto">
      <!-- Form -->
      <div id="form-panel" class="p-6 border-b bg-white">
        <div class="text-gray-400 text-sm">Select a command on the left to start</div>
      </div>

      <!-- Result -->
      <div class="p-6">
        <div id="result-panel"></div>
      </div>
    </main>
  </div>

  <script>
    let commands = []
    let selectedCmd = null

    async function init() {
      const res = await fetch('/api/commands')
      commands = await res.json()
      renderTree(commands, document.getElementById('command-tree'), 0)
    }

    function renderTree(nodes, container, depth) {
      nodes.forEach(cmd => {
        if (cmd.subcommands.length > 0) {
          // Group with children
          const group = document.createElement('div')
          group.className = 'mb-1'

          const label = document.createElement('div')
          label.className = 'text-xs font-medium text-gray-500 uppercase tracking-wide py-1 cursor-pointer flex items-center gap-1'
          label.style.paddingLeft = (depth * 12) + 'px'
          label.innerHTML = '<svg class="w-3 h-3 transition-transform" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"/></svg>' + cmd.name

          const children = document.createElement('div')
          children.className = 'ml-0'

          label.addEventListener('click', () => {
            children.classList.toggle('hidden')
            label.querySelector('svg').style.transform = children.classList.contains('hidden') ? '' : 'rotate(90deg)'
          })

          // Auto expand
          label.querySelector('svg').style.transform = 'rotate(90deg)'

          group.appendChild(label)
          group.appendChild(children)
          container.appendChild(group)

          renderTree(cmd.subcommands, children, depth + 1)
        } else {
          // Leaf command
          const item = document.createElement('div')
          item.className = 'cmd-item px-3 py-2 rounded text-sm cursor-pointer border border-transparent hover:bg-blue-50 mb-0.5'
          item.style.paddingLeft = (depth * 12 + 12) + 'px'
          item.innerHTML = '<div class="font-medium">' + cmd.name + '</div>' +
            (cmd.description ? '<div class="text-xs text-gray-400 mt-0.5">' + cmd.description + '</div>' : '')

          item.addEventListener('click', () => selectCommand(cmd, item))
          container.appendChild(item)
        }
      })
    }

    function selectCommand(cmd, el) {
      document.querySelectorAll('.cmd-item').forEach(e => e.classList.remove('active'))
      el.classList.add('active')
      selectedCmd = cmd
      clearResult()

      renderForm(cmd)
    }

    function renderForm(cmd) {
      const panel = document.getElementById('form-panel')
      let html = '<div class="mb-4"><h2 class="text-base font-semibold">minimax ' + cmd.fullCommand + '</h2>'
      if (cmd.description) html += '<p class="text-sm text-gray-500 mt-1">' + cmd.description + '</p>'
      html += '</div>'

      html += '<div class="space-y-3">'

      // Args
      cmd.args.forEach(arg => {
        html += '<div><label class="block text-sm font-medium text-gray-700 mb-1">' +
          arg.name + (arg.required ? ' <span class="text-red-500">*</span>' : '') +
          '</label>' +
          '<input type="text" data-arg="' + arg.name + '" placeholder="' + (arg.description || arg.name) + '"' +
          ' class="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"></div>'
      })

      // Options
      cmd.options.forEach(opt => {
        const flag = opt.flag  // e.g. '--output' or '-n'
        const hasValue = opt.flags.includes('<') || opt.flags.includes('[')

        if (hasValue) {
          html += '<div><label class="block text-sm font-medium text-gray-700 mb-1">' + flag + '</label>'

          if (opt.enum && opt.enum.length > 0) {
            // Enum -> select
            html += '<select data-option="' + flag + '" class="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent">'
            opt.enum.forEach(v => {
              const selected = opt.defaultValue === v ? ' selected' : ''
              html += '<option value="' + v + '"' + selected + '>' + v + '</option>'
            })
            html += '</select>'
          } else if (opt.type === 'integer' || opt.type === 'number') {
            // Number -> number input
            html += '<input type="number" data-option="' + flag + '" placeholder="' + (opt.description || '') + '"' +
              (opt.defaultValue ? ' value="' + opt.defaultValue.replace(/"/g, '&quot;') + '"' : '') +
              ' class="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent">'
          } else {
            // Default -> text input
            html += '<input type="text" data-option="' + flag + '" placeholder="' + (opt.description || '') + '"' +
              (opt.defaultValue ? ' value="' + opt.defaultValue.replace(/"/g, '&quot;') + '"' : '') +
              ' class="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent">'
          }

          if (opt.description) html += '<p class="text-xs text-gray-400 mt-1">' + opt.description + '</p>'
          html += '</div>'
        } else {
          html += '<div class="flex items-center gap-2">' +
            '<input type="checkbox" data-flag="' + flag + '" id="flag-' + flag + '" class="rounded">' +
            '<label for="flag-' + flag + '" class="text-sm text-gray-700">' + flag + '</label>' +
            (opt.description ? '<span class="text-xs text-gray-400">' + opt.description + '</span>' : '') +
            '</div>'
        }
      })

      html += '</div>'

      if (cmd.interactive) {
        html += '<div class="mt-4 flex items-center gap-2 text-amber-600 text-sm">' +
          '<svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>' +
          'This command requires interactive input. Please run it in a terminal: <code class="bg-gray-100 px-2 py-1 rounded ml-1">minimax ' + cmd.fullCommand + '</code></div>'
      } else {
        html += '<div class="mt-4">' +
          '<button onclick="executeCommand()" class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 transition">Run</button>' +
          '</div>'
      }

      panel.innerHTML = html
    }

    async function executeCommand() {
      if (!selectedCmd) return

      const parts = selectedCmd.fullCommand.split(' ')

      // Collect args
      document.querySelectorAll('[data-arg]').forEach(el => {
        if (el.value.trim()) parts.push(el.value.trim())
      })

      // Collect options with values
      document.querySelectorAll('[data-option]').forEach(el => {
        const val = (el.value || '').trim()
        if (val) {
          parts.push(el.dataset.option, val)
        }
      })

      // Collect flags
      document.querySelectorAll('[data-flag]').forEach(el => {
        if (el.checked) parts.push(el.dataset.flag)
      })

      const resultPanel = document.getElementById('result-panel')
      resultPanel.innerHTML = '<div class="flex items-center gap-2 text-gray-400"><svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Running...</div>'

      const start = Date.now()
      try {
        const res = await fetch('/api/exec', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ args: parts }),
        })
        const data = await res.json()
        const elapsed = Date.now() - start

        let html = '<div class="flex items-center gap-3 mb-3">'
        if (data.exitCode === 0) {
          html += '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">Success</span>'
        } else {
          html += '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">Failed (exit ' + data.exitCode + ')</span>'
        }
        html += '<span class="text-xs text-gray-400">' + elapsed + 'ms</span>'
        html += '<code class="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">minimax ' + parts.join(' ') + '</code>'
        html += '</div>'

        if (data.stdout) {
          html += '<div class="relative group">' +
            '<pre class="result bg-white border rounded-lg p-4 text-sm font-mono overflow-x-auto">' + escapeHtml(data.stdout) + '</pre>' +
            '<button onclick="copyResult(this)" class="absolute top-2 right-2 hidden group-hover:flex items-center gap-1 px-2 py-1 rounded text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 transition">' +
            '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" stroke-width="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke-width="2"/></svg>' +
            'Copy</button></div>'
        }
        if (data.stderr) {
          html += '<div class="relative group mt-2">' +
            '<pre class="result bg-red-50 border border-red-200 rounded-lg p-4 text-sm font-mono text-red-700 overflow-x-auto">' + escapeHtml(data.stderr) + '</pre>' +
            '<button onclick="copyResult(this)" class="absolute top-2 right-2 hidden group-hover:flex items-center gap-1 px-2 py-1 rounded text-xs bg-red-100 hover:bg-red-200 text-red-600 transition">' +
            '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" stroke-width="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke-width="2"/></svg>' +
            'Copy</button></div>'
        }

        resultPanel.innerHTML = html
      } catch (err) {
        resultPanel.innerHTML = '<div class="text-red-600">Request failed: ' + err.message + '</div>'
      }
    }

    function clearResult() {
      document.getElementById('result-panel').innerHTML = ''
    }

    function escapeHtml(str) {
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    }

    function copyResult(btn) {
      const pre = btn.parentElement.querySelector('pre')
      navigator.clipboard.writeText(pre.textContent).then(() => {
        const orig = btn.innerHTML
        btn.innerHTML = '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>Copied'
        setTimeout(() => { btn.innerHTML = orig }, 1500)
      })
    }

    init()
  </script>
</body>
</html>`;

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
            htmlResponse(res, HTML_PAGE);
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
