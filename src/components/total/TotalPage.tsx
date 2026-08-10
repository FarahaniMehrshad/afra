import { useCallback, useMemo, useRef } from 'react';
import { useAppStore } from '@/store/appStore';
import { useLlmStore } from '@/store/llmStore';
import { useBuild } from '@/hooks/useBuild';
import { ROW_HEIGHT } from '@/constants';
import { TotalToolbar } from './TotalToolbar';
import { MergedList, ShownLine } from './MergedList';
import { HistoryPanel } from './HistoryPanel';
import { LlmDebugPanel } from './LlmDebugPanel';

/** The Total-diff page — merged JSON list + line history side panel. */
export function TotalPage() {
  const bundle = useAppStore((s) => s.bundle);
  const build = useBuild();
  const hideNoise = useAppStore((s) => s.hideNoise);
  const onlyChanged = useAppStore((s) => s.onlyChanged);
  const typeFilters = useAppStore((s) => s.typeFilters);
  const minCount = useAppStore((s) => s.minCount);
  const totalQuery = useAppStore((s) => s.totalQuery);
  const selPath = useAppStore((s) => s.selPath);
  const selectPath = useAppStore((s) => s.selectPath);
  const wrap = useAppStore((s) => s.wrap);
  const variant = useAppStore((s) => s.variant);
  const verdicts = useLlmStore((s) => s.verdicts);
  const debugOpen = useLlmStore((s) => s.debugOpen);
  const setDebugOpen = useLlmStore((s) => s.setDebugOpen);

  const scrollRef = useRef<HTMLDivElement>(null);

  const shown: ShownLine[] = useMemo(() => {
    if (!build) return [];
    const tq = totalQuery.trim().toLowerCase();
    const lines = build.mergedLines;
    const out: ShownLine[] = [];
    lines.forEach((l, i) => {
      const evs = build.hist.get(l.path) ?? [];
      const real = evs.filter((e) => !(hideNoise && e.noise));
      if (onlyChanged && !real.length) return;
      if (typeFilters.length && !real.some((e) => typeFilters.includes(e.st))) return;
      if (minCount > 0 && real.length < minCount) return;
      if (
        tq &&
        !l.text.toLowerCase().includes(tq) &&
        !(l.path || '').toLowerCase().includes(tq)
      ) {
        return;
      }
      out.push({ l, i, evs: real });
    });
    // Cap to keep the DOM light even on huge configurations.
    return out.slice(0, 4000);
  }, [build, hideNoise, onlyChanged, typeFilters, minCount, totalQuery]);

  const totalChangeIdx = useMemo(() => {
    const list: number[] = [];
    shown.forEach((x, ri) => {
      if (x.evs.length) list.push(ri);
    });
    return list;
  }, [shown]);

  const jumpTotal = useCallback(
    (dir: 1 | -1) => {
      const el = scrollRef.current;
      if (!el || !totalChangeIdx.length) return;
      const cur = el.scrollTop / ROW_HEIGHT + 3;
      let target: number | undefined;
      if (dir > 0) target = totalChangeIdx.find((x) => x > cur + 0.5);
      else for (const x of totalChangeIdx) if (x < cur - 0.5) target = x;
      if (target === undefined) {
        target =
          dir > 0
            ? totalChangeIdx[0]
            : totalChangeIdx[totalChangeIdx.length - 1];
      }
      el.scrollTo({ top: Math.max(0, (target - 3) * ROW_HEIGHT), behavior: 'smooth' });
    },
    [totalChangeIdx],
  );

  const countLabel = build
    ? shown.length === build.mergedLines.length
      ? build.mergedLines.length + ' lines'
      : shown.length + ' of ' + build.mergedLines.length + ' lines'
    : '';

  if (!bundle) return null;

  return (
    <>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <TotalToolbar
          changeLabel={totalChangeIdx.length + ' changed'}
          countLabel={countLabel}
          onJump={jumpTotal}
        />
        <MergedList
          ref={scrollRef}
          lines={shown}
          selPath={selPath}
          wrap={wrap}
          steps={bundle.steps}
          variant={variant}
          verdicts={verdicts}
          onSelect={selectPath}
        />
      </div>
      <HistoryPanel />
      {debugOpen && <LlmDebugPanel onClose={() => setDebugOpen(false)} />}
    </>
  );
}
