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

import { mkdirSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_PATHS_PER_BATCH = 60;
const MAX_BODY_BYTES = 8 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 180_000;
/**
 * Ceiling on the completion. Each verdict is ~120–180 tokens (path + short
 * reason); at the default batch of 60 that fits comfortably under 16 k with
 * headroom for a longer reason. Without an explicit cap some providers
 * default as low as 4 k, which truncates mid-JSON and reads to the client as
 * "the model omitted these paths".
 */
const DEFAULT_MAX_TOKENS = 16_000;

export function readLlmConfig(env) {
  const baseUrl = (env.LLM_BASE_URL ?? '').trim().replace(/\/+$/, '');
  const apiKey = (env.LLM_API_KEY ?? '').trim();
  const model = (env.LLM_MODEL ?? '').trim() || DEFAULT_MODEL;
  const batch = Number.parseInt(env.LLM_PATHS_PER_BATCH ?? '', 10);
  const maxTok = Number.parseInt(env.LLM_MAX_TOKENS ?? '', 10);
  const logDir = (env.LLM_LOG_DIR ?? '').trim();
  return {
    baseUrl,
    apiKey,
    model,
    pathsPerBatch:
      Number.isFinite(batch) && batch > 0 ? batch : DEFAULT_PATHS_PER_BATCH,
    maxTokens: Number.isFinite(maxTok) && maxTok > 0 ? maxTok : DEFAULT_MAX_TOKENS,
    logDir: logDir ? resolvePath(logDir) : '',
  };
}

/**
 * Debug logging. Enabled when `LLM_LOG_DIR` is set in the environment. Each
 * request writes one JSON file with everything needed to debug omissions:
 * the exact prompt sent to the model, the upstream `finish_reason`, `usage`,
 * and the full raw content string. Never logs the API key.
 *
 * Files are named `<UTC-timestamp>-<requestId>-<phase>.json` so they sort
 * chronologically and pair up naturally per request.
 */
let loggingInitialised = false;
function ensureLogDir(dir) {
  if (!dir) return false;
  if (loggingInitialised) return true;
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    loggingInitialised = true;
    // Breadcrumb so the user can confirm logging is on when they tail /logs.
    appendFileSync(
      resolvePath(dir, '_started.log'),
      new Date().toISOString() + ' — LLM debug logging enabled\n',
      'utf8',
    );
    return true;
  } catch (e) {
    // Logging must never break the analyze path.
    process.stderr.write('[llm.log] cannot init ' + dir + ': ' + messageOf(e) + '\n');
    return false;
  }
}

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function makeRequestId() {
  // 8 random bytes as hex — enough entropy to correlate a request across the
  // three log files (`analyze`, `upstream`, `parse`) without a full uuid dep.
  const buf = new Uint8Array(8);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

function writeLog(dir, requestId, phase, payload) {
  if (!dir) return;
  try {
    const name = nowStamp() + '-' + requestId + '-' + phase + '.json';
    writeFileSync(resolvePath(dir, name), JSON.stringify(payload, null, 2), 'utf8');
  } catch (e) {
    process.stderr.write(
      '[llm.log] cannot write ' + phase + ' for ' + requestId + ': ' + messageOf(e) + '\n',
    );
  }
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
    if (req.method === 'POST' && route === '/log-parse') {
      logParse(env, req, res).catch((e) =>
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
    maxTokens: cfg.maxTokens,
    logging: Boolean(cfg.logDir),
    logDir: cfg.logDir || null,
  };
}

async function analyze(env, req, res) {
  const cfg = readLlmConfig(env);
  const logging = ensureLogDir(cfg.logDir);
  const requestId = makeRequestId();

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
    // Explicit cap. Without it some OpenAI-compatible providers default to a
    // ~4 k completion limit which cuts long verdict lists off mid-JSON —
    // the client then sees every trailing path as "Model reply omitted this
    // path." even though `finish_reason` was `length`.
    max_tokens:
      typeof body.max_tokens === 'number' && body.max_tokens > 0
        ? body.max_tokens
        : cfg.maxTokens,
    response_format: { type: 'json_object' },
    messages: [
      ...(system ? [{ role: 'system', content: system }] : []),
      { role: 'user', content: user },
    ],
  };

  // Log the analyze request BEFORE we hit the network so if the upstream
  // never returns (timeout, hang) we still have the prompt on disk.
  if (logging) {
    writeLog(cfg.logDir, requestId, 'analyze', {
      requestId,
      timestamp: new Date().toISOString(),
      model: payload.model,
      temperature: payload.temperature,
      systemLength: system.length,
      userLength: user.length,
      // Full prompt, unabridged — the whole point is to replay omissions.
      system,
      user,
      responseFormat: payload.response_format,
    });
  }

  let upstream;
  const startedAt = Date.now();
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
    if (logging) {
      writeLog(cfg.logDir, requestId, 'upstream-error', {
        requestId,
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        error: messageOf(e),
      });
    }
    return sendJson(res, 502, {
      requestId,
      error: 'Could not reach ' + cfg.baseUrl + ' — ' + messageOf(e),
    });
  }

  const text = await upstream.text();
  const durationMs = Date.now() - startedAt;
  if (!upstream.ok) {
    if (logging) {
      writeLog(cfg.logDir, requestId, 'upstream-nonok', {
        requestId,
        timestamp: new Date().toISOString(),
        durationMs,
        status: upstream.status,
        statusText: upstream.statusText,
        body: text,
      });
    }
    return sendJson(res, upstream.status, {
      requestId,
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
    if (logging) {
      writeLog(cfg.logDir, requestId, 'upstream-nonjson', {
        requestId,
        timestamp: new Date().toISOString(),
        durationMs,
        rawBody: text,
      });
    }
    return sendJson(res, 502, {
      requestId,
      error: 'Upstream returned non-JSON: ' + text.slice(0, 1200),
    });
  }

  const content = json?.choices?.[0]?.message?.content ?? '';
  const finishReason = json?.choices?.[0]?.finish_reason ?? null;
  const usage = json?.usage ?? null;
  const modelReturned = json?.model ?? payload.model;

  if (logging) {
    // Everything the client needs to distinguish truncation from omission.
    writeLog(cfg.logDir, requestId, 'upstream-ok', {
      requestId,
      timestamp: new Date().toISOString(),
      durationMs,
      status: upstream.status,
      finishReason,
      usage,
      model: modelReturned,
      contentLength: content.length,
      content,
      // Full upstream envelope in case the provider adds fields worth reading.
      upstreamRaw: json,
    });
  }

  sendJson(res, 200, {
    requestId,
    content,
    finishReason,
    usage,
    model: modelReturned,
  });
}

/**
 * Receives a parse-coverage report from the client so we can correlate what
 * the model returned with what the browser managed to extract. Body shape is
 * whatever `llm.service.ts` sends — we just tag it and drop it on disk.
 */
async function logParse(env, req, res) {
  const cfg = readLlmConfig(env);
  const logging = ensureLogDir(cfg.logDir);
  if (!logging) {
    // 204 rather than an error so the client's `.catch(() => {})` stays quiet.
    res.statusCode = 204;
    return res.end();
  }

  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch (e) {
    return sendJson(res, 400, { error: 'Malformed body: ' + messageOf(e) });
  }

  const requestId =
    typeof body?.requestId === 'string' && body.requestId
      ? body.requestId
      : 'noid-' + makeRequestId();

  writeLog(cfg.logDir, requestId, 'parse', {
    requestId,
    timestamp: new Date().toISOString(),
    ...body,
  });
  res.statusCode = 204;
  res.end();
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
