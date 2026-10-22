# Contributing

Start with the [project overview](README.md) and [startup guide](docs/getting-started.md). The [documentation index](docs/README.md) links to source handling, interfaces and operations.

Project software uses the [MIT License](LICENSE). Contributions must have an appropriate, documented origin; third-party provenance and dataset distribution work is tracked in [open-source readiness](docs/plans/open-source.md).

## Useful contributions

- Reproducible bugs in reading, navigation, search, export, or setup.
- Incorrect or missing source links, version evidence, or coverage labels.
- Small, independently reviewable improvements to documentation and accessibility.
- New sources with verified identity, language, source status, and representative format evidence.

For a larger feature or source adapter, open an issue describing the user task, a concrete example, and the proposed scope before implementing it. Coverage plans list candidates; they do not pre-approve legal parsing or publication.

## Development workflow

1. Prepare a local installation using [Getting started](docs/getting-started.md).
2. Keep a change focused. Preserve unrelated work and avoid generated-file churn.
3. Run the checks appropriate to the change:

```bash
npm run check
npm test
npm run build
```

Parser, relationship, and search changes also require their dedicated fixtures or evaluations. Stable IDs, legal parsing, relationship semantics, Canonical contracts, and release gates require the additional review described in [AGENTS.md](AGENTS.md). A documentation-only change should validate its links, examples, and factual claims; clearly state which checks were run.

4. Describe the concrete problem, resulting behavior, validation, and remaining limits in the pull request. Attach a focused screenshot for a visual change when useful; exclude private data.

## Legal-data boundaries

- Never invent, paraphrase, or silently correct purported official legal text.
- Keep raw source, parser output, Canonical data, Runtime artifacts, and UI separate.
- Preserve source language, original identifiers, order, source URLs, and version evidence.
- Keep publisher notes, editorial context, and similarity results separate from operative text.
- Do not infer national implementation relationships from a shared subject or document title.
- Do not weaken baselines or thresholds just to make a changed source pass.

New-source proposals should identify the official publisher and URL, exact legal identity, language, version evidence, media type, and representative complex structures. Acquisition, candidate inspection, and publication are separate stages. See the [onboarding runbook](docs/corpus-onboarding-runbook.md).

Do not include raw downloads, generated Canonical/Runtime artifacts, `.env` files, credentials, or private user data in commits. Source bytes used for a reproduction need a separately reviewed transfer path and source-use conditions.

## Report an issue

Include the commit, Node/npm versions, operating system, page or command, expected result, actual result, and the smallest reproducible example. For legal-data issues include the official URL and version date. Redact local paths, credentials, personal data, and internal documents from logs.

For security-sensitive issues follow [SECURITY.md](SECURITY.md).
