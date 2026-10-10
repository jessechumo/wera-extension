// Zips dist/ for the Chrome Web Store (and GitHub releases).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
mkdirSync('release', { recursive: true });
const out = `release/wera-extension-${version}.zip`;
rmSync(out, { force: true });
execFileSync('zip', ['-qr', `../${out}`, '.'], { cwd: 'dist', stdio: 'inherit' });
console.log(out);
