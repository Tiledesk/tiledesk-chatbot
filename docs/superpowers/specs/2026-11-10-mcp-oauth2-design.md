# MCP OAuth2 — Design

Date: 2026-11-10 · Status: server side implemented (commits f4fe91fe..3224546e) and verified end to end against the reference server (§14); tybot, UI and scheduler job pending
Repos: tiledesk-server, tiledesk-chatbot (tybot). Dashboard / design-studio UI and tiledesk-scheduler-service are follow-ups (§12).
Branch: `features-2611/oauth2-mcp` (tiledesk-server).
Reference MCP server: [modelcontextprotocol/example-remote-server](https://github.com/modelcontextprotocol/example-remote-server) ([OAuth guide](https://github.com/modelcontextprotocol/example-remote-server/blob/main/docs/oauth-implementation.md)), MCP Authorization spec `2025-06-18`.

## 1. Goal

A project admin can connect an MCP server that is protected by OAuth2. tiledesk-server acts as the OAuth client: it runs the authorization code + PKCE flow, stores the tokens encrypted, refreshes them, and gives the chatbot engine a valid access token whenever an AI Prompt action calls that MCP server. Three ways to configure the OAuth client:

- **mcp** — the MCP Authorization spec: discovery from the MCP server URL, Dynamic Client Registration. The admin types only the MCP URL.
- **google** — preset with Google's endpoints and one Tiledesk-owned Google OAuth client from env.
- **manual** — the admin enters authorization/token endpoints, client id/secret and scopes (any OAuth2 provider without discovery).

## 2. Decisions (user, 2026-11-10)

1. Tokens live in the database. The chatbot calls a server endpoint that returns the access token read from the DB. A scheduler, later, calls a server API that refreshes and saves tokens in the DB.
2. Refresh strategy for now: **lazy** — the token endpoint refreshes when the access token is about to expire. The scheduler-facing refresh API is built now; registering the scheduler job is a follow-up.
3. Google: one Tiledesk Google Cloud OAuth client (`MCP_OAUTH_GOOGLE_CLIENT_ID` / `_SECRET`). No per-project client.
4. Scope of this round: server phases 1–3 (store + flow + runtime token) plus the refresh API, and the tybot change that consumes the token endpoint.
5. OAuth client code is written with axios. No `@modelcontextprotocol/sdk` dependency.

## 3. Current state (verified 2026-11-10)

- `services/mcpService.js` handles auth via `customHeaders` or legacy `auth` (bearer / api-key / basic). `buildServerConfig` rejects an `oauth` object: *"OAuth2 authentication is not supported yet"*.
- MCP servers are stored in the `mcp` integration (`models/integrations.js`, `value.servers[]`). Custom servers are keyed by `url`, native ones by `nativeId` (`findServerIndex`).
- `GET /:projectid/integration*` is mongoose-cached for `cacheUtil.longTTL` (`project:<id>:integrations`) and returns `customHeaders[].value` unmasked (`maskIntegrationSecrets` masks only `apikey`, `api_key`, `token`, `secret`, `client_secret`, `password`). So a token must not be written into the integration.
- tybot `DirAiPrompt.js` reads `/integration/name/mcp` with the bot token on every run, turns `customHeaders` into `headers` (`arrayToObject`, `enrichServersFromIntegration`) and forwards them to the LLM backend.
- `/:projectid/mcp` is mounted with `passport basic|jwt`, `validtoken`, `roleChecker.hasRoleOrTypes('admin', ['bot','subscription'])`.
- Internal token-protected endpoints follow `/webhook/scheduled-start`: header `x-auth-token`, `crypto.timingSafeEqual` against an env token, 503 when not configured.
- `TdCache` has `setNX(key, value, ttlSeconds)`, `setJSON`, `getJSON`, `del`.
- `utils/logRedactor.js` redacts keys `^(…|token|…|authorization|x-auth-token|…)$` (anchored: `access_token`, `refresh_token` are **not** covered) and `Bearer …` strings.
- `routes/urlPreview.js` has a hostname-regex private-IP check only (no DNS resolution).
- Node 18.19, axios, nock, mocha + chai-http available.

## 4. Data model (tiledesk-server)

New collection `mcp_oauth_connections` (`models/mcpOAuthConnection.js`):

```
{
  id_project: String (index),
  mode: 'mcp' | 'google' | 'manual',
  server_url: String,                 // MCP server URL = OAuth resource (RFC 8707)
  name: String,                       // display name
  status: 'pending' | 'active' | 'needs_reauth' | 'revoked',
  // OAuth client
  client_id: String,
  client_secret_enc: String,          // encrypted, absent for public clients / google (env)
  client_registered_at: Date,         // DCR only
  // endpoints (discovered, preset or manual)
  resource: String,                   // mcp mode: `resource` of the protected resource metadata (may be the origin, not server_url)
  issuer: String,
  authorization_endpoint: String,
  token_endpoint: String,
  revocation_endpoint: String,
  registration_endpoint: String,
  token_endpoint_auth_method: 'client_secret_basic' | 'client_secret_post' | 'none',
  scopes: [String],
  // tokens
  access_token_enc: String,
  refresh_token_enc: String,
  token_type: String,                 // 'Bearer'
  expires_at: Date,                   // null when the provider sends no expires_in
  granted_scopes: [String],
  last_refresh_at: Date,
  last_error: { code: String, message: String, at: Date },
  created_by: String,                 // user id that started the flow
  createdAt, updatedAt
}
```

Index `{ id_project: 1, server_url: 1 }` unique: one connection per MCP server per project.

The integration server entry gains a reference only (no secrets):

```
oauth: { connection_id: String, mode: 'mcp'|'google'|'manual' }
```

Encryption: AES-256-GCM, key `MCP_OAUTH_ENCRYPTION_KEY` (32 bytes, base64). Stored format `v1:<iv b64>:<tag b64>:<ciphertext b64>`. Never returned by any API except the token endpoint (§7), which returns only the access token.

## 5. Configuration

| Env | Purpose |
|---|---|
| `MCP_OAUTH_ENCRYPTION_KEY` | Required. Without it every OAuth route answers 503 `"MCP OAuth is not available on this installation"`. |
| `MCP_OAUTH_REDIRECT_BASE_URL` | Public base URL of the server; redirect URI = `<base>/oauth2/mcp/callback`. Falls back to `API_URL`. |
| `MCP_OAUTH_RETURN_ORIGINS` | Comma-separated origins allowed as `return_url` (dashboard / design-studio). |
| `MCP_OAUTH_GOOGLE_CLIENT_ID`, `MCP_OAUTH_GOOGLE_CLIENT_SECRET` | Google preset. Without them, `mode: 'google'` answers 503. |
| `MCP_OAUTH_REFRESH_TOKEN` | `x-auth-token` of the scheduler refresh API. Without it the API answers 503. |
| `MCP_OAUTH_ALLOW_INSECURE_URLS` | `true` only in dev/test: allows `http://` and private/loopback hosts (needed for the reference server on `localhost:3232`). |

## 6. Authorization flow

1. **Start** — `POST /:projectid/mcp/oauth/authorize` (admin), body `{ server_url, name?, mode, scopes?, return_url?, manual?: { authorization_endpoint, token_endpoint, revocation_endpoint?, client_id, client_secret?, token_endpoint_auth_method? } }`.
   - `mcp`: discovery (§6.1), then DCR if no stored client for that server (§6.2).
   - `google`: endpoints `https://accounts.google.com/o/oauth2/v2/auth`, `https://oauth2.googleapis.com/token`, `https://oauth2.googleapis.com/revoke`; extra params `access_type=offline`, `prompt=consent`, `include_granted_scopes=true`; `scopes` required.
   - `manual`: endpoints and client from the body (client secret encrypted).
   - Upserts the connection (`status: 'pending'` when new; an `active` connection stays usable until the new flow completes).
   - Generates `state` (32 random bytes, base64url) and `code_verifier` (64 chars), `code_challenge = base64url(sha256(verifier))`, method `S256`.
   - Stores `mcp_oauth:state:<state>` → `{ id_project, connection_id, code_verifier, return_url, user_id }` in Redis, TTL 600 s.
   - Returns `{ authorization_url, connection_id }`. URL params: `response_type=code`, `client_id`, `redirect_uri`, `code_challenge`, `code_challenge_method=S256`, `state`, `scope` (space-joined, when any), `resource=<server_url>` (mcp mode).
2. **Callback** — `GET /oauth2/mcp/callback?code&state` (public, mounted before the `/:projectid` routers).
   - Reads and **deletes** the state (single use). Missing/expired → 400 page.
   - `error` param from the provider → connection `last_error`, redirect `return_url?mcp_oauth=error&error=<code>`.
   - Exchanges the code at the token endpoint (`grant_type=authorization_code`, `code`, `redirect_uri`, `code_verifier`, `resource` in mcp mode, client auth per `token_endpoint_auth_method`).
   - Saves tokens encrypted, `expires_at = now + expires_in`, `status: 'active'`, clears `last_error`.
   - Redirects to `return_url?mcp_oauth=success&connection_id=<id>`; without `return_url`, a minimal HTML page "Connected, you can close this window".
3. **Use** — the admin then saves the MCP server with `oauth.connection_id` (`POST /:projectid/mcp/servers`); `mcpService` uses the token for connect / tools discovery (§8).

### 6.1 Discovery (mode `mcp`)

1. `POST <server_url>` with an `initialize` request and no auth. Expect 401 with `WWW-Authenticate: Bearer resource_metadata="<url>"`.
2. Protected Resource Metadata (RFC 9728): the `resource_metadata` URL, else `<origin>/.well-known/oauth-protected-resource<path>`, else `<origin>/.well-known/oauth-protected-resource`. Take `authorization_servers[0]`, and `scopes_supported` as default scopes when none are given.
3. Authorization Server Metadata: `<issuer>/.well-known/oauth-authorization-server` (RFC 8414, with path insertion when the issuer has a path), else `/.well-known/openid-configuration`. Requires `authorization_endpoint`, `token_endpoint`; `code_challenge_methods_supported` must include `S256` when present.
4. If the server answers 200 to the unauthenticated initialize, discovery fails with 400 `"This MCP server does not require OAuth"`.

### 6.2 Dynamic Client Registration (mode `mcp`)

- `POST registration_endpoint` with `{ client_name: 'Tiledesk', redirect_uris: [<redirect uri>], grant_types: ['authorization_code','refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'client_secret_post' }`.
- Store `client_id`, `client_secret` (encrypted), the returned `token_endpoint_auth_method`, `client_registered_at`.
- No `registration_endpoint` → 400 `"This MCP server does not support dynamic client registration; use mode 'manual'"`.
- The registered client is reused by later flows of the same connection. A token endpoint answer `invalid_client` drops the stored client so the next authorize registers again (the reference server expires clients after 30 days).

## 7. Runtime token and refresh

`oauthTokenService.getAccessToken(connection)`:

- `status !== 'active'` → error `needs_reauth` (409).
- `expires_at` absent or more than `REFRESH_WINDOW_S = 300` s away → decrypt and return.
- Otherwise refresh:
  - Lock `mcp_oauth:refresh_lock:<id>` with `setNX`, TTL 30 s.
  - Not acquired → poll the DB every 250 ms for up to 5 s for a newer `last_refresh_at`; then return the token if still valid, else 503.
  - Acquired → reload the connection, `grant_type=refresh_token` (+ `resource` in mcp mode). Save the new access token; save the new refresh token **only when one is returned** (Google never rotates, the reference server does). Release the lock.
  - `invalid_grant` → `status: 'needs_reauth'`, `last_error`, 409. `invalid_client` → also drop the DCR client (§6.2). Network/5xx → `last_error`, 503, status unchanged.
- No refresh token and the access token expired → `needs_reauth`.

Endpoints:

- `GET /:projectid/mcp/oauth/connections/:id/token` — **bot or subscription callers only** (an admin JWT gets 403, so tokens never reach the dashboard). 200 `{ access_token, token_type, expires_at }`.
- `POST /:projectid/mcp/oauth/connections/:id/refresh` — admin; forces a refresh, returns the public connection.
- `POST /webhook/mcp-oauth/refresh` — scheduler; header `x-auth-token: $MCP_OAUTH_REFRESH_TOKEN`. Body `{ connection_id }` refreshes one and answers 200 `{ success, connection_id, expires_at }` (404 unknown, 409 `needs_reauth`); `{ within_seconds }` (default 900, max 86400) refreshes every `active` connection with a refresh token and `expires_at` within that window, sequentially, each failure isolated. 200 `{ success, refreshed, failed, needs_reauth }`; 400 when `within_seconds` is not an integer in 60..86400. 401 bad token, 503 not configured.

## 8. mcpService changes

- `serverConfig` gains `oauth: { connection_id }`. `applyRequestHeaders` becomes async-aware through a new `resolveRequestHeaders(serverConfig)`: when `oauth.connection_id` is set it loads the connection (same `id_project`), gets the token and sets `Authorization: Bearer <token>`, overriding any `Authorization` from `customHeaders`.
- `sendJSONRPCRequest`: a 401 from an OAuth-backed server triggers one forced refresh and one retry.
- `buildServerConfig` accepts `oauth.connection_id` (rejects the old `oauth` shape with the current message). `normalizeMcpServerEntry` copies `oauth: { connection_id, mode }` into the stored entry after checking the connection belongs to the project.
- `getCacheKey` includes the connection id so sessions are not shared across connections.
- Decided during implementation: the bearer is sent only when the connection's `server_url` equals the requested URL (normalized), else 400. Without it an admin could point a connection of server A at server B and hand B the token of A.
- Decided during implementation: native entries with `oauth` answer 400. Native URLs are never exposed, so the admin cannot run `authorize` on them; supporting them needs `authorize` to accept a `nativeId` (§12).
- OAuth errors keep their status through `sendJSONRPCRequest` and `routes/mcp.js` (404, 409, 503) instead of the generic 500.

## 9. Connection management API (admin)

- `GET /:projectid/mcp/oauth/connections` — public shape: `{ _id, mode, server_url, name, status, scopes, granted_scopes, expires_at, last_refresh_at, last_error, issuer, createdAt, updatedAt }`. No secrets, no `client_id` for google.
- `GET /:projectid/mcp/oauth/connections/:id` — same shape.
- `DELETE /:projectid/mcp/oauth/connections/:id` — best-effort revocation (refresh token, then access token) at `revocation_endpoint`, delete the connection, remove `oauth` from integration entries that reference it (they stay, unauthenticated) and emit `integration.update`. 200 `{ success: true, revoked: Boolean }`.

## 10. Security

- PKCE S256 always; `state` single-use, 10-min TTL, bound to project and user.
- `return_url` origin must be in `MCP_OAUTH_RETURN_ORIGINS`, else 400 at authorize.
- Outbound URL guard (`utils/outboundUrlGuard.js`) for every user-influenced URL (server URL, metadata, endpoints from discovery or manual): `https:` only, DNS-resolved addresses must not be loopback, private, link-local, CGNAT, ULA or unspecified; `maxRedirects: 0`; 10 s timeout; response bodies ≤ 1 MB. `MCP_OAUTH_ALLOW_INSECURE_URLS=true` disables it.
- Secrets encrypted at rest; `logRedactor` gains `access_token`, `refresh_token`, `code_verifier`, `code`, `client_secret`; `maskIntegrationSecrets` unchanged (no secrets in the integration).
- Token endpoint reachable only with bot/subscription credentials of the same project.

## 11. Errors (summary)

| Case | Status |
|---|---|
| Feature env missing | 503 |
| Bad body / discovery or DCR not supported / return_url not allowed | 400 |
| Connection of another project or missing | 404 |
| Admin calling the token endpoint | 403 |
| Connection `needs_reauth` / `revoked` / `pending` on token | 409 `{ success: false, error: <message>, code: 'needs_reauth' }` |
| OAuth connection used for another server URL | 400 |
| Provider unreachable or 5xx | 503 (502 at authorize / callback) |

## 12. Follow-ups (not in this round)

- **Scheduler job**: one global cron (every 10–15 min) in tiledesk-scheduler-service calling `POST /webhook/mcp-oauth/refresh` with `{ within_seconds: 900 }`. Needs a new target (or a generic HTTP target) in the scheduler; contract not verified (repo not accessible from here). Keeps refresh tokens alive for providers with short idle expiry (the reference server: 7 days) and flags `needs_reauth` early.
- **UI** (dashboard / design-studio): "Connect" button opening `authorization_url` in a popup, reading `mcp_oauth=success|error` on `return_url`, showing status and "Reconnect".
- **Google verification**: sensitive/restricted scopes (Gmail, Drive) need Google app verification (restricted: CASA assessment); in "Testing" publishing status refresh tokens expire after 7 days.
- Native MCP servers with OAuth: `authorize` accepting a `nativeId` (the URL stays hidden), then catalog entries with a default `oauth` mode/scopes.

## 13. Testing

- Unit: crypto round-trip and tamper detection; PKCE challenge; discovery URL construction (with and without path); URL guard.
- Route tests with nock for discovery, DCR, token, refresh, revoke; Redis for state/lock.
- Concurrency: two parallel token requests on an expiring token → exactly one refresh call.
- Manual end-to-end against the reference server (`npm run dev:internal`, port 3232) with `MCP_OAUTH_ALLOW_INSECURE_URLS=true`.

## 14. Verification (2026-11-10)

- Automated: 128 mocha tests (`test/mcpOAuthUtils`, `mcpOAuthDiscovery`, `mcpOAuthService`, `mcpOAuthRoute`, `mcpServiceOAuth`, `nativemcp`), run on Node 22 with the enterprise modules removed from `node_modules`. Providers and MCP servers are mocked with nock; Mongo and Redis are real (local).
- Manual end to end against the reference server (`npm run dev:internal`, port 3232, internal auth mode) and tiledesk-server on port 3000 with `MCP_OAUTH_ALLOW_INSECURE_URLS=true` and a dedicated database. Nothing mocked; the consent page of the reference server's mock identity provider was driven with curl. Results:
  - `authorize` in mode `mcp`: discovery, dynamic registration (`token_endpoint_auth_method: none`, no secret) and the `resource` parameter `http://localhost:3232/`.
  - Callback: 302 to `return_url` with `mcp_oauth=success`; the connection is `active` and the public shape has no secrets.
  - `POST /mcp/connect` and `/mcp/servers` with `oauth.connection_id`: 9 tools; the saved entry holds `{ connection_id, mode: 'mcp' }`.
  - `/token`: admin 403, bot JWT 200. With `expires_at` moved to the past the next call refreshed and returned a new access token, and tools were listed with it. The reference server rotates refresh tokens and three refreshes in a row succeeded.
  - Scheduler webhook: wrong token 401; `{ connection_id }` 200; `{ within_seconds: 900 }` with one connection due → `refreshed: 1`.
  - At rest: `access_token_enc` / `refresh_token_enc` in `v1:` format, the plaintext token absent from the document.
  - `DELETE`: `revoked: true`, the integration entry kept without `oauth`, later calls with the old `connection_id` answer 404.
- Not verified: Google with a real client (needs Google Cloud credentials), the 401-then-retry path against a live server (covered only by nock), the scheduler side.
