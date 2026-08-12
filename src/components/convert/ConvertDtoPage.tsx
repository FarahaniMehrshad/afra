import { CSSProperties, useMemo, useState } from 'react';
import { Segmented } from '@/components/ui/Segmented';
import { InlineDiff } from '@/components/steps/InlineDiff';
import { useConvertDto } from '@/hooks/useConvertDto';
import { useAppStore } from '@/store/appStore';
import { diffTexts } from '@/services/diff.service';
import { download } from '@/services/download.util';
import { canonicalStringify } from '@/services/jsonCanonical.util';

type ResultTab = 'plan' | 'wpf' | 'exe';

const RESULT_TABS: Array<{ value: ResultTab; label: string }> = [
  { value: 'plan', label: 'Plan' },
  { value: 'wpf', label: 'WPF result' },
  { value: 'exe', label: 'EXE result' },
];

export function ConvertDtoPage() {
  const bundle = useAppStore((s) => s.bundle);
  const setPage = useAppStore((s) => s.setPage);
  const dtoText = useAppStore((s) => s.convertDtoText);
  const setDtoText = useAppStore((s) => s.setConvertDtoText);
  const baseOrdinal = useAppStore((s) => s.convertBaseStepOrdinal);
  const setBaseOrdinal = useAppStore((s) => s.setConvertBaseStepOrdinal);
  const [tab, setTab] = useState<ResultTab>('plan');

  const {
    baseStep,
    baseWpfText,
    baseExeText,
    parseError,
    plan,
    wpfOut,
    exeOut,
    warnings,
    isReady,
    hasVerdicts,
    seedEntries,
    prefillDtoText,
  } = useConvertDto();

  const wpfText = useMemo(() => (wpfOut ? canonicalStringify(wpfOut) : '{}'), [wpfOut]);
  const exeText = useMemo(() => (exeOut ? canonicalStringify(exeOut) : '{}'), [exeOut]);
  const wpfRows = useMemo(() => diffTexts(baseWpfText, wpfText), [baseWpfText, wpfText]);
  const exeRows = useMemo(() => diffTexts(baseExeText, exeText), [baseExeText, exeText]);

  if (!bundle) return null;

  if (!hasVerdicts) {
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
            Apply DTO needs UI-impact seeds
          </div>
          <div style={{ marginTop: 8, fontSize: 12.5, color: '#8ea4c2', lineHeight: 1.5 }}>
            Run Total diff analysis first. DTO-to-JSON conversion replays derived effects based on
            UI-impact history.
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
            apply DTO to WPF + EXE
          </div>
          <div style={{ fontSize: 11.5, color: '#7f92b0', marginTop: 2 }}>
            compare against a base step, compute add/remove/modify, replay derived changes
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
            value={baseOrdinal}
            onChange={(e) => setBaseOrdinal(Number(e.target.value))}
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

        <button className="afra-btn" onClick={() => setDtoText(prefillDtoText)} style={actionBtnStyle}>
          prefill from step
        </button>
        <button className="afra-btn" onClick={() => void copyToClipboard(wpfText)} style={actionBtnStyle}>
          copy WPF
        </button>
        <button className="afra-btn" onClick={() => void copyToClipboard(exeText)} style={actionBtnStyle}>
          copy EXE
        </button>
        <button
          className="afra-btn"
          onClick={() => {
            const suffix = baseStep ? 'step' + String(baseStep.ordinal).padStart(2, '0') : 'step';
            download('afra-' + suffix + '.wpf.json', wpfText);
            download('afra-' + suffix + '.exe.json', exeText);
          }}
          style={actionBtnStyle}
        >
          download both
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
        <section
          style={{
            width: '44%',
            minWidth: 360,
            borderRight: '1px solid rgba(148,180,255,0.10)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ padding: 12, borderBottom: '1px solid rgba(148,180,255,0.08)' }}>
            <div
              style={{
                fontFamily: 'IBM Plex Mono, monospace',
                fontSize: 11,
                color: '#8ea3c1',
              }}
            >
              DTO input (paste JSON)
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: '#9eb2cf', lineHeight: 1.45 }}>
              Seed fields available (merge:across): {seedEntries.across.length}
            </div>
          </div>
          <textarea
            value={dtoText}
            onChange={(e) => setDtoText(e.target.value)}
            spellCheck={false}
            placeholder='Paste DTO JSON here, then review generated plan and output JSONs…'
            style={{
              flex: 1,
              width: '100%',
              resize: 'none',
              border: 'none',
              outline: 'none',
              background: 'rgba(8,13,22,0.86)',
              color: '#d7e5fa',
              padding: 12,
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: 12,
              lineHeight: '20px',
            }}
          />
          {parseError && (
            <div
              style={{
                borderTop: '1px solid rgba(233,120,120,0.25)',
                background: 'rgba(130,32,32,0.25)',
                color: '#f0c0c0',
                fontFamily: 'IBM Plex Mono, monospace',
                fontSize: 11,
                padding: '8px 10px',
              }}
            >
              invalid JSON: {parseError}
            </div>
          )}
        </section>

        <section style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              flex: 'none',
              padding: '10px 12px',
              borderBottom: '1px solid rgba(148,180,255,0.08)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <Segmented<ResultTab>
              options={RESULT_TABS}
              isActive={(v) => v === tab}
              onSelect={setTab}
              small
            />
            <span style={{ flex: 1 }} />
            <span
              style={{
                fontFamily: 'IBM Plex Mono, monospace',
                fontSize: 11,
                color: '#8ea3c1',
              }}
            >
              {baseStep
                ? 'base step ' + String(baseStep.ordinal).padStart(2, '0') + ' · ' + baseStep.label
                : 'no base step'}
            </span>
          </div>

          <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 12 }}>
            {tab === 'plan' && (
              <PlanPanel
                plan={plan}
                warnings={warnings}
                ready={isReady}
                baseStep={baseStep?.operation ?? ''}
              />
            )}
            {tab === 'wpf' && (
              <ResultInlineDiffPanel
                ready={isReady}
                rows={wpfRows}
                emptyLabel="Paste a valid DTO JSON to preview WPF inline diff."
              />
            )}
            {tab === 'exe' && (
              <ResultInlineDiffPanel
                ready={isReady}
                rows={exeRows}
                emptyLabel="Paste a valid DTO JSON to preview EXE inline diff."
              />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function PlanPanel({
  plan,
  warnings,
  ready,
  baseStep,
}: {
  plan: ReturnType<typeof useConvertDto>['plan'];
  warnings: string[];
  ready: boolean;
  baseStep: string;
}) {
  if (!ready || !plan) {
    return (
      <div style={{ fontSize: 12.5, color: '#8ea3c1', lineHeight: 1.6 }}>
        Paste a valid DTO JSON to generate operations.
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div
        style={{
          fontSize: 12,
          color: '#95abc9',
          fontFamily: 'IBM Plex Mono, monospace',
        }}
      >
        base operation: {baseStep || '—'}
      </div>
      <VariantPlan title="WPF" fields={plan.wpf.fields} elements={plan.wpf.elements} />
      <VariantPlan title="EXE" fields={plan.exe.fields} elements={plan.exe.elements} />
      {warnings.length > 0 && (
        <div
          style={{
            border: '1px solid rgba(233,180,120,0.28)',
            background: 'rgba(140,96,30,0.20)',
            borderRadius: 10,
            padding: '10px 12px',
          }}
        >
          <div style={{ fontSize: 11.5, color: '#f3d1a2', marginBottom: 6 }}>warnings</div>
          <ul style={{ margin: 0, paddingLeft: 18, color: '#e8c79c', fontSize: 11.5, lineHeight: 1.45 }}>
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function VariantPlan({
  title,
  fields,
  elements,
}: {
  title: string;
  fields: Array<{ kind: string; concretePath: string; seedCanonical: string; fromValue: unknown; toValue: unknown }>;
  elements: Array<{ kind: string; parentArrayPath: string; mintedIndex?: number }>;
}) {
  return (
    <div
      style={{
        border: '1px solid rgba(148,180,255,0.14)',
        background: 'rgba(12,19,31,0.56)',
        borderRadius: 12,
        padding: 10,
      }}
    >
      <div
        style={{
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: 12,
          color: '#dde7fa',
          marginBottom: 8,
        }}
      >
        {title} · fields {fields.length} · elements {elements.length}
      </div>

      <div style={{ display: 'grid', gap: 7 }}>
        {elements.map((op, idx) => (
          <div key={'e-' + idx} style={opCardStyle(op.kind)}>
            <div style={{ color: '#c5d6ef', fontSize: 11.5 }}>
              {op.kind} element at <code>{op.parentArrayPath}</code>{' '}
              {op.mintedIndex !== undefined ? '(index ' + op.mintedIndex + ')' : ''}
            </div>
          </div>
        ))}
        {fields.map((op, idx) => (
          <div key={'f-' + idx} style={opCardStyle(op.kind)}>
            <div style={{ color: '#c5d6ef', fontSize: 11.5 }}>
              {op.kind} <code>{op.concretePath}</code>
            </div>
            <div style={{ color: '#9eb2cf', fontSize: 11, marginTop: 4 }}>seed: {op.seedCanonical}</div>
            <div style={{ color: '#8da1be', fontSize: 11, marginTop: 4 }}>
              from {jsonInline(op.fromValue)} to {jsonInline(op.toValue)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResultInlineDiffPanel({
  ready,
  rows,
  emptyLabel,
}: {
  ready: boolean;
  rows: Parameters<typeof InlineDiff>[0]['rows'];
  emptyLabel: string;
}) {
  if (!ready) {
    return <div style={{ fontSize: 12.5, color: '#8ea3c1', lineHeight: 1.6 }}>{emptyLabel}</div>;
  }
  if (!rows.length) {
    return (
      <div style={{ fontSize: 12.5, color: '#8ea3c1', lineHeight: 1.6 }}>
        No line-level differences for this variant.
      </div>
    );
  }

  return (
    <div
      style={{
        fontFamily: 'IBM Plex Mono, monospace',
        fontSize: 12,
        lineHeight: '20px',
        color: '#cfe0f8',
      }}
    >
      <InlineDiff rows={rows} hideNoise={false} wrap={false} />
    </div>
  );
}

function opCardStyle(kind: string): CSSProperties {
  const add = kind === 'add';
  const remove = kind === 'remove';
  return {
    border: '1px solid ' + (add ? 'rgba(94,186,140,0.33)' : remove ? 'rgba(220,118,130,0.34)' : 'rgba(227,188,111,0.34)'),
    background: add
      ? 'rgba(62,145,103,0.14)'
      : remove
        ? 'rgba(166,72,88,0.16)'
        : 'rgba(169,130,57,0.14)',
    borderRadius: 8,
    padding: '8px 10px',
  };
}

function jsonInline(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

async function copyToClipboard(text: string): Promise<void> {
  if (!navigator?.clipboard) return;
  await navigator.clipboard.writeText(text);
}

const actionBtnStyle: CSSProperties = {
  fontFamily: 'IBM Plex Mono, monospace',
  fontSize: 11,
  padding: '6px 10px',
  borderRadius: 8,
  border: '1px solid rgba(148,180,255,0.20)',
  background: 'rgba(148,180,255,0.08)',
  color: '#d6e3f8',
};
