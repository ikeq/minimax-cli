import { accessSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { showHelpOnError } from '../../utils/command.js';

interface SkillsCommandOptions {
  path: string;
}

/**
 * Implementation of `minimax skills <path>`.
 *
 * Copies the bundled `skills/` directory to `<path>/minimax`.
 * Refuses to run when `<path>/minimax` already exists, to avoid
 * clobbering the user's own content.
 */
async function runSkills(opts: SkillsCommandOptions): Promise<void> {
  if (!opts.path || opts.path.trim() === '') {
    throw new Error('<path> must not be empty');
  }

  const src = resolveBundledSkillsDir();
  const dest = path.resolve(opts.path, 'minimax');

  try {
    await fs.access(dest);
    throw new Error(
      `Target already exists: ${dest}. Remove it first or pick a different path.`,
    );
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }

  try {
    const stat = await fs.stat(src);
    if (!stat.isDirectory()) {
      throw new Error(`Bundled skills source is not a directory: ${src}`);
    }
  } catch {
    throw new Error(
      `Bundled skills source not found at ${src}. Reinstall @ikeq/minimax-cli to restore it.`,
    );
  }

  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.cp(src, dest, { recursive: true });

  console.log(`✅ Skills copied to: ${dest}`);
}

/**
 * Locate the bundled `skills/` directory relative to the compiled
 * `dist/index.js`. In a published package the layout is:
 *   <pkg>/dist/index.js      → ../skills
 * In dev (tsx) the compiled file lives under `src/commands/skills/`,
 * so we walk up three levels as a fallback.
 */
function resolveBundledSkillsDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, '..', 'skills'),
    path.resolve(here, '..', '..', 'skills'),
    path.resolve(here, '..', '..', '..', 'skills'),
  ];
  return candidates.find(existsSync) ?? candidates[0];
}

function existsSync(p: string): boolean {
  try {
    accessSync(p);
    return true;
  } catch {
    return false;
  }
}

export default function (program: Command): void {
  const cmd = program
    .command('skills')
    .description('Copy bundled skills/ into <path>/minimax')
    .argument(
      '<path>',
      'Destination directory; a "minimax" folder will be created inside it (Required)',
    )
    .action(async (pathArg: string) => {
      try {
        await runSkills({ path: pathArg });
      } catch (err) {
        console.error(
          'Copy skills failed:',
          err instanceof Error ? err.message : err,
        );
        process.exit(1);
      }
    });

  showHelpOnError(cmd);
}
