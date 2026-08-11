import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createLlmHandler, type LlmEnv } from './server/llm.handler.mjs';
import { createStoreHandler, type StoreEnv } from './server/store.handler.mjs';

// Resolve `@/` to the `src/` folder alongside this config file. Using
// `import.meta.url` avoids depending on `@types/node`.
const srcDir = new URL('./src/', import.meta.url).pathname;

/**
 * Mount the LLM proxy and the persistence API on the dev and preview servers.
 * The same handlers are served by `server/index.mjs` in production, so both
 * `/api/llm` and `/api/store` behave identically whichever way the app runs.
 */
function apiMiddleware(env: LlmEnv & StoreEnv): Plugin {
  return {
    name: 'afra-api',
    configureServer(server) {
      server.middlewares.use('/api/llm', createLlmHandler(env));
      server.middlewares.use('/api/store', createStoreHandler(env));
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/llm', createLlmHandler(env));
      server.middlewares.use('/api/store', createStoreHandler(env));
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Empty prefix so the unprefixed, server-only vars are picked up. These
  // are handed to the handlers directly and never exposed via `define`.
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react(), apiMiddleware(env)],
    resolve: {
      alias: {
        '@': srcDir.replace(/\/$/, ''),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
    },
    preview: {
      host: '0.0.0.0',
      port: 4173,
    },
  };
});
