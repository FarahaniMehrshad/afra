import { useMemo } from 'react';
import { useAppStore } from '@/store/appStore';
import { useSchema } from '@/hooks/useSchema';
import { generateConverter } from '@/services/converter.codegen';
import { SchemaToolbar } from './SchemaToolbar';
import { YamlList } from './YamlList';
import { MappingPanel } from './MappingPanel';
import { ConverterPanel } from './ConverterPanel';
import { CompactionPanel } from './CompactionPanel';
import { NeedsAnalysis } from './NeedsAnalysis';
import type { Variant } from '@/types/journey';
import type { YamlLine } from '@/types/schema';

/** JSON to YML — the wpf and exe sample documents, side-by-side. */
export function SchemaPage() {
  const bundle = useAppStore((s) => s.bundle);
  const selCanon = useAppStore((s) => s.selCanon);
  const selectCanon = useAppStore((s) => s.selectCanon);
  const converterOpen = useAppStore((s) => s.converterOpen);
  const setConverterOpen = useAppStore((s) => s.setConverterOpen);
  const compactionOpen = useAppStore((s) => s.compactionOpen);
  const setCompactionOpen = useAppStore((s) => s.setCompactionOpen);
  const { schema, wpf, exe, effective } = useSchema();

  const generated = useMemo(
    () => (schema && bundle ? generateConverter(schema, bundle.name) : ''),
    [schema, bundle],
  );

  if (!bundle) return null;
  if (!schema || !schema.fieldCount) return <NeedsAnalysis />;

  const entry = selCanon !== null ? schema.index.get(selCanon) ?? null : null;

  return (
    <>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <SchemaToolbar
          fieldCount={schema.fieldCount}
          wpf={wpf}
          exe={exe}
        />
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <VariantSection
            variant="wpf"
            lines={wpf}
            stepLabel={stepLabel(bundle, effective.wpf)}
            selCanon={selCanon}
            onSelect={selectCanon}
            startNumber={1}
          />
          <VariantSection
            variant="exe"
            lines={exe}
            stepLabel={stepLabel(bundle, effective.exe)}
            selCanon={selCanon}
            onSelect={selectCanon}
            startNumber={wpf.length + 1}
          />
        </div>
      </div>
      {compactionOpen && schema.compaction ? (
        <CompactionPanel
          reports={schema.compaction}
          onClose={() => setCompactionOpen(false)}
          onSelectCanon={selectCanon}
        />
      ) : (
        <MappingPanel entry={entry} canon={selCanon} />
      )}
      {converterOpen && (
        <ConverterPanel generated={generated} onClose={() => setConverterOpen(false)} />
      )}
    </>
  );
}

interface VariantSectionProps {
  variant: Variant;
  lines: YamlLine[];
  stepLabel: string | null;
  selCanon: string | null;
  onSelect: (canon: string) => void;
  startNumber: number;
}

function VariantSection({
  variant,
  lines,
  stepLabel,
  selCanon,
  onSelect,
  startNumber,
}: VariantSectionProps) {
  const c = VARIANT_COLORS[variant];
  return (
    <section
      style={{
        flex: 'none',
        borderBottom:
          variant === 'wpf'
            ? '1px solid rgba(148,180,255,0.14)'
            : undefined,
      }}
    >
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 14px',
          background: 'rgba(11,17,29,0.92)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          borderBottom: '1px solid rgba(148,180,255,0.08)',
        }}
      >
        <span
          style={{
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: 10.5,
            letterSpacing: '0.1em',
            padding: '3px 9px',
            borderRadius: 6,
            background: c.bg,
            color: c.fg,
          }}
        >
          {variant}
        </span>
        <span
          style={{
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: 11,
            color: '#7f92b0',
          }}
        >
          {stepLabel ?? 'no readable step'}
        </span>
        <span style={{ flex: 1 }} />
        <span
          style={{
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: 10.5,
            color: '#5f7292',
          }}
        >
          {lines.length} line{lines.length === 1 ? '' : 's'}
        </span>
      </header>
      <YamlList
        lines={lines}
        selCanon={selCanon}
        onSelect={onSelect}
        startNumber={startNumber}
      />
    </section>
  );
}

const VARIANT_COLORS: Record<Variant, { bg: string; fg: string }> = {
  wpf: { bg: 'rgba(79,141,253,0.18)', fg: '#9cc0ff' },
  exe: { bg: 'rgba(52,170,120,0.16)', fg: '#7ee0b0' },
};

function stepLabel(
  bundle: NonNullable<ReturnType<typeof useAppStore.getState>['bundle']>,
  idx: number | null,
): string | null {
  if (idx === null) return null;
  const s = bundle.steps[idx];
  if (!s) return null;
  return 'step ' + String(s.ordinal).padStart(2, '0') + ' · ' + s.label;
}
