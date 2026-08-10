import { useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '@/store/appStore';
import { useLlmStore } from '@/store/llmStore';
import { getBuild } from './useBuild';
import { buildLlmPayload, chunkPayload } from '@/services/llm.payload';
import { renderChunk } from '@/services/llm.prompt';
import { analyzeChunk, fetchLlmHealth } from '@/services/llm.service';
import type { LlmChunkTrace } from '@/types/llm';

/**
 * Drives the LLM pass: assemble both variants, batch them, send the batches
 * with a small amount of concurrency, and stream verdicts into the store as
 * each one lands so the merged list fills in progressively.
 */

const CONCURRENCY = 3;
const DEFAULT_BATCH = 60;

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
  const reset = useLlmStore((s) => s.reset);
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

  // Verdicts belong to one journey; a new folder invalidates all of them.
  // Guarded on identity because this hook remounts every time the user leaves
  // the Total-diff page, and a finished run should survive that.
  useEffect(() => {
    if (useLlmStore.getState().forBundle !== bundle) reset(bundle);
  }, [bundle, reset]);

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
        }
      }
    };

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    abortRef.current = null;
    finishRun(ctrl.signal.aborted ? undefined : firstError || undefined);
  }, [prepare, startRun, patchTrace, addVerdicts, finishRun]);

  const openDebug = useCallback(() => {
    prepare();
    setDebugOpen(true);
  }, [prepare, setDebugOpen]);

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
  };
}
