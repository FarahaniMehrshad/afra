import { useMemo } from 'react';
import { useAppStore } from '@/store/appStore';
import type { EventKind } from '@/types/ir';
import type { UiFieldEntry, UiFieldImpact } from '@/types/impact';
import type { Variant } from '@/types/journey';
import { useUiFieldImpact } from '@/hooks/useUiFieldImpact';
import { ImpactToolbar } from './ImpactToolbar';
import { ImpactColumn } from './ImpactColumn';

/** Field-first map of UI events and same-step derived changes. */
export function ImpactPage() {
  const bundle = useAppStore((s) => s.bundle);
  const impactQuery = useAppStore((s) => s.impactQuery);
  const impactKinds = useAppStore((s) => s.impactKinds);
  const setPage = useAppStore((s) => s.setPage);
  const setVariant = useAppStore((s) => s.setVariant);
  const selectPath = useAppStore((s) => s.selectPath);
  const { mode, wpf, exe, combined, hasVerdicts, hasBothVariants } = useUiFieldImpact();

  const fwpf = useMemo(
    () => (wpf ? filterImpact(wpf, impactQuery, impactKinds) : null),
    [wpf, impactQuery, impactKinds],
  );
  const fexe = useMemo(
    () => (exe ? filterImpact(exe, impactQuery, impactKinds) : null),
    [exe, impactQuery, impactKinds],
  );
  const fcombined = useMemo(
    () => (combined ? filterImpact(combined, impactQuery, impactKinds) : null),
    [combined, impactQuery, impactKinds],
  );

  const summaryLabel = useMemo(() => {
    const fields =
      mode === 'across'
        ? (fcombined?.totals.fields ?? 0)
        : (fwpf?.totals.fields ?? 0) + (fexe?.totals.fields ?? 0);
    const events =
      mode === 'across'
        ? (fcombined?.totals.occurrences ?? 0)
        : (fwpf?.totals.occurrences ?? 0) + (fexe?.totals.occurrences ?? 0);
    const derived =
      mode === 'across'
        ? (fcombined?.totals.derived ?? 0)
        : (fwpf?.totals.derived ?? 0) + (fexe?.totals.derived ?? 0);
    return fields + ' fields · ' + events + ' events · ' + derived + ' derived';
  }, [mode, fcombined, fwpf, fexe]);

  if (!bundle) return null;

  if (!hasVerdicts) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div
          style={{
            maxWidth: 520,
            border: '1px solid rgba(148,180,255,0.14)',
            borderRadius: 14,
            background: 'rgba(11,18,31,0.72)',
            padding: 18,
            color: '#c6d5eb',
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 600, color: '#e4edff' }}>
            UI impact needs analysis results
          </div>
          <div style={{ marginTop: 8, fontSize: 12.5, color: '#8ea4c2', lineHeight: 1.5 }}>
            Run analysis in Total diff first. This page uses its step-operation and derived verdicts
            to group every UI field change with same-step side effects.
          </div>
          <button
            className="afra-btn"
            onClick={() => setPage('total')}
            style={{
              marginTop: 12,
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: 11.5,
              padding: '7px 11px',
              borderRadius: 8,
              border: '1px solid rgba(120,165,255,0.36)',
              background: 'rgba(79,141,253,0.20)',
              color: '#dbe8ff',
            }}
          >
            go to Total diff
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <ImpactToolbar summaryLabel={summaryLabel} />
      {!hasBothVariants && mode !== 'across' && (
        <div
          style={{
            flex: 'none',
            padding: '8px 12px',
            fontSize: 12,
            color: '#9bb0cc',
            borderBottom: '1px solid rgba(148,180,255,0.08)',
          }}
        >
          One variant is missing in this journey; showing what is available.
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
        {mode === 'across' ? (
          fcombined && (
            <ImpactColumn
              impact={fcombined}
              kinds={impactKinds}
              onPathClick={(path, variant) =>
                jumpToPath(path, variant, setVariant, selectPath, setPage)
              }
            />
          )
        ) : (
          <>
            {fwpf && (
              <ImpactColumn
                impact={fwpf}
                kinds={impactKinds}
                onPathClick={(path, variant) =>
                  jumpToPath(path, variant, setVariant, selectPath, setPage)
                }
              />
            )}
            {fexe && (
              <ImpactColumn
                impact={fexe}
                kinds={impactKinds}
                onPathClick={(path, variant) =>
                  jumpToPath(path, variant, setVariant, selectPath, setPage)
                }
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function jumpToPath(
  path: string,
  variant: Variant,
  setVariant: (v: Variant) => void,
  selectPath: (p: string | null) => void,
  setPage: (p: 'total') => void,
): void {
  setVariant(variant);
  selectPath(path);
  setPage('total');
}

function filterImpact(impact: UiFieldImpact, q: string, kinds: EventKind[]): UiFieldImpact {
  const query = q.trim().toLowerCase();
  const entries = impact.entries.filter((entry) => entryMatches(entry, query, kinds));
  const occurrences = entries.reduce(
    (n, e) => n + e.byKind.add.length + e.byKind.remove.length + e.byKind.modify.length,
    0,
  );
  const derived = entries.reduce((n, e) => n + e.totals.derived, 0);
  return {
    ...impact,
    entries,
    totals: {
      fields: entries.length,
      occurrences,
      derived,
    },
  };
}

function entryMatches(entry: UiFieldEntry, query: string, kinds: EventKind[]): boolean {
  if (kinds.length && !kinds.some((k) => entry.byKind[k].length > 0)) return false;
  if (!query) return true;

  if (entry.canonical.toLowerCase().includes(query)) return true;
  for (const kind of ['add', 'remove', 'modify'] as const) {
    for (const row of entry.byKind[kind]) {
      if (row.label.toLowerCase().includes(query)) return true;
      if (row.operation.toLowerCase().includes(query)) return true;
      if (row.concretePaths.some((p) => p.path.toLowerCase().includes(query))) return true;
      if (row.derived.some((d) => d.path.toLowerCase().includes(query))) return true;
    }
  }
  return false;
}
