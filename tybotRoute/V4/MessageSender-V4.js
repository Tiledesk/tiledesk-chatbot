const { ExtApi } = require('../ExtApi.js');
const { Filler } = require('../tiledeskChatbotPlugs/Filler.js');
const { evaluateWhen } = require('./when-eval-V4.js');
const winston = require('../utils/winston');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Cap di sicurezza al delay per non bloccare il flow su valori anomali.
const MAX_DELAY_MS = 10000;

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

  constructor({ projectId, requestId, token, tilebotEndpoint, botName, params }) {
    this.projectId = projectId;
    this.requestId = requestId;
    this.token = token;
    this.botName = botName || 'bot';
    this.params = params || {};
    this.filler = new Filler();
    this.apiext = new ExtApi({ TILEBOT_ENDPOINT: tilebotEndpoint });
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
    const buttons = MessageSenderV4.mapButtons(v4message, buttonSlotMap);
    const body = { text: text, type: 'text', senderFullname: this.botName };
    if (buttons.length > 0) {
      body.attributes = { attachment: { type: 'template', buttons } };
    }
    return body;
  }

  /** Invia un singolo body (Promise wrapper sul callback di ExtApi). */
  sendBody(body) {
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
      const hasButtons = !!(body.attributes && body.attributes.attachment && body.attributes.attachment.buttons.length > 0);
      if ((!body.text || body.text.trim() === '') && !hasButtons) {
        continue; // es. messaggio { text: "" } senza bottoni
      }
      const delay = Math.min(Math.max(Number(m.delayMs) || 0, 0), MAX_DELAY_MS);
      if (delay > 0) await sleep(delay);
      await this.sendBody(body);
    }
  }

  /** Invio di un singolo messaggio di testo semplice (es. fallback non supportato). */
  async sendText(text) {
    await this.sendBody({ text, type: 'text', senderFullname: this.botName });
  }
}

module.exports = { MessageSenderV4 };
