# Moving Development to Another Computer

This is the single source of truth for moving the whole development environment. Git carries the code and reviewed configuration; the items below cover local secrets, downloaded legal sources, and generated product data that Git intentionally ignores.

## 1. Finish work on the old computer

```bash
git status -sb
git push origin main
git log -1 --oneline
```

Do not copy the repository directory or `.git/`. Clone a clean repository on the new computer.

## 2. Copy local-only data

For a complete continuation with no unnecessary downloads or repeated LLM enrichment, securely copy these paths while preserving their relative locations:

```text
.env
data/artifacts/canonical/
data/artifacts/earth/
data/monitor/
data/raw/
```

Purpose:

- `.env` preserves Private AI and other local configuration. It contains secrets and must use a secure transfer channel.
- `data/artifacts/canonical/` lets `npm run dev` rebuild Runtime without downloading and parsing the legal corpus again.
- `data/artifacts/earth/` preserves the complete Galaxy installation. Both `graph.json` and `earth.sqlite` are used; copy the directory, not only the SQLite file.
- `data/monitor/` preserves locally refreshed and enriched Monitor events and avoids repeating LLM calls.
- `data/raw/` preserves exact official snapshots. It is optional for ordinary UI work, but copy it when continuing corpus acquisition, parser work, version review, or exact historical reproduction.

`exports/` is optional. Copy it only when an existing RAG handoff snapshot must be retained.

To inspect transfer size before copying:

```bash
du -sh .env data/artifacts/canonical data/artifacts/earth data/monitor data/raw exports
```

## 3. Do not copy generated dependencies and disposable builds

```text
node_modules/
dist/
coverage/
playwright-report/
test-results/
data/artifacts/runtime/
data/artifacts/search/
data/artifacts/corpus-builds/
data/artifacts/onboarding/
```

Do not copy all of `data/artifacts/`; it contains large disposable builds. Copy only `canonical/` and `earth/` as listed above.

## 4. Set up the new computer

Node.js 24 or newer and npm 11 or newer are required.

```bash
git clone https://github.com/liyouqi/regulatory-knowledge-platform.git
cd regulatory-knowledge-platform
npm ci
```

Restore the copied local-only paths into the repository, then verify and start:

```bash
npm run check
npm test
npm run dev
```

Open the Vite URL printed by the terminal, normally `http://localhost:5173`. Port `3000` is the API.

## 5. Clean rebuild instead of copying data

For a minimal migration, copy only `.env`, then rebuild the current Reader corpus from official sources:

```bash
npm run corpus:update
npm run dev
```

If `data/raw/` was copied but `data/artifacts/canonical/` was not, rebuild without downloading again:

```bash
npm run corpus:update -- --skip-fetch
npm run dev
```

The Reader corpus is reproducible through this workflow. Galaxy and locally enriched Monitor data are separate local products, so copying `data/artifacts/earth/` and `data/monitor/` is the quickest and safest way to preserve their exact current state.

## 6. Final verification

```bash
git status -sb
git log -1 --oneline
npm run check
npm test
```

The Git commit should match the old computer, and `git status` should show no unexpected tracked changes. Ignored local data will not appear in ordinary `git status` output.
