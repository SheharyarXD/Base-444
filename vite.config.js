import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// Kept in sync with DEFAULT_APP_BASE_URL in src/lib/app-params.js. Declared in
// both places on purpose: this file runs in Node at config time and cannot
// import from src/ (that module reads `window` and import.meta.env), while the
// client bundle never sees this file. Change one, change the other.
const DEFAULT_APP_BASE_URL = 'https://app.base44.com'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Prefix '' so this sees exactly what @base44/vite-plugin sees when it
  // decides whether to install its own /api proxy.
  const env = loadEnv(mode, process.cwd(), '')

  // The dev server must proxy /api somewhere: AuthContext calls the relative
  // path `/api/apps/public/...`, so with no proxy Vite answers it with
  // index.html and auth fails with an opaque error. Every .env file is
  // gitignored, so on a fresh clone the plugin logs "Proxy not enabled" and
  // the app can never reach a backend. Falling back to the platform host makes
  // `npm run dev` work out of the box.
  //
  // Reading the env ourselves (rather than defaulting process.env) keeps a real
  // .env.local authoritative — Vite's loadEnv gives process.env precedence over
  // .env files, so pre-seeding it would have overridden the developer's value.
  const appBaseUrl = env.VITE_BASE44_APP_BASE_URL || DEFAULT_APP_BASE_URL

  return {
    logLevel: 'error', // Suppress warnings, only show errors
    plugins: [
      base44({
        // Support for legacy code that imports the base44 SDK with @/integrations, @/entities, etc.
        // can be removed if the code has been updated to use the new SDK imports from @base44/sdk
        legacySDKImports: process.env.BASE44_LEGACY_SDK_IMPORTS === 'true',
        hmrNotifier: true,
        navigationNotifier: true,
        analyticsTracker: true,
        visualEditAgent: true
      }),
      react(),
    ],
    server: {
      proxy: {
        '/api': { target: appBaseUrl, changeOrigin: true },
      },
    },
  }
});
