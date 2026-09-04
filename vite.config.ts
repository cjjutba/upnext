import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Neither the dev server nor `vite preview` maps /app/board to app.html on
 * their own: Vite's MPA support only serves physical .html files at their
 * literal paths. A request under /app with no file extension is a route, not
 * an asset, so it gets rewritten to app.html before Vite resolves it.
 */
function appMpaFallback(): Plugin {
  const rewrite = (req: Connect.IncomingMessage) => {
    const pathname = req.url?.split('?')[0];
    if (!pathname) return;
    if (pathname === '/app' || pathname === '/app/') {
      req.url = '/app.html';
      return;
    }
    if (pathname.startsWith('/app/')) {
      const last = pathname.slice(pathname.lastIndexOf('/') + 1);
      if (!last.includes('.')) req.url = '/app.html';
    }
  };
  return {
    name: 'upnext-app-mpa-fallback',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => { rewrite(req); next(); });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, _res, next) => { rewrite(req); next(); });
    },
  };
}

export default defineConfig({
  appType: 'mpa',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        app: resolve(__dirname, 'app.html'),
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeManifestIcons: false,
      // No auto-injected <script>: the landing page must stay script free. main.tsx registers the SW itself.
      injectRegister: false,
      manifest: {
        name: 'upnext',
        short_name: 'upnext',
        description: 'Courtside pickleball open play manager',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#ffffff',
        start_url: '/app',
        scope: '/app',
        icons: [
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        // Only /app/* is the SPA: the landing page must never be swallowed by this fallback.
        navigateFallback: '/app.html',
        navigateFallbackAllowlist: [/^\/app(\/.*)?$/],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts-css', expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts-files', expiration: { maxEntries: 16, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
    appMpaFallback(),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
} as Parameters<typeof defineConfig>[0]);
