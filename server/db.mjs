/**
 * Postgres pool + auto-migration for the persistence layer.
 *
 * One pool per process, opened lazily. The store handler mounts before we
 * know whether Postgres is even reachable, so `getPool()` returns null when
 * `DATABASE_URL` is empty and every endpoint short-circuits with a friendly
 * 503. That means the app still runs without a database — persistence just
 * silently degrades to "not saved anywhere".
 */

import pg from 'pg';

const { Pool } = pg;

let pool = null;
let migrationsPromise = null;
let disabledReason = '';

/**
 * Central place to grab (or refuse) a pool. Never throws: callers get either
 * a live pool or `null`.
 */
export function getPool(env) {
  const url = (env.DATABASE_URL ?? '').trim();
  if (!url) {
    disabledReason = 'DATABASE_URL is empty';
    return null;
  }
  if (pool) return pool;
  try {
    pool = new Pool({
      connectionString: url,
      // Modest defaults — the app makes few, small queries.
      max: Number.parseInt(env.DATABASE_POOL_MAX ?? '', 10) || 8,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 8_000,
    });
    pool.on('error', (e) => {
      // pg emits background errors on idle clients that the caller can't see.
      process.stderr.write('[db] idle client error: ' + (e?.message ?? e) + '\n');
    });
  } catch (e) {
    disabledReason = 'pool construct failed: ' + (e?.message ?? e);
    pool = null;
  }
  return pool;
}

export function getDisabledReason() {
  return disabledReason;
}

/**
 * Run migrations exactly once per process. Called lazily by the store handler
 * on first use so a running server picks up the schema on demand rather than
 * blocking startup on a database that might not be up yet.
 */
export async function ensureMigrations(env) {
  const p = getPool(env);
  if (!p) return false;
  if (!migrationsPromise) {
    migrationsPromise = migrate(p).catch((e) => {
      // Failing once must not poison every subsequent request; retry next call.
      migrationsPromise = null;
      throw e;
    });
  }
  await migrationsPromise;
  return true;
}

async function migrate(pool) {
  // Everything is idempotent so the same script can be run against a fresh
  // database or an already-migrated one without special-casing.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS journeys (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name          TEXT NOT NULL UNIQUE,
      journey_md    TEXT NOT NULL DEFAULT '',
      steps         JSONB NOT NULL DEFAULT '[]'::jsonb,
      files         JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS journeys_updated_idx
      ON journeys (updated_at DESC);

    -- One polymorphic table for every derived artefact keyed by
    -- (journey, kind, key). Kinds we currently produce:
    --   build         key = variant
    --   step-diff     key = variant + ':' + stepIdx
    --   total-diff    key = variant
    --   analysis      key = variant
    --   schema        key = ''
    --   converter     key = ''
    --   yaml          key = mode
    -- New kinds cost nothing to add — no DDL change needed.
    CREATE TABLE IF NOT EXISTS artifacts (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      journey_id    UUID NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
      kind          TEXT NOT NULL,
      key           TEXT NOT NULL DEFAULT '',
      payload       JSONB NOT NULL,
      meta          JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (journey_id, kind, key)
    );

    CREATE INDEX IF NOT EXISTS artifacts_kind_idx
      ON artifacts (journey_id, kind);
  `);

  // gen_random_uuid needs the pgcrypto extension on older Postgres. 13+ has
  // it built in; leave the CREATE EXTENSION to a comment so we don't try to
  // execute it under a role that lacks superuser.
}

/** Convenience: run a query with the shared pool, or throw if disabled. */
export async function query(env, text, params) {
  const p = getPool(env);
  if (!p) throw new Error('Persistence is disabled: ' + disabledReason);
  return p.query(text, params);
}
