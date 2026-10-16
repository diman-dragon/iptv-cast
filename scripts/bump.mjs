// Поднимает версию в package.json: node scripts/bump.mjs [patch|minor|major]
import { readFileSync, writeFileSync } from 'node:fs';

const kind = process.argv[2] ?? 'patch';
const file = new URL('../package.json', import.meta.url);
const pkg = JSON.parse(readFileSync(file, 'utf8'));
let [major, minor, patch] = pkg.version.split('.').map(Number);
if (kind === 'major') [major, minor, patch] = [major + 1, 0, 0];
else if (kind === 'minor') [minor, patch] = [minor + 1, 0];
else patch += 1;
pkg.version = `${major}.${minor}.${patch}`;
writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n');
console.log(`version -> ${pkg.version} (versionCode ${major * 10000 + minor * 100 + patch})`);
