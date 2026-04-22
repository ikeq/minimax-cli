import { Command } from 'commander';
import { input, select } from '@inquirer/prompts';
import { showHelpOnError } from '../../utils/command.js';
import {
  type CliConfig,
  type Region,
  getConfigPath,
  loadConfig,
  saveConfig,
} from '../../utils/config.js';

/**
 * Render a token as `first6...last6` for display, used as the default
 * value when re-running `init`. Short tokens are returned unchanged.
 */
function maskToken(token: string): string {
  if (token.length <= 12) return token;
  return `${token.slice(0, 6)}...${token.slice(-6)}`;
}

/**
 * Implementation of `minimax init`.
 * Always runs interactively, asking for region / token / imageModel /
 * audioModel / voiceId in order. If a config already exists, previous
 * values are used as defaults so pressing Enter keeps them.
 */
async function runInit(): Promise<void> {
  const existing = await loadConfig();
  const hasExisting = Object.keys(existing).length > 0;

  if (hasExisting) {
    console.log(`\nExisting config detected: ${getConfigPath()}`);
    console.log('Press Enter to keep the current value, or type a new one.\n');
  } else {
    console.log("\nWelcome to minimax. Let's set things up.\n");
  }

  const region = (await select({
    message: 'Region:',
    choices: [
      { name: 'china', value: 'china' },
      { name: 'global', value: 'global' },
    ],
    default: existing.region ?? 'china',
  })) as Region;

  // Shown as `first6...last6` on re-run. Typing a value with "..." is
  // treated as "keep the existing token". After submit, the answer line
  // is re-rendered masked so the plaintext never lingers on screen.
  const maskedDefault = existing.token ? maskToken(existing.token) : undefined;
  const tokenInput = await input({
    message: 'Token:',
    default: maskedDefault,
    validate: (v) => v.trim() !== '' || 'Token must not be empty',
    transformer: (v, { isFinal }) => (isFinal ? maskToken(v) : v),
  });
  const tokenIsUnchanged =
    existing.token !== undefined && tokenInput === maskedDefault;
  const token = tokenIsUnchanged ? existing.token! : tokenInput.trim();

  const imageModel = await input({
    message: 'Image model:',
    default: existing.imageModel,
    validate: (v) => v.trim() !== '' || 'Must not be empty',
  });

  const audioModel = await input({
    message: 'Audio model:',
    default: existing.audioModel,
    validate: (v) => v.trim() !== '' || 'Must not be empty',
  });

  const voiceId = await input({
    message: 'Voice ID:',
    default: existing.voiceId,
    validate: (v) => v.trim() !== '' || 'Must not be empty',
  });

  const next: CliConfig = {
    region,
    token,
    imageModel: imageModel.trim(),
    audioModel: audioModel.trim(),
    voiceId: voiceId.trim(),
  };

  await saveConfig(next);

  console.log(`\n✅ Config saved to: ${getConfigPath()}`);
}

export default function (program: Command): void {
  const cmd = program
    .command('init')
    .description('Initialize or update minimax config')
    .action(async () => {
      try {
        await runInit();
      } catch (err) {
        // inquirer throws ExitPromptError on Ctrl+C; print a friendly
        // message instead of a stack trace.
        if (err instanceof Error && err.name === 'ExitPromptError') {
          console.log('\nCancelled.');
          process.exit(0);
        }
        console.error('Init failed:', err);
        process.exit(1);
      }
    });

  showHelpOnError(cmd);
}
