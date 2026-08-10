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

All parsing, diffing and merging happens in the browser. The only server-side
code is a thin proxy for the optional LLM analysis (see below), which exists
purely so the API key never ends up in the JS bundle.

## LLM pattern recognition

Total diff can ask an OpenAI-compatible model to explain *why* each path
changed, labelling every changed key as a random id, a timestamp, the direct
result of a step's UI operation, a derived side effect, or environment-specific
churn. Copy `.env.example` to `.env` and fill it in:

```bash
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=sk-…
LLM_MODEL=gpt-4o-mini
LLM_PATHS_PER_BATCH=60
```

Restart the dev server, open Total diff and press **analyze patterns**. The run
covers both the `wpf` and `exe` merged configurations in one pass, batching
paths into as many requests as `LLM_PATHS_PER_BATCH` implies. The **payload**
button next to it opens an inspector showing the exact prompt of every batch
before you send it, plus the raw response of each once the run finishes.

Requests go to `/api/llm/*` on the app's own origin — Vite middleware in dev,
`server/index.mjs` in production — so the key stays server-side and there is no
CORS to negotiate. Without a key the button is simply disabled; every other
feature works offline as before.

## Project structure

```
server/                     # the only server-side code
├── llm.handler.mjs         # OpenAI-compatible proxy, dev + prod
├── llm.handler.d.mts       # its types, for vite.config.ts
└── index.mjs               # Express: dist/ + /api/llm

src/
├── App.tsx                 # page router / background
├── constants.ts            # noise regex, colours, layout constants
├── main.tsx                # React entry point
├── styles/globals.css      # design-token styles + keyframes
│
├── types/                  # domain types only — no React
│   ├── journey.ts
│   ├── ir.ts
│   ├── diff.ts
│   └── llm.ts
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
│   ├── llm.payload.ts      # changed paths + history → batches
│   ├── llm.prompt.ts       # batch → system / user messages
│   ├── llm.service.ts      # /api/llm transport + reply parsing
│   └── download.util.ts
│
├── store/
│   ├── appStore.ts         # Zustand: raw user intent only
│   └── llmStore.ts         # Zustand: LLM run state and verdicts
│
├── hooks/                  # thin adapters over services + store
│   ├── useBuild.ts
│   ├── useDiff.ts
│   ├── useExport.ts
│   ├── useIngest.ts
│   ├── useLlmAnalysis.ts
│   └── useRecents.ts
│
└── components/             # feature-scoped, presentational
    ├── layout/     Header, Nav, Scrubber
    ├── ingest/     IngestPage, DropZone, RecentList, StepPreview
    ├── steps/      StepsPage, StepNav, DiffToolbar, SplitDiff, InlineDiff
    ├── total/      TotalPage, TotalToolbar, MergedList, HistoryPanel,
    │               LlmControls, LlmDebugPanel
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
npm start                # ./dist + /api/llm on :8787, reads .env
npm run preview          # Vite's own preview on :4173, also serves /api/llm
```

## Docker

Multi-stage build — Node 20 builds, Node 20 serves. Requires Node 20.12+ for
`--env-file-if-exists`.

```bash
docker compose up --build
# → http://localhost:8080
```

Compose picks up `.env` if it exists, so the LLM proxy is configured the same
way as in development.

Or, without compose:

```bash
docker build -t afra-diff-analyzer .
docker run --rm -p 8080:8787 --env-file .env afra-diff-analyzer
```

## Browser support

- The native folder picker (`showDirectoryPicker`) is used when
  available — Chromium (Chrome / Edge / Brave) and recent WebKit builds.
- Everything else falls back to `<input webkitdirectory>` upload, which
  works everywhere.
