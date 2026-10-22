# Security reporting

Do not post credentials, private documents, personal data, or exploitable vulnerability details in a public issue.

If the repository's GitHub Security tab offers **Report a vulnerability**, use it. Otherwise, open an issue asking for a private contact without describing the vulnerability. A dedicated contact has not been published yet.

A useful private report identifies the affected commit, component, impact, reproduction steps, and a minimal example with sensitive data removed. No response-time or supported-release guarantee has been established.

The local development server and local stdio MCP process are not a hosted security boundary. Consult the [Public API contract](docs/public-api-v1.md), [MCP guide](docs/mcp-server.md), and [deployment runbook](docs/cloud-run-deployment.md) before operating a service for other users.
