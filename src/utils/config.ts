import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export type Region = 'china' | 'global';

/**
 * CLI configuration shape. All fields are optional so the tool
 * still works on first run or when only partially configured.
 */
export interface CliConfig {
  region?: Region;
  token?: string;
  imageModel?: string;
  audioModel?: string;
  voiceId?: string;
}

const CONFIG_DIR = path.join(os.homedir(), '.minimax-cli');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

/**
 * Read the config file. Returns an empty object when the file
 * does not exist (no error thrown).
 */
export async function loadConfig(): Promise<CliConfig> {
  try {
    const raw = await fs.readFile(CONFIG_FILE, 'utf-8');
    return JSON.parse(raw) as CliConfig;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return {};
    }
    throw err;
  }
}

/**
 * Write the config file. The directory is created if missing.
 */
export async function saveConfig(config: CliConfig): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.writeFile(
    CONFIG_FILE,
    JSON.stringify(config, null, 2) + '\n',
    'utf-8',
  );
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}
