import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createLlmHandler, type LlmEnv } from './server/llm.handler.mjs';

// Resolve `@/` to the `src/` folder alongside this config file. Using
// `import.meta.url` avoids depending on `@types/node`.
const srcDir = new URL('./src/', import.meta.url).pathname;

/**
 * Mount the LLM proxy on the dev and preview servers. In production the same
 * handler is served by `server/index.mjs`, so `/api/llm` behaves identically
 * whichever way the app is being run.
 */
function llmApi(env: LlmEnv): Plugin {
  return {
    name: 'afra-llm-api',
    configureServer(server) {
      server.middlewares.use('/api/llm', createLlmHandler(env));
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/llm', createLlmHandler(env));
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Empty prefix so the unprefixed, server-only LLM_* vars are picked up.
  // These are handed to the proxy directly and never exposed via `define`.
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react(), llmApi(env)],
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
