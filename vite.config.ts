import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Four outputs, built by scripts/build.mjs:
//   sidepanel  the React UI (an extension page; may share chunks)
//   background the service worker (one file)
//   content    injected into pages on demand; must be one classic script
//   bridge     runs on the user's Wera dashboard; one classic script
const target = process.env.WERA_TARGET ?? 'sidepanel';

export default defineConfig(() => {
  if (target === 'sidepanel') {
    return {
      plugins: [react(), tailwindcss()],
      base: './',
      build: {
        outDir: 'dist',
        emptyOutDir: false,
        rollupOptions: { input: { sidepanel: resolve(__dirname, 'sidepanel.html') } },
      },
    };
  }
  return {
    build: {
      outDir: 'dist',
      emptyOutDir: false,
      lib: {
        entry: resolve(__dirname, `src/${target}/index.ts`),
        formats: [target === 'content' || target === 'bridge' ? ('iife' as const) : ('es' as const)],
        name: `wera_${target}`,
        fileName: () => `${target}.js`,
      },
    },
  };
});
