# Migrazione runtime V3 → V4 — stato

> Motore di esecuzione per i chatbot **Design Studio V4** (modello a `nodes`).
> Vive interamente in questa cartella `tybotRoute/V4/`. Il percorso V3 del runtime
> resta **invariato**: in `index.js` un guard rileva i bot V4 (presenza di `nodes`)
> e instrada qui.

## Principi

1. **V3 intatto**: nessun file V3 modificato, solo il dispatcher nel guard di `index.js`.
2. **Rilevamento V4** = presenza di documenti nella collection `nodes` per quel bot
   (`models/node.js`).
3. **Output identico al widget**: l'engine invia i messaggi via `ExtApi`
   (stesso endpoint del V3), nello stesso formato che il widget renderizza.
4. **Topologia**: gli archi del grafo vivono in `node.slots[].nextNode`
   (key `direct` per il forward singolo). I connettori visuali sono solo override.
5. **Stato conversazione**: namespace Redis dedicato `tilebotv4:` (non tocca lo stato V3).

## Shape reale di un node V4 (dal backend)

```json
{
  "id": "153e448d",
  "type": "reply",
  "name": "untitled_node_1",
  "data": { "messages": [ { "text": "messaggio 1", "delayMs": 3000, "buttons": { "ui": [...] }, "when": "..." } ] },
  "slots": [ { "id": "5cfc8c3c", "key": "direct", "nextNode": "<idNodoSuccessivo>" } ],
  "position": { "x": 0, "y": 0 },
  "id_faq_kb": "...", "id_project": "...", "_persistence": { ... }
}
```

- `start` / `close` / `defaultFallback`: `data: null`; navigazione via `slots`.
- `reply`: `data.messages[]`; `slots` (vuoti = nodo terminale, attende input).

## File in questa cartella

| File | Ruolo |
|---|---|
| `NodesDataSource-V4.js` | Legge i nodi del bot (Mongo) + helper (start node, find by id, slot `direct`). |
| `state-V4.js` | Stato conversazione su Redis (`tilebotv4:state:<requestId>`). |
| `MessageSender-V4.js` | Invio messaggi al widget (riusa `ExtApi`) + delay + mapping bottoni. |
| `TiledeskChatbot-V4.js` | Orchestratore: walk del grafo, esecuzione nodi, invio. |
| `nodes/start-V4.js` | Handler node `start`. |
| `nodes/reply-V4.js` | Handler node `reply`. |
| `nodes/close-V4.js` | Handler node `close`. |
| `nodes/defaultFallback-V4.js` | Handler node `defaultFallback`. |

## Stato actions/nodi

Legenda: ✅ fatto · 🚧 in corso · ⬜ da fare · ⛔ fallback halt (non ancora supportato)

| Node type | Stato | Note |
|---|---|---|
| `start` | ✅ | Entrypoint su `\start`; naviga allo slot `direct`. `nodes/start-V4.js`. |
| `reply` | ✅ | `data.messages[]` → testo + delay; bottoni base. `nodes/reply-V4.js`. |
| `replyv2` | ✅ | Come `reply` + slot `no_match` (input non riconosciuto) e `no_input` (timeout `noInputTimeout` ms, timer in-process con controllo `USER_INPUT`). `nodes/replyv2-V4.js`. |
| `close` | ✅ | Termina la conversazione (azzera lo stato). `nodes/close-V4.js`. |
| `defaultFallback` | ✅ | Eseguito su input non riconosciuto; naviga allo slot `direct`. `nodes/defaultFallback-V4.js`. |
| `ai_prompt` | ⛔ | Fase successiva. |
| `rag_query` / KB | ⛔ | Fase successiva. |
| `condition` / `jsoncondition` | ⛔ | Branching `when` DSL — fase successiva. |
| `web_request` | ⛔ | Fase successiva. |
| altri (capture, iteration, ecc.) | ⛔ | Vedi `docs/missing-actions-roadmap.md` del design-studio. |

**Fallback sicuro**: un node `type` non gestito → l'engine logga e invia un messaggio
di "non supportato" (non crasha, non esegue logica V3).

## Limitazioni note MVP (da rifinire)

- ✅ Variabili `{{...}}` nel testo: risolte via `Filler` (LiquidJS). Context =
  `allParametersStatic` (Redis) + `chatbot_id`/`chatbot_name`/`conversation_id`.
- ✅ Bottoni: render OK. Shape reale dal DS = `message.buttons: [{ id, type, label }]`
  (array piatto, testo in `label`) → mappato a `attachment.buttons: [{ type, value }]`.
  `mapButtons` gestisce anche la shape `{active, ui, json}`.
- ✅ Bottoni — ROUTING: il target del click vive in `node.slots` (key `button`,
  `slot.id == button.id` → `nextNode`). `MessageSender-V4.mapButtons` popola `action`
  (=`#<nextNode>`) e `show_echo:true` sui bottoni `action` — il widget richiede `action`
  non vuoto per emettere il click.
  - Bottoni **`action`**: instradati in modo AFFIDABILE dal target esplicito che il widget
    rimanda in `message.attributes.action` (`"#<nodeId>"`) → `resolveEntryNode` fa strip `#`
    + `byId`. Indipendente dallo stato (funziona anche con awaitingButtons stale/dopo resume).
  - Bottoni **`text`** con slot: match su `awaitingButtons` (stato salvato) per `value/label`.
  - Bottoni senza connettore → defaultFallback (corretto).
- ✅ `directNext`: solo lo slot `direct` è forward automatico (niente fallback a `slots[0]`):
  un reply con soli slot `button` si FERMA e attende il click.
- NB widget: i bottoni `url` per design del widget non collassavano mai (manca la guardia
  `isLastMessage` su `message-attachment.component.html` riga 17, presente su text/action).
  Patchato il widget per aggiungere `&& isLastMessage === true` anche all'url → ora collassano
  come gli altri. (Deviazione dal default Tiledesk, dove i link restano persistenti.)
- ✅ `when` (condition DSL) sui messaggi: valutato da `when-eval-V4.js` (parser DSL
  mirror di `when-parser.ts` del DS) che riusa `TiledeskExpression` per la semantica
  operatori (==, !=, >, contains, isEmpty, AND/OR, ...) identica al V3. Messaggio
  nascosto se `when` è falso; vuoto/assente = sempre mostrato; errore parse/eval =
  mostrato (fail-safe). Provato e2e (vero→mostra, falso→nasconde).
- ✅ Messaggi vuoti (`{text:""}`) senza bottoni: saltati.
- ✅ Media (immagini / iframe / redirect / gallery): messaggio
  `{ type, text, metadata:{src,...}, galleries? }` → `buildMessageBody` usa il `type` reale e
  inoltra `metadata`/cards (fill `{{var}}`). Il widget renderizza `type=='image'`,
  `type=='frame'`, `type=='redirect'`, `type=='gallery'`.
  - **Type mapping** (`NODE_TYPE_TO_MSG_TYPE`): il DS usa `type:'iframe'`, ma il widget
    rende il frame solo con `type:'frame'` (`utils-message.isFrame`) → il runtime mappa
    `iframe → frame`. `redirect` già riconosciuto. Altri type coincidono.
  - **Gallery**: `galleries[]` → `attributes.attachment.gallery[]` (card: `preview.src`,
    `title`, `description`, `buttons`); il widget la rende come carousel (`isCarousel`).
- 📖 **Documentazione action**: vedi `ACTIONS-REFERENCE.md` (JSON nodo + JSON costruito +
  spiegazione + casi d'uso per start/defaultFallback/close/reply×5 tipi). Base per la doc futura.
- ✅ Idle-ack (no chat "in attesa"): se un turno NON produce alcun messaggio visibile
  (nodo reply vuoto, ramo terminale, close senza contenuto), il motore invia un messaggio
  nascosto `{ type:'text', text:'', attributes:{subtype:'info'} }`. Il server NON pubblica
  typing per i `subtype:'info'` e il widget, ricevendo un messaggio, **spegne l'indicatore
  "sta scrivendo"** (lo rende come nota di servizio, non come bolla del bot). Conteggio in
  `MessageSenderV4.sentCount` / `hasSent()`; invio in `TiledeskChatbot-V4.reply()` dopo il walk.
- Delay: `sleep(delayMs)` lato engine.
- ✅ Reply multi-messaggio + interazione concorrente ("turn token"):
  - Ogni turno (`reply()`) scrive un token univoco in Redis (`state-V4.setTurn`).
  - `MessageSender-V4.sendV4Messages`, dopo il delay e prima di ogni messaggio, verifica
    `isStaleTurn()`: se è iniziato un nuovo turno (es. click su un bottone durante
    l'attesa) → **annulla i messaggi rimanenti** del reply (Caso A). Verificato e2e.
  - Se NON si clicca nulla, il messaggio successivo esce e il widget nasconde i bottoni
    del precedente via `isLastMessage` (Caso B, già gestito lato widget).

## Diagnostica
- Log `verbose` nell'engine: `entry: START|bottone|input non riconosciuto → ...` e
  `visito nodo: <type> (<id>)`. Avviare il runtime con `LOG_LEVEL=verbose node index.js`.
- defaultFallback verificato e2e: input/bottone senza slot → `defaultFallback` → suo slot
  `direct`. Se il nodo target è vuoto (`data:null`) non viene inviato nulla (atteso):
  mettere il messaggio di fallback nel reply collegato al defaultFallback.

## Changelog
- (init) scaffold cartella V4 + handler start/reply/close/defaultFallback.
- Dispatcher in `index.js`: `dispatchIfV4` (rileva nodes → motore V4). V3 invariato.
- Test logico OK su nodi reali di caf4b: `\start → reply "messaggio 1" → STOP`;
  `input non riconosciuto → defaultFallback → close`.
- ✅ Test e2e OK: con runtime riavviato, `\start` sul bot caf4b → il bot risponde
  con il testo del node V4 ("V4 reply text 1"), sender = bot. Confermato che il
  dispatch V4 funziona e il V3 non viene più eseguito per i bot con `nodes`.
- NB operativo: `node index.js` NON si auto-ricarica → dopo ogni modifica al codice
  V4 il runtime va riavviato (valutare `nodemon` per il dev).
- FIX comando di start: il server in autostart (widget) manda al bot **`/start`** (slash),
  non `\start` (backslash) — vedi server `pubmodules/trigger/rulesTrigger.js:727` e
  `event/botEvent.js:51` (accetta entrambi). Il motore V4 ora riconosce ENTRAMBI via
  `START_COMMANDS = ['\\start', '/start']` (`TiledeskChatbot-V4.js`). Prima, con `/start`
  cadeva su `defaultFallback → close` (muto) → widget senza risposta. Verificato: `/start`
  → "V4 reply text 1".
- NB debug: i log del motore V4 sono a livello `verbose`; con `LOG_LEVEL=info` (default)
  NON sono visibili in `/tmp/chatbot-v4-runtime.log`. Per debug avviare con `LOG_LEVEL=verbose`.
