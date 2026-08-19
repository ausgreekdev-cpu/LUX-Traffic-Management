import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'favicon.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'LUX Traffic Management',
        short_name: 'LUX',
        description: 'WA Traffic Management System — TMP & Permit Management',
        id: 'LUX-Traffic-Management',
        lang: 'en',
        dir: 'ltr',
        theme_color: '#f57f17',
        background_color: '#111827',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui', 'browser'],
        orientation: 'any',
        categories: ['business', 'productivity', 'utilities'],
        start_url: '/',
        scope: '/',
        screenshots: [
          {
            src: '/screenshot-wide.png',
            sizes: '1280x720',
            type: 'image/png',
            form_factor: 'wide',
            label: 'LUX Traffic Management dashboard'
          },
          {
            src: '/screenshot-narrow.png',
            sizes: '720x1280',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'LUX Traffic Management mobile view'
          }
        ],
        icons: [
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ],
        shortcuts: [
          {
            name: 'New TMP',
            short_name: 'New TMP',
            description: 'Create a new Traffic Management Plan',
            url: '/tmps/new',
            icons: [{ src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' }]
          },
          {
            name: 'New Permit',
            short_name: 'New Permit',
            description: 'Create a new permit application',
            url: '/permits/new',
            icons: [{ src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' }]
          },
          {
            name: 'Time Tracking',
            short_name: 'Time',
            description: 'Log hours against TMPs and cost codes',
            url: '/time-tracking',
            icons: [{ src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' }]
          }
        ]
      },
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /\/api\/photos\/[^?]+/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'lux-photos',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: /\/api\/(tmps|kanban\/board|permits|workflows\/checklist)/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'lux-field-data',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      }
    })
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001'
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom']
        }
      }
    }
  }
});
