import { useAppStore } from '@/store/appStore';
import type { Page } from '@/types/journey';

const TABS: { id: Page; label: string }[] = [
  { id: 'ingest', label: 'Ingest' },
  { id: 'steps', label: 'Steps diff' },
  { id: 'total', label: 'Total diff' },
  { id: 'impact', label: 'UI impact' },
  { id: 'dto', label: 'Convert to DTO' },
];

/** Page switcher. */
export function Nav() {
  const page = useAppStore((s) => s.page);
  const setPage = useAppStore((s) => s.setPage);
  return (
    <nav
      style={{
        display: 'flex',
        gap: 4,
        padding: 4,
        borderRadius: 12,
        background: 'rgba(148,180,255,0.05)',
        border: '1px solid rgba(148,180,255,0.09)',
      }}
    >
      {TABS.map((t) => {
        const active = page === t.id;
        return (
          <button
            key={t.id}
            onClick={() => setPage(t.id)}
            className="afra-btn"
            style={{
              fontSize: 12.5,
              fontWeight: 500,
              letterSpacing: '0.02em',
              padding: '7px 15px',
              borderRadius: 9,
              border: active
                ? '1px solid rgba(120,165,255,0.42)'
                : '1px solid transparent',
              background: active ? 'rgba(79,141,253,0.20)' : 'transparent',
              color: active ? '#e9f0ff' : '#8195b3',
            }}
          >
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}
