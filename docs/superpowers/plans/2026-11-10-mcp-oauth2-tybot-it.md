# MCP OAuth2 — Piano di implementazione tiledesk-chatbot (tybot)

> **Per gli agenti:** SUB-SKILL RICHIESTA: usare superpowers:subagent-driven-development (consigliata) o superpowers:executing-plans per implementare questo piano task per task. Gli step usano la sintassi checkbox (`- [ ]`) per il tracciamento.

**Obiettivo:** Quando un'action AI Prompt usa un server MCP la cui voce nell'integration ha `oauth.connection_id`, tybot recupera l'access token da tiledesk-server e lo invia come `Authorization: Bearer …` al backend LLM insieme agli altri header MCP.

**Architettura:** Nuovo `services/McpOAuthTokenService.js` (`GET /:id_project/mcp/oauth/connections/:id/token` con il JWT del chatbot, breve cache in-process) → `DirAiPrompt` risolve i token dopo `enrichServersFromIntegration` e li passa ad `arrayToObject`, che imposta `headers.Authorization` per ultimo.

**Stack:** Node, `utils/HttpUtils`, mocha + l'harness di test esistente di AI Prompt.

**Spec:** `docs/superpowers/specs/2026-11-10-mcp-oauth2-design-it.md` (§7 endpoint del token, §8 cosa salva il server nell'integration, §11 errori).

## Vincoli globali

- Branch: nuovo `feature/mcp-oauth2` da `main` in tiledesk-chatbot. Un commit per task. Mai fare push.
- Dipende dall'endpoint del token sul server, già implementato in tiledesk-server (commit `496a71cb`, verificato end to end: spec §14). I token si recuperano sempre dal server: tybot non legge mai `mcp_oauth_connections` dal suo database, anche se `IntegrationService` legge le integration da lì (i token sono cifrati e il refresh sta sul server).
- Richiesta: `GET API_ENDPOINT + "/" + id_project + "/mcp/oauth/connections/" + connection_id + "/token"`, header `Authorization: 'JWT ' + this.token` (come `IntegrationService.getIntegrationFromApi`). Body della risposta 200 `{ access_token, token_type, expires_at }`.
- Cache: `Map` in-process con chiave `id_project:connection_id`, voce valida fino a `expires_at - 60 s`; nessuna cache quando `expires_at` è null; mai nei log.
- Errore (409 `needs_reauth`, 404, 5xx, rete): l'action fallisce come quando manca l'integration MCP — `flowError` = `"MCP server <name> needs to be reconnected"` per il 409, `"MCP server <name> OAuth token unavailable"` negli altri casi; poi `falseIntent` se impostato, altrimenti `callback()`.
- L'`Authorization` da OAuth sovrascrive un `Authorization` proveniente da `customHeaders` o da variabili del flow.
- Test: sottoinsieme di `npm test` per `tybotRoute/test/conversation-ai_prompt_test.js`, `tybotRoute/test/dir_ai_prompt_headers_test.js` e il nuovo file; il server è mockato dallo stub HTTP già usato in quei test.

## Punti di attenzione per la review

1. Un server senza `oauth` → nessuna richiesta del token (nessuna regressione, nessuna latenza aggiunta).
2. Il token non compare mai nell'output di `winston`/`this.logger` (`json.servers` è loggato in debug: oscurare lì `headers.Authorization`).
3. I server nativi non hanno mai `oauth`: il server lo rifiuta sulle voci native (400, spec §8). Una voce nativa non deve chiamare il service del token e mantiene invariati gli header delle variabili del flow.

---

### Task 1: service del token

**File:**
- Creare: `tybotRoute/services/McpOAuthTokenService.js`
- Test: `tybotRoute/test/mcp_oauth_token_service_test.js`

**Interfacce:**
- `getToken(id_project, connection_id, token) → Promise<{ access_token, token_type, expires_at }>`; rifiuta con `err.status` (409/404/5xx, 502 su errore di rete) ed `err.code` preso dal body.
- `clearCache()` per i test. Campi d'istanza `httpUtils`, `now` sostituibili come in `IntegrationService`.

- [ ] **Step 1: Test che falliscono.** 200 → restituito e messo in cache (seconda chiamata senza HTTP); la cache scade 60 s prima di `expires_at` (stub di `now`); `expires_at: null` → nessuna cache; 409 → rifiuta con `status 409, code 'needs_reauth'`; errore di rete → 502.
- [ ] **Step 2: Eseguire** → fallisce.
- [ ] **Step 3: Implementare.**
- [ ] **Step 4: Eseguire** → passa.
- [ ] **Step 5: Commit** — `feat(ai-prompt): MCP OAuth token service`.

### Task 2: iniezione del bearer in DirAiPrompt

**File:**
- Modificare: `tybotRoute/tiledeskChatbotPlugs/directives/DirAiPrompt.js`
- Test: `tybotRoute/test/dir_ai_prompt_headers_test.js` (nuovi casi), `tybotRoute/test/conversation-ai_prompt_test.js` (un caso end-to-end)

**Interfacce:**
- `resolveOAuthTokens(servers, mcp_integration) → Promise<{ tokens: { [serverName]: 'Bearer …' }, error?: string }>`: per ogni server dell'action, `getIntegrationServer`; se `integrationServer.oauth?.connection_id` → `McpOAuthTokenService.getToken(this.projectId, id, this.token)`. Le richieste vanno in parallelo; il primo errore valorizza `error`.
- `arrayToObject(arr, mcp_integration, flowVariables, oauthTokens = {})`: dopo `mergeHeadersWithVariables`, `if (oauthTokens[server.name]) cleanServer.headers.Authorization = oauthTokens[server.name]`.
- Chiamato nel ramo `action.servers` subito dopo `resolveNativeServerUrls`, prima di costruire `flowVariables`; il percorso d'errore ricalca `nativeUrlError`.
- La riga `winston.debug("DirAiPrompt json.servers: ", …)` logga una copia con `headers.Authorization` sostituito da `'[REDACTED]'`.

- [ ] **Step 1: Test che falliscono.** Server dell'integration con `oauth: { connection_id: 'c1' }` → `json.servers.<name>.headers.Authorization === 'Bearer t1'`; `Authorization: 'x'` nei customHeaders → sovrascritto; server senza `oauth` → service del token non chiamato (punto di review 1); server nativo senza `oauth` → service del token non chiamato e header delle variabili del flow invariati (punto di review 3); service del token 409 → `flowError` "needs to be reconnected" e viene eseguito il false intent; il log di debug non contiene `t1` (punto di review 2).
- [ ] **Step 2: Eseguire** → fallisce.
- [ ] **Step 3: Implementare.**
- [ ] **Step 4: Eseguire** i due file di test AI Prompt esistenti più quello del Task 1 → passa.
- [ ] **Step 5: Commit** — `feat(ai-prompt): send MCP OAuth bearer from the server token endpoint`.
