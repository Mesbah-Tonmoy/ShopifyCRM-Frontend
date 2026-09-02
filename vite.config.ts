import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'

/**
 * Origins allowed to embed the feature board in an iframe.
 *
 * Local ports are included so the board can be tested from a Shopify app
 * running on localhost. Override with VITE_BOARD_FRAME_ANCESTORS to add a
 * tunnel host (ngrok, Cloudflare) or to lock this down further.
 *
 * Note: a page opened straight from disk has the origin `null`, which cannot
 * be allowlisted — serve the test page over http instead.
 */
const DEFAULT_FRAME_ANCESTORS = [
  "'self'",
  'http://localhost:*',
  'http://127.0.0.1:*',
  'https://*.myshopify.com',
  'https://admin.shopify.com',
].join(' ')

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const frameAncestors = env.VITE_BOARD_FRAME_ANCESTORS || DEFAULT_FRAME_ANCESTORS

  // Set VITE_BOARD_FRAME_ANCESTORS=off to send no CSP at all. Useful when
  // diagnosing an embed failure: if it still fails with the header gone, the
  // cause is not CSP.
  const headers =
    frameAncestors.trim().toLowerCase() === 'off'
      ? {}
      : { 'Content-Security-Policy': `frame-ancestors ${frameAncestors}` }

  return {
    plugins: [
      vue(),
      vueJsx(),
      vueDevTools(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      },
    },
    server: {
      host: '0.0.0.0',
      port: 8080,
      // Keeps dev behaving like production, where the same header must be set
      // by whatever serves the built SPA.
      headers,
      watch: {
        usePolling: true,
        interval: 1000
      },
      hmr: {
        host: 'localhost',
        port: 8080
      }
  }
  }
})
