# Contact and lightweight product analytics

The product exposes one shared `Help` menu in Reader, Monitor, and Galaxy. Feedback is submitted to the same-origin API and sent by the server; the recipient address is never included in browser JavaScript, HTML, status responses, or submission responses.

## Contact delivery

Add the following values to the local `.env` used for deployment:

```dotenv
CONTACT_TO_EMAIL=YOUR_PRIVATE_CONTACT_EMAIL
CONTACT_SMTP_USER=YOUR_SMTP_ACCOUNT
CONTACT_SMTP_PASSWORD=YOUR_SMTP_APP_PASSWORD
```

Gmail defaults are built in: `smtp.gmail.com`, port `465`, with TLS. A different provider may set `CONTACT_SMTP_HOST`, `CONTACT_SMTP_PORT`, and optionally `CONTACT_SMTP_FROM`.

For Gmail, use an app password rather than the normal account password. Do not commit `.env` or paste its values into source code. When configuration is incomplete, `GET /api/contact/status` returns only `{ "available": false }` and the Help menu explains that delivery is unavailable.

The form accepts product feedback, data issues, and questions. It attaches the current surface, URL, and Reader/Galaxy context where available. The visitor may provide a reply address; it is used only as the email `Reply-To`. No automatic reply is sent, so the private recipient address is not disclosed to the visitor.

## Cloud Logging events

The application writes single-line structured JSON to standard output. Cloud Run collects it automatically. No analytics SDK, cookie, database, or separate dashboard is required.

Current events:

- `page_view`: SPA route changes, with `surface` and `path`;
- `search_result_opened`: the chosen search mode, query, result count, and destination;
- `copilot_query`: Reader and Monitor Copilot questions;
- `monitor_refresh`: protected API or daily-button refresh completion;
- `contact_submission`: delivery outcome and topic, without message body or reply address.

Example Cloud Logging filters:

```text
jsonPayload.event="page_view"
jsonPayload.event="search_result_opened"
jsonPayload.event="contact_submission"
```

These are event counts, not unique-user analytics. The application deliberately does not create a user identifier.
