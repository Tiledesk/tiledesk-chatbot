# MCP OAuth2 — Design

Data: 2026-11-10 · Stato: lato server implementato (commit f4fe91fe..3224546e) e verificato end to end contro il server di riferimento (§14); restano tybot, UI e job dello scheduler
Repo: tiledesk-server, tiledesk-chatbot (tybot). La UI di dashboard / design-studio e tiledesk-scheduler-service sono follow-up (§12).
Branch: `features-2611/oauth2-mcp` (tiledesk-server).
Server MCP di riferimento: [modelcontextprotocol/example-remote-server](https://github.com/modelcontextprotocol/example-remote-server) ([guida OAuth](https://github.com/modelcontextprotocol/example-remote-server/blob/main/docs/oauth-implementation.md)), specifica MCP Authorization `2025-06-18`.

## 1. Obiettivo

Un admin di progetto può collegare un server MCP protetto da OAuth2. tiledesk-server fa da client OAuth: esegue il flusso authorization code + PKCE, salva i token cifrati, li rinfresca e fornisce al chatbot engine un access token valido ogni volta che un'action AI Prompt chiama quel server MCP. Tre modi per configurare il client OAuth:

- **mcp** — la specifica MCP Authorization: discovery a partire dall'URL del server MCP, Dynamic Client Registration. L'admin inserisce solo l'URL MCP.
- **google** — preset con gli endpoint di Google e un unico client OAuth Google di Tiledesk da env.
- **manual** — l'admin inserisce endpoint di autorizzazione e token, client id/secret e scope (qualsiasi provider OAuth2 senza discovery).

## 2. Decisioni (utente, 2026-11-10)

1. I token stanno nel database. Il chatbot chiama un endpoint del server che restituisce l'access token letto dal DB. Uno scheduler, in seguito, chiamerà un'API del server che rinfresca e salva i token nel DB.
2. Strategia di refresh per ora: **lazy** — l'endpoint del token rinfresca quando l'access token sta per scadere. L'API di refresh per lo scheduler si crea ora; la registrazione del job nello scheduler è un follow-up.
3. Google: un unico client OAuth Google Cloud di Tiledesk (`MCP_OAUTH_GOOGLE_CLIENT_ID` / `_SECRET`). Nessun client per progetto.
4. Scope di questo giro: fasi server 1–3 (store + flusso + token a runtime) più l'API di refresh, e la modifica a tybot che usa l'endpoint del token.
5. Il codice del client OAuth è scritto con axios. Nessuna dipendenza da `@modelcontextprotocol/sdk`.

## 3. Stato attuale (verificato 2026-11-10)

- `services/mcpService.js` gestisce l'autenticazione tramite `customHeaders` o il vecchio `auth` (bearer / api-key / basic). `buildServerConfig` rifiuta un oggetto `oauth`: *"OAuth2 authentication is not supported yet"*.
- I server MCP sono salvati nell'integration `mcp` (`models/integrations.js`, `value.servers[]`). I server custom sono identificati da `url`, quelli nativi da `nativeId` (`findServerIndex`).
- `GET /:projectid/integration*` è in cache mongoose per `cacheUtil.longTTL` (`project:<id>:integrations`) e restituisce `customHeaders[].value` non mascherati (`maskIntegrationSecrets` maschera solo `apikey`, `api_key`, `token`, `secret`, `client_secret`, `password`). Quindi un token non deve essere scritto nell'integration.
- `DirAiPrompt.js` di tybot legge `/integration/name/mcp` con il token del bot a ogni esecuzione, trasforma i `customHeaders` in `headers` (`arrayToObject`, `enrichServersFromIntegration`) e li inoltra al backend LLM.
- `/:projectid/mcp` è montato con `passport basic|jwt`, `validtoken`, `roleChecker.hasRoleOrTypes('admin', ['bot','subscription'])`.
- Gli endpoint interni protetti da token seguono `/webhook/scheduled-start`: header `x-auth-token`, `crypto.timingSafeEqual` contro un token da env, 503 se non configurato.
- `TdCache` ha `setNX(key, value, ttlSeconds)`, `setJSON`, `getJSON`, `del`.
- `utils/logRedactor.js` oscura le chiavi `^(…|token|…|authorization|x-auth-token|…)$` (regex ancorata: `access_token` e `refresh_token` **non** sono coperti) e le stringhe `Bearer …`.
- `routes/urlPreview.js` ha solo un controllo degli IP privati basato su regex dell'hostname (nessuna risoluzione DNS).
- Disponibili Node 18.19, axios, nock, mocha + chai-http.

## 4. Modello dati (tiledesk-server)

Nuova collection `mcp_oauth_connections` (`models/mcpOAuthConnection.js`):

```
{
  id_project: String (index),
  mode: 'mcp' | 'google' | 'manual',
  server_url: String,                 // URL del server MCP = risorsa OAuth (RFC 8707)
  name: String,                       // nome visualizzato
  status: 'pending' | 'active' | 'needs_reauth' | 'revoked',
  // client OAuth
  client_id: String,
  client_secret_enc: String,          // cifrato, assente per client pubblici / google (env)
  client_registered_at: Date,         // solo DCR
  // endpoint (scoperti, preset o manuali)
  resource: String,                   // modalità mcp: `resource` dei protected resource metadata (può essere l'origin, non server_url)
  issuer: String,
  authorization_endpoint: String,
  token_endpoint: String,
  revocation_endpoint: String,
  registration_endpoint: String,
  token_endpoint_auth_method: 'client_secret_basic' | 'client_secret_post' | 'none',
  scopes: [String],
  // token
  access_token_enc: String,
  refresh_token_enc: String,
  token_type: String,                 // 'Bearer'
  expires_at: Date,                   // null quando il provider non invia expires_in
  granted_scopes: [String],
  last_refresh_at: Date,
  last_error: { code: String, message: String, at: Date },
  created_by: String,                 // id dell'utente che ha avviato il flusso
  createdAt, updatedAt
}
```

Indice univoco `{ id_project: 1, server_url: 1 }`: una connessione per server MCP per progetto.

La voce del server nell'integration riceve solo un riferimento (nessun segreto):

```
oauth: { connection_id: String, mode: 'mcp'|'google'|'manual' }
```

Cifratura: AES-256-GCM, chiave `MCP_OAUTH_ENCRYPTION_KEY` (32 byte, base64). Formato salvato `v1:<iv b64>:<tag b64>:<ciphertext b64>`. Mai restituito da nessuna API tranne l'endpoint del token (§7), che restituisce solo l'access token.

## 5. Configurazione

| Env | Scopo |
|---|---|
| `MCP_OAUTH_ENCRYPTION_KEY` | Obbligatoria. Senza, ogni rotta OAuth risponde 503 `"MCP OAuth is not available on this installation"`. |
| `MCP_OAUTH_REDIRECT_BASE_URL` | URL base pubblico del server; redirect URI = `<base>/oauth2/mcp/callback`. Se assente si usa `API_URL`. |
| `MCP_OAUTH_RETURN_ORIGINS` | Origin separate da virgola ammesse come `return_url` (dashboard / design-studio). |
| `MCP_OAUTH_GOOGLE_CLIENT_ID`, `MCP_OAUTH_GOOGLE_CLIENT_SECRET` | Preset Google. Senza, `mode: 'google'` risponde 503. |
| `MCP_OAUTH_REFRESH_TOKEN` | `x-auth-token` dell'API di refresh per lo scheduler. Senza, l'API risponde 503. |
| `MCP_OAUTH_ALLOW_INSECURE_URLS` | `true` solo in dev/test: consente `http://` e host privati/loopback (serve per il server di riferimento su `localhost:3232`). |

## 6. Flusso di autorizzazione

1. **Avvio** — `POST /:projectid/mcp/oauth/authorize` (admin), body `{ server_url, name?, mode, scopes?, return_url?, manual?: { authorization_endpoint, token_endpoint, revocation_endpoint?, client_id, client_secret?, token_endpoint_auth_method? } }`.
   - `mcp`: discovery (§6.1), poi DCR se per quel server non c'è un client salvato (§6.2).
   - `google`: endpoint `https://accounts.google.com/o/oauth2/v2/auth`, `https://oauth2.googleapis.com/token`, `https://oauth2.googleapis.com/revoke`; parametri extra `access_type=offline`, `prompt=consent`, `include_granted_scopes=true`; `scopes` obbligatori.
   - `manual`: endpoint e client dal body (client secret cifrato).
   - Crea o aggiorna la connessione (`status: 'pending'` se nuova; una connessione `active` resta utilizzabile finché il nuovo flusso non si completa).
   - Genera `state` (32 byte casuali, base64url) e `code_verifier` (64 caratteri), `code_challenge = base64url(sha256(verifier))`, metodo `S256`.
   - Salva `mcp_oauth:state:<state>` → `{ id_project, connection_id, code_verifier, return_url, user_id }` su Redis, TTL 600 s.
   - Restituisce `{ authorization_url, connection_id }`. Parametri dell'URL: `response_type=code`, `client_id`, `redirect_uri`, `code_challenge`, `code_challenge_method=S256`, `state`, `scope` (separati da spazio, se presenti), `resource=<server_url>` (modalità mcp).
2. **Callback** — `GET /oauth2/mcp/callback?code&state` (pubblica, montata prima dei router `/:projectid`).
   - Legge e **cancella** lo state (monouso). Mancante/scaduto → pagina 400.
   - Parametro `error` dal provider → `last_error` sulla connessione, redirect a `return_url?mcp_oauth=error&error=<code>`.
   - Scambia il code sul token endpoint (`grant_type=authorization_code`, `code`, `redirect_uri`, `code_verifier`, `resource` in modalità mcp, autenticazione del client secondo `token_endpoint_auth_method`).
   - Salva i token cifrati, `expires_at = now + expires_in`, `status: 'active'`, azzera `last_error`.
   - Redirect a `return_url?mcp_oauth=success&connection_id=<id>`; senza `return_url`, una pagina HTML minima "Connesso, puoi chiudere questa finestra".
3. **Uso** — l'admin salva poi il server MCP con `oauth.connection_id` (`POST /:projectid/mcp/servers`); `mcpService` usa il token per connect / discovery dei tool (§8).

### 6.1 Discovery (modalità `mcp`)

1. `POST <server_url>` con una richiesta `initialize` senza autenticazione. Ci si aspetta 401 con `WWW-Authenticate: Bearer resource_metadata="<url>"`.
2. Protected Resource Metadata (RFC 9728): l'URL `resource_metadata`, altrimenti `<origin>/.well-known/oauth-protected-resource<path>`, altrimenti `<origin>/.well-known/oauth-protected-resource`. Si prende `authorization_servers[0]` e `scopes_supported` come scope di default se non ne vengono indicati.
3. Authorization Server Metadata: `<issuer>/.well-known/oauth-authorization-server` (RFC 8414, con inserimento del path se l'issuer ha un path), altrimenti `/.well-known/openid-configuration`. Richiede `authorization_endpoint`, `token_endpoint`; `code_challenge_methods_supported`, se presente, deve includere `S256`.
4. Se il server risponde 200 all'initialize non autenticato, la discovery fallisce con 400 `"This MCP server does not require OAuth"`.

### 6.2 Dynamic Client Registration (modalità `mcp`)

- `POST registration_endpoint` con `{ client_name: 'Tiledesk', redirect_uris: [<redirect uri>], grant_types: ['authorization_code','refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'client_secret_post' }`.
- Si salvano `client_id`, `client_secret` (cifrato), il `token_endpoint_auth_method` restituito, `client_registered_at`.
- Nessun `registration_endpoint` → 400 `"This MCP server does not support dynamic client registration; use mode 'manual'"`.
- Il client registrato viene riusato dai flussi successivi della stessa connessione. Una risposta `invalid_client` dal token endpoint elimina il client salvato, così il prossimo authorize si registra di nuovo (il server di riferimento fa scadere i client dopo 30 giorni).

## 7. Token a runtime e refresh

`oauthTokenService.getAccessToken(connection)`:

- `status !== 'active'` → errore `needs_reauth` (409).
- `expires_at` assente o a più di `REFRESH_WINDOW_S = 300` s → decifra e restituisce.
- Altrimenti refresh:
  - Lock `mcp_oauth:refresh_lock:<id>` con `setNX`, TTL 30 s.
  - Lock non acquisito → interroga il DB ogni 250 ms per al massimo 5 s cercando un `last_refresh_at` più recente; poi restituisce il token se ancora valido, altrimenti 503.
  - Lock acquisito → ricarica la connessione, `grant_type=refresh_token` (+ `resource` in modalità mcp). Salva il nuovo access token; salva il nuovo refresh token **solo se ne arriva uno** (Google non li ruota mai, il server di riferimento sì). Rilascia il lock.
  - `invalid_grant` → `status: 'needs_reauth'`, `last_error`, 409. `invalid_client` → elimina anche il client DCR (§6.2). Errore di rete/5xx → `last_error`, 503, stato invariato.
- Nessun refresh token e access token scaduto → `needs_reauth`.

Endpoint:

- `GET /:projectid/mcp/oauth/connections/:id/token` — **solo chiamanti bot o subscription** (un JWT admin riceve 403, così i token non arrivano mai alla dashboard). 200 `{ access_token, token_type, expires_at }`.
- `POST /:projectid/mcp/oauth/connections/:id/refresh` — admin; forza un refresh, restituisce la connessione pubblica.
- `POST /webhook/mcp-oauth/refresh` — scheduler; header `x-auth-token: $MCP_OAUTH_REFRESH_TOKEN`. Body `{ connection_id }` ne rinfresca una e risponde 200 `{ success, connection_id, expires_at }` (404 se non esiste, 409 `needs_reauth`); `{ within_seconds }` (default 900, max 86400) rinfresca ogni connessione `active` con refresh token e `expires_at` entro quella finestra, in sequenza, isolando ogni errore. 200 `{ success, refreshed, failed, needs_reauth }`; 400 se `within_seconds` non è un intero tra 60 e 86400. 401 token errato, 503 non configurato.

## 8. Modifiche a mcpService

- `serverConfig` riceve `oauth: { connection_id }`. `applyRequestHeaders` diventa compatibile con l'asincrono tramite un nuovo `resolveRequestHeaders(serverConfig)`: quando `oauth.connection_id` è valorizzato carica la connessione (stesso `id_project`), ottiene il token e imposta `Authorization: Bearer <token>`, sovrascrivendo un eventuale `Authorization` dei `customHeaders`.
- `sendJSONRPCRequest`: un 401 da un server con OAuth provoca un refresh forzato e un solo nuovo tentativo.
- `buildServerConfig` accetta `oauth.connection_id` (rifiuta la vecchia forma di `oauth` con il messaggio attuale). `normalizeMcpServerEntry` copia `oauth: { connection_id, mode }` nella voce salvata dopo aver verificato che la connessione appartenga al progetto.
- `getCacheKey` include l'id della connessione, così le sessioni non vengono condivise tra connessioni.
- Deciso durante lo sviluppo: il bearer viene inviato solo se il `server_url` della connessione coincide con l'URL chiamato (normalizzato), altrimenti 400. Senza questo controllo un admin potrebbe collegare la connessione del server A al server B e consegnare a B il token di A.
- Deciso durante lo sviluppo: le voci native con `oauth` rispondono 400. L'URL dei server nativi non viene mai esposto, quindi l'admin non può lanciare `authorize` su di essi; per supportarli `authorize` deve accettare un `nativeId` (§12).
- Gli errori OAuth mantengono il loro status attraverso `sendJSONRPCRequest` e `routes/mcp.js` (404, 409, 503) invece del 500 generico.

## 9. API di gestione delle connessioni (admin)

- `GET /:projectid/mcp/oauth/connections` — forma pubblica: `{ _id, mode, server_url, name, status, scopes, granted_scopes, expires_at, last_refresh_at, last_error, issuer, createdAt, updatedAt }`. Nessun segreto, nessun `client_id` per google.
- `GET /:projectid/mcp/oauth/connections/:id` — stessa forma.
- `DELETE /:projectid/mcp/oauth/connections/:id` — revoca best-effort (refresh token, poi access token) su `revocation_endpoint`, cancella la connessione, rimuove `oauth` dalle voci dell'integration che la referenziano (le voci restano, senza autenticazione) ed emette `integration.update`. 200 `{ success: true, revoked: Boolean }`.

## 10. Sicurezza

- PKCE S256 sempre; `state` monouso, TTL 10 minuti, legato a progetto e utente.
- L'origin di `return_url` deve essere in `MCP_OAUTH_RETURN_ORIGINS`, altrimenti 400 all'authorize.
- Guard sugli URL in uscita (`utils/outboundUrlGuard.js`) per ogni URL influenzato dall'utente (URL del server, metadati, endpoint da discovery o manuali): solo `https:`, gli indirizzi risolti via DNS non devono essere loopback, privati, link-local, CGNAT, ULA o non specificati; `maxRedirects: 0`; timeout 10 s; body delle risposte ≤ 1 MB. `MCP_OAUTH_ALLOW_INSECURE_URLS=true` lo disattiva.
- Segreti cifrati a riposo; `logRedactor` aggiunge `access_token`, `refresh_token`, `code_verifier`, `code`, `client_secret`; `maskIntegrationSecrets` invariato (nessun segreto nell'integration).
- Endpoint del token raggiungibile solo con credenziali bot/subscription dello stesso progetto.

## 11. Errori (riepilogo)

| Caso | Stato |
|---|---|
| Env della feature mancante | 503 |
| Body errato / discovery o DCR non supportati / return_url non ammesso | 400 |
| Connessione di un altro progetto o inesistente | 404 |
| Admin che chiama l'endpoint del token | 403 |
| Connessione `needs_reauth` / `revoked` / `pending` sul token | 409 `{ success: false, error: <messaggio>, code: 'needs_reauth' }` |
| Connessione OAuth usata per un altro URL di server | 400 |
| Provider irraggiungibile o 5xx | 503 (502 su authorize / callback) |

## 12. Follow-up (non in questo giro)

- **Job dello scheduler**: un cron globale (ogni 10–15 minuti) in tiledesk-scheduler-service che chiama `POST /webhook/mcp-oauth/refresh` con `{ within_seconds: 900 }`. Serve un nuovo target (o un target HTTP generico) nello scheduler; contratto non verificato (repo non accessibile da qui). Mantiene vivi i refresh token dei provider con scadenza per inattività breve (il server di riferimento: 7 giorni) e segnala presto i `needs_reauth`.
- **UI** (dashboard / design-studio): pulsante "Connetti" che apre `authorization_url` in un popup, legge `mcp_oauth=success|error` sul `return_url`, mostra lo stato e "Riconnetti".
- **Verifica Google**: gli scope sensibili/ristretti (Gmail, Drive) richiedono la verifica dell'app da parte di Google (ristretti: assessment CASA); con stato di pubblicazione "Testing" i refresh token scadono dopo 7 giorni.
- Server MCP nativi con OAuth: `authorize` che accetta un `nativeId` (l'URL resta nascosto), poi voci del catalogo con modalità `oauth` e scope di default.

## 13. Test

- Unitari: round-trip della cifratura e rilevamento delle manomissioni; challenge PKCE; costruzione degli URL di discovery (con e senza path); guard sugli URL.
- Test delle rotte con nock per discovery, DCR, token, refresh, revoca; Redis per state/lock.
- Concorrenza: due richieste del token in parallelo su un token in scadenza → esattamente una chiamata di refresh.
- End-to-end manuale contro il server di riferimento (`npm run dev:internal`, porta 3232) con `MCP_OAUTH_ALLOW_INSECURE_URLS=true`.

## 14. Verifica (2026-11-10)

- Automatica: 128 test mocha (`test/mcpOAuthUtils`, `mcpOAuthDiscovery`, `mcpOAuthService`, `mcpOAuthRoute`, `mcpServiceOAuth`, `nativemcp`), eseguiti con Node 22 e con i moduli enterprise tolti da `node_modules`. Provider e server MCP sono simulati con nock; Mongo e Redis sono reali (locali).
- End to end manuale contro il server di riferimento (`npm run dev:internal`, porta 3232, auth in modalità interna) e tiledesk-server sulla porta 3000 con `MCP_OAUTH_ALLOW_INSECURE_URLS=true` e un database dedicato. Niente di simulato; la pagina di consenso dell'identity provider fittizio del server di riferimento è stata guidata con curl. Risultati:
  - `authorize` in modalità `mcp`: discovery, registrazione dinamica (`token_endpoint_auth_method: none`, nessun secret) e parametro `resource` `http://localhost:3232/`.
  - Callback: 302 al `return_url` con `mcp_oauth=success`; la connessione è `active` e la forma pubblica non contiene segreti.
  - `POST /mcp/connect` e `/mcp/servers` con `oauth.connection_id`: 9 tool; la voce salvata contiene `{ connection_id, mode: 'mcp' }`.
  - `/token`: admin 403, JWT del bot 200. Con `expires_at` spostato nel passato la chiamata successiva ha fatto il refresh e restituito un nuovo access token, con cui i tool sono stati elencati. Il server di riferimento ruota i refresh token e tre refresh di seguito sono andati a buon fine.
  - Webhook dello scheduler: token errato 401; `{ connection_id }` 200; `{ within_seconds: 900 }` con una connessione in scadenza → `refreshed: 1`.
  - A riposo: `access_token_enc` / `refresh_token_enc` nel formato `v1:`, il token in chiaro assente dal documento.
  - `DELETE`: `revoked: true`, la voce dell'integration resta senza `oauth`, le chiamate successive con il vecchio `connection_id` rispondono 404.
- Non verificato: Google con un client reale (servono credenziali Google Cloud), il percorso 401 e nuovo tentativo contro un server reale (coperto solo con nock), il lato scheduler.
