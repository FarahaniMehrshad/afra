import { useRecents } from '@/hooks/useRecents';
import { useIngest } from '@/hooks/useIngest';

/** List of previously ingested folders (IndexedDB-backed). */
export function RecentList() {
  const { recents, forget } = useRecents();
  const { openRecent } = useIngest();
  if (!recents.length) return null;

  return (
    <div>
      <div
        style={{
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: 10.5,
          letterSpacing: '0.12em',
          color: '#5f7292',
          marginBottom: 10,
        }}
      >
        PREVIOUSLY INGESTED
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {recents.map((r) => (
          <div
            key={r.name}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '11px 14px',
              borderRadius: 12,
              border: '1px solid rgba(148,180,255,0.10)',
              background: 'rgba(148,180,255,0.04)',
              backdropFilter: 'blur(14px)',
              WebkitBackdropFilter: 'blur(14px)',
            }}
          >
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: '#4f8dfd',
                flex: 'none',
              }}
            />
            <span
              className="afra-ellipsis"
              style={{
                flex: 1,
                minWidth: 0,
                fontFamily: 'IBM Plex Mono, monospace',
                fontSize: 12,
                color: '#b6c6e0',
              }}
            >
              {r.name}
            </span>
            <span
              style={{
                fontFamily: 'IBM Plex Mono, monospace',
                fontSize: 10.5,
                color: '#5f7292',
              }}
            >
              {new Date(r.ts).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              })}
            </span>
            <button
              onClick={() => openRecent(r.handle)}
              className="afra-btn afra-btn-ghost"
              style={{
                fontFamily: 'IBM Plex Mono, monospace',
                fontSize: 11,
                padding: '5px 11px',
                borderRadius: 8,
                border: '1px solid rgba(148,180,255,0.16)',
                background: 'transparent',
                color: '#9db2d4',
              }}
            >
              reopen
            </button>
            <button
              onClick={() => forget(r.name)}
              className="afra-btn"
              style={{
                fontFamily: 'IBM Plex Mono, monospace',
                fontSize: 11,
                padding: '5px 9px',
                borderRadius: 8,
                border: '1px solid transparent',
                background: 'transparent',
                color: '#5f7292',
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
