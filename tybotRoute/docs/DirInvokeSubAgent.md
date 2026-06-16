# Sub-agent interni e action `invoke_subagent`

Questa guida descrive il meccanismo dei **sub-agent interni** in Tilebot: un bot padre può delegare l'esecuzione a un altro bot (sub-agent) registrato nello stesso progetto, attendere opzionalmente il risultato e riprendere il proprio flusso.

## Panoramica

Un sub-agent interno è un **bot Tilebot secondario** invocato dal bot padre tramite l'action `invoke_subagent` (`DirInvokeSubAgent`). Ogni invocazione crea un **run** isolato con:

- un `runId` univoco;
- un `subRequestId` dedicato (`automation-request-{projectId}-{runId}`);
- lo stato persistito in Redis (`tdcache`);
- un contesto `_tdSubAgent` propagato al sub-agent.

Il sub-agent esegue il proprio flusso come un bot autonomo. Quando ha finito (in modalità `wait_result`), restituisce il risultato al padre tramite l'action `return` (`DirReturn`), che usa lo stesso canale Redis pub/sub già impiegato da `DirWebResponse`.

```
┌─────────────────┐     invoke_subagent      ┌─────────────────┐
│   Bot padre     │ ───────────────────────► │   Sub-agent     │
│  (parent bot)   │   intent + input +       │  (altro bot)    │
│                 │   contesto _tdSubAgent   │                 │
│                 │ ◄─────────────────────── │                 │
│                 │   return (status/payload)│                 │
└─────────────────┘                          └─────────────────┘
        │                                            │
        │  wait_result: continua con trueIntent       │
        │  fire_and_continue: prosegue subito          │
        └────────────────────────────────────────────┘
```

### Componenti coinvolti

| Componente | Ruolo |
|------------|-------|
| `DirInvokeSubAgent` | Action `invoke_subagent`: avvia il run, dispatch al sub-bot, attende il return |
| `InternalSubAgentService` | Creazione/stato run, messaggi, parametri, contesto sub-agent |
| `DirReturn` | Action `return` nel sub-agent: pubblica il risultato verso il padre |
| `DirReply` / `DirReplyV2` | Le reply del sub-agent possono essere instradate al `parentRequestId` |

---

## Action `invoke_subagent`

**Tipo action:** `_tdActionType: "invoke_subagent"`  
**Directive:** `Directives.INVOKE_SUB_AGENT`  
**Implementazione:** `tybotRoute/tiledeskChatbotPlugs/directives/DirInvokeSubAgent.js`

### Parametri obbligatori

| Parametro | Alias | Descrizione |
|-----------|-------|-------------|
| `subagent_id` | `agentKey`, `agent`, `key` | ID del bot sub-agent da caricare tramite `botsDataSource` |
| `intentName` | — | Intent di ingresso del sub-agent (con o senza prefisso `/`) |

### Modalità di esecuzione (`mode`)

| Valore | Comportamento |
|--------|---------------|
| `fire_and_continue` | **Default.** Il bot padre prosegue subito con le action successive. Il sub-agent gira in background. |
| `wait_result` | Il flusso padre si **sospende** fino al `return` del sub-agent, al timeout o a un errore di dispatch. Alla fine riprende tramite `trueIntent` o `falseIntent`. |

**Alias legacy** (equivalenti a `wait_result`):

- `awaitWebhookPublish: true`
- `waitForResult: true`

In modalità `wait_result`, la callback di `execute` restituisce `true` per segnalare al motore che il blocco deve attendere.

### Input verso il sub-agent

| Parametro | Descrizione |
|-----------|-------------|
| `input` | Oggetto passato al sub-agent (preferito) |
| `payload` | Alias di `input` |

I valori supportano il **template filling** con i parametri della request corrente (`{{variabile}}`), tramite `InternalSubAgentService.fillValue`.

L'input viene incluso nel payload del messaggio di dispatch insieme al contesto `_tdSubAgent`:

```json
{
  "query": "valore risolto",
  "_tdSubAgent": {
    "runId": "abc123...",
    "parentRequestId": "support-group-...",
    "subRequestId": "automation-request-{projectId}-{runId}",
    "agentKey": "subagent_bot_id",
    "subagentId": "subagent_bot_id",
    "mode": "wait_result"
  }
}
```

### Timeout

| Parametro | Descrizione |
|-----------|-------------|
| `timeoutMs` / `timeout` | Timeout in millisecondi per l'attesa del return |

Priorità di risoluzione:

1. `action.timeoutMs` o `action.timeout`
2. `subBot.attributes.subAgentTimeoutMs`
3. Default: **120000 ms** (2 minuti)

Al timeout il run passa a stato `timeout`. In `wait_result`, il padre riceve l'evento di errore e può continuare con `falseIntent` / `onTimeoutIntent`.

> **Nota:** il timeout non è attualmente disabilitabile (`timeoutMs: 0` ricade sul default). Per task molto lunghi è prevista l'introduzione di `disableTimeout` — vedi [Timeout opzionale lato parent](#timeout-opzionale-lato-parent).

### Assegnazione parametri (bot padre)

Disponibili subito dopo l'avvio:

| Parametro | Contenuto assegnato |
|-----------|---------------------|
| `assignRunIdTo` | `runId` del run |
| `assignSubRequestIdTo` | `subRequestId` isolato |
| `assignStatusTo` | Stato iniziale (`running`) o `failed` in caso di errore immediato |

Disponibili al termine (modalità `wait_result`, o in caso di errore immediato):

| Parametro | Alias | Contenuto assegnato |
|-----------|-------|---------------------|
| `assignResultTo` | `assign_result_to` | `payload` del `return` (in caso di successo HTTP 2xx) |
| `assignErrorTo` | `assign_error_to` | Oggetto errore |
| `assignStatusTo` | `assign_status_to` | Stato terminale: `completed`, `failed`, `timeout` |
| `assignRunTo` | `assign_run_to` | Evento completo `{ status, output, error, parentRequestId, subRequestId, runId }` |

### Continuazione del flusso padre (`wait_result`)

Dopo il return (o timeout/errore), il padre viene riavviato su un intent dedicato:

| Esito | Parametri (in ordine di priorità) |
|-------|-----------------------------------|
| Successo (status HTTP 2xx) | `trueIntent`, `onCompletedIntent`, `onCompleteIntent`, `thenIntent` |
| Errore / timeout | `falseIntent`, `onFailedIntent`, `onTimeoutIntent` |

Nel payload della continuazione è disponibile `subAgentRun` con i dettagli dell'evento.

### Dispatch al sub-bot

| Parametro | Descrizione |
|-----------|-------------|
| `useExt: true` / `dispatchViaExt: true` | Usa `tilebotService.sendMessageToBot` invece di `executeBlock` |

Default: `executeBlock`.

---

## Esempio: bot padre

```json
{
  "_tdActionType": "invoke_subagent",
  "subagent_id": "subagent_bot_id",
  "intentName": "#0d9dd162-5882-4da0-a898-41d209652534",
  "mode": "wait_result",
  "trueIntent": "#SUCCESS",
  "falseIntent": "#FAILURE",
  "assignResultTo": "subagent_result",
  "input": {
    "userQuestion": "{{lastUserText}}"
  }
}
```

Intent di successo nel padre:

```json
{
  "_tdActionType": "reply",
  "attributes": {
    "commands": [{
      "type": "message",
      "message": {
        "type": "text",
        "text": "Risultato sub-agent: {{subagent_result}}"
      }
    }]
  }
}
```

Riferimento test: `tybotRoute/test/invoke-subagent_bot_parent.js`.

---

## Lato sub-agent

Il sub-agent è un bot Tilebot normale. All'avvio riceve il comando intent configurato in `intentName` e può leggere:

- i campi di `input` nel payload;
- il contesto `_tdSubAgent` (per correlare run, parent e sub-request).

### Restituire il risultato al padre: action `return`

Per completare un sub-agent invocato in `wait_result`, usare l'action `return` (`DirReturn`):

```json
{
  "_tdActionType": "return",
  "status": 200,
  "bodyType": "json",
  "payload": "{\n  \"success\": true,\n  \"data\": {{ result | json }}\n}"
}
```

`DirReturn` pubblica su Redis:

- **topic:** `/webhooks/{subRequestId}`
- **ready key:** chiave Redis usata anche da `DirWebResponse` (polling di backup ogni 25 ms)

Il padre considera **successo** uno status HTTP compreso tra 200 e 299; qualsiasi altro valore produce stato `failed`.

### Reply verso l'utente durante l'esecuzione

Mentre il sub-agent è in esecuzione, le action `reply` (`DirReply`, `DirReplyV2`) usano `InternalSubAgentService.resolveOutboundRequestId` per inviare i messaggi al **`parentRequestId`** invece che al `subRequestId` isolato. L'utente finale vede quindi le risposte del sub-agent nella conversazione del bot padre.

---

## Stati del run

Definiti in `INTERNAL_SUB_AGENT_STATUS` (`InternalSubAgentService`):

| Stato | Significato |
|-------|-------------|
| `started` | Run creato |
| `running` | Sub-agent in esecuzione |
| `progress` | Aggiornamento intermedio (riservato) |
| `completed` | Return ricevuto con successo |
| `failed` | Errore di dispatch, return con status non 2xx, o errore di parsing |
| `timeout` | Nessun return entro `timeoutMs` |

Lo stato è persistito in Redis con chiave:

```
tilebot:requests:{parentRequestId}:subagents:{runId}
```

TTL: almeno 24 ore, esteso in base al timeout configurato.

---

## Flusso dettagliato (`wait_result`)

1. Il padre esegue `invoke_subagent`.
2. `InternalSubAgentService.createRun` crea run e `subRequestId`.
3. I parametri di assegnazione immediata (`assignRunIdTo`, ecc.) vengono scritti in Redis.
4. `DirInvokeSubAgent` si iscrive al topic `/webhooks/{subRequestId}` e avvia il polling della ready key.
5. Il messaggio viene inviato al sub-bot con intent e payload.
6. Il sub-agent esegue il proprio flusso; eventuali `reply` vanno al padre.
7. Il sub-agent chiama `return` con status e payload.
8. Il padre riceve il return, aggiorna il run, assegna `assignResultTo` / `assignErrorTo`, e dispatcha `trueIntent` o `falseIntent`.

In caso di errore già alla fase di setup (bot non trovato, `intentName` mancante, ecc.), lo stato `failed` viene assegnato subito senza avviare il sub-agent.

---

## Architettura: perché `automation-request-` e non il `support-group-` del padre?

Il sub-agent **non** gira sulla stessa `request_id` della conversazione utente (`support-group-{projectId}-{uuid}`). Ogni run ottiene un `subRequestId` dedicato con prefisso `automation-request-{projectId}-{runId}` (vedi `InternalSubAgentService.buildSubRequestId`).

Questa non è una limitazione della piattaforma Tiledesk, ma una **scelta di isolamento** deliberata. Lo stesso prefisso è già usato per esecuzioni headless (es. `POST /block/...` in `index.js`): flussi bot senza conversazione live.

### Ruoli distinti

| Identificatore | Ruolo |
|----------------|-------|
| `support-group-...` (`parentRequestId`) | Identità della **conversazione** con l'utente |
| `automation-request-...` (`subRequestId`) | Identità di una **esecuzione delegata** del sub-agent |

### Motivazioni

| Motivo | Spiegazione |
|--------|-------------|
| **Namespace parametri** | Gli attributi di flusso vivono in `tilebot:requests:{requestId}:parameters`. Un `requestId` separato evita che `set_attribute`, `assign`, `webrequest` ecc. del sub-agent sovrascrivano le variabili del padre (e viceversa). |
| **Canale di return univoco** | `DirReturn` pubblica su `/webhooks/{requestId}`. Ogni run ha un topic dedicato; sul `support-group-` del padre non si distinguerebbero return di run concorrenti o di altre attese (webhook, ecc.). |
| **Stato di esecuzione isolato** | Lock intent, capture user reply e step counter (`checkStep`) sono scoped per `requestId`. Eseguire sul padre interferirebbe con il flusso sospeso in `wait_result`. |
| **Routing messaggi** | Il dispatch al sub-bot usa `recipient: subRequestId`. La conversazione utente resta sul `support-group-`; le `reply` del sub-agent vengono reindirizzate al padre tramite `resolveOutboundRequestId`. |
| **Run multipli** | Ogni invocazione ha un `runId` univoco. Sulla stessa `support-group-` non si potrebbero avere run paralleli indipendenti. |

### Cosa è già condiviso con il padre

Anche con namespace isolato, alcuni punti di contatto esistono già:

- **Input all'invocazione**: risolto dai parametri del padre (`allParameters` su `parentRequestId`).
- **Reply**: instradate al `parentRequestId` (`DirReply`, `DirReplyV2`).
- **Risultato finale** (`wait_result`): scritto sul padre via `assignParentResult` (`assignResultTo`, `assignErrorTo`, ecc.).

---

## Compatibilità action nel sub-agent

Le directive usano quasi tutte `context.requestId`, che nel sub-agent corrisponde all'`automation-request-`, non al `support-group-` del padre.

### Action non supportate (legate alla request Tiledesk)

Chiamano le API Tiledesk con `this.requestId`. Un `automation-request-` **non è una request di supporto** nel backend:

| Action | Problema |
|--------|----------|
| `close` | `closeRequest(subRequestId)` su request inesistente o errata |
| `agent` | `moveToAgent(subRequestId)` |
| `move_to_unassigned` | `updateRequestParticipants(subRequestId, ...)` |
| `department` | `updateRequestDepartment(subRequestId, ...)` |
| `add_tags`, `set_conversation_tags` | aggiornano tag sulla request Tiledesk |
| `replace_bot`, `replace_bot_v2`, `replace_bot_v3` | sostituiscono il bot sulla request |
| `remove_current_bot` | idem |
| `contact_update` | aggiorna lead/contatto legato alla request |
| `send_email`, `send_whatsapp`, `fire_tiledesk_event` | dipendono dal contesto conversazione/canale |
| `deflect_to_help_center` | richiede contesto conversazione |

### Action non supportate (mismatch con l'input utente)

| Action | Problema |
|--------|----------|
| `capture_user_reply` | lock su `subRequestId`; l'utente risponde sulla `support-group-` del padre |
| `form` / intent form | attende input su request sbagliata |
| `lock_intent`, `unlock_intent` | lock sul sub-request, messaggi utente sul parent |

### Action funzionanti ma con dati incompleti

| Action | Limitazione |
|--------|-------------|
| `ask_gpt`, `ask_gpt_v2`, `gpt_task`, `ai_condition` | il **transcript** è nel namespace del sub-agent; `updateConversationTranscript` in `DirReply` scrive lì, non sul padre |
| Attributi di contesto (`lastUserText`, lead, ticket, channel, ecc.) | popolati da `updateRequestAttributes` all'ingresso messaggio; sul sub-agent arriva solo ciò che è in `input` / `_tdSubAgent` |

### Action consigliate nel sub-agent

| Action | Note |
|--------|------|
| `webrequest`, `webrequestv2` | HTTP esterno |
| `code` | esecuzione JS |
| `set_attribute`, `set_attributev2`, `assign`, `delete` | sul namespace isolato del sub-agent |
| `condition`, `json_condition`, `if_open_hours`, `if_online_agents` | valutazione locale |
| `reply`, `reply_v2` | messaggio inviato al padre |
| `return` | meccanismo previsto per chiudere il run |
| `wait`, `intent`, `iteration`, `flow_log` | ok |
| `invoke_subagent` | sub-agent annidati |
| Integrazioni esterne (`make`, `hubspot`, `brevo`, `customerio`, `qapla`) | ok se non richiedono la request Tiledesk |

**Regola pratica:** progettare i sub-agent come flussi **compute-only** (HTTP, AI, logica) + `reply` per feedback utente + `return` per il risultato strutturato. Evitare action che modificano la request di supporto o attendono input dall'utente.

---

## Evoluzioni previste

Le sezioni seguenti documentano comportamenti **non ancora implementati**, ma considerati per sviluppi futuri. I flag e i parametri indicati sono proposte di design.

### `parameterScope` — condivisione spazio attributi

**Stato attuale:** gli attributi di flusso (Redis: `tilebot:requests:{requestId}:parameters`) sono **sempre isolati** sul `subRequestId`. Solo l'input iniziale legge dal padre; le scritture del sub-agent restano nel namespace proprio.

**Proposta:** flag sull'action `invoke_subagent`:

```json
{
  "_tdActionType": "invoke_subagent",
  "parameterScope": "isolated",
  "subagent_id": "subagent_bot_id",
  "intentName": "#MY_INTENT"
}
```

| Valore | Comportamento proposto |
|--------|------------------------|
| `isolated` | **Default (attuale).** Lettura/scrittura su `subRequestId`. |
| `parent` | Lettura e scrittura sul `parentRequestId` del padre. Il sub-agent vede e aggiorna direttamente `{{variabili}}` del padre. |
| `parent_readonly` *(opzionale)* | Lettura dal padre, scrittura sul namespace isolato. Compromesso per evitare collisioni in scrittura. |

**Implementazione prevista:**

- Introdurre `InternalSubAgentService.resolveParameterRequestId(context)` che, in base a `parameterScope` e `_tdSubAgent`, restituisce `parentRequestId` o `subRequestId`.
- Applicare la risoluzione in modo **centralizzato** (es. `TiledeskChatbot.addParameterStatic`, `allParametersStatic`), non in ogni directive singola.
- Propagare `parameterScope` nel contesto `_tdSubAgent` per le invocazioni annidate.

**Trade-off:**

| Pro | Contro |
|-----|--------|
| Il sub-agent accede subito alle variabili del padre | Collisioni di nomi tra padre e sub-agent |
| Meno bisogno di passare tutto via `input` / `assignResultTo` | Run concorrenti sullo stesso padre si sovrascrivono a vicenda |
| Allineamento con attributi visibili in dashboard | Lock, transcript e step counter resterebbero separati senza ulteriori estensioni |

### Timeout opzionale lato parent

**Stato attuale:** il timeout **non è disabilitabile**. In `InternalSubAgentService.timeoutMs`, valori `0`, `null` o non validi ricadono sul default di **120000 ms** (2 minuti). `#scheduleTimeout` in `DirInvokeSubAgent` parte sempre; allo scadere il run passa a `timeout` e il padre continua con `falseIntent` / `onTimeoutIntent`.

**Proposta:** consentire attese illimitate per sub-agent con task lunghi:

```json
{
  "_tdActionType": "invoke_subagent",
  "mode": "wait_result",
  "disableTimeout": true,
  "subagent_id": "subagent_bot_id",
  "intentName": "#LONG_TASK"
}
```

Oppure interpretare `timeoutMs: 0` come assenza di timeout (oggi **non** supportato).

**Implementazione prevista:**

1. `timeoutMs`: se `disableTimeout === true` o `timeoutMs === 0` → nessun timer lato parent.
2. `#scheduleTimeout`: non schedulare `setTimeout` se il timeout è disabilitato.
3. In `wait_result`: restare in attesa su pub/sub + polling fino al `return`, senza limite temporale.
4. **TTL Redis del run**: usare un valore alto fisso (es. 7 giorni) quando il timeout è disabilitato, per evitare che lo stato del run scada prima del completamento.

**Nota su `MAX_EXECUTION_TIME`:** il limite globale del chatbot (default 8 ore, configurabile via `CHATBOT_MAX_EXECUTION_TIME`) conta gli step del flusso attivo su una request. Il padre in `wait_result` è fermo (`callback(true)` → `theend()` in `DirectivesChatbotPlug`) e **non consuma step** mentre attende; il vincolo rilevante per task lunghi è oggi il timeout del sub-agent (120 s), non il `MAX_EXECUTION_TIME` del padre.

### Esecuzione sul `support-group-` del padre *(non prevista)*

Far girare il sub-agent direttamente sul `parentRequestId` comporterebbe i problemi elencati in [Architettura](#architettura-perché-automation-request--e-non-il-support-group-del-padre). Non è prevista come alternativa a `automation-request-`; eventuali esigenze di condivisione stato vanno affrontate tramite `parameterScope` e/o passaggio esplicito di `input` / `assignResultTo`.

---

## Requisiti e limitazioni

- **`tdcache` (Redis)** obbligatorio: senza cache l'invocazione fallisce.
- **`botsDataSource`** obbligatorio sul chatbot padre per caricare il sub-bot.
- Il sub-agent deve essere un bot registrato e raggiungibile tramite `getBotByIdCache(subagent_id)`.
- In `fire_and_continue`, errori di dispatch aggiornano il run ma **non** bloccano il flusso padre; `assignErrorTo` viene valorizzato solo in quel caso se configurato.
- I parametri request hanno un limite di ~20 MB per singolo valore (`addParameter`).
- Gli attributi di flusso del sub-agent sono **isolati** sul `subRequestId`; vedi [Compatibilità action](#compatibilità-action-nel-sub-agent) e [Evoluzioni previste](#evoluzioni-previste).

---

## File di riferimento

| File | Contenuto |
|------|-----------|
| `tiledeskChatbotPlugs/directives/DirInvokeSubAgent.js` | Implementazione action `invoke_subagent` |
| `services/InternalSubAgentService.js` | Logica condivisa run, messaggi, parametri |
| `tiledeskChatbotPlugs/directives/DirReturn.js` | Return dal sub-agent al padre |
| `tiledeskChatbotPlugs/directives/DirReply.js` | Routing reply verso il padre |
| `tiledeskChatbotPlugs/directives/DirReplyV2.js` | Routing reply verso il padre (v2) |
| `test/invoke-subagent_bot_parent.js` | Esempio flusso padre |
| `test/invoke-subagent_bot_sub.js` | Esempio flusso sub-agent con `return` |
| `test/internal-sub-agents_test.js` | Test unitari servizio e dispatch |

---

## Test

```bash
cd tybotRoute
npm test -- --grep "Subagent"
npm test -- --grep "Internal Sub-Agents"
```
