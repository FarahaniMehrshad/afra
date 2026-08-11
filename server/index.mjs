/**
 * Production server: serves the Vite build out of `dist/` and mounts the LLM
 * proxy plus the persistence API on the same origin, so the SPA can call
 * `/api/llm/*` and `/api/store/*` with no CORS and no secrets in the bundle.
 *
 *   npm run build && npm start
 *
 * `npm start` passes `--env-file=.env`; in Docker the vars come from the
 * container environment instead, and both land in `process.env` either way.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createLlmHandler } from './llm.handler.mjs';
import { createStoreHandler } from './store.handler.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '..', 'dist');
const port = Number.parseInt(process.env.PORT ?? '', 10) || 8787;

const app = express();
app.disable('x-powered-by');

app.use('/api/llm', createLlmHandler(process.env));
app.use('/api/store', createStoreHandler(process.env));

// Vite emits content-hashed asset names, so they can be cached forever.
app.use(
  '/assets',
  express.static(path.join(dist, 'assets'), { immutable: true, maxAge: '1y' }),
);
app.use(express.static(dist));

// SPA fallback. Registered as a catch-all middleware rather than `app.get('*')`
// because Express 5 no longer accepts the bare wildcard string.
app.use((_req, res) => res.sendFile(path.join(dist, 'index.html')));

app.listen(port, '0.0.0.0', () => {
  console.log('AFRA listening on http://0.0.0.0:' + port);
});
