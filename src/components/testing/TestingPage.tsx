import { CSSProperties, useState } from 'react';
import { Segmented } from '@/components/ui/Segmented';
import { InlineDiff } from '@/components/steps/InlineDiff';
import { useTestRun } from '@/hooks/useTestRun';
import { useAppStore } from '@/store/appStore';
import { download } from '@/services/download.util';
import type { VariantTestResult } from '@/hooks/useTestRun';

type TestTab = 'summary' | 'wpf' | 'exe' | 'dto' | 'plan';

const TABS: Array<{ value: TestTab; label: string }> = [
  { value: 'summary', label: 'Summary' },
  { value: 'wpf', label: 'WPF diff' },
  { value: 'exe', label: 'EXE diff' },
  { value: 'dto', label: 'DTO used' },
  { value: 'plan', label: 'Plan' },
];

/**
 * Regression harness page. Base step S is fed the DTO derived from step S+1's
 * real snapshots; anything the round trip doesn't reproduce shows up as a
 * unified diff and is logged to the debug ingest for offline analysis.
 */
export function TestingPage() {
  const bundle = useAppStore((s) => s.bundle);
  const setPage = useAppStore((s) => s.setPage);
  const baseOrdinal = useAppStore((s) => s.testBaseStepOrdinal);
  const setBaseOrdinal = useAppStore((s) => s.setTestBaseStepOrdinal);
  const [tab, setTab] = useState<TestTab>('summary');

  const run = useTestRun();

  if (!bundle) return null;

  if (!run.hasVerdicts) {
    return (
      <EmptyState
        title="Testing needs UI-impact seeds"
        body="Run Total-diff analysis first. Testing round-trips through the same DTO pipeline."
        cta="go to Total diff"
        onCta={() => setPage('total')}
      />
    );
  }

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <Toolbar
        baseOrdinal={baseOrdinal}
        onBaseChange={setBaseOrdinal}
        onDownloadLogs={() => {
          const payload = JSON.stringify(run, replacerForLogs, 2);
          const stamp = 'step' + String(run.baseStep?.ordinal ?? 0).padStart(2, '0');
          download('afra-test-' + stamp + '.json', payload);
        }}
      />

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
        <Segmented<TestTab>
          options={TABS}
          isActive={(v) => v === tab}
          onSelect={setTab}
          small
        />
        <span style={{ flex: 1 }} />
        <StatusPills wpf={run.wpf} exe={run.exe} />
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 12 }}>
        {!run.isReady && (
          <div style={{ color: '#8ea3c1', fontSize: 12.5, lineHeight: 1.6 }}>
            {run.nextStep === null
              ? 'This is the last step in the journey; pick an earlier base to compare.'
              : 'Preparing round-trip…'}
          </div>
        )}

        {run.isReady && tab === 'summary' && <SummaryPanel run={run} />}
        {run.isReady && tab === 'wpf' && <DiffPanel result={run.wpf} />}
        {run.isReady && tab === 'exe' && <DiffPanel result={run.exe} />}
        {run.isReady && tab === 'dto' && <TextPanel text={run.dtoText} label="DTO built from next step" />}
        {run.isReady && tab === 'plan' && <PlanPanel run={run} />}
      </div>
    </div>
  );
}

function Toolbar({
  baseOrdinal,
  onBaseChange,
  onDownloadLogs,
}: {
  baseOrdinal: number;
  onBaseChange: (n: number) => void;
  onDownloadLogs: () => void;
}) {
  const bundle = useAppStore((s) => s.bundle);
  if (!bundle) return null;

  const idx = bundle.steps.findIndex((s) => s.ordinal === baseOrdinal);
  const next = idx >= 0 ? bundle.steps[idx + 1] ?? null : null;

  return (
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
        <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 13, color: '#e6eeff' }}>
          round-trip · DTO(next) → apply(base) → compare(next)
        </div>
        <div style={{ fontSize: 11.5, color: '#7f92b0', marginTop: 2 }}>
          {next
            ? 'next: step ' + String(next.ordinal).padStart(2, '0') + ' · ' + next.label
            : 'no next step — pick an earlier base'}
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
        base
        <select
          value={baseOrdinal}
          onChange={(e) => onBaseChange(Number(e.target.value))}
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
          {bundle.steps.map((s, i) => (
            <option
              key={s.ordinal}
              value={s.ordinal}
              disabled={i === bundle.steps.length - 1}
            >
              step {String(s.ordinal).padStart(2, '0')} · {s.label}
              {i === bundle.steps.length - 1 ? ' (no next)' : ''}
            </option>
          ))}
        </select>
      </label>

      <button className="afra-btn" onClick={onDownloadLogs} style={btnStyle}>
        download run report
      </button>
    </div>
  );
}

function StatusPills({
  wpf,
  exe,
}: {
  wpf: VariantTestResult | null;
  exe: VariantTestResult | null;
}) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <StatusPill label="WPF" result={wpf} />
      <StatusPill label="EXE" result={exe} />
    </div>
  );
}

function StatusPill({ label, result }: { label: string; result: VariantTestResult | null }) {
  const match = result?.match;
  const count = result?.diffCount ?? 0;
  const color =
    match === undefined ? '#8ea3c1' : match ? '#8be0a4' : '#f0a89c';
  const bg =
    match === undefined
      ? 'rgba(148,180,255,0.08)'
      : match
        ? 'rgba(70,190,120,0.12)'
        : 'rgba(220,110,110,0.14)';
  const text = match === undefined ? '—' : match ? 'match' : count + ' diffs';
  return (
    <span
      style={{
        fontFamily: 'IBM Plex Mono, monospace',
        fontSize: 11,
        padding: '4px 8px',
        borderRadius: 8,
        border: '1px solid rgba(148,180,255,0.20)',
        color,
        background: bg,
      }}
    >
      {label}: {text}
    </span>
  );
}

function SummaryPanel({ run }: { run: ReturnType<typeof useTestRun> }) {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Card>
        <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, color: '#dde7fa' }}>
          {run.baseStep
            ? 'base · step ' + String(run.baseStep.ordinal).padStart(2, '0') + ' · ' + run.baseStep.label
            : 'no base'}
        </div>
        <div style={{ fontSize: 11.5, color: '#95abc9', marginTop: 4 }}>
          {run.nextStep
            ? 'next · step ' + String(run.nextStep.ordinal).padStart(2, '0') + ' · ' + run.nextStep.label
            : 'no next'}
        </div>
        <div style={{ fontSize: 11.5, color: '#95abc9', marginTop: 4 }}>
          next operation: {run.nextStep?.operation || '—'}
        </div>
        <div style={{ fontSize: 11.5, color: '#95abc9', marginTop: 4 }}>
          seeds used: {run.seedCount} · dto bytes: {run.dtoText.length}
        </div>
      </Card>

      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        <VariantSummary title="WPF" result={run.wpf} />
        <VariantSummary title="EXE" result={run.exe} />
      </div>

      {run.warnings.length > 0 && <WarningsCard warnings={run.warnings} />}
    </div>
  );
}

function VariantSummary({ title, result }: { title: string; result: VariantTestResult | null }) {
  if (!result) {
    return (
      <Card>
        <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, color: '#dde7fa' }}>
          {title}
        </div>
        <div style={{ fontSize: 11.5, color: '#95abc9', marginTop: 4 }}>no result yet</div>
      </Card>
    );
  }
  const color = result.match ? '#8be0a4' : '#f0a89c';
  return (
    <Card>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, color: '#dde7fa' }}>
          {title}
        </div>
        <span style={{ color, fontSize: 11.5, fontWeight: 600 }}>
          {result.match ? 'match' : result.diffCount + ' diff rows'}
        </span>
      </div>
      <div style={{ marginTop: 6, fontSize: 11, color: '#8ea3c1' }}>
        expected {result.expectedText.length} bytes · generated {result.generatedText.length} bytes
      </div>
    </Card>
  );
}

function DiffPanel({ result }: { result: VariantTestResult | null }) {
  if (!result) return <div style={{ color: '#8ea3c1' }}>no result</div>;
  if (!result.diffRows.length) {
    return <div style={{ color: '#8be0a4', fontSize: 12.5 }}>Perfect match — nothing to show.</div>;
  }
  return (
    <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, lineHeight: '20px', color: '#cfe0f8' }}>
      <div style={{ fontSize: 11, color: '#8ea3c1', marginBottom: 8 }}>
        <span style={{ color: '#f0a0aa' }}>−</span> expected lines the generator missed
        {'  ·  '}
        <span style={{ color: '#7ee0b0' }}>+</span> generator emitted lines that shouldn&apos;t be there
        {'  ·  '}
        {result.diffCount} diff rows
      </div>
      <div style={{ fontSize: 10.5, color: '#7f92b0', marginBottom: 10 }}>
        random guids → <code style={{ color: '#b6c4dc' }}>&lt;guid&gt;</code>
        {' · '}
        RND column names → <code style={{ color: '#b6c4dc' }}>&lt;rnd-col&gt;</code>
        {' · '}
        ISO timestamps → <code style={{ color: '#b6c4dc' }}>&lt;ts&gt;</code>
        {'  (zero-guid preserved as-is)'}
      </div>
      <InlineDiff rows={result.diffRows} hideNoise={false} wrap={false} />
    </div>
  );
}

function TextPanel({ text, label }: { text: string; label: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#8ea3c1', marginBottom: 6 }}>{label}</div>
      <pre
        style={{
          margin: 0,
          padding: 12,
          borderRadius: 10,
          background: 'rgba(8,13,22,0.86)',
          color: '#d7e5fa',
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: 11.5,
          lineHeight: '18px',
          overflow: 'auto',
        }}
      >
        {text}
      </pre>
    </div>
  );
}

function PlanPanel({ run }: { run: ReturnType<typeof useTestRun> }) {
  if (!run.plan) return null;
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <PlanVariant title="WPF" fields={run.plan.wpf.fields} elements={run.plan.wpf.elements} />
      <PlanVariant title="EXE" fields={run.plan.exe.fields} elements={run.plan.exe.elements} />
      {run.warnings.length > 0 && <WarningsCard warnings={run.warnings} />}
    </div>
  );
}

function PlanVariant({
  title,
  fields,
  elements,
}: {
  title: string;
  fields: Array<{ kind: string; concretePath: string; seedCanonical: string }>;
  elements: Array<{ kind: string; parentArrayPath: string }>;
}) {
  return (
    <Card>
      <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, color: '#dde7fa', marginBottom: 8 }}>
        {title} · fields {fields.length} · elements {elements.length}
      </div>
      <div style={{ display: 'grid', gap: 6 }}>
        {elements.map((op, i) => (
          <div key={'e' + i} style={opStyle(op.kind)}>
            {op.kind} element at <code>{op.parentArrayPath}</code>
          </div>
        ))}
        {fields.slice(0, 40).map((op, i) => (
          <div key={'f' + i} style={opStyle(op.kind)}>
            {op.kind} <code>{op.concretePath}</code>
          </div>
        ))}
        {fields.length > 40 && (
          <div style={{ fontSize: 11, color: '#8ea3c1' }}>… {fields.length - 40} more field ops omitted</div>
        )}
      </div>
    </Card>
  );
}

function WarningsCard({ warnings }: { warnings: string[] }) {
  return (
    <div
      style={{
        border: '1px solid rgba(233,180,120,0.28)',
        background: 'rgba(140,96,30,0.20)',
        borderRadius: 10,
        padding: '10px 12px',
      }}
    >
      <div style={{ fontSize: 11.5, color: '#f3d1a2', marginBottom: 6 }}>
        warnings ({warnings.length})
      </div>
      <ul style={{ margin: 0, paddingLeft: 18, color: '#e8c79c', fontSize: 11.5, lineHeight: 1.45 }}>
        {warnings.map((w, i) => (
          <li key={i}>{w}</li>
        ))}
      </ul>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        border: '1px solid rgba(148,180,255,0.14)',
        background: 'rgba(12,19,31,0.56)',
        borderRadius: 12,
        padding: 12,
      }}
    >
      {children}
    </div>
  );
}

function EmptyState({
  title,
  body,
  cta,
  onCta,
}: {
  title: string;
  body: string;
  cta: string;
  onCta: () => void;
}) {
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
        <div style={{ fontSize: 14, fontWeight: 600, color: '#e4edff' }}>{title}</div>
        <div style={{ marginTop: 8, fontSize: 12.5, color: '#8ea4c2', lineHeight: 1.5 }}>{body}</div>
        <button
          className="afra-btn"
          onClick={onCta}
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
          {cta}
        </button>
      </div>
    </div>
  );
}

function replacerForLogs(_key: string, value: unknown): unknown {
  // Keep the report compact: strip the full expected/generated text and diff rows
  // (they're readily reproducible from the base+next step docs).
  if (
    value &&
    typeof value === 'object' &&
    'diffRows' in (value as Record<string, unknown>)
  ) {
    const v = value as Record<string, unknown>;
    return {
      variant: v.variant,
      diffCount: v.diffCount,
      match: v.match,
      expectedBytes: (v.expectedText as string | undefined)?.length ?? 0,
      generatedBytes: (v.generatedText as string | undefined)?.length ?? 0,
      firstMismatches: Array.isArray(v.diffRows)
        ? v.diffRows
            .filter((r) => (r as { k?: string }).k !== '=')
            .slice(0, 40)
            .map((r) => ({
              k: (r as { k?: string }).k,
              an: (r as { an?: number | null }).an,
              bn: (r as { bn?: number | null }).bn,
              expected: (r as { a?: string | null }).a,
              generated: (r as { b?: string | null }).b,
            }))
        : [],
    };
  }
  return value;
}

function opStyle(kind: string): CSSProperties {
  const add = kind === 'add';
  const remove = kind === 'remove';
  return {
    border:
      '1px solid ' +
      (add ? 'rgba(94,186,140,0.33)' : remove ? 'rgba(220,118,130,0.34)' : 'rgba(227,188,111,0.34)'),
    background: add
      ? 'rgba(62,145,103,0.14)'
      : remove
        ? 'rgba(166,72,88,0.16)'
        : 'rgba(169,130,57,0.14)',
    borderRadius: 8,
    padding: '6px 10px',
    color: '#c5d6ef',
    fontSize: 11.5,
  };
}

const btnStyle: CSSProperties = {
  fontFamily: 'IBM Plex Mono, monospace',
  fontSize: 11,
  padding: '6px 10px',
  borderRadius: 8,
  border: '1px solid rgba(148,180,255,0.20)',
  background: 'rgba(148,180,255,0.08)',
  color: '#d6e3f8',
};
