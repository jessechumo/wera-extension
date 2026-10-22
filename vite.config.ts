import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Four outputs, built by scripts/build.mjs, each one file:
//   background the service worker (an ES module)
//   page       runs in every frame of every page: detects job pages, reads
//              and fills forms, the answer button (a classic script)
//   panel      the Wera panel (React), put into a job page's top frame on
//              demand (a classic script, its styles inlined)
//   bridge     runs on the user's Wera dashboard (a classic script)
const target = process.env.WERA_TARGET ?? 'page';
const entry = target === 'panel' ? 'src/panel/index.tsx' : `src/${target}/index.ts`;

export default defineConfig(({ mode }) => ({
  plugins: target === 'panel' ? [react(), tailwindcss()] : [],
  define: {
    'process.env.NODE_ENV': JSON.stringify(mode === 'development' ? 'development' : 'production'),
    // End-to-end builds open Wera's shadow roots so tests can reach in; real builds keep them closed.
    __WERA_E2E__: JSON.stringify(!!(process.env.WERA_E2E || process.env.WERA_OPEN_SHADOW)),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: resolve(import.meta.dirname, entry),
      formats: [target === 'background' ? ('es' as const) : ('iife' as const)],
      name: `wera_${target}`,
      fileName: () => `${target}.js`,
    },
  },
}));
