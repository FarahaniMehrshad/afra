/**
 * REST endpoints for the persistence layer, mounted at `/api/store`. Same
 * handler shape as `llm.handler.mjs` so the Vite middleware and the Express
 * production server can share the exact same code path.
 *
 * Routes (prefix stripped):
 *   GET    /health
 *   GET    /journeys                          — list summaries
 *   PUT    /journeys/:name                    — upsert one journey
 *   GET    /journeys/:name                    — full bundle
 *   DELETE /journeys/:name
 *   GET    /journeys/:name/artifacts          — list every artefact meta
 *   GET    /journeys/:name/artifacts/:kind    — list one kind
 *   GET    /journeys/:name/artifacts/:kind/:key
 *   PUT    /journeys/:name/artifacts/:kind/:key
 *   DELETE /journeys/:name/artifacts/:kind/:key
 *
 * Journey `name` is URL-encoded on both sides because folder names contain
 * spaces, non-ASCII (فارسی), colons on Windows drive-anchored paths, etc.
 */

import { ensureMigrations, getPool, query } from './db.mjs';

const MAX_BODY_BYTES = 64 * 1024 * 1024; // Files bag can be large.

export function createStoreHandler(env) {
  return function storeHandler(req, res, next) {
    dispatch(env, req, res)
      .catch((e) => sendJson(res, 500, { error: messageOf(e) }))
      .finally(() => {
        if (!res.writableEnded && typeof next === 'function') next();
      });
  };
}

async function dispatch(env, req, res) {
  const url = req.url ?? '/';
  const [pathOnly] = url.split('?');
  const route = pathOnly.replace(/\/+$/, '') || '/';
  const method = req.method ?? 'GET';

  if (method === 'GET' && route === '/health') {
    return sendJson(res, 200, await health(env));
  }

  // Every other route needs a live database.
  const ready = await ensureMigrations(env).catch((e) => {
    sendJson(res, 503, {
      error: 'Persistence not ready: ' + messageOf(e),
    });
    return false;
  });
  if (ready === false) return;
  if (!ready) {
    return sendJson(res, 503, {
      error:
        'Persistence is disabled — set DATABASE_URL and restart the server.',
    });
  }

  // Parse the route into pieces. Only the /journeys tree exists today, so
  // reject anything else early.
  const parts = route.split('/').filter(Boolean);
  if (parts[0] !== 'journeys') {
    return sendJson(res, 404, { error: 'No such store route: ' + method + ' ' + route });
  }

  // /journeys
  if (parts.length === 1) {
    if (method === 'GET') return listJourneys(env, res);
    return methodNotAllowed(res, method);
  }

  const name = safeDecode(parts[1]);
  if (!name) {
    return sendJson(res, 400, { error: 'Journey name must be non-empty.' });
  }

  // /journeys/:name
  if (parts.length === 2) {
    if (method === 'GET') return getJourney(env, res, name);
    if (method === 'PUT') return upsertJourney(env, req, res, name);
    if (method === 'DELETE') return deleteJourney(env, res, name);
    return methodNotAllowed(res, method);
  }

  if (parts[2] !== 'artifacts') {
    return sendJson(res, 404, { error: 'No such store route: ' + method + ' ' + route });
  }

  // /journeys/:name/artifacts
  if (parts.length === 3) {
    if (method === 'GET') return listArtifacts(env, res, name);
    return methodNotAllowed(res, method);
  }

  const kind = safeDecode(parts[3]);
  if (!kind || !/^[a-z0-9_-]+$/i.test(kind)) {
    return sendJson(res, 400, { error: 'Bad artifact kind: ' + parts[3] });
  }

  // /journeys/:name/artifacts/:kind
  if (parts.length === 4) {
    if (method === 'GET') return listArtifactsOfKind(env, res, name, kind);
    return methodNotAllowed(res, method);
  }

  // /journeys/:name/artifacts/:kind/:key
  // The key is a single URL-encoded segment; if the caller has more, treat
  // the remainder as part of the key (rejoined with '/'). This lets keys
  // like `wpf:3/foo` survive round-trips.
  const key = safeDecode(parts.slice(4).join('/'));
  if (parts.length >= 5) {
    if (method === 'GET') return getArtifact(env, res, name, kind, key);
    if (method === 'PUT') return upsertArtifact(env, req, res, name, kind, key);
    if (method === 'DELETE') return deleteArtifact(env, res, name, kind, key);
    return methodNotAllowed(res, method);
  }

  sendJson(res, 404, { error: 'No such store route: ' + method + ' ' + route });
}

async function health(env) {
  const pool = getPool(env);
  const configured = Boolean(pool);
  let reachable = false;
  let error = null;
  if (pool) {
    try {
      await pool.query('SELECT 1');
      reachable = true;
    } catch (e) {
      error = messageOf(e);
    }
  }
  return {
    configured,
    reachable,
    error,
  };
}

/* ------------------------- Journeys -------------------------------------- */

async function listJourneys(env, res) {
  const q = await query(
    env,
    `SELECT name, jsonb_array_length(steps) AS step_count,
            created_at, updated_at
     FROM journeys
     ORDER BY updated_at DESC`,
    [],
  );
  sendJson(res, 200, {
    journeys: q.rows.map((r) => ({
      name: r.name,
      stepCount: Number(r.step_count) || 0,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  });
}

async function getJourney(env, res, name) {
  const q = await query(
    env,
    `SELECT id, name, journey_md, steps, files, created_at, updated_at
     FROM journeys WHERE name = $1`,
    [name],
  );
  if (!q.rowCount) return sendJson(res, 404, { error: 'Not found: ' + name });
  const row = q.rows[0];
  sendJson(res, 200, {
    id: row.id,
    name: row.name,
    journeyMd: row.journey_md,
    steps: row.steps,
    files: row.files,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

async function upsertJourney(env, req, res, name) {
  const body = await readJson(req);
  const journeyMd = typeof body.journeyMd === 'string' ? body.journeyMd : '';
  const steps = Array.isArray(body.steps) ? body.steps : [];
  const files = body.files && typeof body.files === 'object' ? body.files : {};

  const q = await query(
    env,
    `INSERT INTO journeys (name, journey_md, steps, files)
     VALUES ($1, $2, $3::jsonb, $4::jsonb)
     ON CONFLICT (name) DO UPDATE
       SET journey_md = EXCLUDED.journey_md,
           steps      = EXCLUDED.steps,
           files      = EXCLUDED.files,
           updated_at = NOW()
     RETURNING id, created_at, updated_at`,
    [name, journeyMd, JSON.stringify(steps), JSON.stringify(files)],
  );

  sendJson(res, 200, {
    id: q.rows[0].id,
    name,
    createdAt: q.rows[0].created_at,
    updatedAt: q.rows[0].updated_at,
  });
}

async function deleteJourney(env, res, name) {
  const q = await query(env, `DELETE FROM journeys WHERE name = $1`, [name]);
  sendJson(res, 200, { deleted: q.rowCount });
}

/* ------------------------- Artifacts ------------------------------------- */

async function listArtifacts(env, res, name) {
  const q = await query(
    env,
    `SELECT a.kind, a.key,
            jsonb_build_object('bytes', octet_length(a.payload::text)) AS size,
            a.created_at, a.updated_at
     FROM   artifacts a
     JOIN   journeys j ON j.id = a.journey_id
     WHERE  j.name = $1
     ORDER  BY a.kind, a.key`,
    [name],
  );
  sendJson(res, 200, {
    artifacts: q.rows.map((r) => ({
      kind: r.kind,
      key: r.key,
      bytes: r.size?.bytes ?? 0,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  });
}

async function listArtifactsOfKind(env, res, name, kind) {
  const q = await query(
    env,
    `SELECT a.key, a.created_at, a.updated_at,
            octet_length(a.payload::text) AS bytes
     FROM   artifacts a
     JOIN   journeys j ON j.id = a.journey_id
     WHERE  j.name = $1 AND a.kind = $2
     ORDER  BY a.key`,
    [name, kind],
  );
  sendJson(res, 200, {
    kind,
    artifacts: q.rows.map((r) => ({
      key: r.key,
      bytes: Number(r.bytes) || 0,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  });
}

async function getArtifact(env, res, name, kind, key) {
  const q = await query(
    env,
    `SELECT a.payload, a.meta, a.created_at, a.updated_at
     FROM   artifacts a
     JOIN   journeys j ON j.id = a.journey_id
     WHERE  j.name = $1 AND a.kind = $2 AND a.key = $3`,
    [name, kind, key],
  );
  if (!q.rowCount) return sendJson(res, 404, { error: 'Not found' });
  const row = q.rows[0];
  sendJson(res, 200, {
    kind,
    key,
    payload: row.payload,
    meta: row.meta,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

async function upsertArtifact(env, req, res, name, kind, key) {
  const body = await readJson(req);
  const payload = body.payload;
  const meta = body.meta && typeof body.meta === 'object' ? body.meta : {};
  if (payload === undefined) {
    return sendJson(res, 400, { error: 'Body must include a `payload` field.' });
  }

  // Look up the journey id first so an artefact upsert against a missing
  // journey fails loudly rather than silently orphaning.
  const j = await query(env, `SELECT id FROM journeys WHERE name = $1`, [name]);
  if (!j.rowCount) {
    return sendJson(res, 404, {
      error: 'Unknown journey: ' + name + ' (upsert it first).',
    });
  }

  await query(
    env,
    `INSERT INTO artifacts (journey_id, kind, key, payload, meta)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)
     ON CONFLICT (journey_id, kind, key) DO UPDATE
       SET payload    = EXCLUDED.payload,
           meta       = EXCLUDED.meta,
           updated_at = NOW()`,
    [j.rows[0].id, kind, key, JSON.stringify(payload), JSON.stringify(meta)],
  );

  sendJson(res, 200, { saved: true, kind, key });
}

async function deleteArtifact(env, res, name, kind, key) {
  const q = await query(
    env,
    `DELETE FROM artifacts a
     USING  journeys j
     WHERE  a.journey_id = j.id
       AND  j.name = $1 AND a.kind = $2 AND a.key = $3`,
    [name, kind, key],
  );
  sendJson(res, 200, { deleted: q.rowCount });
}

/* ------------------------- Plumbing -------------------------------------- */

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Body exceeds ' + MAX_BODY_BYTES + ' bytes'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text ? JSON.parse(text) : {});
      } catch (e) {
        reject(new Error('Malformed JSON body: ' + messageOf(e)));
      }
    });
    req.on('error', reject);
  });
}

function safeDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function methodNotAllowed(res, method) {
  return sendJson(res, 405, { error: 'Method not allowed: ' + method });
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
