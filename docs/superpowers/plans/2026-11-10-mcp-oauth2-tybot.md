# MCP OAuth2 — tiledesk-chatbot (tybot) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an AI Prompt action uses an MCP server whose integration entry has `oauth.connection_id`, tybot fetches the access token from tiledesk-server and sends it as `Authorization: Bearer …` to the LLM backend with the other MCP headers.

**Architecture:** New `services/McpOAuthTokenService.js` (`GET /:id_project/mcp/oauth/connections/:id/token` with the chatbot JWT, short in-process cache) → `DirAiPrompt` resolves tokens after `enrichServersFromIntegration` and passes them to `arrayToObject`, which sets `headers.Authorization` last.

**Tech Stack:** Node, `utils/HttpUtils`, mocha + the existing AI Prompt test harness.

**Spec:** `docs/superpowers/specs/2026-11-10-mcp-oauth2-design.md` (§7 token endpoint, §8 what the server stores in the integration, §11 errors).

## Global Constraints

- Branch: new `feature/mcp-oauth2` from `main` in tiledesk-chatbot. One commit per task. Never push.
- Depends on the server token endpoint, already implemented in tiledesk-server (commit `496a71cb`, verified end to end: spec §14). Tokens are always fetched from the server: tybot never reads `mcp_oauth_connections` from its database, even though `IntegrationService` reads integrations from it (tokens are encrypted and refresh lives on the server).
- Request: `GET API_ENDPOINT + "/" + id_project + "/mcp/oauth/connections/" + connection_id + "/token"`, header `Authorization: 'JWT ' + this.token` (same as `IntegrationService.getIntegrationFromApi`). 200 body `{ access_token, token_type, expires_at }`.
- Cache: in-process `Map` keyed `id_project:connection_id`, entry valid until `expires_at - 60 s`; no cache when `expires_at` is null; never logged.
- Failure (409 `needs_reauth`, 404, 5xx, network): the action fails like a missing MCP integration — `flowError` = `"MCP server <name> needs to be reconnected"` for 409, `"MCP server <name> OAuth token unavailable"` otherwise; then `falseIntent` if set, else `callback()`.
- `Authorization` from OAuth overrides an `Authorization` coming from `customHeaders` or flow variables.
- Tests: `npm test` subset for `tybotRoute/test/conversation-ai_prompt_test.js`, `tybotRoute/test/dir_ai_prompt_headers_test.js` and the new file; the server is mocked by the existing HTTP stub used in those tests.

## Review Focus

1. A server without `oauth` → no token request at all (no regression, no added latency).
2. The token never appears in `winston`/`this.logger` output (`json.servers` is logged at debug: redact `headers.Authorization` there).
3. Native servers never carry `oauth`: the server rejects it on native entries (400, spec §8). A native entry must not call the token service and keeps its flow-variable headers unchanged.

---

### Task 1: token service

**Files:**
- Create: `tybotRoute/services/McpOAuthTokenService.js`
- Test: `tybotRoute/test/mcp_oauth_token_service_test.js`

**Interfaces:**
- `getToken(id_project, connection_id, token) → Promise<{ access_token, token_type, expires_at }>`; rejects with `err.status` (409/404/5xx, 502 on network) and `err.code` from the body.
- `clearCache()` for tests. Instance fields `httpUtils`, `now` substitutable like `IntegrationService`.

- [ ] **Step 1: Failing tests.** 200 → returned and cached (second call no HTTP); cache expiry 60 s before `expires_at` (stub `now`); `expires_at: null` → no cache; 409 → rejects `status 409, code 'needs_reauth'`; network error → 502.
- [ ] **Step 2: Run** → fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → pass.
- [ ] **Step 5: Commit** — `feat(ai-prompt): MCP OAuth token service`.

### Task 2: DirAiPrompt bearer injection

**Files:**
- Modify: `tybotRoute/tiledeskChatbotPlugs/directives/DirAiPrompt.js`
- Test: `tybotRoute/test/dir_ai_prompt_headers_test.js` (new cases), `tybotRoute/test/conversation-ai_prompt_test.js` (one end-to-end case)

**Interfaces:**
- `resolveOAuthTokens(servers, mcp_integration) → Promise<{ tokens: { [serverName]: 'Bearer …' }, error?: string }>`: for each action server, `getIntegrationServer`; if `integrationServer.oauth?.connection_id` → `McpOAuthTokenService.getToken(this.projectId, id, this.token)`. Requests run in parallel; first failure sets `error`.
- `arrayToObject(arr, mcp_integration, flowVariables, oauthTokens = {})`: after `mergeHeadersWithVariables`, `if (oauthTokens[server.name]) cleanServer.headers.Authorization = oauthTokens[server.name]`.
- Called in the `action.servers` branch right after `resolveNativeServerUrls`, before building `flowVariables`; the error path mirrors `nativeUrlError`.
- The `winston.debug("DirAiPrompt json.servers: ", …)` line logs a copy with `headers.Authorization` replaced by `'[REDACTED]'`.

- [ ] **Step 1: Failing tests.** Integration server with `oauth: { connection_id: 'c1' }` → `json.servers.<name>.headers.Authorization === 'Bearer t1'`; customHeaders `Authorization: 'x'` → overridden; server without `oauth` → token service not called (Review Focus 1); native server without `oauth` → token service not called and flow-variable headers unchanged (Review Focus 3); token service 409 → `flowError` "needs to be reconnected" and the false intent runs; debug log does not contain `t1` (Review Focus 2).
- [ ] **Step 2: Run** → fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the two existing AI Prompt test files plus Task 1's → pass.
- [ ] **Step 5: Commit** — `feat(ai-prompt): send MCP OAuth bearer from the server token endpoint`.
