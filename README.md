# AFRA — RAS journey inspector

AFRA ingests a RAS `TestArtifacts` folder — one journey, a `journey.jsonl`
step index, and per-step `.wpf.json` / `.exe.json` snapshots — and lets you
walk through the configuration changes each step introduced.

Three views:

- **Ingest.** Pick or drop a folder. IndexedDB remembers folders you have
  opened before so reopening one is a single click.
- **Steps diff.** Side-by-side or inline JSON diff for the currently
  selected step. Search, wrap-toggle, noise-mute (mutes GUID / UID /
  timestamp churn), jump-to-next-change.
- **Total diff.** The merged configuration across every step, with per-key
  history: click any line to see exactly which step added / modified /
  removed it and what the value became.

Exports available from the header: `merged.json` for the union of every
step, and `report.md` for a human-readable change log.

The whole app is a single-page React application — no backend. All parsing,
diffing and merging happens in the browser.

## Project structure

```
src/
├── App.tsx                 # page router / background
├── constants.ts            # noise regex, colours, layout constants
├── main.tsx                # React entry point
├── styles/globals.css      # design-token styles + keyframes
│
├── types/                  # domain types only — no React
│   ├── journey.ts
│   ├── ir.ts
│   └── diff.ts
│
├── services/               # pure, testable business logic
│   ├── ir.service.ts       # JSON → IR, merge, flatten, emit
│   ├── diff.service.ts     # Myers line diff + word-level highlighting
│   ├── noise.service.ts    # noise heuristics
│   ├── journey.service.ts  # journey.jsonl parsing + validation
│   ├── fs.service.ts       # native / drag / input folder adapters
│   ├── recents.service.ts  # IndexedDB "recently opened" persistence
│   ├── build.service.ts    # orchestrates a per-variant build
│   ├── export.service.ts   # merged.json + report.md formatters
│   └── download.util.ts
│
├── store/appStore.ts       # Zustand: raw user intent only
│
├── hooks/                  # thin adapters over services + store
│   ├── useBuild.ts
│   ├── useDiff.ts
│   ├── useExport.ts
│   ├── useIngest.ts
│   └── useRecents.ts
│
└── components/             # feature-scoped, presentational
    ├── layout/     Header, Nav, Scrubber
    ├── ingest/     IngestPage, DropZone, RecentList, StepPreview
    ├── steps/      StepsPage, StepNav, DiffToolbar, SplitDiff, InlineDiff
    ├── total/      TotalPage, TotalToolbar, MergedList, HistoryPanel
    └── ui/         Segmented, Toggle, IconButton
```

SOLID call-outs:

- **Single responsibility.** Services do one job each (parsing, diffing,
  noise, exporting). Components render — they do not compute.
- **Open / closed.** Adding a new diff layout is a new component plus one
  entry in the layout `Segmented`; nothing else changes. Same story for a
  new export format or a new noise rule.
- **Liskov.** `DirHandle` in `fs.service` is a structural interface — the
  three real backends (native, drag, input) all satisfy it without knowing
  about one another.
- **Interface segregation.** Components subscribe to narrow store slices
  (`useAppStore(s => s.stepIdx)`) rather than the whole state object, so
  they only re-render when something they care about changes.
- **Dependency inversion.** Hooks depend on service *functions*, not on
  concrete transport code (IndexedDB / FileSystem API). Services can be
  unit-tested in Node with plain stubs.

## Local development

```bash
npm install
npm run dev              # http://localhost:5173
```

## Production build

```bash
npm run build            # emits ./dist
npm run preview          # serves ./dist on :4173
```

## Docker

Multi-stage build — Node 20 for the build, Nginx 1.27 for the serve.

```bash
docker compose up --build
# → http://localhost:8080
```

Or, without compose:

```bash
docker build -t afra-diff-analyzer .
docker run --rm -p 8080:80 afra-diff-analyzer
```

## Browser support

- The native folder picker (`showDirectoryPicker`) is used when
  available — Chromium (Chrome / Edge / Brave) and recent WebKit builds.
- Everything else falls back to `<input webkitdirectory>` upload, which
  works everywhere.
