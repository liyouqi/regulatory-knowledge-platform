# EBA Q&A and Regulatory Dossier contract

This feature adds two related but independent product entities to the existing
application. It does not change the Canonical legal-document contract or the
meaning of the global legal relationship graph.

## Release 0 scope

- Import the complete EBA **Final Q&A** catalogue available at the recorded
  import time.
- Import full question, background and final-answer content only for Final
  Q&As whose declared legal act is DORA.
- Provide a paginated Q&A catalogue and internal detail pages only where full
  detail content is present. Catalogue-only records link to the official EBA
  page.
- Provide independent Regulatory Dossier catalogue/detail pages that compose
  reviewed legal and Q&A evidence.
- Keep the React/Node application and read-only SQLite deployment unchanged.

Release 0 deliberately excludes automatic refresh, Q&A history, currentness or
supersession conclusions, global Search integration, RAG retrieval, MCP and the
public v1 API.

## Source and data boundaries

Raw EBA HTML is an acquisition artifact under `data/raw/eba-qa/` and remains
ignored by Git. The normalized, schema-validated product inputs are stored in:

- `data/official-metadata/eba-qa/catalog.json`;
- `data/official-metadata/eba-qa/dora-details.json`;
- `data/editorial/dossiers.json`.

These files contain source wording and metadata, not a second copy of the
Canonical legal corpus. Each import records its source URL, retrieval time,
declared record count and content hash. Release 0 does not retain prior imports.
Some early EBA catalogue records do not expose a final-publication date in the
official list; the normalized field remains null rather than being inferred.
Likewise, a detail record may omit the answer-prepared-by field; absence remains
null and is not replaced with an assumed authority.

Q&A stable IDs use `qa:eba:<public-id>`, for example
`qa:eba:2025_7613`. A Q&A is not a `CanonicalDocument`, legal provision,
Guideline or case. Its official EBA status and answer source are displayed
without upgrading the answer to binding law.

## Q&A legal references

EBA-declared legal references are stored separately from the global
`relationships` table. A reference can be:

- `declared-legal-act`;
- `declared-provision`;
- `associated-measure`.

Its provenance is `OFFICIAL_QA_METADATA`. Exact targets may resolve to loaded
Document/Provision stable IDs. Unresolved or Profile-excluded targets retain
the official citation label and URL; they are never guessed or silently
retargeted. Release 0 does not infer references from answer prose and does not
use `INTERPRETS` for Q&A links.

## Dossier boundary

A Dossier is a reviewed `EDITORIAL` product, not an official EBA output and not
a Q&A category. Its source items can reference loaded legal entities, full Q&A
details or other official materials. Dossier composition links remain in
dedicated Dossier tables and do not enter the legal relationship graph.

Every published conclusion or decision block must have at least one exact
source item. The UI labels Dossier prose as platform analysis and keeps the
official wording accessible through its source links.

## Edition/Profile rule

The EBA Final Q&A catalogue is a global official-reference directory and is not
trimmed by a legal Edition/Profile. A Q&A reference receives an internal Reader
link only when its exact target exists in the active Profile.

Dossiers are Profile-scoped. A Dossier is omitted unless all source items marked
as required can resolve in the active Profile. Optional catalogue-only sources
may remain external official links.

## Runtime and delivery

Q&A and Dossier data use dedicated SQLite tables, repositories, services, APIs
and lazy-loaded React pages in the existing application. Reader, Explorer and
legal Search must continue to start and operate without importing Q&A or
Dossier UI code.

Initial page APIs are limited to:

```text
GET /api/qa?page=&pageSize=&legalAct=&topic=
GET /api/qa/:publicId
GET /api/dossiers
GET /api/dossiers/:slug
```

Q&A/Dossier input hashes, builder versions and published counts participate in
the Runtime build identity and verification manifest.

## Import and rebuild

### First run on a new computer

The normalized Q&A catalogue, the 25 DORA detail records and the reviewed
Dossier definitions are committed to Git. A new computer does **not** need the
old raw HTML snapshot and does not need to contact EBA merely to start the app:

```bash
npm install
npm run dev
```

`npm run dev` runs the Runtime build first, so the local ignored SQLite artifact
is reconstructed from the committed legal corpus, Q&A inputs and Dossier
definitions. Use `npm run runtime:verify` when you want a separate integrity
check.

### Deliberate EBA refresh

Refresh the one-time normalized inputs explicitly:

```bash
npm run eba-qa:fetch
```

The command downloads all Final-Q&A catalogue pages, downloads detail pages
only for DORA records, validates official EBA HTTPS URLs and Final status, then
atomically replaces the two normalized input files. Review the resulting diff
before committing it. This command is not part of normal startup. Raw HTML is
kept only as ignored acquisition evidence; the small normalized product inputs
are the cross-computer baseline managed in Git.

After importing or pulling committed inputs:

```bash
npm run runtime:build
npm run runtime:verify
npm run dev
```

## Release gates

- Dataset schemas, official-host URLs, IDs, counts and hashes validate.
- Catalog IDs are unique and every imported record was Final at import time.
- Every detail record exists in the catalogue and matches `detailAvailable`.
- Resolved DORA references exact-match loaded stable IDs.
- Every required Dossier source resolves or the Dossier is omitted/fails under
  the declared Profile rule.
- UI and API tests distinguish official non-binding Q&A content from reviewed
  platform-authored Dossier content.
- Dedicated fixtures, `npm run check`, `npm test` and `npm run build` pass.
