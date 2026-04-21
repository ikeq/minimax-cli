import { accessSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface SkillsCommandOptions {
  path: string;
}

/**
 * Implementation of `minimax skills <path>`.
 *
 * Copies the bundled `skills/` directory to `<path>/minimax`.
 * Refuses to run when `<path>/minimax` already exists, to avoid
 * clobbering the user's own content.
 */
export async function runSkills(opts: SkillsCommandOptions): Promise<void> {
  if (!opts.path || opts.path.trim() === '') {
    throw new Error('<path> must not be empty');
  }

  const src = resolveBundledSkillsDir();
  const dest = path.resolve(opts.path, 'minimax');

  // Existence check — never overwrite.
  try {
    await fs.access(dest);
    throw new Error(
      `Target already exists: ${dest}. Remove it first or pick a different path.`,
    );
  } catch (err) {
    // ENOENT is what we want.
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }

  // Verify the source is actually there (dev mode vs. published package).
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
 * In dev (tsx) the compiled file lives under `src/commands/`, so we
 * walk up two levels as a fallback.
 */
function resolveBundledSkillsDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidate1 = path.resolve(here, '..', 'skills');
  const candidate2 = path.resolve(here, '..', '..', 'skills');
  return existsSync(candidate1) ? candidate1 : candidate2;
}

function existsSync(p: string): boolean {
  try {
    accessSync(p);
    return true;
  } catch {
    return false;
  }
}
