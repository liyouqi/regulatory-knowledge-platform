# Using the app

Start the app using [Getting started](getting-started.md). The paths below assume `http://localhost:5173`; use the port printed by Vite. A page can only display laws and datasets loaded on that installation.

## Read and find text

Open `/read/dora/articles/1` for the Reader or `/explore/dora` for the whole-act Explorer. The table of contents follows the source structure. Publisher notes and editorial context are labelled separately from legal text.

Use `Cmd+K` / `Ctrl+K` to search law names, full text or definitions. Full-text search combines unquoted terms with AND and word-prefix matching. Quotes match a normalized phrase. Results link to the matching text; document scope narrows the search to one loaded law.

Examples:

```text
DORA Article 28
operational risk
"management body"
```

Reader links use `/read/:slug/:collection/:number`. A link can include an anchor to a body block. The route preserves the source label; it does not renumber a legal provision.

## Browse related material

| Page | Path | What it shows |
| --- | --- | --- |
| Countries | `/countries` | Local national documents and separate EU framework links |
| Topics | `/topics` | Reviewed subject assignments across documents |
| Banking governance | `/domains/banking-governance-internal-control` | The CRD → EBA → CSSF path and its evidence |
| DORA scope | `/applicability/dora` | Credit-institution listing and retained qualifications |
| AI Act timeline | `/timelines/ai-act` | Reviewed dates and their source evidence |
| GDPR decision | `/decisions/gdpr` | Four source-backed findings from CNPD 18FR/2022 |
| RTS/ITS library | `/library/dora` | Reviewed Level 2 measures; `/rts` or `/its` narrows the list |
| Global relationships | `/relationships` | Loaded documents, with optional external metadata layers |
| Document relationships | `/relationships/dora` | Relations around one document |
| Provision relationships | `/relationships/dora/articles/28` | Relations around one provision |
| EBA Q&A | `/qa` | Imported answer catalogue and available local details |
| Dossiers | `/dossiers` | Reviewed issue files combining provisions and official answers |

References and Cited By use the same stored edges in opposite query directions. Legal-text references, reviewed mappings, official metadata and TF-IDF recommendations retain their own provenance. A missing relation means no such relation is published locally.

The DORA scope page is starting evidence, not a final institution-specific decision. Timeline-derived dates are labelled as derived. CJEU graph nodes in the current slice contain metadata, not loaded judgment text.

## Other features

The top bar switches between light and dark themes. Browser preferences are local and do not alter legal data.

[Copilot](copilot/contextual-regulatory-copilot.md), [Monitor](monitor/regulatory-monitor.md) and [Earth](earth/earth.md) have separate setup and data requirements.
