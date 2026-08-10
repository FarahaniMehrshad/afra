import { useMemo } from 'react';
import { useAppStore } from '@/store/appStore';
import { useSchema } from '@/hooks/useSchema';
import { generateConverter } from '@/services/converter.codegen';
import { SchemaToolbar } from './SchemaToolbar';
import { YamlList } from './YamlList';
import { MappingPanel } from './MappingPanel';
import { ConverterPanel } from './ConverterPanel';
import { NeedsAnalysis } from './NeedsAnalysis';

/** JSON to YML — the generated document, its converter, and the source mapping. */
export function SchemaPage() {
  const bundle = useAppStore((s) => s.bundle);
  const selCanon = useAppStore((s) => s.selCanon);
  const selectCanon = useAppStore((s) => s.selectCanon);
  const converterOpen = useAppStore((s) => s.converterOpen);
  const setConverterOpen = useAppStore((s) => s.setConverterOpen);
  const { schema, empty, sample, lines } = useSchema();

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
          lineCount={lines.length}
          empty={empty}
          sample={sample}
        />
        <YamlList lines={lines} selCanon={selCanon} onSelect={selectCanon} />
      </div>
      <MappingPanel entry={entry} canon={selCanon} />
      {converterOpen && (
        <ConverterPanel generated={generated} onClose={() => setConverterOpen(false)} />
      )}
    </>
  );
}
