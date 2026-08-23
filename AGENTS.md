# Regulatory Knowledge Platform

Read only the relevant sections of `docs/` before changing product behavior.

- Official legal text is never invented, paraphrased, or silently corrected.
- Raw source, parser output, canonical data, runtime artifacts, and UI stay separate.
- Stable IDs and relationship semantics require targeted tests and a higher-intensity review.
- UI does not import source adapters or parse raw legal formats.
- Keep Phase 1 as one TypeScript/Node application with build-time data preparation and a read-only runtime artifact.
- Use `npm run check` and `npm test` for ordinary changes. Parser, relationship, or search changes must also run their dedicated fixtures/evals when introduced.
- Do not commit raw source dumps, generated runtime artifacts, secrets, or local environment files.
- Keep Codex tasks narrow. Use Terra Medium by default; request Sol High review before changing canonical contracts, legal parsing, relationship semantics, or release gates.
