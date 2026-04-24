import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    clean: true,
    splitting: false,
    sourcemap: true,
    treeshake: true,
    outExtension({ format }) {
      return { js: format === 'cjs' ? '.cjs' : '.mjs' }
    },
  },
  {
    entry: ['src/cli.ts'],
    format: ['cjs'],
    dts: false,
    splitting: false,
    sourcemap: false,
    banner: { js: '#!/usr/bin/env node' },
    outExtension: () => ({ js: '.cjs' }),
  },
])
