// @ts-check
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  // Relative URLs, so the built folder works from any path (a sub-folder on a web host, or a multi-file artifact).
  base: './',
  // The app version shown by "Check this phone" (src/selfcheck.js).
  define: { __APP_VERSION__: JSON.stringify(version) },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsInlineLimit: 0,
  },
  preview: { port: 4173, strictPort: true },
  plugins: [
    // Installed and configured, but OFF: no service worker, no web manifest, no registration script are generated.
    // A later step turns it on by setting `disable: false` and giving `manifest` real values (name, icons, colors).
    VitePWA({
      disable: true,
      injectRegister: false,
      registerType: 'prompt',
      manifest: false,
      workbox: {
        // payload.bin (sealed) carries the sample photo, the design and the artist files; it must be precached for offline use.
        globPatterns: ['**/*.{html,js,css,bin}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
    }),
  ],
});
