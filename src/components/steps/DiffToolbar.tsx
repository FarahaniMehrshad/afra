import { useAppStore } from '@/store/appStore';
import { Segmented } from '../ui/Segmented';
import { Toggle } from '../ui/Toggle';
import { IconButton } from '../ui/IconButton';
import type { DiffLayout, Variant } from '@/types/journey';

interface Props {
  title: string;
  operation: string;
  addCount: number;
  delCount: number;
  onJump: (dir: 1 | -1) => void;
}

/** Toolbar above the actual diff viewport. */
export function DiffToolbar({ title, operation, addCount, delCount, onJump }: Props) {
  const variant = useAppStore((s) => s.variant);
  const setVariant = useAppStore((s) => s.setVariant);
  const layout = useAppStore((s) => s.layout);
  const setLayout = useAppStore((s) => s.setLayout);
  const wrap = useAppStore((s) => s.wrap);
  const toggleWrap = useAppStore((s) => s.toggleWrap);
  const hideNoise = useAppStore((s) => s.hideNoise);
  const toggleNoise = useAppStore((s) => s.toggleNoise);
  const diffQuery = useAppStore((s) => s.diffQuery);
  const setDiffQuery = useAppStore((s) => s.setDiffQuery);

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
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: 13,
            color: '#e6eeff',
          }}
        >
          {title}
        </div>
        <div
          className="afra-ellipsis"
          style={{
            fontSize: 11.5,
            color: '#7f92b0',
            marginTop: 2,
            maxWidth: 560,
          }}
        >
          {operation}
        </div>
      </div>
      <span style={{ flex: 1 }} />

      <Segmented<Variant>
        options={[
          { value: 'wpf', label: 'wpf' },
          { value: 'exe', label: 'exe' },
        ]}
        isActive={(v) => v === variant}
        onSelect={setVariant}
      />

      <Segmented<DiffLayout>
        options={[
          { value: 'split', label: 'side-by-side' },
          { value: 'inline', label: 'inline' },
        ]}
        isActive={(v) => v === layout}
        onSelect={setLayout}
      />

      <Toggle active={wrap} onClick={toggleWrap} title="Wrap long lines instead of clipping them">
        wrap {wrap ? 'on' : 'off'}
      </Toggle>
      <Toggle
        active={hideNoise}
        onClick={toggleNoise}
        title="Treat GUID / UID / revision churn as noise"
      >
        noise {hideNoise ? 'muted' : 'shown'}
      </Toggle>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <IconButton onClick={() => onJump(-1)}>↑</IconButton>
        <IconButton onClick={() => onJump(1)}>↓</IconButton>
      </div>

      <input
        value={diffQuery}
        onChange={(e) => setDiffQuery(e.target.value)}
        placeholder="Search lines…"
        className="afra-input"
        style={{
          width: 170,
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: 11.5,
          padding: '6px 10px',
          borderRadius: 9,
          border: '1px solid rgba(148,180,255,0.12)',
          background: 'rgba(148,180,255,0.05)',
          color: '#dbe4f2',
          outline: 'none',
        }}
      />
      <div
        style={{
          display: 'flex',
          gap: 8,
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: 11,
        }}
      >
        <span style={{ color: '#7ee0b0' }}>+{addCount}</span>
        <span style={{ color: '#f0a0aa' }}>−{delCount}</span>
      </div>
    </div>
  );
}
