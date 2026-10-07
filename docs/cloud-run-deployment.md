# Google Cloud Run deployment runbook

This is the single deployment runbook for the Regulatory Knowledge Platform. Run every command from the repository root and in the numbered order below.

The release remains one Node application and one Cloud Run service:

- Express serves the API and the built React application;
- the verified Platform Runtime SQLite artifact is copied into the image and opened read-only;
- the verified Galaxy graph and Earth SQLite remain separate artifacts but are copied into the same image;
- Monitor code and the current local `data/monitor` snapshot are copied into the same image;
- Private AI is called only by the server. The browser never receives its API key.

The examples use:

```bash
PROJECT_ID="regulatory-507508"
REGION="europe-west1"
SERVICE="regulatory-knowledge-platform"
REPOSITORY="regulatory"
```

## 1. Load and validate local configuration

`.env` is neither committed nor copied into the Docker image. It is loaded locally so configuration can be checked and, in step 5, explicitly applied to the Cloud Run revision.

```bash
set -a
source .env
set +a

node --import tsx -e '
import { loadPrivateAiConfig } from "./src/copilot/providers/private-ai-config.ts";
const result = loadPrivateAiConfig(process.env);
if (!result.available) {
  console.error(result.reason);
  process.exit(1);
}
console.log("Private AI config valid:", result.config.baseUrl, result.config.model);
'
```

The command validates the URL, required fields, timeout, authentication-header name, and thinking mode. It does not call the provider, so a valid local configuration does not prove that the provider accepts the model ID.

These values are required:

- `PRIVATE_AI_API_KEY`;
- `PRIVATE_AI_BASE_URL`;
- `PRIVATE_AI_MODEL`.

The current application also accepts:

- `PRIVATE_AI_AUTH_HEADER`, defaulting to `Authorization`;
- `PRIVATE_AI_AUTH_SCHEME`, defaulting to `Bearer`;
- `PRIVATE_AI_TIMEOUT_SECONDS`, defaulting to `60`;
- `PRIVATE_AI_THINKING_MODE`, either `enabled`, `disabled`, or unset.

Do not deploy placeholder values. The model value must be the provider's exact identifier, without literal quote characters. If the provider exposes an OpenAI-compatible model listing, it may be inspected with:

```bash
curl -sS "${PRIVATE_AI_BASE_URL%/}/models" \
  -H "${PRIVATE_AI_AUTH_HEADER:-Authorization}: ${PRIVATE_AI_AUTH_SCHEME:-Bearer} ${PRIVATE_AI_API_KEY}" \
  | jq -r '.data[]?.id'
```

The listing may be incomplete. A missing ID is not conclusive; the provider documentation or a minimal chat-completions request is authoritative.

## 2. Verify the release inputs

Review the exact commit and local changes first:

```bash
git log -1 --oneline
git status --short
```

Then run the normal project gates and build the deployment-fixed Runtime artifact:

```bash
npm run check
npm test
npm run runtime:verify
npm run earth:verify -- --artifact data/artifacts/earth/earth.sqlite
npm run build
```

`npm test` runs the Runtime build through its `pretest` hook, so it is not repeated as a separate command. Do not continue if any command fails. Keep the Runtime `buildId`, `profileId`, `profileVersion`, and `profileHash` printed by these commands with the release record.

Confirm the generated Galaxy graph that will be copied into the image:

```bash
node --import tsx -e '
import { readFileSync } from "node:fs";
import { metadataGraphSchema } from "./src/earth/contract/metadata-graph.ts";
const graph = metadataGraphSchema.parse(JSON.parse(readFileSync("data/artifacts/earth/graph.json", "utf8")));
console.log({
  snapshot: graph.source.snapshotHash,
  included: graph.report.scopeWorks,
  related: graph.report.boundaryWorks,
  institutions: graph.report.institutions,
  relations: graph.edges.length,
});
'
```

`graph.json` is a generated, Git-ignored release input. It must exist on the machine that builds the image.

Confirm the Monitor snapshot that will be copied into the image:

```bash
node --import tsx -e '
import { readCurrentMonitorTimeline } from "./src/monitor/monitor-data.ts";
const timeline = readCurrentMonitorTimeline();
console.log({
  year: timeline.year,
  events: timeline.events.length,
  sources: timeline.sources.length,
  generatedAt: timeline.generatedAt,
});
'
```

Only `data/monitor` is active. `data/artifacts/monitor` must not be recreated or deployed. Monthly Monitor files are intentionally ignored by Git but are present in the local Docker build context, so verify this count on the machine that builds the image.

## 3. Verify Google Cloud and Artifact Registry

Set the release shell variables and confirm the active account and project:

```bash
PROJECT_ID="regulatory-507508"
REGION="europe-west1"
SERVICE="regulatory-knowledge-platform"
REPOSITORY="regulatory"

gcloud version
gcloud auth list
gcloud config set project "$PROJECT_ID"
gcloud projects describe "$PROJECT_ID"
```

The following bootstrap commands are required only when the project or workstation has not already been prepared:

```bash
gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
  --project "$PROJECT_ID"

gcloud artifacts repositories describe "$REPOSITORY" \
  --project "$PROJECT_ID" \
  --location "$REGION"

gcloud auth configure-docker "${REGION}-docker.pkg.dev"
```

If the repository does not exist, create it once:

```bash
gcloud artifacts repositories create "$REPOSITORY" \
  --project "$PROJECT_ID" \
  --repository-format docker \
  --location "$REGION"
```

The active account needs permission to push to Artifact Registry and deploy Cloud Run revisions.

## 4. Build and push one immutable image

Use a new tag for every build. The timestamp prevents two builds with different ignored Monitor snapshots from reusing the same Git-SHA tag.

```bash
RELEASE_ID="$(date -u +%Y%m%d%H%M%S)-$(git rev-parse --short HEAD)"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${SERVICE}:${RELEASE_ID}"

docker buildx build \
  --platform linux/amd64 \
  --tag "$IMAGE" \
  --push \
  .

echo "$IMAGE"
```

The Docker build compiles the Web application and copies the already verified Platform Runtime SQLite, Galaxy graph, the separately verified Earth SQLite, and the local `data/monitor` snapshot. It does not fetch official legal sources or run Monitor refresh inside Cloud Run.

## 5. Deploy the image and Private AI configuration

For the current demo deployment, apply the local `.env` directly to the server revision:

```bash
gcloud run deploy "$SERVICE" \
  --project "$PROJECT_ID" \
  --image "$IMAGE" \
  --region "$REGION" \
  --allow-unauthenticated \
  --port 8080 \
  --memory 1Gi \
  --max-instances 1 \
  --env-vars-file .env \
  --remove-secrets REGULATORY_PUBLIC_API_KEYS
```

`--env-vars-file .env` is an explicit deployment action: it sends the file's values to the Cloud Run revision even though the file is absent from Git and the image. The current `.env` is expected to contain only the `PRIVATE_AI_*` server configuration described in step 1.

`--remove-secrets REGULATORY_PUBLIC_API_KEYS` removes the stale Secret Manager reference that otherwise gets inherited and blocks creation of the new revision. Consequently, authenticated operations under `/api/v1` remain fail-closed in this demo. Reader, Explorer, Earth, Monitor, Reader Copilot, and Monitor Copilot do not require that Public API key.

If the Public API is enabled later, configure its key as a separately reviewed Secret Manager change. Do not add that production change implicitly to this demo command.

## 6. Verify the deployed revision

Read the deployed URL and revision identity:

```bash
SERVICE_URL="$(gcloud run services describe "$SERVICE" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --format='value(status.url)')"

gcloud run services describe "$SERVICE" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --format='table(status.latestReadyRevisionName,spec.template.spec.containers[0].image,status.url)'
```

Verify the server, Copilot configuration, Galaxy graph, and Monitor snapshot:

```bash
curl -fsS "$SERVICE_URL/api/health" | jq
curl -fsS "$SERVICE_URL/api/copilot/status" | jq
curl -fsS "$SERVICE_URL/api/earth/graph" \
  | jq '{snapshot: .source.snapshotHash, included: .report.scopeWorks, related: .report.boundaryWorks, institutions: .report.institutions, relations: (.edges | length)}'
curl -fsS "$SERVICE_URL/api/monitor/timeline?year=$(date -u +%Y)" \
  | jq '{year, events: (.events | length), sources: (.sources | length), generatedAt}'
```

Copilot must report `status: "ready"`. The Galaxy graph and Monitor counts must match step 2. Open these browser routes as a final smoke test:

```text
<SERVICE_URL>/
<SERVICE_URL>/earth
<SERVICE_URL>/monitor
```

Submit one Reader or Monitor Copilot question, then verify structured query logging:

```bash
gcloud logging read \
  'resource.type="cloud_run_revision"
   AND resource.labels.service_name="regulatory-knowledge-platform"
   AND jsonPayload.event="copilot_query"' \
  --project "$PROJECT_ID" \
  --freshness 10m \
  --limit 20 \
  --format json
```

Do not declare the release complete until the health identity, Copilot status, Galaxy graph, Monitor counts, browser smoke test, and query log all match the intended release.

The current deployment serves the Monitor snapshot baked into the image. It does not configure a daily scheduler and therefore does not refresh Monitor automatically. Runtime refresh is an optional, separately operated feature; Cloud Run instance-local files are not durable across a new revision or replacement instance, so a reliable daily production refresh also needs an explicit persistence or image-rebuild decision.

## Troubleshooting and rollback

If Artifact Registry returns `403`, repeat the Docker authentication command from step 3 and confirm that the active account can write to the repository.

If deployment still reports a permission error for `regulatory-public-api-keys`, confirm that step 5 contains `--remove-secrets REGULATORY_PUBLIC_API_KEYS`. Adding `PRIVATE_AI_*` variables alone does not remove an inherited Secret reference.

If the new revision is unhealthy, route traffic back to the preceding ready revision from the Cloud Run revisions page or with `gcloud run services update-traffic`. Do not rebuild an old tag; retain the previous image digest and revision as the rollback target.
