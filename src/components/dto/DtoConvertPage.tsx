import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { useLlmStore } from '@/store/llmStore';
import { getBuild } from '@/hooks/useBuild';
import { computeUiFieldImpact, mergeAcrossVariants } from '@/services/impact.service';
import { buildImpactDtoFromStep } from '@/services/impactDto.service';
import type { UiFieldEntry } from '@/types/impact';

/** Convert a selected step's WPF/EXE JSON into the merged-across DTO shape. */
export function DtoConvertPage() {
  const bundle = useAppStore((s) => s.bundle);
  const hideNoise = useAppStore((s) => s.hideNoise);
  const setPage = useAppStore((s) => s.setPage);
  const verdicts = useLlmStore((s) => s.verdicts);

  const [stepOrdinal, setStepOrdinal] = useState<number>(1);
  const [withSampleValues, setWithSampleValues] = useState(true);

  useEffect(() => {
    if (!bundle?.steps.length) return;
    setStepOrdinal(bundle.steps[0].ordinal);
  }, [bundle]);

  const seedEntries = useMemo(() => {
    if (!bundle || verdicts.size === 0) return [] as UiFieldEntry[];
    const wpfEntries = computeUiFieldImpact({
      build: getBuild(bundle, 'wpf'),
      variant: 'wpf',
      verdicts,
      steps: bundle.steps,
      hideNoise,
      includeCategories: ['derived'],
      includeUnclassified: false,
    });
    const exeEntries = computeUiFieldImpact({
      build: getBuild(bundle, 'exe'),
      variant: 'exe',
      verdicts,
      steps: bundle.steps,
      hideNoise,
      includeCategories: ['derived'],
      includeUnclassified: false,
    });
    return mergeAcrossVariants(wpfEntries, exeEntries);
  }, [bundle, verdicts, hideNoise]);

  const selectedIdx = useMemo(() => {
    if (!bundle) return -1;
    return bundle.steps.findIndex((s) => s.ordinal === stepOrdinal);
  }, [bundle, stepOrdinal]);

  const selectedStep = bundle?.steps[selectedIdx] ?? null;

  const wpfObj = useMemo(() => {
    if (!bundle || selectedIdx < 0) return null;
    return getBuild(bundle, 'wpf').docs[selectedIdx]?.obj ?? null;
  }, [bundle, selectedIdx]);
  const exeObj = useMemo(() => {
    if (!bundle || selectedIdx < 0) return null;
    return getBuild(bundle, 'exe').docs[selectedIdx]?.obj ?? null;
  }, [bundle, selectedIdx]);

  const dto = useMemo(
    () => buildImpactDtoFromStep(seedEntries, wpfObj, exeObj, { withSampleValues }),
    [seedEntries, withSampleValues, wpfObj, exeObj],
  );

  const dtoText = useMemo(() => JSON.stringify(dto, null, 4), [dto]);

  if (!bundle) return null;

  if (verdicts.size === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div
          style={{
            maxWidth: 560,
            border: '1px solid rgba(148,180,255,0.14)',
            borderRadius: 14,
            background: 'rgba(11,18,31,0.72)',
            padding: 18,
            color: '#c6d5eb',
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 600, color: '#e4edff' }}>
            DTO conversion needs UI-impact seeds
          </div>
          <div style={{ marginTop: 8, fontSize: 12.5, color: '#8ea4c2', lineHeight: 1.5 }}>
            Run Total diff analysis first. The converter uses merge:across UI-impact fields as seed
            to shape the DTO.
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
      <div
        style={{
          flex: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '11px 16px',
          borderBottom: '1px solid rgba(148,180,255,0.08)',
          background: 'rgba(14,20,34,0.4)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div
            style={{
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: 13,
              color: '#e6eeff',
            }}
          >
            convert JSONs to DTO
          </div>
          <div style={{ fontSize: 11.5, color: '#7f92b0', marginTop: 2 }}>
            step snapshots projected onto merge:across seed fields
          </div>
        </div>
        <span style={{ flex: 1 }} />

        <label
          style={{
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: 11,
            color: '#9bb0cc',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          step
          <select
            value={stepOrdinal}
            onChange={(e) => setStepOrdinal(Number(e.target.value))}
            className="afra-input"
            style={{
              minWidth: 260,
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: 11.5,
              padding: '6px 10px',
              borderRadius: 9,
              border: '1px solid rgba(148,180,255,0.12)',
              background: 'rgba(148,180,255,0.05)',
              color: '#dbe4f2',
              outline: 'none',
            }}
          >
            {bundle.steps.map((s) => (
              <option key={s.ordinal} value={s.ordinal}>
                step {String(s.ordinal).padStart(2, '0')} · {s.label}
              </option>
            ))}
          </select>
        </label>

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: 10.5,
            color: '#9ab0cd',
            userSelect: 'none',
          }}
        >
          <input
            type="checkbox"
            checked={withSampleValues}
            onChange={(e) => setWithSampleValues(e.target.checked)}
          />
          with sample values
        </label>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
        <section
          style={{
            width: '38%',
            minWidth: 320,
            borderRight: '1px solid rgba(148,180,255,0.10)',
            padding: 12,
            overflow: 'auto',
          }}
        >
          <div
            style={{
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: 11,
              color: '#8ea3c1',
            }}
          >
            Selected step
          </div>
          <div style={{ marginTop: 6, fontSize: 12.5, color: '#d9e4f6' }}>
            {selectedStep
              ? 'step ' +
                String(selectedStep.ordinal).padStart(2, '0') +
                ' · ' +
                selectedStep.label
              : '—'}
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: '#8ea3c1', lineHeight: 1.5 }}>
            {selectedStep?.operation ?? ''}
          </div>

          <div style={{ marginTop: 14, fontSize: 12, color: '#8ea3c1' }}>
            WPF file:{' '}
            <span style={{ color: '#c9d8ee' }}>
              {selectedStep?.files.find((f) => f.toLowerCase().endsWith('.wpf.json')) ?? '—'}
            </span>
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: '#8ea3c1' }}>
            EXE file:{' '}
            <span style={{ color: '#c9d8ee' }}>
              {selectedStep?.files.find((f) => f.toLowerCase().endsWith('.exe.json')) ?? '—'}
            </span>
          </div>

          <div style={{ marginTop: 14, fontSize: 12, color: '#8ea3c1' }}>
            Seed fields (merge:across):{' '}
            <span style={{ color: '#c9d8ee' }}>{seedEntries.length}</span>
          </div>
        </section>

        <section style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: 12 }}>
          <pre
            style={{
              margin: 0,
              whiteSpace: 'pre',
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: 12,
              lineHeight: '20px',
              color: '#cfe0f8',
            }}
          >
            {dtoText}
          </pre>
        </section>
      </div>
    </div>
  );
}
