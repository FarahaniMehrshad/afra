/**
 * OpenAI-compatible proxy, written as a bare `(req, res, next)` handler so the
 * exact same code can be mounted on the Vite dev/preview server and on the
 * production Express server.
 *
 * The point of it existing at all: `LLM_API_KEY` must never be shipped inside
 * the browser bundle, and most providers refuse cross-origin browser calls.
 *
 * Mounted at `/api/llm`, so the paths seen here are prefix-stripped:
 *   GET  /health   -> whether a key is configured (never the key itself)
 *   POST /analyze  -> { system, user } forwarded as a chat completion
 */

const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_PATHS_PER_BATCH = 60;
const MAX_BODY_BYTES = 8 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 180_000;

export function readLlmConfig(env) {
  const baseUrl = (env.LLM_BASE_URL ?? '').trim().replace(/\/+$/, '');
  const apiKey = (env.LLM_API_KEY ?? '').trim();
  const model = (env.LLM_MODEL ?? '').trim() || DEFAULT_MODEL;
  const batch = Number.parseInt(env.LLM_PATHS_PER_BATCH ?? '', 10);
  return {
    baseUrl,
    apiKey,
    model,
    pathsPerBatch:
      Number.isFinite(batch) && batch > 0 ? batch : DEFAULT_PATHS_PER_BATCH,
  };
}

/** Providers differ on whether the configured URL already names the route. */
function completionsUrl(baseUrl) {
  return /\/chat\/completions$/.test(baseUrl)
    ? baseUrl
    : baseUrl + '/chat/completions';
}

export function createLlmHandler(env) {
  return function llmHandler(req, res, next) {
    const route = (req.url ?? '/').split('?')[0].replace(/\/+$/, '') || '/';

    if (req.method === 'GET' && route === '/health') {
      return sendJson(res, 200, health(readLlmConfig(env)));
    }
    if (req.method === 'POST' && route === '/analyze') {
      analyze(env, req, res).catch((e) =>
        sendJson(res, 500, { error: messageOf(e) }),
      );
      return;
    }
    if (typeof next === 'function') return next();
    sendJson(res, 404, { error: 'No such LLM route: ' + req.method + ' ' + route });
  };
}

function health(cfg) {
  let host = '';
  try {
    host = cfg.baseUrl ? new URL(cfg.baseUrl).host : '';
  } catch {
    host = cfg.baseUrl;
  }
  return {
    configured: Boolean(cfg.baseUrl && cfg.apiKey),
    hasBaseUrl: Boolean(cfg.baseUrl),
    hasApiKey: Boolean(cfg.apiKey),
    model: cfg.model,
    host,
    pathsPerBatch: cfg.pathsPerBatch,
  };
}

async function analyze(env, req, res) {
  const cfg = readLlmConfig(env);
  if (!cfg.baseUrl || !cfg.apiKey) {
    return sendJson(res, 503, {
      error:
        'LLM is not configured. Set LLM_BASE_URL and LLM_API_KEY in .env and restart the server.',
    });
  }

  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch (e) {
    return sendJson(res, 400, { error: 'Malformed request body: ' + messageOf(e) });
  }

  const system = typeof body.system === 'string' ? body.system : '';
  const user = typeof body.user === 'string' ? body.user : '';
  if (!user) return sendJson(res, 400, { error: 'Request is missing a `user` message.' });

  const payload = {
    model: typeof body.model === 'string' && body.model ? body.model : cfg.model,
    temperature: typeof body.temperature === 'number' ? body.temperature : 0,
    response_format: { type: 'json_object' },
    messages: [
      ...(system ? [{ role: 'system', content: system }] : []),
      { role: 'user', content: user },
    ],
  };

  let upstream;
  try {
    upstream = await fetch(completionsUrl(cfg.baseUrl), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer ' + cfg.apiKey,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (e) {
    // Network-level failure: DNS, TLS, timeout. The client only ever learns
    // the shape of the failure, never anything derived from the key.
    return sendJson(res, 502, {
      error: 'Could not reach ' + cfg.baseUrl + ' — ' + messageOf(e),
    });
  }

  const text = await upstream.text();
  if (!upstream.ok) {
    return sendJson(res, upstream.status, {
      error:
        'Upstream returned ' +
        upstream.status +
        ' ' +
        upstream.statusText +
        (text ? ': ' + text.slice(0, 1200) : ''),
    });
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return sendJson(res, 502, {
      error: 'Upstream returned non-JSON: ' + text.slice(0, 1200),
    });
  }

  sendJson(res, 200, {
    content: json?.choices?.[0]?.message?.content ?? '',
    finishReason: json?.choices?.[0]?.finish_reason ?? null,
    usage: json?.usage ?? null,
    model: json?.model ?? payload.model,
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Request body exceeds ' + MAX_BODY_BYTES + ' bytes'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res, status, obj) {
  const buf = Buffer.from(JSON.stringify(obj), 'utf8');
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('content-length', String(buf.length));
  res.setHeader('cache-control', 'no-store');
  res.end(buf);
}

function messageOf(e) {
  return e instanceof Error ? e.message : String(e);
}
