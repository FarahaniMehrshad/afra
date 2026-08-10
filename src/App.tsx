import { useAppStore } from './store/appStore';
import { Header } from './components/layout/Header';
import { Scrubber } from './components/layout/Scrubber';
import { IngestPage } from './components/ingest/IngestPage';
import { StepsPage } from './components/steps/StepsPage';
import { TotalPage } from './components/total/TotalPage';
import { SchemaPage } from './components/schema/SchemaPage';
import { useVerdictInvalidation } from './hooks/useLlmAnalysis';

/**
 * The chrome. Everything about *what* to show lives in feature pages;
 * this file only decides *which* one and paints the background gradient.
 */
export default function App() {
  const page = useAppStore((s) => s.page);
  const loaded = useAppStore((s) => s.bundle !== null);

  useVerdictInvalidation();

  return (
    <div
      style={{
        position: 'relative',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: '#070b12',
        fontSize: 14,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background:
            'radial-gradient(900px 520px at 12% -10%, rgba(60,110,220,0.20), transparent 62%),' +
            'radial-gradient(760px 460px at 88% 4%, rgba(38,150,190,0.13), transparent 60%),' +
            'radial-gradient(700px 700px at 50% 115%, rgba(70,90,200,0.10), transparent 65%)',
        }}
      />

      <Header />
      {/* The scrubber is a per-step control; the JSON-to-YML page has no steps. */}
      {loaded && page !== 'ingest' && page !== 'schema' && <Scrubber />}

      <main
        style={{
          position: 'relative',
          zIndex: 1,
          flex: 1,
          minHeight: 0,
          display: 'flex',
          overflow: 'hidden',
        }}
      >
        {page === 'ingest' && <IngestPage />}
        {page === 'steps' && loaded && <StepsPage />}
        {page === 'total' && loaded && <TotalPage />}
        {page === 'schema' && loaded && <SchemaPage />}
      </main>
    </div>
  );
}
