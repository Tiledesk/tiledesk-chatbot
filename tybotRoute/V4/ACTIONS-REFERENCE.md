# Action del motore runtime V4 — riferimento e documentazione

> File di riepilogo delle **action (nodi)** elaborate dal motore di esecuzione V4
> (`tybotRoute/V4/`). Per ogni action: **JSON del nodo** (come lo produce il Design
> Studio e lo salva il backend), **JSON costruito/inviato** dal runtime al widget,
> spiegazione di tutto ciò che fa, casi d'uso.
>
> Pensato come **base per la documentazione futura**. Riferimento prodotto:
> https://guide.tiledesk.com/ai-chatbots-and-automation/actions-explained
>
> ⚠️ La struttura dei JSON è stata verificata sul backend reale e via test e2e.

---

## 0. Modello dei dati e flusso di esecuzione

Un chatbot V4 è un **grafo di nodi** salvati nella collection Mongo `nodes`. Ogni nodo:

```jsonc
{
  "id": "153e448d",          // id sintetico stabile (hash 8 char)
  "type": "reply",           // tipo di action (start | reply | defaultFallback | close | ...)
  "name": "untitled_node_1", // nome leggibile (display)
  "data": { /* payload type-specifico, oppure null */ },
  "slots": [                 // uscite del nodo (topologia / connettori)
    { "id": "5cfc8c3c", "key": "direct", "nextNode": "153e448d" }
  ],
  "position": { "x": 0, "y": 0 },
  "id_project": "…", "id_faq_kb": "…",   // foreign key
  "_persistence": { "_id": "…", "createdAt": "…", "__v": 0 }  // cruft backend
}
```

**Come gira il motore** (`TiledeskChatbot-V4.js`):
1. Il server inoltra al webhook del bot (`/ext/:botid`) ogni messaggio utente.
2. Il dispatcher (`index.js → dispatchIfV4`) instrada al motore V4 se il bot ha `nodes`.
3. Il motore risolve il **nodo di ingresso** (`resolveEntryNode`):
   - testo `\start` **o** `/start` → nodo `start` (il server in autostart manda `/start`);
   - messaggio con `attributes.action` (bottone *action*) → nodo target esplicito;
   - testo che combacia con un bottone *text* in attesa → nodo collegato;
   - altrimenti → `defaultFallback`.
4. Poi **cammina il grafo** (`walk`) eseguendo gli handler dei nodi finché un nodo
   si ferma (attesa input) o chiude. I messaggi vengono inviati al widget con
   `MessageSender-V4.js` (stesso endpoint del runtime V3).

---

## 1. Concetti comuni (validi per tutte le action)

### 1.1 Slot e connettori
La topologia vive nei `slots` del nodo:
- **`key: "direct"`** → forward automatico: dopo l'esecuzione il motore prosegue su `nextNode`.
- **`key: "button"`** → uscita di un bottone: `slot.id == button.id`, `nextNode` = nodo target del click.
- Un nodo con **soli** slot `button` (nessun `direct`) **si ferma e attende** il click.
- Nessuno slot → nodo **terminale** (attende input / fine ramo).

### 1.2 Bottoni (su reply e su card gallery)
Shape nel nodo: `{ "id", "type", "label", "link?", "target?" }`. Tre tipi:

| type | Cosa fa | Routing |
|---|---|---|
| `text` | Invia `label` come messaggio utente (echo) | Slot `button` con `id == button.id` → match testuale su `label` |
| `url` | Apre un link esterno (`link`, `target`) | Nessuno (apre l'URL, non instrada) |
| `action` | Passa a un altro nodo del flow | Slot `button` → il runtime mette il target in `attributes.action` (`"#<nodeId>"`) |

Output costruito per il widget (`mapButtons`): `{ "type", "value": <label>, "link?", "target?", "action?": "#<nodeId>", "show_echo?": true }`.
- Il widget richiede `action` non vuoto per emettere il click dei bottoni `action`.
- `show_echo: true` rende l'echo del click un messaggio utente normale (non di servizio).

### 1.3 Variabili `{{ ... }}`
Testo, `metadata.src/name`, titoli/descrizioni gallery passano dal **Filler (LiquidJS)**.
Context disponibile: variabili della request in Redis + le standard
`chatbot_id`, `chatbot_name`, `conversation_id`.
Esempio: `"Ciao da {{chatbot_name}}"` → `"Ciao da Test Chatbot"`.

### 1.4 Filtro `when` (condizione di visibilità del messaggio)
Stringa DSL opzionale sul messaggio: se **falsa**, il messaggio non viene inviato.
Grammatica: `<var> <op> <valore>` con `AND`/`OR`. Operatori: `==`, `!=`, `>`, `>=`,
`<`, `<=`, `contains`, `startsWith`, `endsWith`, `isEmpty`, `isNull`, `isUndefined`.
Es.: `"chatbot_id != '000000'"`. Vuoto/assente = sempre mostrato. Semantica identica al V3
(riusa `TiledeskExpression`).

### 1.5 Delay e annullamento (`delayMs` + turn token)
- `delayMs` (default 0): attesa **prima** di inviare il messaggio (effetto "sta scrivendo").
- **Turn token**: se durante l'attesa tra i messaggi di un reply l'utente **clicca un
  bottone** (nuovo turno), il motore **annulla i messaggi rimanenti** del reply e segue
  il connettore del bottone. Se non clicca nulla, i messaggi escono e il widget nasconde i
  bottoni del messaggio precedente (`isLastMessage`).

### 1.6 Mapping dei `type` verso il protocollo widget
Il runtime traduce alcuni `type` del nodo nel `type` del protocollo messaggi del widget:

| `type` nodo V4 | `type` messaggio widget |
|---|---|
| `text`, `image`, `redirect`, `gallery` | invariato |
| `iframe` | **`frame`** (il widget rende il frame solo con `type:'frame'`) |

---

## 2. Action: `start`

**Cosa fa.** È l'**ingresso** del flow. Viene eseguita all'apertura della conversazione,
quando arriva il comando di start (`\start` o `/start`). Non produce output: naviga
immediatamente allo slot `direct`.

**JSON nodo**
```json
{
  "id": "01000001",
  "type": "start",
  "name": "start",
  "data": null,
  "slots": [ { "id": "5cfc8c3c", "key": "direct", "nextNode": "153e448d" } ]
}
```

**JSON costruito/inviato.** *Nessuno* — `start` non invia messaggi, prosegue su `nextNode`.

**Note / casi d'uso.**
- Punto di partenza obbligatorio: da qui parte il "messaggio di benvenuto" (di solito un `reply`).
- Il motore azzera lo stato della conversazione quando riceve un comando di start
  (ripartenza pulita).

---

## 3. Action: `defaultFallback`

**Cosa fa.** Ramo di **fallback** eseguito quando l'input utente **non è riconosciuto**
(non è un comando di start, non combacia con un bottone in attesa). Se ha `data.messages`,
li invia (come un reply); poi naviga allo slot `direct`.

**JSON nodo** (forma tipica "router": nessun messaggio proprio, instrada a un reply)
```json
{
  "id": "05000005",
  "type": "defaultFallback",
  "name": "defaultFallback",
  "data": null,
  "slots": [ { "id": "12345678", "key": "direct", "nextNode": "84cb363f" } ]
}
```

**JSON costruito/inviato.** Se `data.messages` è valorizzato, gli stessi messaggi del
`reply` (vedi §5). Se `data` è `null`, **nessun output**: naviga al nodo collegato (es. un
reply "Non ho capito" o un `close`).

**Note / casi d'uso.**
- Tipicamente collegato a un `reply` con un messaggio tipo *"Non ho capito, riprova"*,
  oppure a un nodo AI (Ask KB) per rispondere comunque.
- Se il nodo target è **vuoto**, l'utente non vede nulla: mettere il messaggio nel reply
  collegato.

---

## 4. Action: `close`

**Cosa fa.** **Chiude** il ramo di conversazione: il motore azzera lo stato V4 e si ferma.
Non invia messaggi e non prosegue.

**JSON nodo**
```json
{
  "id": "5df2caf0",
  "type": "close",
  "name": "untitled_node_2",
  "data": null,
  "slots": []
}
```

**JSON costruito/inviato.** *Nessuno*. Termina il flusso e pulisce lo stato del turno.

**Note / casi d'uso.**
- Fine naturale di un percorso (es. dopo aver dato l'informazione richiesta).
- NB: chiude il **flusso del bot**, non archivia la conversazione lato server.

---

## 5. Action: `reply`

**Cosa fa.** È l'action che **parla** all'utente. Contiene un array `data.messages[]`:
ogni messaggio viene inviato in sequenza (rispettando `delayMs` e `when`). Un messaggio può
essere di 5 tipi: **testo, immagine, iframe, redirect, gallery**. Può portare bottoni e,
se ha slot `direct`, prosegue; altrimenti si ferma in attesa del click/input.

**Struttura generale del nodo**
```jsonc
{
  "id": "153e448d",
  "type": "reply",
  "name": "untitled_node_1",
  "data": { "messages": [ /* uno o più Message, vedi sotto */ ] },
  "slots": [
    { "id": "d5978690", "key": "button", "nextNode": "c84bbfc3" }  // uscita di un bottone action
    // eventuale { "id": "...", "key": "direct", "nextNode": "..." } per il forward automatico
  ]
}
```

Campi comuni di un `Message`: `text`, `delayMs?`, `when?`, `buttons?`, `type?`, `metadata?`, `galleries?`.

### 5.1 Reply — **testo**

**JSON nodo (message)**
```json
{
  "type": "text",
  "text": "V4 reply text 😍\n{{chatbot_id}} - {{chatbot_name}} - {{conversation_id}}",
  "delayMs": 0,
  "when": "chatbot_id != '000000'",
  "buttons": [
    { "id": "d5978690", "type": "action", "label": "Pulsante 1 action" },
    { "id": "ec228bf7", "type": "text",   "label": "Pulsante 2 testo" },
    { "id": "572169be", "type": "url",    "label": "Pulsante 3 url", "link": "www.tiledesk.com", "target": "blank" }
  ]
}
```
(`type` può essere omesso ≡ `text`.)

**JSON costruito/inviato al widget**
```json
{
  "text": "V4 reply text 😍\n69f1ccba… - Test Chatbot - support-group-…",
  "type": "text",
  "senderFullname": "Test Chatbot",
  "attributes": {
    "attachment": {
      "type": "template",
      "buttons": [
        { "type": "action", "value": "Pulsante 1 action", "action": "#c84bbfc3", "show_echo": true },
        { "type": "text",   "value": "Pulsante 2 testo" },
        { "type": "url",    "value": "Pulsante 3 url", "link": "www.tiledesk.com", "target": "blank" }
      ]
    }
  }
}
```
Senza bottoni, `attributes` viene omesso (solo `text` + `type`).

**Casi d'uso.** Messaggio di benvenuto, domande con opzioni a bottone, risposte testuali,
messaggi multipli "a step" con `delayMs`, varianti condizionali con `when`.

### 5.2 Reply — **immagine**

**JSON nodo (message)**
```json
{
  "type": "image",
  "text": "casa di campagna",
  "metadata": { "src": "https://…/trullo-salentino.jpg" },
  "buttons": [ { "id": "a883e434", "type": "action", "label": "Pulsante" } ],
  "delayMs": 4000
}
```

**JSON costruito/inviato**
```json
{
  "text": "casa di campagna",
  "type": "image",
  "senderFullname": "Test Chatbot",
  "metadata": { "src": "https://…/trullo-salentino.jpg" },
  "attributes": { "attachment": { "type": "template", "buttons": [ { "type": "action", "value": "Pulsante", "action": "#…", "show_echo": true } ] } }
}
```
Il widget rende l'immagine da `type:'image'` + `metadata.src` (caption = `text`). `metadata.src`/`name`
passano dal Filler (`{{var}}` risolte).

**Casi d'uso.** Mostrare foto prodotto, schede visive, anteprime, con eventuali bottoni di scelta.

### 5.3 Reply — **iframe**

**JSON nodo (message)**
```json
{
  "type": "iframe",
  "text": "descrizione iframe",
  "metadata": { "src": "http://www.tiledesk.com", "height": 400 }
}
```

**JSON costruito/inviato** (⚠️ `type` rimappato `iframe → frame`)
```json
{
  "text": "descrizione iframe",
  "type": "frame",
  "senderFullname": "Test Chatbot",
  "metadata": { "src": "http://www.tiledesk.com", "height": 400 }
}
```
Il widget rende il frame solo con `type:'frame'` + `metadata.src` (`utils-message.isFrame`).

**Casi d'uso.** Incorporare una pagina/web app (form esterno, mappa, calendario, configuratore)
direttamente nella chat.

### 5.4 Reply — **redirect**

**JSON nodo (message)**
```json
{
  "type": "redirect",
  "text": "",
  "metadata": { "src": "http://www.tiledesk.com?var={{userFullname}}", "target": "blank" }
}
```

**JSON costruito/inviato**
```json
{
  "text": "",
  "type": "redirect",
  "senderFullname": "Test Chatbot",
  "metadata": { "src": "http://www.tiledesk.com?var=…", "target": "blank" }
}
```
Il widget riconosce `type:'redirect'` e **apre/redirige** all'URL (`metadata.src`,
`target` = `blank`/`self`/`parent`) appena ricevuto. `src` passa dal Filler.

**Casi d'uso.** Reindirizzare a una pagina (checkout, login, pagina prodotto) con parametri
dinamici presi dalle variabili di conversazione.

### 5.5 Reply — **gallery** (carousel)

**JSON nodo (message)** — le card vivono in `galleries[]`; i bottoni di ogni card stanno
in `galleries[i].buttons` (non in `Message.buttons`):
```json
{
  "type": "gallery",
  "text": "le nostre case",
  "galleries": [
    {
      "preview": { "src": "https://…/1.jpg" },
      "title": "Casa 1 {{chatbot_name}}",
      "description": "in campagna",
      "buttons": [
        { "id": "b1", "type": "url",    "label": "Sito",   "link": "https://x", "target": "blank" },
        { "id": "b2", "type": "action", "label": "Scegli" }
      ]
    },
    { "preview": { "src": "" }, "title": "Casa 2", "description": "al mare", "buttons": [] }
  ]
}
```

**JSON costruito/inviato** (carousel del widget: `type:'gallery'` + `attributes.attachment.gallery[]`)
```json
{
  "text": "le nostre case",
  "type": "gallery",
  "senderFullname": "Test Chatbot",
  "attributes": {
    "attachment": {
      "gallery": [
        {
          "preview": { "src": "https://…/1.jpg" },
          "title": "Casa 1 Test Chatbot",
          "description": "in campagna",
          "buttons": [
            { "type": "url",    "value": "Sito",   "link": "https://x", "target": "blank" },
            { "type": "action", "value": "Scegli", "action": "#node_target", "show_echo": true }
          ]
        },
        { "preview": { "src": "" }, "title": "Casa 2", "description": "al mare", "buttons": [] }
      ]
    }
  }
}
```
Ogni card: `preview.src` (immagine), `title`, `description`, `buttons[]` (mappati come i bottoni reply).
Il widget rende il carousel con `utils-message.isCarousel` (`type:'gallery'` + `attachment.gallery`).

**Casi d'uso.** Catalogo prodotti/servizi scorrevole, scelta tra più opzioni con immagine,
liste di risultati (es. immobili, articoli) con bottoni per card.

---

## 5b. Action: `replyv2` (Reply avanzato)

**Cosa fa.** È un `reply` (stessi `data.messages[]` con testo/media/bottoni) **che attende
l'input dell'utente**, con due uscite di gestione in più negli `slots`:
- **`no_match`** → l'utente risponde ma l'input **non combacia** con nessun bottone connesso;
- **`no_input`** → l'utente **non risponde** entro `data.noInputTimeout` ms.

I bottoni connessi instradano dai loro slot `button` (come nel reply). Il nodo **non**
prosegue da solo (niente `direct`): si ferma sempre in attesa.

**JSON nodo**
```json
{
  "id": "7fe94305",
  "type": "replyv2",
  "name": "untitled_node",
  "data": {
    "messages": [
      { "text": "reply 2", "buttons": [
        { "id": "441b0fa4", "type": "text", "label": "Pulsante" },
        { "id": "a86b88ec", "type": "text", "label": "Pulsante" }
      ] }
    ],
    "noInputTimeout": 10000
  },
  "slots": [
    { "id": "fb4d1fde", "key": "no_input", "nextNode": "5b070b2a" },
    { "id": "d30350d1", "key": "no_match", "nextNode": "84cb363f" }
    // + eventuali { "key": "button", "id": "<buttonId>", "nextNode": "..." } per i bottoni connessi
  ]
}
```

**JSON costruito/inviato.** Identico al `reply` (stesso `MessageSenderV4`): i messaggi
(testo/media/bottoni) vengono inviati così come documentato in §5. Le uscite
`no_match`/`no_input` non producono output proprio: instradano ad altri nodi.

**Comportamento a runtime.**
1. Invia i messaggi e **si ferma** salvando lo stato (bottoni in attesa + `noMatchNode`).
2. **no_input**: setta una variabile di controllo `USER_INPUT` e schedula un `setTimeout`
   di `noInputTimeout` ms. Allo scadere, se l'utente non ha risposto (la variabile è
   ancora la stessa) → esegue il nodo `no_input`. Su ogni nuovo input la variabile viene
   azzerata → il timer non scatta. (Timer in-process, perso al restart — come il V3.)
3. **no_match**: al prossimo input, se non combacia con un bottone in attesa → esegue il
   nodo `no_match` (al posto del `defaultFallback` globale).

**Casi d'uso.** Domande con risposta attesa (scelta, conferma) dove serve gestire
esplicitamente "non ho capito" (`no_match`) e "l'utente è inattivo" (`no_input`, es.
sollecito o chiusura automatica).

---

## 6. Stato di implementazione

| Action / tipo | Stato nel motore V4 |
|---|---|
| `start` | ✅ |
| `defaultFallback` | ✅ |
| `close` | ✅ |
| `reply` — testo | ✅ |
| `reply` — immagine | ✅ |
| `reply` — iframe (`→ frame`) | ✅ |
| `reply` — redirect | ✅ |
| `reply` — gallery | ✅ |
| `replyv2` (Reply avanzato: + `no_match` / `no_input`) | ✅ |
| altri (`ai_prompt`, `web_request`, `condition`, ecc.) | ⬜ da fare (fallback sicuro: messaggio "tipo non supportato") |

> Tipi di nodo non ancora migrati: il motore non crasha, logga e invia un messaggio
> "tipo di nodo non ancora supportato". Vedi `MIGRATION-STATUS.md` per il dettaglio.

---

## 7. File del motore (dove sta cosa)

| File | Ruolo |
|---|---|
| `TiledeskChatbot-V4.js` | Orchestratore: entry node, walk del grafo, turn token. |
| `NodesDataSource-V4.js` | Lettura nodi + helper navigazione (slot `direct`/`button`). |
| `MessageSender-V4.js` | **Costruzione del JSON inviato** (testo/media/iframe/redirect/gallery, bottoni, fill `{{}}`, type mapping) + invio. |
| `when-eval-V4.js` | Valutazione del filtro `when` (DSL). |
| `state-V4.js` | Stato conversazione + turn token (Redis, namespace `tilebotv4:`). |
| `nodes/start-V4.js`, `reply-V4.js`, `close-V4.js`, `defaultFallback-V4.js` | Handler per tipo di nodo. |
