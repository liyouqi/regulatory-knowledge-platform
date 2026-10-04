# Documentation

Start with the [project README](../README.md) for installation, local development and a product tour. This index identifies the maintained document for each task.

## Find the right document

| Task | Document |
| --- | --- |
| Understand product scope and acceptance criteria | [Product requirements](regulatory_knowledge_platform_requirements.md) |
| Understand architecture and data boundaries | [Technical architecture](regulatory_knowledge_platform_technical_architecture.md) |
| Check documented phase completion and remaining coverage | [Coverage backlog](coverage-backlog.md) |
| Check published, queued and planned Reader documents | [Reader corpus status](corpus-status.md) |
| Refresh the Reader corpus or add an official source | [Corpus onboarding runbook](corpus-onboarding-runbook.md) |
| Inspect detailed commands, Reader navigation or search behaviour | [Reader and legal data reference](reader-and-data-reference.md) |
| Move the development environment | [Development migration](development-migration.md) |
| Stage, promote or roll back a Runtime artifact | [Runtime operation runbook](runtime-operation-runbook.md) |
| Build, deploy and verify a Cloud Run revision | [Cloud Run deployment](cloud-run-deployment.md) |

## Feature specifications

These documents define feature scope and behaviour. Dated implementation checkpoints describe the verification performed at that time.

| Feature | Document | Boundary |
| --- | --- | --- |
| EBA Q&A and Regulatory Dossiers | [Q&A and Dossier contract](eba-qa-dossier.md) | Official Q&A evidence and reviewed editorial analysis remain distinct. |
| Reader Copilot | [Contextual Regulatory Copilot](copilot/contextual-regulatory-copilot.md) | Current-context implementation, intended retrieval extension and remaining readiness checks. |
| Regulatory Monitor | [Monitor specification](monitor/regulatory-monitor.md) | Separate current-year publication feed, enrichment and monthly report. |
| Galaxy | [Galaxy specification](earth/earth.md) | Official metadata graph and separate Article reading collection; `/earth` is the retained technical route. |

## Integration contracts

- [Public API v1](public-api-v1.md): REST contracts, Profile isolation, access configuration and compatibility.
- [MCP server](mcp-server.md): local stdio tools, client configuration and transport limits.
- [Platform → RAG snapshot](rag-snapshot-export.md): immutable offline export, provenance and receiver requirements.

## Generated inventories

These files are reports from their own data pipelines. Update them through the generating command, rather than maintaining counts by hand.

| Report | Generating command | What it measures |
| --- | --- | --- |
| [Reader corpus status](corpus-status.md) | `npm run corpus:update` | Reader source-registry publication lifecycle. |
| [Galaxy included-file inventory](earth/earth-inventory.md) | `npm run earth:inventory` or `npm run earth:refresh` | Installed metadata graph collection. |
| [Galaxy family coverage](earth/earth-families.md) | `npm run earth:inventory` or `npm run earth:refresh` | Observed family and related-file coverage of the installed graph. |

Reader full text, Galaxy metadata and Monitor events have separate coverage and refresh paths. A count in one report does not establish coverage in another product.

## Historical records

- [Reader release history](history/reader-releases.md): implementation milestones extracted from the original README.
- [Monitor handoff history](history/monitor-handoffs.md): the 2026-09-13 development handoff and 2026-09-14 completion checkpoint.

Historical records preserve earlier counts, verification results and decisions. Use the maintained runbooks for today's commands; a historical test result or Git state does not verify the current checkout or deployment.

## Maintaining documentation

- Keep setup and the product entry points in the root README; keep this file as the document index.
- Maintain operating procedures in their named runbook. Link to that runbook from feature documents instead of copying another checklist.
- Maintain scope and acceptance criteria in the product requirements, with feature-specific decisions in the corresponding specification. The architecture document explains implementation and data boundaries.
- Record phase completion and coverage work in the coverage backlog. Generated inventories own corpus counts; design documents may include explicitly dated checkpoints.
- Keep dated handoff and release records under `history/`. When a feature specification contains a dated checkpoint, label its date and keep remaining work distinguishable from completed work.
- The baseline design documents include future scope. Verify current dependencies and executable commands against `package.json`, `.nvmrc` and the relevant runbook.
- Keep new proposals identifiable as proposals until they are adopted. Discussion in chat does not by itself revise a product contract.

Contribution and legal-data rules are in [AGENTS.md](../AGENTS.md).
