import { copyFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  onSuccess: async () => {
    // Keep the Web UI template next to dist/index.js so the runtime
    // `resolve(here, 'template.html')` lookup finds it in production.
    copyFileSync(
      'src/commands/ui/template.html',
      'dist/template.html',
    );
  },
});
