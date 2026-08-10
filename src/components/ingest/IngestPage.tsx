import { useAppStore } from '@/store/appStore';
import { DropZone } from './DropZone';
import { RecentList } from './RecentList';
import { StepPreview } from './StepPreview';

export function IngestPage() {
  const error = useAppStore((s) => s.error);
  const loaded = useAppStore((s) => s.bundle !== null);

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '40px 28px 60px' }}>
      <div
        style={{
          maxWidth: 1080,
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 22,
          animation: 'afraFade .35s ease both',
        }}
      >
        <div>
          <h1
            style={{
              margin: '0 0 6px',
              fontSize: 26,
              fontWeight: 600,
              letterSpacing: '-0.01em',
              color: '#eef3ff',
            }}
          >
            Ingest a journey folder
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: 13.5,
              color: '#8395b2',
              maxWidth: 640,
            }}
          >
            Pick the TestArtifacts folder that holds one run. It must contain{' '}
            <span
              style={{
                fontFamily: 'IBM Plex Mono, monospace',
                color: '#b6c6e0',
              }}
            >
              journey.md
            </span>{' '}
            and{' '}
            <span
              style={{
                fontFamily: 'IBM Plex Mono, monospace',
                color: '#b6c6e0',
              }}
            >
              journey.jsonl
            </span>{' '}
            next to the step JSON files.
          </p>
        </div>

        <DropZone />

        {error && (
          <div
            style={{
              padding: '13px 16px',
              borderRadius: 12,
              border: '1px solid rgba(226,90,105,0.28)',
              background: 'rgba(226,90,105,0.09)',
              color: '#f0a8b0',
              fontSize: 13,
              fontFamily: 'IBM Plex Mono, monospace',
            }}
          >
            {error}
          </div>
        )}

        <RecentList />

        {loaded && <StepPreview />}
      </div>
    </div>
  );
}
