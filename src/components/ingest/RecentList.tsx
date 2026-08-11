import { useRecents, UnifiedRecent } from '@/hooks/useRecents';
import { useIngest } from '@/hooks/useIngest';

/**
 * "Previously ingested" list — merged view over the DB and the browser's
 * IndexedDB. DB rows can be reopened without touching disk; local rows go
 * back to the FileSystem handle so any new files show up.
 */
export function RecentList() {
  const { recents, loading, refresh } = useRecents();
  const { openRecent, openStoredJourney } = useIngest();

  if (!recents.length) {
    if (loading) return null;
    return null;
  }

  const open = async (r: UnifiedRecent) => {
    if (r.source === 'db') {
      await openStoredJourney(r.name);
    } else if (r.handle) {
      await openRecent(r.handle);
    }
    // Bring the list back into sync — a reopen may bump timestamps or, for
    // fresh-from-disk ingests, produce a new DB row.
    void refresh();
  };

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 10,
        }}
      >
        <span
          style={{
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: 10.5,
            letterSpacing: '0.12em',
            color: '#5f7292',
          }}
        >
          PREVIOUSLY INGESTED
        </span>
        <span style={{ flex: 1 }} />
        <button
          onClick={() => void refresh()}
          className="afra-btn afra-btn-ghost"
          style={{
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: 10.5,
            padding: '3px 9px',
            borderRadius: 7,
            border: '1px solid rgba(148,180,255,0.14)',
            background: 'transparent',
            color: '#7f92b0',
            opacity: loading ? 0.5 : 1,
          }}
          disabled={loading}
          title="Reload from database"
        >
          ↻ refresh
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {recents.map((r) => (
          <RecentRow key={r.key} r={r} onOpen={() => open(r)} />
        ))}
      </div>
    </div>
  );
}

interface RowProps {
  r: UnifiedRecent;
  onOpen: () => void;
}

function RecentRow({ r, onOpen }: RowProps) {
  const { forget } = useRecents();
  const isDb = r.source === 'db';

  return (
    <div
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
        title={isDb ? 'Stored in the database' : 'Local folder handle'}
        style={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: isDb ? '#7ee0b0' : '#4f8dfd',
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
      <SourceBadge r={r} />
      <span
        style={{
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: 10.5,
          color: '#5f7292',
        }}
      >
        {formatTs(r.ts)}
      </span>
      <button
        onClick={onOpen}
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
        title={
          isDb
            ? 'Reopen from database (no disk access)'
            : 'Rescan the folder on disk'
        }
      >
        reopen
      </button>
      <button
        onClick={() => void forget(r.name, r.source)}
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
        title={
          isDb
            ? 'Delete the journey and all its saved artefacts from the database'
            : 'Forget this local folder handle (does not touch the database)'
        }
      >
        ✕
      </button>
    </div>
  );
}

function SourceBadge({ r }: { r: UnifiedRecent }) {
  const isDb = r.source === 'db';
  const label = isDb
    ? 'db · ' + (r.stepCount ?? 0) + ' steps'
    : 'local';
  return (
    <span
      style={{
        fontFamily: 'IBM Plex Mono, monospace',
        fontSize: 10,
        letterSpacing: '0.04em',
        padding: '2px 7px',
        borderRadius: 6,
        background: isDb ? 'rgba(52,170,120,0.10)' : 'rgba(79,141,253,0.10)',
        color: isDb ? '#7ee0b0' : '#8fb3ee',
        border:
          '1px solid ' +
          (isDb ? 'rgba(52,170,120,0.22)' : 'rgba(120,165,255,0.22)'),
      }}
    >
      {label}
    </span>
  );
}

/** Same date format the previous version used. */
function formatTs(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}
