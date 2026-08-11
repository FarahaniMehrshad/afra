import { useEffect } from 'react';
import { useAppStore } from '@/store/appStore';
import { useLlmStore } from '@/store/llmStore';
import { useBuild } from './useBuild';
import { saveArtifactSafe, saveJourneySafe } from '@/services/store.service';
import { diffTexts } from '@/services/diff.service';
import type { BuildResult } from '@/types/ir';

/**
 * Auto-persist coordinator. Mounted once at the app root. Subscribes to the
 * pieces of state that produce user-visible artefacts and writes each one to
 * the persistence API when it settles.
 *
 * Saves are best-effort: any failure logs a warning and moves on. Each save
 * is debounced per-artefact so a burst of state updates during an LLM run
 * doesn't hammer the database.
 */

// Coalesce writes: a burst finishes with one PUT rather than one per keystroke.
const DEBOUNCE_MS = 700;

export function usePersist(): void {
  const bundle = useAppStore((s) => s.bundle);
  const variant = useAppStore((s) => s.variant);
  const stepIdx = useAppStore((s) => s.stepIdx);
  const verdicts = useLlmStore((s) => s.verdicts);

  const build = useBuild();

  // 1. The journey itself. First save happens the moment a bundle is loaded;
  //    later saves are no-ops because content doesn't change post-ingest, but
  //    the effect re-runs cheaply when the identity flips.
  useDebouncedEffect(
    () => {
      if (!bundle) return;
      void saveJourneySafe(bundle);
    },
    [bundle],
    DEBOUNCE_MS,
  );

  // 2. Per-variant build. This carries the merged JSON, its emitted lines,
  //    the change counts, and the full history map — everything the Total
  //    diff view is derived from.
  useDebouncedEffect(
    () => {
      if (!bundle || !build) return;
      void saveArtifactSafe(bundle.name, 'build', variant, serializeBuild(build), {
        variant,
        stepCount: build.docs.length,
        mergedLineCount: build.mergedLines.length,
      });
      // A denormalised copy of the merged-lines slice so the Total-diff page
      // can be reconstructed without pulling the (much bigger) full build.
      void saveArtifactSafe(bundle.name, 'total-diff', variant, {
        mergedLines: build.mergedLines,
        counts: build.counts,
      });
    },
    [bundle, variant, build],
    DEBOUNCE_MS,
  );

  // 3. The currently viewed step diff. Diffs are cheap to recompute, but we
  //    save the ones the user actually looks at so a reload page can show
  //    them without spinning up the whole build.
  useDebouncedEffect(
    () => {
      if (!bundle || !build || stepIdx <= 0) return;
      const prev = build.docs[stepIdx - 1]?.text ?? '';
      const cur = build.docs[stepIdx]?.text ?? '';
      if (!cur) return;
      const rows = diffTexts(prev, cur);
      const key = variant + ':' + stepIdx;
      void saveArtifactSafe(bundle.name, 'step-diff', key, rows, {
        variant,
        stepIdx,
        rowCount: rows.length,
      });
    },
    [bundle, build, variant, stepIdx],
    DEBOUNCE_MS,
  );

  // 4. LLM verdicts. Written per-variant so both wpf and exe classifications
  //    survive independently. Skipped when the map is empty (no run yet).
  useDebouncedEffect(
    () => {
      if (!bundle || verdicts.size === 0) return;
      const perVariant: Record<string, unknown[]> = { wpf: [], exe: [] };
      for (const v of verdicts.values()) {
        (perVariant[v.variant] ??= []).push(v);
      }
      for (const [v, rows] of Object.entries(perVariant)) {
        if (rows.length) {
          void saveArtifactSafe(bundle.name, 'analysis', v, rows, {
            variant: v,
            count: rows.length,
          });
        }
      }
    },
    [bundle, verdicts],
    DEBOUNCE_MS,
  );

  // The old JSON-to-YML persistence (schema, yaml, converter artefacts) has
  // been removed alongside the deterministic converter itself. When the new
  // LLM-driven JSON-to-YML flow lands, its outputs get new effects here.
}

/**
 * setTimeout inside useEffect keyed by deps. Each dep-change resets the
 * timer, so a rapid burst collapses into one call at the end.
 */
function useDebouncedEffect(
  fn: () => void,
  deps: React.DependencyList,
  ms: number,
): void {
  useEffect(() => {
    const t = setTimeout(fn, ms);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/* ------------------------- Serialisers ----------------------------------- */
// The domain has a few `Map` fields that don't survive JSON.stringify on
// their own. Each serialiser produces a plain-object shape that round-trips
// through the store.

function serializeBuild(b: BuildResult): unknown {
  return {
    // Drop `obj` because it's redundant with `text` and much bigger.
    docs: b.docs.map((d) => ({ file: d.file, text: d.text })),
    mergedLines: b.mergedLines,
    counts: b.counts,
    hist: Array.from(b.hist.entries()),
  };
}
