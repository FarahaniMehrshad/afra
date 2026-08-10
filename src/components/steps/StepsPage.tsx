import { useCallback, useMemo, useRef } from 'react';
import { useAppStore } from '@/store/appStore';
import { useBuild } from '@/hooks/useBuild';
import { useDiff } from '@/hooks/useDiff';
import { ROW_HEIGHT } from '@/constants';
import { StepNav } from './StepNav';
import { DiffToolbar } from './DiffToolbar';
import { SplitDiff } from './SplitDiff';
import { InlineDiff } from './InlineDiff';

/** The per-step diff page — sidebar + toolbar + diff viewport. */
export function StepsPage() {
  const bundle = useAppStore((s) => s.bundle);
  const stepIdx = useAppStore((s) => s.stepIdx);
  const layout = useAppStore((s) => s.layout);
  const hideNoise = useAppStore((s) => s.hideNoise);
  const wrap = useAppStore((s) => s.wrap);
  const diffQuery = useAppStore((s) => s.diffQuery);
  const build = useBuild();

  const idx = Math.max(1, Math.min(stepIdx, (bundle?.steps.length ?? 1) - 1));
  const rows = useDiff(build, idx);
  const scrollRef = useRef<HTMLDivElement>(null);

  const missingDoc = !build?.docs[idx]?.text;
  const step = bundle?.steps[idx];
  const prevFileLabel =
    idx > 0
      ? build?.docs[idx - 1]?.file ?? 'no previous document'
      : 'empty — first step';
  const curFileLabel = build?.docs[idx]?.file ?? 'missing document';

  const filtered = useMemo(() => {
    const q = diffQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      ((r.a ?? '') + ' ' + (r.b ?? '')).toLowerCase().includes(q),
    );
  }, [rows, diffQuery]);

  const addCount = missingDoc
    ? 0
    : filtered.filter(
        (r) => (r.k === 'add' || r.k === 'mod') && !(hideNoise && r.noise),
      ).length;
  const delCount = missingDoc
    ? 0
    : filtered.filter(
        (r) => (r.k === 'del' || r.k === 'mod') && !(hideNoise && r.noise),
      ).length;

  const changeIndices = useMemo(() => {
    const list: number[] = [];
    filtered.forEach((r, i) => {
      if (r.k !== '=' && r.k !== 'fold' && !(hideNoise && r.noise)) {
        list.push(i);
      }
    });
    return list;
  }, [filtered, hideNoise]);

  const jump = useCallback(
    (dir: 1 | -1) => {
      const el = scrollRef.current;
      if (!el || !changeIndices.length) return;
      const cur = el.scrollTop / ROW_HEIGHT + 3;
      let target: number | undefined;
      if (dir > 0) target = changeIndices.find((x) => x > cur + 0.5);
      else for (const x of changeIndices) if (x < cur - 0.5) target = x;
      if (target === undefined) {
        target = dir > 0 ? changeIndices[0] : changeIndices[changeIndices.length - 1];
      }
      el.scrollTo({ top: Math.max(0, (target - 3) * ROW_HEIGHT), behavior: 'smooth' });
    },
    [changeIndices],
  );

  if (!step) return null;

  return (
    <>
      <StepNav />

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <DiffToolbar
          title={String(step.ordinal).padStart(2, '0') + '  ' + step.label}
          operation={step.operation}
          addCount={addCount}
          delCount={delCount}
          onJump={jump}
        />
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflow: 'auto',
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: 12,
            lineHeight: ROW_HEIGHT + 'px',
          }}
        >
          {(!filtered.length || missingDoc) && (
            <div
              style={{
                padding: '60px 30px',
                textAlign: 'center',
                color: '#7f92b0',
                fontSize: 13,
                lineHeight: 1.7,
              }}
            >
              {missingDoc
                ? 'No document could be read for this step (' +
                  (build?.docs[idx]?.file ?? 'no file listed in journey.jsonl') +
                  ').'
                : diffQuery
                  ? 'No lines match your search.'
                  : 'This step introduced no line-level changes.'}
            </div>
          )}
          {filtered.length > 0 && !missingDoc && layout === 'split' && (
            <SplitDiff
              rows={filtered}
              hideNoise={hideNoise}
              wrap={wrap}
              prevFileLabel={prevFileLabel}
              curFileLabel={curFileLabel}
            />
          )}
          {filtered.length > 0 && !missingDoc && layout === 'inline' && (
            <InlineDiff rows={filtered} hideNoise={hideNoise} wrap={wrap} />
          )}
        </div>
      </div>
    </>
  );
}
