const { ExtApi } = require('../ExtApi.js');
const { Filler } = require('../tiledeskChatbotPlugs/Filler.js');
const { evaluateWhen } = require('./when-eval-V4.js');
const stateV4 = require('./state-V4.js');
const winston = require('../utils/winston');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Cap di sicurezza al delay per non bloccare il flow su valori anomali.
const MAX_DELAY_MS = 10000;

/**
 * Gap minimo (ms) fra DUE invii consecutivi di messaggi nello stesso turno.
 *
 * Perché serve: il web widget ordina i messaggi della conversazione per
 * `timestamp` (chat21) con un sort STABILE, inserendo i nuovi in testa
 * (`mqtt-conversation-handler.addReplaceMessageInArray`). Se due messaggi
 * back-to-back ricevono lo STESSO timestamp (collisione sul millisecondo),
 * l'ultimo arrivato resta in testa → i messaggi appaiono in ordine INVERTITO
 * (es. il messaggio del nodo 2 sopra quello del nodo 1). Il V3 non aveva il
 * problema perché i `commands` facevano calcolare al widget timestamp
 * incrementali (`prev + 100ms`). Spaziando gli invii garantiamo a chat21
 * timestamp distinti e crescenti → ordine corretto. Configurabile via env.
 */
const MIN_SEND_GAP_MS = Math.max(0, Number(process.env.V4_MSG_MIN_GAP_MS) || 150);

// Mappa dei `type` del messaggio-nodo V4 → `type` del protocollo messaggi del widget.
// Il DS usa 'iframe', ma il widget rende il frame solo con `type === 'frame'`
// (chat21-core/utils/utils-message.isFrame). Gli altri (text/image/redirect/file/audio)
// coincidono e non vanno rimappati.
const NODE_TYPE_TO_MSG_TYPE = { iframe: 'frame' };

/**
 * Invio dei messaggi del bot V4 alla conversazione (stesso endpoint del V3).
 *
 * Riusa `ExtApi.sendSupportMessageExt`. Ogni messaggio V4 (`data.messages[i]`)
 * diventa UN support message già "renderizzato":
 *  - testo con le variabili `{{...}}` risolte tramite `Filler` (LiquidJS),
 *  - eventuali bottoni come attachment template — la stessa forma che il widget
 *    riceve dal V3.
 */
class MessageSenderV4 {

  constructor({ projectId, requestId, token, tilebotEndpoint, botName, params, tdcache, turnToken }) {
    this.projectId = projectId;
    this.requestId = requestId;
    this.token = token;
    this.botName = botName || 'bot';
    this.params = params || {};
    this.tdcache = tdcache;
    this.turnToken = turnToken;
    this.sentCount = 0; // messaggi VISIBILI inviati in questo turno
    // Epoch (ms) dell'ultimo invio: usato per spaziare gli invii consecutivi
    // (vedi `MIN_SEND_GAP_MS`) ed evitare collisioni di timestamp lato widget.
    this.lastSendAt = 0;
    this.filler = new Filler();
    this.apiext = new ExtApi({ TILEBOT_ENDPOINT: tilebotEndpoint });
  }

  /** True se in questo turno è stato inviato almeno un messaggio visibile. */
  hasSent() {
    return this.sentCount > 0;
  }

  /**
   * Ricarica le variabili di conversazione (Redis) in `this.params`, preservando
   * le chiavi standard chatbot_id/name/conversation_id. Chiamato dal walk dopo un
   * handler che ha scritto variabili, così i `reply` successivi vedono i nuovi valori.
   */
  async refreshParams() {
    if (!this.tdcache) return;
    try {
      const { TiledeskChatbot } = require('../engine/TiledeskChatbot.js'); // lazy: evita cicli
      const fresh = (await TiledeskChatbot.allParametersStatic(this.tdcache, this.requestId)) || {};
      fresh.chatbot_id = this.params.chatbot_id;
      fresh.chatbot_name = this.params.chatbot_name;
      fresh.conversation_id = this.params.conversation_id;
      this.params = fresh;
    } catch (err) {
      winston.error('(MessageSenderV4) refreshParams error: ', err);
    }
  }

  /**
   * Ack "idle": inviato quando il turno NON ha prodotto alcun messaggio visibile
   * (es. nodo reply vuoto, ramo terminale senza contenuto). Serve SOLO a far
   * arrivare un messaggio al widget così da spegnere l'indicatore "sta scrivendo"
   * e non lasciare la chat in attesa. `subtype:'info'` → il server NON pubblica
   * typing per questo messaggio e il widget lo rende come nota di servizio (non
   * come bolla del bot), non come risposta.
   */
  async sendIdleAck() {
    await this.sendBody({
      text: '',
      type: 'text',
      senderFullname: this.botName,
      attributes: { subtype: 'info' },
    });
  }

  /**
   * Caso A: rileva se è iniziato un NUOVO turno (es. click su un bottone) mentre
   * questo reply stava inviando i suoi messaggi. Confronta il turn token catturato
   * a inizio reply con quello corrente in Redis.
   */
  async isStaleTurn() {
    if (!this.turnToken || !this.tdcache) return false;
    const current = await stateV4.getTurn(this.tdcache, this.requestId);
    return !!(current && current !== this.turnToken);
  }

  /**
   * Mappa i bottoni di un messaggio V4 nello shape attachment del widget.
   * Shape reale dal DS: `message.buttons = [{ id, type, label, link?, target?, action? }]`
   * (array piatto; il testo del bottone è in `label`).
   * Shape alternativa (doc/target): `{ active, ui:[], json:[] }` con `value`.
   * Gestiamo entrambe; il campo testo del widget è `value`.
   */
  static mapButtons(v4message, buttonSlotMap) {
    let list = v4message && v4message.buttons;
    if (!list) return [];
    if (!Array.isArray(list)) {
      list = list[list.active || 'ui'] || list.ui || [];
    }
    const slotMap = buttonSlotMap || {};
    return (list || []).map((btn) => {
      const value = btn.value != null ? btn.value : (btn.label != null ? btn.label : '');
      const type = btn.type || 'text';
      const out = { type, value };
      if (type === 'url') {
        if (btn.link) out.link = btn.link;
        if (btn.target) out.target = btn.target;
      } else if (type === 'action') {
        // Il widget richiede `action` non vuoto per emettere il click
        // (action-button.component.ts). Il routing reale lo fa il motore via
        // awaitingButtons (match sul `value`); qui basta un valore non vuoto.
        const target = slotMap[btn.id];
        out.action = target ? ('#' + target) : value;
        out.show_echo = true; // echo visibile come messaggio utente (non subtype 'info')
      }
      return out;
    });
  }

  /** Body del support message per UN messaggio V4 (testo con `{{var}}` risolte + bottoni). */
  buildMessageBody(v4message, buttonSlotMap) {
    const rawText = v4message.text != null ? v4message.text : '';
    const text = this.filler.fill(rawText, { ...this.params });
    // Usa il `type` reale del messaggio (es. 'image'), rimappato al protocollo
    // widget dove serve (es. 'iframe' → 'frame'). Mai forzare 'text'.
    const rawType = v4message.type || 'text';
    const type = NODE_TYPE_TO_MSG_TYPE[rawType] || rawType;
    const body = { text: text, type: type, senderFullname: this.botName };

    // Media (image/file/...): porta `metadata` (con fill delle variabili in src/name).
    if (v4message.metadata) {
      const metadata = { ...v4message.metadata };
      if (metadata.src) metadata.src = this.filler.fill(metadata.src, { ...this.params });
      if (metadata.name) metadata.name = this.filler.fill(metadata.name, { ...this.params });
      body.metadata = metadata;
    }

    // Gallery (carousel): le card vivono in `galleries[]` → attributes.attachment.gallery[].
    if (rawType === 'gallery' && Array.isArray(v4message.galleries) && v4message.galleries.length > 0) {
      const gallery = v4message.galleries.map((card) => this.buildGalleryCard(card, buttonSlotMap));
      body.attributes = { attachment: { gallery } };
      return body;
    }

    // Bottoni top-level del messaggio (text/image): attachment template.
    const buttons = MessageSenderV4.mapButtons(v4message, buttonSlotMap);
    if (buttons.length > 0) {
      body.attributes = { attachment: { type: 'template', buttons } };
    }
    return body;
  }

  /** Mappa una card della gallery nello shape atteso dal carousel del widget. */
  buildGalleryCard(card, buttonSlotMap) {
    const preview = card && card.preview ? { ...card.preview } : { src: '' };
    if (preview.src) preview.src = this.filler.fill(preview.src, { ...this.params });
    return {
      preview,
      title: this.filler.fill((card && card.title) || '', { ...this.params }),
      description: this.filler.fill((card && card.description) || '', { ...this.params }),
      buttons: MessageSenderV4.mapButtons({ buttons: (card && card.buttons) || [] }, buttonSlotMap),
    };
  }

  /**
   * Spaziatura anti-collisione: prima di ogni invio garantisce che siano
   * trascorsi almeno `MIN_SEND_GAP_MS` dall'invio precedente nello stesso
   * turno, così chat21 assegna timestamp distinti e crescenti e il widget non
   * inverte l'ordine dei messaggi (vedi commento su `MIN_SEND_GAP_MS`).
   * `lastSendAt` viene aggiornato PRIMA della richiesta HTTP così la cadenza è
   * regolata sull'avvio degli invii (l'eventuale `delayMs` già speso conta come
   * gap: se ha superato il minimo, qui non si attende oltre).
   */
  async throttleSend() {
    if (this.lastSendAt > 0) {
      const wait = MIN_SEND_GAP_MS - (Date.now() - this.lastSendAt);
      if (wait > 0) await sleep(wait);
    }
    this.lastSendAt = Date.now();
  }

  /** Invia un singolo body (Promise wrapper sul callback di ExtApi). */
  async sendBody(body) {
    await this.throttleSend();
    return new Promise((resolve) => {
      this.apiext.sendSupportMessageExt(body, this.projectId, this.requestId, this.token, (err) => {
        if (err) winston.error('(MessageSenderV4) send error: ', err);
        resolve();
      });
    });
  }

  /**
   * Invia in sequenza i messaggi V4 di un nodo reply, rispettando `delayMs`
   * (attesa PRIMA di ogni messaggio). Salta i messaggi vuoti (nessun testo né bottoni).
   */
  async sendV4Messages(messages, buttonSlotMap) {
    for (const m of (messages || [])) {
      // filtro di visibilità `when` (DSL): se la condizione è falsa, salta il messaggio
      if (m.when != null && !evaluateWhen(m.when, this.params)) {
        winston.verbose('(MessageSenderV4) messaggio saltato dal filtro when="' + m.when + '"');
        continue;
      }
      const body = this.buildMessageBody(m, buttonSlotMap);
      const hasButtons = (body.attributes?.attachment?.buttons?.length || 0) > 0;
      const hasMedia = !!body.metadata?.src;
      const hasGallery = (body.attributes?.attachment?.gallery?.length || 0) > 0;
      if ((!body.text || body.text.trim() === '') && !hasButtons && !hasMedia && !hasGallery) {
        continue; // es. messaggio { text: "" } senza bottoni/media/gallery
      }
      const delay = Math.min(Math.max(Number(m.delayMs) || 0, 0), MAX_DELAY_MS);
      if (delay > 0) await sleep(delay);
      // Caso A: se durante l'attesa è iniziato un nuovo turno (es. click su un
      // bottone), annulla l'invio dei messaggi rimanenti di questo reply.
      if (await this.isStaleTurn()) {
        winston.verbose('(MessageSenderV4) nuovo turno rilevato → annullo i messaggi rimanenti del reply');
        return;
      }
      await this.sendBody(body);
      this.sentCount++;
    }
  }

  /** Invio di un singolo messaggio di testo semplice (es. fallback non supportato). */
  async sendText(text) {
    await this.sendBody({ text, type: 'text', senderFullname: this.botName });
    this.sentCount++;
  }
}

module.exports = { MessageSenderV4 };
