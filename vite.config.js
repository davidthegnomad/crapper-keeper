import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8'));

export default defineConfig({
    root: resolve(__dirname, 'deploy-dn/crapper-keeper'),
    base: './',
    define: {
        __APP_VERSION__: JSON.stringify(pkg.version || '0.0.0'),
    },
    build: {
        outDir: resolve(__dirname, 'dist/crapper-keeper'),
        emptyOutDir: true,
        sourcemap: true,
    },
    server: {
        port: 5173,
        strictPort: true,
    },
});
