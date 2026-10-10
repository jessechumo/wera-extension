// Builds the extension into dist/: the three Vite targets plus the
// manifest (with the version from package.json) and icons.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { build } from 'vite';

const watch = process.argv.includes('--watch');
rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });

for (const target of ['sidepanel', 'background', 'content']) {
  process.env.WERA_TARGET = target;
  await build({ configFile: 'vite.config.ts', mode: watch ? 'development' : 'production', build: { watch: watch ? {} : null } });
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
manifest.version = pkg.version;
// End-to-end tests cannot click permission prompts: their build has the
// local test servers granted up front. Never set this for a release.
if (process.env.WERA_E2E) manifest.host_permissions = ['http://127.0.0.1/*', 'http://localhost/*'];
writeFileSync('dist/manifest.json', JSON.stringify(manifest, null, 2));
cpSync('public', 'dist', { recursive: true });
console.log(`built wera-extension ${pkg.version} into dist/`);
