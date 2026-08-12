import { useMemo, useState } from 'react';
import type { UiFieldEntry } from '@/types/impact';
import { buildImpactDto } from '@/services/impactDto.service';

interface Props {
  entries: UiFieldEntry[];
}

export function ImpactDtoPanel({ entries }: Props) {
  const [withSamples, setWithSamples] = useState(true);

  const dto = useMemo(
    () => buildImpactDto(entries, { withSampleValues: withSamples }),
    [entries, withSamples],
  );
  const text = useMemo(() => JSON.stringify(dto, null, 4), [dto]);

  return (
    <aside
      style={{
        width: '44%',
        minWidth: 360,
        maxWidth: 700,
        borderLeft: '1px solid rgba(148,180,255,0.10)',
        display: 'flex',
        flexDirection: 'column',
        background: 'rgba(11,18,31,0.70)',
      }}
    >
      <div
        style={{
          flex: 'none',
          padding: '10px 12px',
          borderBottom: '1px solid rgba(148,180,255,0.10)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(14,20,34,0.32)',
          gap: 8,
        }}
      >
        <span
          style={{
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: 12,
            color: '#dce6f8',
          }}
        >
          sample JSON DTO
        </span>
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
            checked={withSamples}
            onChange={(e) => setWithSamples(e.target.checked)}
          />
          with sample values
        </label>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 10 }}>
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
          {text}
        </pre>
      </div>
    </aside>
  );
}
