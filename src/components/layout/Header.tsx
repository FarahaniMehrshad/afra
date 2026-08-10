import { useAppStore } from '@/store/appStore';
import { useExport } from '@/hooks/useExport';
import { Nav } from './Nav';

/** Top bar — brand, page tabs, folder chip, export buttons. */
export function Header() {
  const bundle = useAppStore((s) => s.bundle);
  const { exportMerged, exportReport } = useExport();

  return (
    <header
      style={{
        position: 'relative',
        zIndex: 3,
        display: 'flex',
        alignItems: 'center',
        gap: 22,
        padding: '0 20px',
        height: 60,
        flex: 'none',
        background: 'rgba(14,20,34,0.55)',
        backdropFilter: 'blur(22px) saturate(150%)',
        WebkitBackdropFilter: 'blur(22px) saturate(150%)',
        borderBottom: '1px solid rgba(148,180,255,0.10)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span
          style={{
            fontSize: 19,
            fontWeight: 600,
            letterSpacing: '0.22em',
            color: '#eaf1ff',
          }}
        >
          AFRA
        </span>
        <span
          style={{
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: 11,
            color: '#7183a0',
            letterSpacing: '0.06em',
          }}
        >
          RAS journey inspector
        </span>
      </div>

      <Nav />

      <div style={{ flex: 1 }} />

      {bundle && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 12px',
              borderRadius: 10,
              background: 'rgba(148,180,255,0.06)',
              border: '1px solid rgba(148,180,255,0.12)',
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#4f8dfd',
                boxShadow: '0 0 10px #4f8dfd',
              }}
            />
            <span
              className="afra-ellipsis"
              style={{
                fontFamily: 'IBM Plex Mono, monospace',
                fontSize: 11.5,
                color: '#b6c6e0',
                maxWidth: 280,
              }}
            >
              {bundle.name}
            </span>
            <span
              style={{
                fontFamily: 'IBM Plex Mono, monospace',
                fontSize: 11,
                color: '#6d7f9c',
              }}
            >
              {bundle.steps.length} steps
            </span>
          </div>
          <button
            onClick={exportMerged}
            className="afra-btn afra-btn-ghost"
            style={{
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: 11,
              padding: '7px 11px',
              borderRadius: 9,
              border: '1px solid rgba(148,180,255,0.14)',
              background: 'rgba(148,180,255,0.05)',
              color: '#a9bcd8',
            }}
          >
            merged.json
          </button>
          <button
            onClick={exportReport}
            className="afra-btn afra-btn-ghost"
            style={{
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: 11,
              padding: '7px 11px',
              borderRadius: 9,
              border: '1px solid rgba(148,180,255,0.14)',
              background: 'rgba(148,180,255,0.05)',
              color: '#a9bcd8',
            }}
          >
            report.md
          </button>
        </div>
      )}
    </header>
  );
}
