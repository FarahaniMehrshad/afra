import { useAppStore } from '@/store/appStore';
import { Segmented } from '../ui/Segmented';
import { download } from '@/services/download.util';
import { toYamlText } from '@/services/yaml.service';
import type { YamlLine, YamlMode } from '@/types/schema';

interface Props {
  fieldCount: number;
  lineCount: number;
  empty: YamlLine[];
  sample: YamlLine[];
}

/** Toolbar for the JSON-to-YML page: which document to show, and the exports. */
export function SchemaToolbar({ fieldCount, lineCount, empty, sample }: Props) {
  const yamlMode = useAppStore((s) => s.yamlMode);
  const setYamlMode = useAppStore((s) => s.setYamlMode);
  const setConverterOpen = useAppStore((s) => s.setConverterOpen);
  const folder = useAppStore((s) => s.bundle?.name ?? 'afra');

  const base = 'afra-ui-fields';

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
          wpf and exe unified — arrays collapsed onto one element
        </div>
      </div>
      <span style={{ flex: 1 }} />

      <Segmented<YamlMode>
        options={[
          {
            value: 'sample',
            label: 'sample arrays',
            title: 'Every array filled in with one representative element',
          },
          {
            value: 'empty',
            label: 'empty arrays',
            title:
              'Arrays of plain values emptied to []; arrays of objects keep their fields',
          },
        ]}
        isActive={(v) => v === yamlMode}
        onSelect={setYamlMode}
      />

      <button
        onClick={() => setConverterOpen(true)}
        className="afra-btn afra-btn-ghost"
        title="Read and edit the JavaScript that performs this conversion"
        style={ghost}
      >
        converter.js
      </button>
      <button
        onClick={() => download(base + '.empty.yml', toYamlText(empty), 'text/yaml')}
        className="afra-btn afra-btn-ghost"
        title={'Download the empty-array document for ' + folder}
        style={ghost}
      >
        empty.yml
      </button>
      <button
        onClick={() => download(base + '.sample.yml', toYamlText(sample), 'text/yaml')}
        className="afra-btn afra-btn-ghost"
        title={'Download the sample-array document for ' + folder}
        style={ghost}
      >
        sample.yml
      </button>

      <span
        style={{
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: 11,
          color: '#6d7f9c',
        }}
      >
        {fieldCount} fields · {lineCount} lines
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
