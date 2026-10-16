import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));

export default defineConfig({
  build: { outDir: 'dist' },
  // Версия приложения берётся из package.json и доступна в коде как __APP_VERSION__.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
});
