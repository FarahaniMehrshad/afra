import { useCallback, useMemo, useRef } from 'react';
import { useAppStore } from '@/store/appStore';
import { useLlmStore, verdictKey } from '@/store/llmStore';
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

  // #region agent log
  useMemo(() => {
    if (!build || !verdicts.size) return null;
    const chipNoBadge: { path: string; events: number; inHist: boolean; inVerdicts: boolean }[] = [];
    for (const x of shown) {
      if (!x.evs.length) continue;
      const has = verdicts.has(verdictKey(variant, x.l.path));
      if (!has) {
        chipNoBadge.push({
          path: x.l.path,
          events: x.evs.length,
          inHist: build.hist.has(x.l.path),
          inVerdicts: false,
        });
      }
    }
    fetch('http://127.0.0.1:7369/ingest/d7782203-d7ad-44af-a3e4-ad5fc56ff0b3',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'53c723'},body:JSON.stringify({sessionId:'53c723',runId:'post-fix',hypothesisId:'D',location:'TotalPage.tsx:shown',message:'chip-no-badge rows',data:{variant,hideNoise,verdicts:verdicts.size,shown:shown.length,chipRows:shown.filter((x)=>x.evs.length).length,chipNoBadgeCount:chipNoBadge.length,chipNoBadgeSamples:chipNoBadge.slice(0,20),unknownBadges:[...verdicts.values()].filter((v)=>v.category==='unknown'&&v.variant===variant).length,closerLike:chipNoBadge.filter((r)=>r.path.endsWith('}')||r.path==='').length},timestamp:Date.now()})}).catch(()=>{});
    return chipNoBadge.length;
  }, [build, shown, verdicts, variant, hideNoise]);
  // #endregion

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
