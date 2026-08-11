import { useAppStore } from '@/store/appStore';
import { download } from '@/services/download.util';
import { yamlLinesToText } from '@/services/sampleYaml.service';
import { useSchema } from '@/hooks/useSchema';
import type { Variant } from '@/types/journey';
import type { YamlLine } from '@/types/schema';

interface Props {
  fieldCount: number;
  wpf: YamlLine[];
  exe: YamlLine[];
}

/** Toolbar for the JSON-to-YML page: step picker, downloads, compaction toggle. */
export function SchemaToolbar({ fieldCount, wpf, exe }: Props) {
  const setConverterOpen = useAppStore((s) => s.setConverterOpen);
  const folder = useAppStore((s) => s.bundle?.name ?? 'afra');

  const base = 'afra-ui-fields';
  const totalLines = wpf.length + exe.length;

  return (
    <div
      style={{
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
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
          json to yml
        </div>
        <div style={{ fontSize: 11.5, color: '#7f92b0', marginTop: 2 }}>
          wpf and exe · full configurations from the picked step
        </div>
      </div>
      <span style={{ flex: 1 }} />

      <StepPicker />

      <button
        onClick={() => setConverterOpen(true)}
        className="afra-btn afra-btn-ghost"
        title="Read and edit the JavaScript that performs this conversion"
        style={ghost}
      >
        converter.js
      </button>
      <CompactionToggle />

      <button
        onClick={() =>
          download(base + '.wpf.yml', yamlLinesToText(wpf), 'text/yaml')
        }
        className="afra-btn afra-btn-ghost"
        title={'Download the wpf sample YAML for ' + folder}
        style={ghost}
        disabled={!wpf.length}
      >
        wpf.yml
      </button>
      <button
        onClick={() =>
          download(base + '.exe.yml', yamlLinesToText(exe), 'text/yaml')
        }
        className="afra-btn afra-btn-ghost"
        title={'Download the exe sample YAML for ' + folder}
        style={ghost}
        disabled={!exe.length}
      >
        exe.yml
      </button>

      <span
        style={{
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: 11,
          color: '#6d7f9c',
        }}
      >
        {fieldCount} fields · {totalLines} lines
      </span>
    </div>
  );
}

const ghost = {
  fontFamily: 'IBM Plex Mono, monospace',
  fontSize: 11,
  padding: '7px 11px',
  borderRadius: 9,
  border: '1px solid rgba(148,180,255,0.14)',
  background: 'rgba(148,180,255,0.05)',
  color: '#a9bcd8',
} as const;

/**
 * Native `<select>` styled to match the app. Picks which step's snapshot
 * populates the sample-YAML values, with an "auto" mode that uses the
 * longest snapshot per variant.
 */
function StepPicker() {
  const bundle = useAppStore((s) => s.bundle);
  const sampleStepIdx = useAppStore((s) => s.sampleStepIdx);
  const setSampleStepIdx = useAppStore((s) => s.setSampleStepIdx);
  const { effective } = useSchema();
  const steps = bundle?.steps ?? [];
  if (!steps.length || !bundle) return null;

  const value = sampleStepIdx === null ? 'auto' : String(sampleStepIdx);
  const active = sampleStepIdx !== null;

  const labelForIdx = (i: number | null): string | null => {
    if (i === null) return null;
    const s = bundle.steps[i];
    if (!s) return null;
    return String(s.ordinal).padStart(2, '0') + ' · ' + s.label;
  };

  const wpfLabel = labelForIdx(effective.wpf);
  const exeLabel = labelForIdx(effective.exe);

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 6px 3px 10px',
        borderRadius: 10,
        background: active ? 'rgba(79,141,253,0.14)' : 'rgba(148,180,255,0.05)',
        border:
          '1px solid ' +
          (active
            ? 'rgba(120,165,255,0.36)'
            : 'rgba(148,180,255,0.09)'),
      }}
      title="Choose which real-run snapshot fills the sample values"
    >
      <span
        style={{
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: 10.5,
          color: '#5f7292',
          letterSpacing: '0.02em',
        }}
      >
        sample from
      </span>
      <select
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          setSampleStepIdx(v === 'auto' ? null : Number(v));
        }}
        style={{
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: 11,
          padding: '4px 6px',
          borderRadius: 7,
          border: '1px solid rgba(148,180,255,0.14)',
          background: 'rgba(14,20,34,0.9)',
          color: active ? '#cfe0ff' : '#a9bcd8',
          outline: 'none',
          cursor: 'pointer',
          maxWidth: 260,
        }}
      >
        <option value="auto" style={{ background: '#0e1422' }}>
          auto · longest per variant
        </option>
        {steps.map((s, i) => (
          <option key={i} value={i} style={{ background: '#0e1422' }}>
            {String(s.ordinal).padStart(2, '0')} · {s.label}
          </option>
        ))}
      </select>
      {(wpfLabel || exeLabel) && (
        <span
          title={
            'YAML sample values are being read from these snapshots. When a ' +
            'variant has no readable doc for the picked step, the longest ' +
            'available doc is used as a fallback.'
          }
          style={{
            display: 'inline-flex',
            gap: 4,
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: 10,
            color: '#7f92b0',
            paddingLeft: 4,
          }}
        >
          {wpfLabel && <EffTag variant="wpf" text={wpfLabel} />}
          {exeLabel && <EffTag variant="exe" text={exeLabel} />}
        </span>
      )}
    </div>
  );
}

function EffTag({ variant, text }: { variant: Variant; text: string }) {
  const c =
    variant === 'wpf'
      ? { bg: 'rgba(79,141,253,0.14)', fg: '#9cc0ff' }
      : { bg: 'rgba(52,170,120,0.14)', fg: '#7ee0b0' };
  return (
    <span
      style={{
        padding: '2px 6px',
        borderRadius: 5,
        background: c.bg,
        color: c.fg,
      }}
    >
      {variant} · {text}
    </span>
  );
}

/**
 * Kept in its own component so the whole toolbar doesn't re-render when the
 * compaction report changes — only this small button rerenders on aliases
 * counts flipping.
 */
function CompactionToggle() {
  const compactionOpen = useAppStore((s) => s.compactionOpen);
  const setCompactionOpen = useAppStore((s) => s.setCompactionOpen);
  const { schema } = useSchema();

  const reports = schema?.compaction;
  const savings = reports
    ? sumSavings(reports.wpf) + sumSavings(reports.exe)
    : 0;
  const dupes = reports
    ? reports.wpf.duplicates.length + reports.exe.duplicates.length
    : 0;

  return (
    <button
      onClick={() => setCompactionOpen(!compactionOpen)}
      className="afra-btn"
      title={
        reports
          ? savings +
            ' lines saved by compaction · ' +
            dupes +
            ' duplicate groups (wpf + exe)'
          : 'Compaction report will appear once a schema is built'
      }
      style={{
        ...ghost,
        borderColor: compactionOpen
          ? 'rgba(120,165,255,0.36)'
          : ghost.border.replace('1px solid ', ''),
        background: compactionOpen
          ? 'rgba(79,141,253,0.16)'
          : ghost.background,
        color: compactionOpen ? '#cfe0ff' : ghost.color,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      compaction
      {reports && savings > 0 && (
        <span
          style={{
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: 10,
            padding: '1px 6px',
            borderRadius: 5,
            background: 'rgba(52,170,120,0.16)',
            color: '#7ee0b0',
          }}
        >
          −{savings}
        </span>
      )}
    </button>
  );
}

function sumSavings(r: import('@/types/schema').CompactionReport): number {
  return (
    r.collapsedValues +
    r.collapsedTypeWrappers +
    r.strippedMetaLeaves +
    r.duplicates.reduce((s, d) => s + (d.count - 1), 0)
  );
}
