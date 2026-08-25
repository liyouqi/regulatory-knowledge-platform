# Runtime artifact operation runbook

The runtime SQLite file is derived data. It is not a Canonical legal source and is never committed to Git. The Node service opens one artifact read-only at startup; switching an artifact therefore requires a service restart.

## Build and validate a staging artifact

Build to a new release directory, never directly over the active production file:

```bash
npm run runtime:build -- --profile <profile-id> --output /srv/regulatory/releases/<release-id>/regulatory.sqlite
npm run runtime:verify -- --input /srv/regulatory/releases/<release-id>/regulatory.sqlite
```

`runtime:verify` opens the artifact through the same read-only Search and Reader services used by the API. It verifies SQLite integrity, FTS5 availability, the schema version, manifest counts, Reader payload validation, one shared build ID, and matching Profile identity/hash.

Keep the command output, including `buildId`, `profileId`, `profileVersion`, and `profileHash`, with the deployment record. Do not promote an artifact if verification fails.

## Promote

Point `REGULATORY_RUNTIME_DATABASE_PATH` at an active symlink outside the repository. Create and replace the symlink atomically, preserving the prior release directory:

```bash
ln -s /srv/regulatory/releases/<release-id>/regulatory.sqlite /srv/regulatory/.runtime-next.sqlite
mv -f /srv/regulatory/.runtime-next.sqlite /srv/regulatory/runtime.sqlite
REGULATORY_RUNTIME_DATABASE_PATH=/srv/regulatory/runtime.sqlite npm run start
```

After the service starts, confirm `/api/health` reports the verified `buildId`, Profile identity, and expected corpus counts. The default development path remains `data/artifacts/runtime/regulatory.sqlite` when the environment variable is unset.

## Roll back

If the new service cannot start, its health check fails, or the reported build ID differs from the staged verification result, stop the new process and point the active symlink at the retained prior artifact:

```bash
ln -s /srv/regulatory/releases/<previous-release-id>/regulatory.sqlite /srv/regulatory/.runtime-next.sqlite
mv -f /srv/regulatory/.runtime-next.sqlite /srv/regulatory/runtime.sqlite
REGULATORY_RUNTIME_DATABASE_PATH=/srv/regulatory/runtime.sqlite npm run start
```

Confirm `/api/health` reports the prior build ID before declaring the rollback complete. Retain at least one previously verified release directory; do not overwrite or delete it during promotion.
