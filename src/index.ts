#!/usr/bin/env node
import { Command, Option } from 'commander';
import { runInit } from './commands/init.js';
import { runImage } from './commands/image.js';
import { runSearch } from './commands/search.js';
import { runSkills } from './commands/skills.js';
import { registerWebCommand } from './commands/ui.js';

const program = new Command();

program
  .name('minimax')
  .description('MiniMax command line tool')
  .version('0.1.0');

/**
 * Make a command print its full help whenever argument parsing fails
 * (missing required option, unknown flag, etc.), instead of the default
 * one-liner error. A short error message is printed first so the user
 * still sees *what* went wrong.
 */
function showHelpOnError(cmd: Command): void {
  cmd.showHelpAfterError(true).exitOverride((err) => {
    // Let --help / --version exit normally.
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

program
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

const imageCmd = program
  .command('image')
  .description('Text-to-image generation')
  .argument('<prompt>', 'Text description of the image (Required)')
  .addOption(
    new Option(
      '-o, --output <path>',
      'Output file path; parent directory is created if missing. If the path has a .png/.jpg/.jpeg/.webp extension, that extension wins over --format. With -n>1 files are numbered -1, -2, ... (Required)',
    ).makeOptionMandatory(true),
  )
  .addOption(
    new Option(
      '-r, --aspect-ratio <ratio>',
      'Aspect ratio (Required)',
    )
      .choices(['1:1', '16:9', '4:3', '3:2', '2:3', '3:4', '9:16', '21:9'])
      .makeOptionMandatory(true),
  )
  .addOption(
    new Option('-n, --number <count>', 'Number of images to generate').default(
      '1',
    ),
  )
  .addOption(
    new Option('-f, --format <format>', 'Output format')
      .choices(['png', 'jpg', 'webp'])
      .default('webp'),
  )
  .option(
    '--reference <urls>',
    'Comma-separated http(s) URLs used as subject references, e.g. img1,img2',
    (raw: string) =>
      raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
  )
  .option('--debug', 'Print HTTP request/response for debugging')
  .action(async (prompt: string, opts) => {
    try {
      await runImage(prompt, {
        output: opts.output,
        aspectRatio: opts.aspectRatio,
        n: opts.number,
        format: opts.format,
        reference: opts.reference,
        debug: opts.debug,
      });
    } catch (err) {
      console.error(
        'Image generation failed:',
        err instanceof Error ? err.message : err,
      );
      process.exit(1);
    }
  });

showHelpOnError(program);
showHelpOnError(imageCmd);
// init takes no args, but keep the behaviour consistent.
showHelpOnError(program.commands.find((c) => c.name() === 'init')!);

const searchCmd = program
  .command('search')
  .description('Web search via the coding-plan endpoint')
  .argument('<query>', 'Search query; 3-5 keywords work best (Required)')
  .option('--debug', 'Print HTTP request/response for debugging')
  .action(async (query: string, opts) => {
    try {
      await runSearch(query, {
        debug: opts.debug,
      });
    } catch (err) {
      console.error(
        'Search failed:',
        err instanceof Error ? err.message : err,
      );
      process.exit(1);
    }
  });

showHelpOnError(searchCmd);

const skillsCmd = program
  .command('skills')
  .description('Copy bundled skills/ into <path>/minimax')
  .argument('<path>', 'Destination directory; a "minimax" folder will be created inside it (Required)')
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

showHelpOnError(skillsCmd);

registerWebCommand(program);

program.parseAsync(process.argv);
