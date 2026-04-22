#!/usr/bin/env node
import { Command } from 'commander';
import registerAudio from './commands/audio/index.js';
import registerImage from './commands/image/index.js';
import registerInit from './commands/init/index.js';
import registerSearch from './commands/search/index.js';
import registerSkills from './commands/skills/index.js';
import registerUi from './commands/ui/index.js';
import { showHelpOnError } from './utils/command.js';

const program = new Command();

program
  .name('minimax')
  .description('MiniMax command line tool')
  .version('0.1.0');

showHelpOnError(program);

registerInit(program);
registerImage(program);
registerAudio(program);
registerSearch(program);
registerSkills(program);
registerUi(program);

program.parseAsync(process.argv);
