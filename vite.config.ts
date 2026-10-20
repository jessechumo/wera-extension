import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Five outputs, built by scripts/build.mjs:
//   sidepanel  the React UI (an extension page; may share chunks)
//   background the service worker (one file)
//   content    injected into pages on demand; must be one classic script
//   bridge     runs on the user's Wera dashboard; one classic script
//   launcher   the Wera button on job sites the user allowed; one classic script
const target = process.env.WERA_TARGET ?? 'sidepanel';

export default defineConfig(() => {
  if (target === 'sidepanel') {
    return {
      plugins: [react(), tailwindcss()],
      base: './',
      build: {
        outDir: 'dist',
        emptyOutDir: false,
        rollupOptions: { input: { sidepanel: resolve(import.meta.dirname, 'sidepanel.html') } },
      },
    };
  }
  return {
    build: {
      outDir: 'dist',
      emptyOutDir: false,
      lib: {
        entry: resolve(import.meta.dirname, `src/${target}/index.ts`),
        formats: [target === 'background' ? ('es' as const) : ('iife' as const)],
        name: `wera_${target}`,
        fileName: () => `${target}.js`,
      },
    },
  };
});
