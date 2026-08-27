# Regulatory Knowledge Platform

An English European financial regulatory knowledge platform for EU and Luxembourg law. The first usable corpus focuses on digital, ICT, cyber, and data regulation; the same canonical pipeline is intended to support banking, payments, funds, insurance, and digital-assets editions without separate codebases.

## Documents

- `README.md`: setup, commands, quick navigation, and the operational entry point.
- `docs/regulatory_knowledge_platform_requirements.md`: product scope, releases, and acceptance criteria.
- `docs/regulatory_knowledge_platform_technical_architecture.md`: architectural decisions and data contracts.
- `docs/corpus-onboarding-runbook.md`: repeatable workflow for adding or refreshing legal sources.
- `docs/coverage-backlog.md`: bounded phase completion and deferred 1→100 corpus work.
- `docs/runtime-operation-runbook.md`: staging, verification, promotion, and rollback of runtime artifacts.
- `AGENTS.md`: short, stable instructions for Codex and other coding agents.

## Development Environment

The production application is a Node.js/TypeScript project. It does not use Python or Conda in Phase 1.

| Concern | Tool / file | Purpose |
| --- | --- | --- |
| Node runtime | `.nvmrc` | Pins Node.js 24 for local development. |
| Package manager | npm | Installs and runs the project tools. |
| Dependency manifest | `package.json` | Declares direct dependencies and available commands. |
| Reproducible dependency tree | `package-lock.json` | Pins the exact installed package versions. Commit this file. |
| Optional Python utilities | separate future `tools/` utility only | Never part of the Phase 1 web runtime or canonical contract. |

If you use `nvm`, its workflow is the closest equivalent to selecting a Conda environment:

```bash
nvm install
nvm use
node --version
npm ci
```

If `nvm` is not installed, install a current Node.js 24 LTS release, confirm `node --version` starts with `v24`, then run `npm ci`.

## First Setup

From the repository root:

```bash
npm ci
npm run runtime:build
npm run check
npm test
npm run build
```

Use `npm ci` for a clean or new machine. Use `npm install` only when `package.json` has intentionally changed; it updates `package-lock.json`.

## Daily Development

Start the API server and web application together:

```bash
npm run dev
```

Then open `http://localhost:5173`. The Vite web app proxies `/api` calls to the Express API at `http://localhost:3000`.

### Quick Navigation

Vite normally uses port `5173`; if that port is occupied, use the port printed by `npm run dev` (for example `5175`) in the same paths below.

| Product surface | Example URL | Purpose |
| --- | --- | --- |
| Reader | `http://localhost:5173/read/dora/articles/1` | Read an exact provision with stable navigation and relationship context. |
| EBA Guideline | `http://localhost:5173/read/eba-gl-2021-05/provisions/5` | Read the EBA internal-governance subject-matter paragraph and its reviewed CRD relationship. |
| Act Explorer | `http://localhost:5173/explore/dora` | Browse the complete structure of one legal act. |
| RTS/ITS Library | `http://localhost:5173/library/dora` | Browse a regulatory family's reviewed Level 2 measures; append `/rts` or `/its` to filter. |
| Global Network | `http://localhost:5173/relationships` | View loaded regulations in one connected space; optionally reveal CJEU cases and external CELLAR Works. |
| Document Graph | `http://localhost:5173/relationships/gdpr` | Explore Act-level relationships, including the reviewed GDPR CJEU Case nodes. |
| Article Graph | `http://localhost:5173/relationships/dora/articles/20` | Explore relationships scoped to one exact provision. |
| Implementation Timeline | `http://localhost:5173/timelines/ai-act` | Review AI Act publication, entry-into-force, and phased-application milestones with exact Article 113 evidence. |
| Supervisory Decisions | `http://localhost:5173/decisions/gdpr` | Review provision-level CNPD findings with the exact official operative text and source PDF. |
| Regulatory Path | `http://localhost:5173/domains/banking-governance-internal-control` | Follow the reviewed CRD → EBA → CSSF path with explicit direction and exact relationship evidence. |
| Applicability Navigator | `http://localhost:5173/applicability/dora` | Review DORA Article 2 scope evidence for a credit institution, retain all loaded qualifications, then continue to related RTS/ITS mappings. |

Press `Cmd+K` on macOS or `Ctrl+K` elsewhere from any product page to open global law, full-text, definition, and opened-law search.

Use the **Light/Dark** control in the top bar to switch the shared Reader, Explorer, and Level 2 Library chrome. Dark is the default; the browser stores the selected theme locally, without storing legal text or changing the runtime artifact.

Before considering a change complete, run:

```bash
npm run check
npm test
npm run build
```

| Command | When to use it |
| --- | --- |
| `npm run dev` | Develop the web app and API together. |
| `npm run check` | Run formatting, linting, and TypeScript validation. |
| `npm run check:fix` | Apply safe formatting and lint fixes. Review the diff afterwards. |
| `npm test` | Run fast unit tests. |
| `npm run build` | Verify the production web build. |
| `npm run corpus:build -- --profile <profileId>` | Rebuild the exact manifest-pinned raw snapshots through existing Canonical builders into an isolated, verified Runtime artifact and machine-readable report. |
| `npm run corpus:build -- --profile <profileId> --require-archived` | Apply the production snapshot-retention gate; currently fails until every pinned snapshot has a reviewed remote archive URI. |
| `npm run runtime:build` | Atomically rebuild the default `full-corpus` read-only runtime SQLite from validated Canonical artifacts. |
| `npm run runtime:build -- --profile banking-default` | Build the reviewed banking baseline; the current policy excludes the complete MiCA family. |
| `REGULATORY_EDITION_PROFILE=banking-default npm run dev` | Build and run the local application with the banking baseline through the normal `predev` hook. |
| `npm run runtime:verify` | Validate a built runtime SQLite artifact through the read-only Reader and Search services. |
| `npm run release:verify` | Rebuild and verify raw snapshots, registry IDs, Canonical views, and runtime SQLite as one corpus. |
| `npm run relationships:benchmark` | Evaluate the reviewed Article ↔ Recital Top-5 cases and fail unless the publication gate passes. |
| `npm run cellar:relations:fetch` | Fetch a bounded official CELLAR SPARQL snapshot for the loaded EU CELEX corpus without publishing it. |
| `npm run cellar:relations:verify -- --snapshot <path>` | Verify the ignored CELLAR response/query hashes and its normalized candidate. |
| `npm run cellar:lifecycle:fetch` | Discover the reviewed amendment/corrigendum predicates around loaded EU CELEX seeds without publishing external nodes. |
| `npm run cellar:lifecycle:verify -- --snapshot <path>` | Verify an ignored lifecycle query/response/candidate snapshot and its hashes. |
| `npm run cellar:case-law:fetch` | Discover official direct CJEU interpretation metadata around loaded EU CELEX seeds without publishing case-law nodes. |
| `npm run cellar:case-law:verify -- --snapshot <path>` | Verify an ignored CJEU query/response/candidate snapshot and its hashes. |
| `npm run cellar:case-law:metadata:fetch -- --snapshot <path>` | Save an immutable official English-title/ECLI/date snapshot for a verified CJEU discovery snapshot. |
| `npm run cellar:case-law:metadata:verify -- --snapshot <path>` | Verify a CJEU metadata snapshot's source candidate, query, response, hashes, and normalized candidate. |
| `npm run cellar:case-law:metadata:probe -- --snapshot <path>` | Check the official English title, ECLI, and date completeness of a verified CJEU candidate snapshot without publishing metadata. |
| `npm run search:benchmark` | Run the fixed six-query relevance check and record a warm-search latency baseline with machine/runtime metadata. |
| `npm run cssf:source:list` | List the reviewed CSSF representative-source registry. |
| `npm run cssf:source:fetch -- --id <ID>` | Save an immutable official CSSF HTML/PDF snapshot under ignored raw data. |
| `npm run cssf:source:verify -- --snapshot <path>` | Recompute CSSF snapshot byte counts and SHA-256 hashes. |
| `npm run cssf:canonical:inspect -- --snapshot <path>` | Inspect CSSF HTML or tagged-PDF structure and candidate fidelity metrics without publishing. |
| `npm run cssf:canonical:build -- --snapshot <path>` | Publish an immutable CSSF Canonical artifact after the media-specific quality gate passes. |
| `npm run test:e2e` | Run Playwright smoke tests for the DORA Explorer, Reader, Level 2 library, and global search. |

## Deploy to Google Cloud Run

This is one deployable Node application: Express serves `/api/*` and the Vite `dist` frontend from the same container, while SQLite is opened read-only. The Docker image deliberately receives a previously verified runtime artifact; it does not fetch or rebuild legal source data in Cloud Run.

Before building an image, create and verify the artifact locally or in a controlled build environment:

```bash
npm run runtime:build
npm run runtime:verify
docker build -t regulatory-knowledge-platform:local .
docker run --rm -p 8080:8080 -e PORT=8080 regulatory-knowledge-platform:local
```

Then verify `http://localhost:8080/api/health` and `http://localhost:8080/`. This runtime makes no external data request: Reader, Explorer, Search, Library, and Relationship Graph all use the bundled read-only SQLite artifact. Network access is only needed to update source snapshots, open an official-source link, or serve the public deployment.

To publish a verified image to Cloud Run, create or select a billed GCP project, install the Google Cloud CLI, and choose a region. The commands below use `europe-west1` and an Artifact Registry repository named `regulatory`. Enable the APIs and create the repository once per project:

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
gcloud services enable run.googleapis.com artifactregistry.googleapis.com
gcloud artifacts repositories create regulatory \
  --repository-format=docker \
  --location=europe-west1
gcloud auth configure-docker europe-west1-docker.pkg.dev
```

### Registry authentication troubleshooting

Before the first push, confirm that `gcloud` is using the intended account and project:

```bash
gcloud version
gcloud auth list
gcloud config list
gcloud projects describe "$(gcloud config get-value project)"
```

If `docker buildx ... --push` fails with `failed to fetch anonymous token` and `403 Forbidden`, repeat `gcloud auth configure-docker europe-west1-docker.pkg.dev`. If Docker still does not use the credential helper, create a short-lived Docker login from the active `gcloud` account, then rerun the push:

```bash
gcloud auth print-access-token | docker login \
  -u oauth2accesstoken \
  --password-stdin https://europe-west1-docker.pkg.dev
```

The authenticated account also needs the **Artifact Registry Writer** role for the project or the `regulatory` repository.

For every release, use a new immutable tag. On Apple Silicon, Cloud Run requires an image containing `linux/amd64`, so build and push it with Buildx rather than tagging the locally tested native image:

```bash
RELEASE_ID="$(git rev-parse --short HEAD)"
IMAGE="europe-west1-docker.pkg.dev/YOUR_PROJECT_ID/regulatory/regulatory-knowledge-platform:${RELEASE_ID}"
docker buildx build --platform linux/amd64 --tag "$IMAGE" --push .
gcloud run deploy regulatory-knowledge-platform \
  --image "$IMAGE" \
  --region europe-west1 \
  --allow-unauthenticated \
  --port 8080 \
  --memory 1Gi \
  --max-instances 1
```

After deployment, obtain the service URL from the command output and check `<service-url>/api/health`. Keep the deployed image tag and the response's `runtimeDatabase.buildId` with the release record. A new verified SQLite artifact is promoted by building and deploying a new immutable image, then routing traffic to the new Cloud Run revision; retain the preceding image for rollback. The service honours Cloud Run's injected `PORT` variable.

## Legal Data Operations

The source pipeline resolves an EU law from its CELEX work to the English expression, the `fmx4` manifestation, and its declared legal-content stream in the Publications Office Cellar. It supports both CELEX expression aliases and the explicit language/work links used by newer Official Journal acts, and it avoids selecting legacy `.doc.xml` metadata when a manifestation exposes multiple items. After a canonical artifact is built, the Reader loads the latest validated artifact automatically. On a new machine with no DORA artifact, it falls back to a clearly labelled DORA fixture.

### Pipeline status and boundary

The implemented deterministic path is:

```text
source registry
→ exact snapshot manifest and checksum verification
→ parser inspection and reviewed quality baseline
→ immutable Canonical artifact
→ Edition/Profile compilation
→ reviewed relationship datasets and builders
→ atomic runtime SQLite build
→ runtime verification, tests, and release gates
```

These stages are real and independently runnable. `data/corpus-build-manifest.json` pins all 18 current registry entries to exact verified snapshot IDs and content hashes. `npm run corpus:build -- --profile <profileId>` verifies those snapshots and reviewed inputs, invokes the existing EUR-Lex/CSSF/EBA Canonical builders, compiles the selected Edition/Profile, verifies an isolated Runtime SQLite, and writes an ignored machine-readable build report. Rebuilding both `full-corpus` and `banking-default` reproduces their existing Runtime build IDs. Durable remote snapshot storage is not configured yet: all current entries are honestly marked `local-only`, and `--require-archived` fails closed until reviewed archive URIs are recorded. The workflow is documented in `docs/corpus-onboarding-runbook.md`.

The platform keeps one master Canonical corpus and compiles build-time editions. `banking-default` currently includes CRD (including EBA/GL/2021/05), DORA, GDPR, AI Act, NIS2, Data Act, and CSSF families while excluding MiCA and its RTS; `full-corpus` remains the explicit default. The compiler constrains Documents, Definitions, Relationships, Search, Reader routes, Libraries, Graph endpoints, and applicability rules together, records Profile identity/hash in Runtime schema `5.3.0`, and prevents an excluded registered law from reappearing as an external graph Work. Dynamic per-request Profile switching, authorization, and public compatibility remain Phase 4 concerns.

For local development, `REGULATORY_EDITION_PROFILE` is consumed only by the build command inherited by `predev`/`prestart`; an explicit `--profile` argument takes precedence. A production container always serves the Profile already compiled into its bundled SQLite artifact. Changing an environment variable on a running container does not rewrite or switch that artifact.

### List the registered laws

```bash
npm run source:list
```

The version-controlled registry is `data/source-registry.json`. It currently contains seven Level 1 acts, including the CRD banking-governance pilot source, four DORA RTS measures, two DORA ITS measures, and one MiCA RTS measure. Documents in the same regulatory family intentionally share a `familyId`; `regulatoryLevel` and `measureType` distinguish primary acts, RTS, ITS, and future Level 3 material.

### CSSF representative sources

CSSF uses a separate source adapter and registry so that CSSF HTML/PDF handling does not enter the EUR-Lex/Cellar parser. The initial reviewed set contains one structured HTML communiqué and two official PDF circulars: the 9 April 2025 ICT-risk update communiqué, Circular CSSF 25/893 on DORA incident reporting, and the consolidated Circular CSSF 12/552 on internal governance and risk management. The HTML document exercises native heading/list structure; the circulars establish that PDF fallback is required for official legal text. Acquisition accepts only `https://cssf.lu` or `https://www.cssf.lu`, follows only same-authority redirects, enforces bounded media types and sizes, and writes immutable content-hashed snapshots under ignored `data/raw/cssf`.

```bash
npm run cssf:source:list
npm run cssf:source:fetch -- --id circular-25-893
npm run cssf:source:verify -- --snapshot data/raw/cssf/circular-25-893/<snapshot-directory>
npm run cssf:canonical:inspect -- --snapshot data/raw/cssf/communication-2025-04-09-ict-risk-updates/<snapshot-directory>
npm run cssf:canonical:build -- --snapshot data/raw/cssf/communication-2025-04-09-ict-risk-updates/<snapshot-directory>
npm run cssf:canonical:inspect -- --snapshot data/raw/cssf/circular-25-893/<snapshot-directory>
npm run cssf:canonical:build -- --snapshot data/raw/cssf/circular-25-893/<snapshot-directory>
```

The CSSF registry stores the official heading and subject separately when CSSF publishes them as separate fields. The independent HTML adapter preserves headings, paragraphs, nested lists, footnotes, source locators, and stable `lu:cssf:*` IDs; unsupported substantive images and excluded related-document cards remain explicit parser warnings. Its reviewed quality gate fixes the expected section/block counts, warning ceiling, and official-text anchor hashes. The tagged-PDF adapter combines the PDF's semantic structure with explicit numbering markers, preserves page evidence, and fails closed on structural gaps. Circular CSSF 25/893 now passes its page, chapter, provision, point, warning, and official-text hash gates. Its introduction, four chapters, points 1–15, nested letter/number points, and footnotes are available through the common Canonical contract; the non-body signature table is excluded with an explicit warning. Raw source snapshots and parser output remain distinct.

Runtime schema `5.3.0` keeps CELEX and authority-local identifiers in separate nullable columns with an at-least-one constraint. Reader payloads now retain the Canonical source snapshot ID and each Provision/Body Block's exact PDF page, XPath, CSS selector, XML ID, or fixture locator for citation delivery. It projects reviewed `sourceStatus` metadata into normalized `document_version_chains`, `document_versions`, and `document_version_edges` tables, stores reviewed CELLAR amendment/corrigendum metadata in separate `legal_works` and `lifecycle_relationships` tables, and keeps metadata-only CJEU cases in independent `case_entities` and `case_law_relationships` tables. The read-only `/api/documents/:documentId/version-chain` endpoint and Reader distinguish the loaded original/consolidated snapshot from external current-version and corrigendum records. Lifecycle and Case edges are visible only in the Document graph and do not claim that external legal or judgment text is loaded. Validated CSSF and EBA artifacts enter the same catalog, full-text search, Explorer, Reader, and relationship contracts without invented CELEX or Article semantics. Circular CSSF 12/552 uses a separate consolidated-governance PDF profile: it restores 4 Parts, 82 Part/Chapter/Sub-chapter/Section/Sub-section nodes, Part I points 1–3 and its 19 definition entries, Part II points 1–186, Part III points 1–51, the Part IV timeline, and Annexes I–II. Sub-chapters map to the existing Canonical `division` kind, substantive unnumbered paragraphs, timeline closing text, and the tagged table remain independent official-text provisions when no explicit numbered parent exists; only the page 83 contact footer is excluded with an explicit warning. Repeated Part-local point numbers receive stable disambiguated route tokens while their official labels remain unchanged.

The Phase 3 Banking Governance context is materialized at build time. `data/editorial/regulatory-domains.json` publishes a reviewed, versioned editorial taxonomy and representative CRD/CSSF/EBA assignments; `data/official-metadata/authorities.json` separately publishes reviewed official issuer metadata, while `data/official-metadata/legal-natures.json` records the EBA guideline's compliance expectation, status, review flag, and application date with distinct official evidence. Runtime `5.3.0` keeps these in normalized context tables rather than modifying Canonical legal text or weakening the existing legal-entity relationship contract. Reader consumes the same read-only service output as future Agent/RAG adapters through `/api/documents/:documentId/regulatory-context?provisionId=<stable-id>`. The bounded set now contains 3 Domains, 10 Document/Provision assignments, 5 Authorities, 4 issuer relationships, and one reviewed legal-nature record.

The first reviewed national implementation mapping publishes `Circular CSSF 12/552 Introduction block 7 → IMPLEMENTS → EBA/GL/2021/05`. Its evidence is the exact Circular paragraph that identifies the Guidelines and describes translating applicable European principles into the Luxembourg banking-sector context. In this 0→1 contract, `IMPLEMENTS` runs from an evidence-bearing loaded national body block to the loaded EU or authority instrument; it does not assert that the Circular `TRANSPOSES` CRD. The mapping is Profile-filtered and fails closed if its official-text evidence drifts.

### Banking Governance regulatory path

The generic `/domains/:domainSlug` product surface and `GET /api/regulatory-paths/:domainSlug` service project the existing Runtime taxonomy, assignments, authorities, legal nature, Profile identity, and cross-document relationships into one evidence-bearing navigation path. The first path at `/domains/banking-governance-internal-control` displays CRD IV, EBA/GL/2021/05, and Circular CSSF 12/552 together with the existing `MANDATES`, `SUPPLEMENTS`, and `IMPLEMENTS` directions and their exact official evidence. It does not read curated JSON at request time, reverse edges for visual convenience, or treat an Edition/Profile as an institution-specific legal applicability conclusion. CRD, EBA, and CSSF Reader/Explorer context links back to the same generic path.

### DORA applicability navigator

Runtime `5.3.0` adds the first evidence-bearing applicability rule at `/applicability/dora` and `GET /api/applicability/dora?entityType=credit-institution`. The reviewed input identifies the exact DORA Article 2(1)(a) listing for credit institutions and retains Article 2(1)'s “without prejudice” text, the complete loaded Article 2(3) exclusion subtree, and Article 2(4), for 10 exact legal-text evidence records. `applicability-rule@1.0.0` resolves every stable ID against the current Canonical-derived `DocumentView`, rejects text drift and incomplete qualification subtrees, and omits the rule when DORA is outside the selected Edition/Profile. The result status is deliberately bounded to `listed-in-scope-subject-to-qualifications`; it is not a final institution-specific legal determination. Article 20 and Article 28 are separate reviewed navigation entries whose RTS/ITS links are assembled from existing `MANDATES` relationships rather than copied into the rule dataset. Reader, Explorer, Web, and internal API consume the same read-only Runtime projection; unknown entity types return `404` rather than a guessed answer.

### AI Act implementation timeline

Runtime `5.1.0` adds an independent Temporal projection for six reviewed AI Act milestones at `/timelines/ai-act` and `GET /api/timelines/ai-act`. Publication metadata and Article 113 legal-text events are materialized into `implementation_timeline_events`; every application date links back to the exact Article 113 Body Block, XPath, official URL, and unmodified evidence text. The 1 August 2024 entry-into-force event is explicitly marked `DERIVED`: the builder verifies the Article 113 twentieth-day rule, the reviewed 12 July 2024 publication date, and the deterministic 20-calendar-day calculation. It is never represented as a date quoted directly by Article 113. Timeline data is Profile-filtered, schema-validated, and separate from UI copy and Canonical legal text.

### CNPD supervisory decision

Runtime `5.2.0` adds the first reviewed supervisory Decision at `/decisions/gdpr` and `GET /api/supervisory-decisions/gdpr`. CNPD decision `18FR/2022` is stored as a separate `decision:lu:cnpd:18fr-2022` entity with its authority, jurisdiction, date, decision number, official title, subject, pseudonymized respondent label, outcome, official page/PDF, verified PDF SHA-256, and review lineage. Four `FINDS_VIOLATION_OF` relationships point to loaded GDPR Articles 5, 6, 12, and 15 and use `DECISION_TEXT` provenance with the exact operative text on PDF page 30. The optional `provisionId` query filters these findings for Reader context. The full decision text is not imported into Canonical data, and no finding is inferred from the website summary.

### Agent/RAG citation context (internal)

Phase 3 exposes one unversioned internal transport over the reusable citation-context service:

```text
GET /api/internal/citation-context/:entityId
GET /api/internal/citation-retrieval?q=<query>&limit=<1-10>&documentId=<optional>
```

Pass a stable Provision or Body Block ID returned by full-text search. The response contains exact, unmodified official-text segments with their stable IDs and source locators; document URL, snapshot/version/as-of and Canonical build identity; Runtime build/Profile identity; root-Provision relationships with direction, provenance and evidence; and the same Domain, Authority and legal-nature context used by the Web product. Retrieval metadata is explicitly `stable-entity-id@1.0.0`, exact match, rank `1`, score `1`; it is not a semantic-confidence or legal-confidence score. Unknown or Profile-excluded IDs return `404` rather than falling back to another law.

After `npm run dev`, for example:

```bash
curl 'http://localhost:3000/api/internal/citation-context/lu%3Acssf%3Acircular-12-552%3Aprovision%3Aintroduction%3Ablock%3A7'
curl --get 'http://localhost:3000/api/internal/citation-retrieval' \
  --data-urlencode 'q=EBA shall issue guidelines arrangements processes mechanisms' \
  --data-urlencode 'limit=3'
```

The retrieval route runs the existing SQLite FTS5 search and resolves each result to its exact citation bundle. It preserves both final `rank` and original `searchRank`; an unresolved body record may fall back only to its own root Provision, never to another law. Empty lexical matches return an identity-bearing response with no results. The reviewed CRD/CSSF/EBA 0→1 gate can be rerun with `npm run citation:benchmark`; all three cases must hit the expected entity at Top 1.

These routes are deterministic, read-only projections over the schema-validated Runtime. Public compatibility, authentication, rate limiting, and external adapters remain Phase 4 concerns.

### EBA Guidelines source

EBA uses an independent official-host adapter and registry. EBA/GL/2021/05 is pinned as a 93-page official PDF under stable Document ID `eu:eba:gl:2021:05`; the parser includes the Guidelines body on PDF pages 13–64, restores paragraphs 1–234 and Annex I, and explicitly excludes the Final Report front matter and accompanying consultation/impact material from the legal body. Page/structure/provision/block counts, warning ceiling, and four official-text hashes form the reviewed fidelity gate.

```bash
npm run eba:source:list
npm run eba:source:fetch -- --id eba-gl-2021-05
npm run eba:source:verify -- --snapshot data/raw/eba/eba-gl-2021-05/<snapshot-directory>
npm run eba:canonical:inspect -- --snapshot data/raw/eba/eba-gl-2021-05/<snapshot-directory>
npm run eba:canonical:build -- --snapshot data/raw/eba/eba-gl-2021-05/<snapshot-directory>
```

The reviewed relationship dataset publishes `CRD Article 74 → MANDATES → EBA/GL/2021/05` from CRD Article 74(3), and `EBA paragraph 5 → SUPPLEMENTS → CRD Article 74` from the guideline's own subject-matter text. These are evidence-checked `OFFICIAL_MAPPING` edges. The official EBA page currently marks the final report `In force` and separately exposes an `Ongoing review`; the guideline body states that the updated guidelines apply from 31 December 2021. Those facts remain separate records rather than being merged with the page's differing application-date field.

### Download an official immutable snapshot

```bash
npm run source:fetch -- --celex 32022R2554
```

This command:

1. refuses a CELEX ID that is not in the registry;
2. downloads the official Cellar tree notice over HTTPS;
3. resolves the English Formex v4 legal-content XML, ZIP, or legacy multi-item manifestation from the tree rather than guessing a file URL;
4. saves the tree notice and byte-exact official Formex content under `data/raw/eur-lex/<CELEX>/<timestamp>-<hash>/`; legacy ACT/ANNEX/DOC items are placed in a deterministic local package whose snapshot records and verifies every upstream URL, response metadata, byte count, and SHA-256 hash.

`data/raw/` is intentionally ignored by Git. Each timestamped directory is an immutable source snapshot; do not edit its files.

### Verify a downloaded snapshot

Use the directory printed by `source:fetch`:

```bash
npm run source:verify -- --snapshot data/raw/eur-lex/32022R2554/<snapshot-directory>
```

Verification checks the metadata contract, byte counts, SHA-256 hashes, and the binding between `snapshotId` and the Formex content hash. For a legacy multi-item manifestation it also opens the deterministic package and verifies every recorded upstream item independently. Newer package manifestations can additionally be inspected with `unzip`; older acts such as GDPR use an official single XML stream and do not need this step:

```bash
unzip -t data/raw/eur-lex/32022R2554/<snapshot-directory>/source.fmx4.zip
```

### Build the canonical document

Use the same verified snapshot directory:

```bash
npm run canonical:build -- --snapshot data/raw/eur-lex/32022R2554/<snapshot-directory>
```

The build validates the source snapshot again, separates the ACT and any independently stored ANNEX XML files without a system `unzip` dependency, parses structural nodes and legal provisions, validates stable IDs and content hashes, then enforces the law-specific counts and text-fidelity hashes stored in `data/source-registry.json`.

The immutable result is written under `data/artifacts/canonical/<CELEX>/`. This directory is ignored by Git and can always be rebuilt. Restart `npm run dev` after the first build so the API loads the official artifact.

### Add another EU law

1. Add one entry to `data/source-registry.json`; use the official CELEX ID, English ELI URL, the appropriate shared `familyId`, explicit `regulatoryLevel` / `measureType`, and reviewed common names in `aliases`. CELEX and aliases must be unique; family IDs are intentionally reusable. Do not add speculative or ambiguous aliases. When EUR-Lex records a consolidated version or corrigendum, also add the bounded `sourceStatus` metadata (`basis`, `textAsOf`, `checkedAt`, `currentVersionUrl`, and official correction date/URL); do not imply that an original OJ snapshot already incorporates a later correction. The status hash participates in the immutable Canonical artifact and runtime build identities, so a later correction produces a new build without overwriting the original snapshot.
2. Validate the registry and check the new row:

   ```bash
   npm run source:list
   npm test
   ```

3. Acquire and verify it:

   ```bash
   npm run source:fetch -- --celex <CELEX>
   npm run source:verify -- --snapshot data/raw/eur-lex/<CELEX>/<snapshot-directory>
   ```

4. Inspect the parser result without publishing a runtime artifact:

   ```bash
   npm run canonical:inspect -- --snapshot data/raw/eur-lex/<CELEX>/<snapshot-directory>
   ```

5. Compare the reported Article, Recital, Annex, paragraph, point, structural-node, warning, and suggested anchor-text results with the official source. Add the complete reviewed `quality` baseline to the registry.
6. Run `canonical:build`. It refuses to publish a law whose quality baseline is missing.
7. Rebuild the derived runtime database, then restart the development server:

   ```bash
   npm run runtime:build
   npm run dev
   ```

If discovery or a fidelity gate fails, stop. Do not substitute an unofficial mirror, fabricate Cellar identifiers, or weaken the baseline merely to make the build pass. Acts with materially different Formex structures require a targeted parser fixture before publication. Parser `1.3.0` covers both division-wrapped acts and newer acts whose Articles are direct `ENACTING.TERMS` children.

### Add or update an official Level 2 mapping

1. Ingest the RTS or ITS as a normal official document using the steps above. Give it the same `familyId` as its Level 1 act, `regulatoryLevel: "level-2"`, and the correct `measureType`.
2. Verify the adopted act and its exact legal basis in EUR-Lex. Do not map a draft technical standard as an adopted act.
3. Add one record per mandate Article to `data/official-mappings/level2.json`. Preserve the Level 1 Article/entity IDs, an exact mandate excerpt, the Level 2 CELEX/official title/document number, the adoption-basis wording, both official URLs, and `OFFICIAL_MAPPING` provenance.
4. Rebuild and run the dedicated gates:

   ```bash
   npm run runtime:build
   npx vitest run src/relationships/official-mapping.test.ts
   npm run check
   npm test
   npm run build
   ```

The builder rejects missing documents, invalid Article endpoints, an official-title mismatch, or mandate evidence that is not present in the loaded official Article. It emits `Article → MANDATES → RTS/ITS` and `RTS/ITS → ADOPTED_UNDER → Article` into the same relationship table. The UI and API never read the curated JSON directly.

### Refresh an existing law

Run `source:fetch` again with the same CELEX ID, verify the new directory, and run `canonical:build` against it. A new timestamped source snapshot and canonical artifact are created; previous artifacts remain available for comparison and rollback. Identical Formex content produces the same content hash and `snapshotId`, even though retrieval metadata has a later timestamp. Then run `npm run runtime:build` and restart the server so the API opens the new read-only runtime artifact.

The implemented workflow is now:

```text
official source snapshot ✓
→ Formex parser / normalizer ✓
→ canonical-data and fidelity validation ✓
→ immutable canonical artifact ✓
→ Reader API and UI ✓
→ six-law parser validation ✓
→ Universal One-page Act Explorer ✓
→ global law discovery / Find Laws ✓
→ current-document full-text ✓
→ SQLite FTS5 global search build ✓
→ explicit relationship build ✓
→ official Level 2 mapping build ✓
→ atomic publish or rollback
```

### Stable identity rules

- EU document: `eu:<CELEX>`, for example `eu:32022R2554`.
- Article: `eu:<CELEX>:article:<number>`.
- Nested provisions append their kind and normalized legal number.
- Repeated local numbering appends `:occurrence:<n>` only from the second occurrence.
- A source-specific version is separate: `<logical-id>@<source-version>`.

Logical IDs never contain a content hash or UI URL. Content hashes prove text integrity; they do not define the legal entity.

### Reader links and navigation

Reader URLs are stable and readable:

```text
/read/dora/articles/6
/read/dora/recitals/40
/read/dora/articles/1#paragraph-1-point-a-subpoint-iii
/read/ai-act/annexes/vii#annex-part-1
```

Refreshing or using browser Back/Forward restores the selected collection and provision. Paragraph and point markers are permalinks; the adjacent copy control puts the stable URL on the clipboard and briefly confirms success. The Reader's current-law field gives exact locators priority and accepts inputs such as `23`, `art 23`, `rec 40`, and `annex 2`.

The same field searches the loaded law's Article, Recital, and Annex titles and body text without another server request. Multiple unquoted terms use strict AND semantics, each term supports word-prefix matching, and quoted text is an exact normalized phrase. Results include highlighted snippets and open stable provision or paragraph anchors. For example:

```text
ICT risk manag
operational resilience
"management body"
```

The in-memory index is rebuilt deterministically from the validated `DocumentView`, carries `schemaVersion`, `documentId`, and `buildId`, and is not a second source of legal truth. Use `↑`/`↓` and `Enter` for result navigation, or `Esc` to close the result list.

### Explorer links and navigation

Each registered law has a lightweight one-page structural overview:

```text
/explore/dora
/explore/gdpr
/explore/ai-act
/explore/mica
/explore/nis2
/explore/data-act
/explore/dora#article-28
```

The Explorer API is `/api/explorer/:slug`. Its response contains document metadata, counts, and the recursive structural outline, but not legal body text. Article links open the same stable Reader provision routes, while the Reader's **Explore** action returns to the exact Article anchor. Explorer scroll position is restored within the browser session.

After `npm run dev`, manually check one legacy single-XML act and one modern package act, for example:

1. Open `http://localhost:5173/explore/dora` and select Article 28.
2. Confirm the Reader opens `/read/dora/articles/28`.
3. Select **Explore** and confirm the browser returns to `/explore/dora#article-28` with the Article visible.
4. Repeat a structural and mobile check at `http://localhost:5173/explore/ai-act`.

### Find Laws

Use `Cmd+K` on macOS or `Ctrl+K` elsewhere from either Reader or Explorer to open the global Find Laws panel. Search is live; `↑`/`↓` changes the active result, `Enter` opens its Explorer, and `Esc` closes the panel.

The deterministic server endpoint is `/api/search/laws?q=<query>`. It ranks exact legal identity ahead of lexical title matches in this order: CELEX, reviewed name/alias, structured year/number citation, exact title, title prefix, then whole-term matches. A one-character typo fallback applies only to a concise reviewed law name or alias (for example `doora` → DORA); it never alters official legal text. Compound law-and-locator input preserves a recognised law anchor even when descriptive words occur before the locator (for example `dora risk article 3` → DORA Article 3). When no law identity matches, the dialog offers a direct switch to Full text instead of an empty result area. Useful checks include:

```text
DORA
DORA article 3
Digital Operational Resilience Act
32022R2554
2022/2554
Regulation (EU) 2022/2554
NIS 2
Directive 2022/2555
AI Act annex VII
```

Compound queries combine a verified law identity with `article`/`art`, `recital`/`rec`, or `annex` and a number. They open the exact stable Reader route only when that provision exists; the service does not guess missing provisions. Known aliases live only in `data/source-registry.json`. After changing them, run `npm run source:list`, `npm run check`, and `npm test`; the UI does not contain a second alias or ranking implementation.

### Opened Laws

Select **Opened laws** in the same panel, or press `Tab` once from **Find laws**, to reopen recent regulations immediately. This is deliberately a local convenience, not regulatory data: the browser stores a versioned list of at most ten stable document IDs, their most recently visited Reader/Explorer path, and a timestamp in `localStorage`. It stores no legal text, requires no account, does not write to SQLite, and can be cleared from the panel.

The current document catalog hydrates those IDs at display time, so a law no longer shipped in the local corpus is simply not shown. Opening a law again moves it to the top and preserves its most recent deep link. The input filters the local list; `↑`/`↓` and `Enter` work exactly as in the other command-palette modes.

### Definitions

Open the global panel and select **Definitions**, or press `Tab` once from **Find laws**. Search supports exact normalized terms, term prefixes, and quoted term phrases. Results show the official definition text, EU/LU jurisdiction, source law, Article and point, CELEX ID, and a stable link to the defining point. The same term can appear once per source law, so cross-regulation differences remain visible.

Useful checks include:

```text
controller
personal data
"AI system"
digital operational resilience
network and information system
crypto asset
data holder
```

The global endpoint is `/api/search/definitions?q=<term>&limit=<1-50>`, while `/api/documents/:documentId/definitions` provides the same traceable records for Reader annotation. Definitions are derived during `npm run runtime:build`; the browser never parses legal prose into definitions. The current strict rule only accepts point records inside an Article titled `Definitions` whose official text starts with `<term> means`. The seven Level 1 acts produce 362 structurally matching definition points; the current 18-document runtime contains 365 definitions after including three additional structurally matching points from the DORA register ITS.

Reader body text marks a defined term only when the same document has one unique extracted definition and the official term appears with exact case-insensitive text and complete word boundaries. It does not apply stemming, synonyms, or cross-document inference, does not annotate the defining provision itself, and never overlaps an explicit legal-reference span. Hover/focus shows an exact-text excerpt; click opens a Side Peek with the complete official definition, source provision, definition type, and official source link.

When a definition explicitly says `as defined in`, it is stored as `incorporated`; otherwise it is `direct`. Exact direct definitions rank before incorporated references, while every result retains its own official source text and point link. For example, `personal data` returns the direct GDPR definition first, followed by incorporated MiCA, Data Act, and AI Act definitions.

### Global full-text search

Open the same global panel with `Cmd+K` or `Ctrl+K`, then select **Full text** or press `Tab` to switch modes. Full-text search covers the headings and legal body blocks of every loaded law. Multiple unquoted terms use strict AND and word-prefix semantics; quoted text is an exact normalized phrase. Results contain safe highlighted text segments and open stable paragraph-level Reader links.

Useful checks include:

```text
operational risk
"management body"
personal data controller
artificial intelligence system
crypto asset
data holder
```

The endpoint is `/api/search/full-text?q=<query>&limit=<1-50>`. Add `documentId=eu:<CELEX>` for exact document scope. User input is normalized into bounded parameterized FTS expressions; unsupported operator punctuation is not executed as raw FTS syntax.

The artifact at `data/artifacts/runtime/regulatory.sqlite` is generated and ignored by Git. It contains a schema version, a content-derived build ID, Canonical document build IDs, materialized Reader and Explorer payloads, reviewed aliases, stable search, definition, entity, and relationship records, and separate FTS5 tables. It is never canonical legal data. `npm run dev`, `npm start`, and `npm test` rebuild it first, or rebuild it explicitly after adding or updating a Canonical law:

```bash
npm run runtime:build
npm test -- src/search/full-text-search.test.ts
npm test -- src/relationships/explicit-reference.test.ts
npm run search:benchmark
npm run performance:benchmark
```

The builder checks that the local SQLite runtime supports FTS5, creates a temporary database, validates and optimizes it, then atomically publishes the completed file. At startup the API opens this artifact read-only and fails fast if its schema or manifest is incompatible. `/api/health` reports its `buildId` and corpus counts. For a staged production artifact, run `npm run runtime:verify -- --input <sqlite-path>` before switching the running service to it; the command checks SQLite integrity/FTS support plus matching Reader and Search manifests.

The website never reads Canonical JSON, `data/source-registry.json`, or curated mappings at runtime. `documents` holds queryable family/level/measure/source metadata plus a bounded `source_status_json` object, `document_views` holds schema-validated Reader and Explorer JSON read models, and `document_aliases` holds reviewed aliases. `legal_entities` provides the stable JOIN boundary for loaded documents, provisions, and body blocks; `relationships` stores provenance-aware resolved edges. The separate `legal_works` and `lifecycle_relationships` tables allow reviewed CELEX Work metadata to reference an unloaded external endpoint without weakening those foreign keys. Search, Definitions, and Relationships reuse the same artifact. Corpus parity tests require every SQLite Reader/Explorer payload to equal its Canonical-derived DTO exactly. This deliberately avoids reconstructing recursive legal trees with many joins while keeping one runtime data source.

The search benchmark fails if any fixed full-text or definition query loses its expected law. Its JSON report records the Node and SQLite versions, platform, architecture, CPU, memory, corpus build ID and counts, warm-up and sample counts, first-query timings, and warm P50/P95/max full-text latency. Treat its values as a machine-specific baseline, not as a portable guarantee.

`npm run performance:benchmark` rebuilds the runtime and web production build, runs the local read-only API with a Vite production preview, and prints a machine-specific JSON baseline. It measures warm loopback HTTP responses for the Reader document and an Article 28 provision-relationship request (10 warm-ups, 100 samples each), and fails when either P95 reaches 100 ms. It also records three fresh-browser-context and three repeat homepage samples for navigation timing, FCP/LCP when the browser reports them, and same-origin transfer payload. “Fresh” means a new browser context; it deliberately does not claim to clear OS or disk caches.

### References and Cited By

The Reader relationship panel shows deterministic references derived at build time from official legal text. **References** opens an internal Article, Annex, or loaded law; **Cited by** is the reverse query over the same stored edge, not a duplicated or separately parsed relation. Each result retains the exact matched citation, source entity, official source URL, provenance (`LEGAL_TEXT`), resolver method/version, and a stable target ID. The same panel appears below the legal text on tablet and mobile.

The runtime endpoint is `/api/relationships/:documentId/:provisionId`. Its response keeps `references`, `citedBy`, `mandates`, `adoptedUnder`, `supplements`, `implements`, `relatedDocuments`, and `relatedRecitals` separate, plus the runtime build ID. The current `explicit-reference@1.0.0` resolver conservatively publishes singular Article/Annex references within a loaded law, modern typed EU Regulation/Directive citations, and compound cross-law Article citations when the target exists in the loaded corpus. Unresolved, ambiguous, plural/range, shorthand, and unloaded external targets remain ordinary official text; they are counted in the build manifest but are not guessed into links.

In the Reader, an inline citation becomes clickable only when the builder supplied an exact `sourceEntityId` plus a validated character range whose stored evidence text still matches the rendered official text. The browser never re-parses legal prose with regex. Clicking opens Side Peek without changing the Reader URL; it requests `/api/relationship-previews/:entityId` only then, derives a short target excerpt from the existing read-only Reader payload, and provides explicit **Open full** and official-source actions. Closing Side Peek leaves the reading position untouched.

`npm run runtime:build` currently publishes 2,574 resolved explicit-reference edges, 16 directed official-mapping edges from 8 reviewed mandate records, and 1,374 scored Related Recital edges after the TF-IDF gate passes; it reports 1,489 unmaterialized references across 14 immutable EU documents. These are corpus-specific audit counts, not permanent product constants. Builder versions, curated mapping content, and the reviewed TF-IDF benchmark participate in the runtime build ID, so changing resolver semantics, evidence, or benchmark inputs invalidates the artifact deterministically.

### Related Recitals benchmark

Run `npm run relationships:benchmark` before publishing TF-IDF relationship changes. The version-controlled benchmark checks eight reviewed DORA, GDPR, and AI Act Article ↔ Recital cases at Top 5 and currently requires a 100% case hit rate. The runtime builder publishes scored `RELATED_RECITAL` edges only when the complete benchmark corpus is loaded and the gate passes; partial test corpora publish none. These edges use provenance `TFIDF` and remain textual-relevance suggestions, not legal authority or legal-confidence scores.

### CELLAR focused official relations

The first CELLAR SPARQL slice is deliberately closed over the 13 loaded EU CELEX works and publishes only two reviewed CDM predicates: `resource_legal_based_on_resource_legal` becomes document-level `ADOPTED_UNDER`, and `resource_legal_completes_resource_legal` becomes `SUPPLEMENTS`. The normalized, version-controlled dataset contains 12 official Work-to-Work records: seven legal-basis edges and five completion edges. Every published edge uses `OFFICIAL_METADATA`, retains both CELLAR Work URIs and the exact predicate locator, and is emitted only when both CELEX documents exist as local document entities.

`npm run cellar:relations:fetch` writes the query, raw SPARQL response, hashes, and a normalized candidate under ignored `data/raw/cellar-relations/`; it never changes published data. After verification and human review, the candidate can update `data/official-metadata/cellar-focused-relations.json`. Runtime builds consume only that reviewed file. `work_cites_work` is intentionally excluded from this slice because the platform already has more precise Article/body-block `REFERENCES`; it remains a separate citation-enrichment decision. Article graphs also exclude document-scoped edges rather than visually misrepresenting them as Article-scoped relationships; the Document graph displays them at their exact document scope.

The lifecycle discovery command is a separate open-neighborhood review gate for the official `resource_legal_amends_resource_legal` and `resource_legal_corrects_resource_legal` predicates. The verified 2026-08-24 snapshot found 65 candidates around the then-current 13 loaded EU seeds: 24 amendment edges and 41 corrigenda. In that snapshot two amendments pointed into a loaded seed and 22 pointed from a seed to an external Work. After CRD became the fourteenth loaded EU document, the already-reviewed `MiCA → AMENDS → CRD` record resolves locally; the remaining 64 lifecycle records still have an external endpoint. No new lifecycle relation was inferred during CRD onboarding. The immutable raw snapshot remains ignored; its reviewed normalized records are published separately in `data/official-metadata/cellar-lifecycle-relations.json`. Runtime schema `5.3.0` maps CELEX to stable Work IDs, links loaded Works back to `documents`, keeps external Works metadata-only, and publishes `AMENDS` / `CORRECTS` solely in the Document graph. Selecting an external node opens official CELLAR metadata rather than a local Reader route.

## Current Release Status

Annotated Git tag `v0.1.0` marks commit `4b485b6` as the first usable product release. The earlier `phase-1.0.0` tag remains the Phase 1 milestone; later Phase 2 work builds on it without rewriting the Phase 1 Canonical contract.

Release 0.1 has a complete local multi-law Reader foundation:

- Node 24, npm, React/Vite, Express, TypeScript, Biome, and Vitest;
- a three-column DORA Reader and `/api/documents/:documentId` endpoint;
- a versioned Canonical Document contract with provenance, source-version IDs, structural paths, parser warnings, content hashes, and integrity validation;
- stable document/provision IDs with duplicate-number handling covered by tests;
- a validated six-law source registry and real EUR-Lex/Cellar Formex snapshot acquisition and verification;
- a DORA Formex parser producing 64 Articles, 106 Recitals, 274 Paragraph/Subparagraph records, 446 Point/Subpoint records, and 15 structural nodes with zero parser warnings;
- an AI Act Formex package parser producing 113 Articles, 180 Recitals, 13 separately stored Annexes, 581 Paragraph/Subparagraph records, 632 Point/Subpoint records, and 29 structural nodes with zero parser warnings;
- validated GDPR, MiCA, NIS2, and Data Act artifacts, bringing Release 0.1 to all six core laws and covering both legacy single-XML and modern multi-file Formex manifestations;
- hard text-fidelity hashes for selected first/last Article, Recital, and Annex anchors across all six laws, with immutable parser-versioned artifacts;
- automatic multi-law Reader loading of the latest validated official artifacts, with DORA fixture fallback only when its build does not exist;
- a recursive Adaptive TOC preserving Chapter/Section semantics and Article ranges;
- separate Articles/Recitals/Annexes collections, a law switcher, Quick Go, previous/next navigation, structural breadcrumbs, stable provision routes, and paragraph/point deep-link highlighting;
- explicit document type, publication date, source retrieval date, source version, build ID, CELEX, and official-source link in the Reader;
- desktop and 390px mobile browser smoke checks using the official DORA and AI Act artifacts;
- unit tests and a production build gate.

Release 0.2 is now in progress and additionally includes:

- a universal recursive One-page Act Explorer for all six laws;
- a separate lightweight Explorer DTO and `/api/explorer/:slug` endpoint that do not duplicate legal body text;
- stable Explorer ↔ Reader navigation, exact Article anchors, browser-history compatibility, and session scroll restoration;
- desktop DORA, MiCA structure, and 390px AI Act mobile browser smoke checks.
- a global Find Laws command panel shared by Reader and Explorer, with live server-side results and complete keyboard navigation;
- reviewed aliases in the source registry and deterministic CELEX, alias, legal citation, title-prefix, and whole-term ranking;
- verified compound locators such as `DORA article 3` and `AI Act annex VII`, resolved to stable Reader routes without returning legal body text;
- global navigation to stable Explorer routes, with desktop and 390px mobile browser checks.
- a deterministic current-document inverted index over provision headings and legal body blocks, with strict AND, phrase, prefix, snippets, highlights, and paragraph-level navigation;
- responsive current-law search integrated with Quick Go and verified against exact locators, DORA body text, phrase queries, and 390px layout.

The Release 0.2 Explorer & Basic Discovery scope is complete locally. Release 0.3 additionally includes:

- a rebuildable, schema-versioned SQLite FTS5 artifact derived from validated `DocumentView` records;
- content-derived index build IDs, source document build metadata, stable paragraph targets, and atomic publication;
- a read-only Search Service and `/api/search/full-text` endpoint with bounded parameterized queries;
- strict AND, prefix, exact phrase, deterministic BM25 ranking, safe highlighted snippets, and optional document scope;
- a keyboard-complete **Full text** mode in the shared global panel, verified on desktop and at 390px mobile width;
- fixed service tests and a reproducible six-query relevance and latency benchmark with complete runtime, machine, corpus, and sampling metadata.
- 294 first-class definition records across all six laws, extracted only from structurally verified `Definitions` provisions;
- exact, normalized, prefix, and quoted phrase definition lookup with direct definitions ranked ahead of explicit incorporated references;
- a traceable `/api/search/definitions` contract and a keyboard-complete **Definitions** mode verified across GDPR/MiCA/Data Act/AI Act sources and at 390px mobile width;
- a fixed six-query definition evaluation set included in `npm run search:benchmark`.
- a keyboard-complete **Opened laws** mode: a versioned, bounded local-only history of stable document IDs and last Reader/Explorer paths, with clear-history control and no duplication of legal data into browser storage.

Release 0.3 is complete locally. The next planned scope is Release 0.4: structured cross-document relationships, starting only with official, traceable references.

Release 0.4 is now in progress and additionally includes:

- a versioned explicit-reference builder over stable document/provision/body-block entities;
- internal Article/Annex and resolved cross-law Regulation/Directive targets, with conservative unresolved-reference handling;
- a normalized SQLite `legal_entities` + `relationships` model with evidence, provenance, builder lineage, indexes, and integrity checks;
- reverse `CITED_BY` lookup derived from stored `REFERENCES` edges;
- a schema-validated relationship API and responsive Reader relationship panel;
- browser verification of DORA Article 1 → NIS2 Article 3 navigation, the reverse Cited By view, and AI Act Article 11 → Annex IV on a 390px viewport;
- evidence-span-only inline citations and an on-demand, URL-preserving Side Peek with an official target excerpt.

The explicit-reference portion of Release 0.4 is complete locally. Exact, document-scoped defined-term hover/focus and official-definition Side Peek are also implemented from the normalized SQLite definition records; ambiguous terms and inferred variants remain unlinked.

Release 0.5 is complete and includes:

- full official ingestion, Reader, Explorer, and search coverage for DORA Delegated Regulation (EU) 2024/1774 and MiCA Delegated Regulation (EU) 2025/305;
- full official ingestion and reviewed Article 28(10) mapping for DORA Delegated Regulation (EU) 2024/1773 (ICT third-party contractual-policy RTS);
- full official ingestion and reviewed Article 18 mapping for DORA Delegated Regulation (EU) 2024/1772 (incident classification and materiality-threshold RTS);
- full official ingestion, four Annexes, reviewed Article 28(9) mapping, and the first real ITS filter for DORA Implementing Regulation (EU) 2024/2956;
- full official ingestion and reviewed Article 20 mapping for DORA Delegated Regulation (EU) 2025/301 (major ICT incident reporting-content and time-limit RTS);
- full official ingestion, four Annexes, and reviewed Article 20 mapping for DORA Implementing Regulation (EU) 2025/302 (major ICT incident reporting forms, templates, and procedures ITS);
- a minimal legal-text status contract that distinguishes original OJ text from a current EUR-Lex version and exposes known corrigenda in Reader and Level 2 Library;
- version-controlled, schema-validated DORA/MiCA mapping evidence;
- `official-mapping@1.0.0` paired `MANDATES` / `ADOPTED_UNDER` edges in the unified SQLite relationship store;
- separate relationship API groups and responsive Reader presentation with official-evidence links;
- direct-Article Formex support with a parser fixture and parser version `1.3.0`;
- desktop and 390px browser verification of DORA Article 15, reverse RTS legal bases, and exact MiCA RTS search.

The family-level RTS/ITS library and Level 1 summary counts are now implemented from the runtime SQLite data: `/library/dora`, `/library/mica`, and their `/rts` or `/its` filters list official measures, mandate Articles, Reader/Explorer links, source status, and official sources without duplicating the curated mapping input. The DORA incident-reporting RTS/ITS pair is complete. The reviewed DORA/GDPR/AI Act TF-IDF benchmark passes 8/8 at Top 5, so build-time Related Recitals are enabled for those three laws with explicit `TFIDF` provenance and retained similarity scores. Additional Level 2 measures are an explicitly unbounded Phase 2 backlog, not a Release 0.5 completion condition.

Phase 2 is now in progress. Its relationship graph delivery includes a focused Article graph at `/relationships/:slug/:collection/:number`, a Document graph at `/relationships/:slug`, and a global network at `/relationships`. The Article view remains exact-provision scoped; the Document view collapses only cross-document edges onto their stable document entities and combines legal-text references, reviewed Level 2 mappings, and reviewed CELLAR metadata without changing the underlying relationship records. The global view uses that same read-only runtime projection: all loaded regulations are visible by default, while metadata-only CJEU Cases and external CELLAR Works are optional layers. Explorer provides the Document entry, Article graphs link to the broader Document view, and every loaded Document node can open its focused graph. All views support relation-type filters, state-backed node dragging, pan/zoom, an explicit provenance legend, and an on-demand source Side Peek. The graph UI remains route-lazy-loaded, so the visualization dependency does not increase the Reader/Explorer initial JavaScript bundle.

The first bounded structured relationship query is available at `/relationship-queries/level-2-mandates` (also linked from every relationship graph). It is deliberately a fixed query template, not AI or free-text understanding: choose a DORA Article and it returns only its reviewed `MANDATES` edges, including stable IDs, exact mapping evidence, the official evidence URL, and Reader links. It defaults to DORA Article 28, where the currently reviewed data returns both the register-of-information ITS 2024/2956 and the ICT third-party-policy RTS 2024/1773. A missing result means that no reviewed mapping is published for that Article; it does not mean that no legal relationship exists.

The second Phase 2 slice publishes the 12 reviewed closed-corpus CELLAR structural relations described above without changing the Canonical contract. The next bounded slice adds the separately reviewed external-Work contract. After the first national implementation mapping, Runtime schema `5.1.0` reports 3,982 resolved loaded-entity relationships, plus 65 lifecycle relationships, 63 external Works, 72 CJEU Case entities, and 72 Act-level `INTERPRETS` relationships in the default `full-corpus` Profile; the loaded-entity count includes two reviewed CRD/EBA mapping edges, one reviewed CSSF/EBA `IMPLEMENTS` edge, three legal-text citation edges introduced by the loaded guideline, 12 closed-corpus `OFFICIAL_METADATA` CELLAR edges, and 1,374 benchmark-gated Related Recitals. The reviewed CELLAR datasets remain explicitly based on their earlier 13-seed snapshot until a separate refresh/review adds CRD or EBA; loading either source does not silently claim new CELLAR metadata edges. The Document graph displays the 24 `AMENDS`, 41 `CORRECTS`, and GDPR's 72 metadata-only CJEU edges; the Global Network preserves these same nodes and edges as optional metadata layers rather than duplicating them. The CJEU dataset preserves 71 judgments and one order exactly as classified by their official English titles; two joined-case CELEX records remain explicitly unavailable without fallback. Judgment text and Article/paragraph citation inference are not part of this slice, so Case nodes open official CELLAR metadata rather than local text. Complete consolidated lineage, Article-level amendment provenance, additional CELLAR predicates, and Article-level CJEU delivery remain separately reviewed work.
