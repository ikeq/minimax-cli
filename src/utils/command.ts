import type { Command } from 'commander';

/**
 * Make a command print its full help whenever argument parsing fails
 * (missing required option, unknown flag, etc.), instead of the default
 * one-liner error. A short error message is printed first so the user
 * still sees *what* went wrong.
 */
export function showHelpOnError(cmd: Command): void {
  cmd.showHelpAfterError(true).exitOverride((err) => {
    if (
      err.code === 'commander.helpDisplayed' ||
      err.code === 'commander.help' ||
      err.code === 'commander.version'
    ) {
      process.exit(0);
    }
    process.exit(1);
  });
}
