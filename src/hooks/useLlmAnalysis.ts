import { useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '@/store/appStore';
import { useLlmStore, verdictKey } from '@/store/llmStore';
import { getBuild } from './useBuild';
import { buildLlmPayload, chunkPayload } from '@/services/llm.payload';
import { renderChunk } from '@/services/llm.prompt';
import { analyzeChunk, fetchLlmHealth } from '@/services/llm.service';
import { deleteArtifactSafe } from '@/services/store.service';
import type { LlmChunkTrace } from '@/types/llm';

/**
 * Drives the LLM pass: assemble both variants, batch them, send the batches
 * with a small amount of concurrency, and stream verdicts into the store as
 * each one lands so the merged list fills in progressively.
 */

const CONCURRENCY = 3;
const DEFAULT_BATCH = 60;

/**
 * Drops the verdicts when a different journey is loaded. Mounted once at the
 * app level rather than alongside the LLM controls, because the results are
 * read by pages that never render those controls — leave it to whoever is
 * showing a button and a folder swapped in from the Ingest page keeps a stale
 * classification alive.
 */
export function useVerdictInvalidation(): void {
  const bundle = useAppStore((s) => s.bundle);
  const reset = useLlmStore((s) => s.reset);

  useEffect(() => {
    // Guarded on identity: this must survive ordinary re-renders, a finished
    // run should not be thrown away just because a page remounted.
    if (useLlmStore.getState().forBundle !== bundle) reset(bundle);
  }, [bundle, reset]);
}

export function useLlmAnalysis() {
  const bundle = useAppStore((s) => s.bundle);
  const hideNoise = useAppStore((s) => s.hideNoise);

  const health = useLlmStore((s) => s.health);
  const healthChecked = useLlmStore((s) => s.healthChecked);
  const status = useLlmStore((s) => s.status);
  const done = useLlmStore((s) => s.done);
  const total = useLlmStore((s) => s.total);
  const error = useLlmStore((s) => s.error);

  const setHealth = useLlmStore((s) => s.setHealth);
  const previewRun = useLlmStore((s) => s.previewRun);
  const startRun = useLlmStore((s) => s.startRun);
  const patchTrace = useLlmStore((s) => s.patchTrace);
  const addVerdicts = useLlmStore((s) => s.addVerdicts);
  const finishRun = useLlmStore((s) => s.finishRun);
  const setDebugOpen = useLlmStore((s) => s.setDebugOpen);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (healthChecked) return;
    let live = true;
    fetchLlmHealth()
      .then((h) => live && setHealth(h))
      .catch(() => live && setHealth(null));
    return () => {
      live = false;
    };
  }, [healthChecked, setHealth]);

  const batch = health?.pathsPerBatch ?? DEFAULT_BATCH;
  const signature = (bundle?.name ?? '') + '|' + hideNoise + '|' + batch;

  /**
   * Build the batches without sending anything. Both variants get built here,
   * which is the one genuinely expensive moment — hence doing it on demand
   * rather than on every noise-toggle.
   */
  const prepare = useCallback((): LlmChunkTrace[] => {
    if (!bundle) return [];
    const held = useLlmStore.getState();
    if (held.signature === signature && held.traces.length) return held.traces;

    const payload = buildLlmPayload(
      bundle,
      { wpf: getBuild(bundle, 'wpf'), exe: getBuild(bundle, 'exe') },
      { hideNoise },
    );
    const next: LlmChunkTrace[] = chunkPayload(payload, batch).map((chunk) => {
      const prompt = renderChunk(chunk);
      return {
        chunk,
        system: prompt.system,
        user: prompt.user,
        status: 'pending',
        response: null,
        error: null,
        usage: null,
        ms: null,
      };
    });

    previewRun(payload, next, signature);
    return next;
  }, [bundle, hideNoise, batch, signature, previewRun]);

  const cancel = useCallback(() => abortRef.current?.abort(), []);

  const run = useCallback(async () => {
    if (useLlmStore.getState().status === 'running') return;
    const queue = prepare().slice();
    if (!queue.length) return;

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    startRun();

    let firstError = '';

    const worker = async () => {
      for (;;) {
        if (ctrl.signal.aborted) return;
        const t = queue.shift();
        if (!t) return;

        patchTrace(t.chunk.id, { status: 'running' });
        const t0 = performance.now();
        try {
          const res = await analyzeChunk(
            t.chunk,
            { system: t.system, user: t.user },
            ctrl.signal,
          );
          patchTrace(t.chunk.id, {
            status: 'ok',
            response: res.raw,
            usage: res.usage,
            error: null,
            ms: Math.round(performance.now() - t0),
          });
          addVerdicts(res.verdicts);
        } catch (e) {
          if (ctrl.signal.aborted) return;
          const msg = e instanceof Error ? e.message : String(e);
          // One bad batch must not cost us the other nineteen.
          if (!firstError) firstError = msg;
          patchTrace(t.chunk.id, {
            status: 'error',
            error: msg,
            ms: Math.round(performance.now() - t0),
          });
          // Still mark every path in the failed batch so the gutter does not
          // quietly leave those rows blank next to their change chips.
          addVerdicts(
            t.chunk.entries.map((entry) => ({
              variant: t.chunk.variant,
              path: entry.path,
              category: 'unknown' as const,
              confidence: 0,
              reason: 'Batch failed: ' + msg,
            })),
          );
        }
      }
    };

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    abortRef.current = null;
    finishRun(ctrl.signal.aborted ? undefined : firstError || undefined);
    // #region agent log
    {
      const st = useLlmStore.getState();
      const sentPaths = st.traces.flatMap((t) =>
        t.chunk.entries.map((e) => ({ variant: t.chunk.variant, path: e.path, status: t.status })),
      );
      const missing = sentPaths.filter(
        (p) => !st.verdicts.has(verdictKey(p.variant, p.path)),
      );
      fetch('http://127.0.0.1:7369/ingest/d7782203-d7ad-44af-a3e4-ad5fc56ff0b3',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'53c723'},body:JSON.stringify({sessionId:'53c723',runId:'post-fix',hypothesisId:'B',location:'useLlmAnalysis.ts:run',message:'run finished coverage',data:{status:st.status,error:st.error||firstError||'',traceStatuses:st.traces.map((t)=>({id:t.chunk.id,status:t.status,error:t.error,entries:t.chunk.entries.length})),sent:sentPaths.length,verdicts:st.verdicts.size,missingCount:missing.length,missingByStatus:missing.reduce((m,p)=>{m[p.status]=(m[p.status]||0)+1;return m;},{} as Record<string,number>),missingSamples:missing.slice(0,12)},timestamp:Date.now()})}).catch(()=>{});
    }
    // #endregion
  }, [prepare, startRun, patchTrace, addVerdicts, finishRun]);

  const openDebug = useCallback(() => {
    prepare();
    setDebugOpen(true);
  }, [prepare, setDebugOpen]);

  /**
   * Wipe every LLM verdict for the current journey — both the in-memory
   * `llmStore` and the persisted `analysis/wpf` + `analysis/exe` rows in
   * Postgres. Cancels any run in flight first so a stale batch can't repopulate
   * verdicts after they've been cleared.
   *
   * The DB deletes are fire-and-forget: persistence being unavailable must not
   * prevent the operator from starting over locally.
   */
  const clear = useCallback(() => {
    abortRef.current?.abort();
    // `reset(bundle)` re-marks `forBundle` so `useVerdictInvalidation` sees no
    // divergence and doesn't clobber whatever comes next.
    useLlmStore.getState().reset(bundle);
    if (bundle) {
      void deleteArtifactSafe(bundle.name, 'analysis', 'wpf');
      void deleteArtifactSafe(bundle.name, 'analysis', 'exe');
    }
  }, [bundle]);

  return {
    health,
    healthChecked,
    status,
    done,
    total,
    error,
    ready: Boolean(bundle),
    configured: Boolean(health?.configured),
    run,
    cancel,
    openDebug,
    clear,
  };
}
