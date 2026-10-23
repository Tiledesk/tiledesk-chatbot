const winston = require('./winston');

/**
 * I connettori degli agenti V3 (Design Studio V3, dal 12/10/2026).
 *
 * Un agente V3 (`bot.ds_version === 'v3'`) tiene i suoi collegamenti nella LISTA `bot.connectors`, non nei campi
 * delle action (`trueIntent`, `falseIntent`, `intentName`, `goToIntent`, `elseIntent`,
 * `cases[].intent`, `nextBlockAction.intentName`, ...): sul server quei campi possono essere
 * vuoti. Le direttive non cambiano di una riga: prima che un blocco venga eseguito, questo
 * modulo RISCRIVE i campi delle sue action dalla lista, cosi' ogni direttiva legge quello che
 * ha sempre letto. Per un agente che non e' V3, o che e' V3 ma non ha ancora la lista, non fa
 * nulla: resta la logica V2 di sempre, campi alla mano.
 *
 * Regola (14/10/2026): la lista AGGIUNGE e SOSTITUISCE, non toglie. Un'uscita che ha un record
 * nella lista prende quella destinazione; un'uscita senza record resta com'e' nel JSON del blocco
 * (vuota se il Design Studio V3 l'ha ripulita, piena se il blocco viene da un flusso vecchio o da
 * un import). Cosi' una lista vuota o incompleta non spegne mai un collegamento che il JSON porta
 * ancora, e un record non puo' che aggiungere strada. Per lo stesso motivo nessun contenitore
 * (`settings`, `nextBlockAction`) nasce se la lista non ha un record da metterci.
 *
 * Anche i bottoni delle reply passano da qui (dal 12/10/2026 sera): nel JSON di un V3 il bottone
 * non porta piu' `action`; prima che la reply parta verso il widget, `button.action` viene
 * riempito dalla lista con `#id` piu' l'eventuale coda `{...}` di parametri (`props.params` del
 * record). Il widget riceve quello che riceveva. `DirReplyV2`, che alla seconda esecuzione
 * rilegge `button.action`, rilegge la reply gia' riempita. Un bottone senza record resta com'e'.
 *
 * Il pallino del blocco: se il JSON non porta piu' il descrittore `attributes.nextBlockAction`
 * ma la lista ha il record del blocco (`kind: 'block'`), il descrittore nasce dal record, cosi'
 * `addConnectAction` trova quello che ha sempre trovato.
 *
 * Il catalogo delle uscite e' la copia di `connectors/connector-catalog.ts` del Design Studio:
 * stessi tipi, stessi campi, stessi suffissi degli id. Se cambia di la', cambia anche qui.
 *
 * Formato della lista: `{ version: 1, updatedAt, items: [{ id, from: { intentId, actionId, slot },
 * to: { intentId }, kind, props? }] }`, dove `id` = `${intentId}/${actionId}${suffisso}/${toIntentId}`.
 */

const COLLECTION_VERSION = 1;
const DS_VERSION_V3 = 'v3';
const KIND_BLOCK = 'block';

const field = (suffix, name) => ({ kind: 'field', suffix, field: name });
const nested = (suffix, path) => ({ kind: 'nested', suffix, path });
const lastCommand = (suffix, name) => ({ kind: 'lastCommandSetting', suffix, field: name });
const array = (suffix, arrayName, idField, name) => ({ kind: 'array', suffix, array: arrayName, idField, field: name });
/** I bottoni della action, a qualunque profondita' (come `findButtons` del Design Studio): ancora `uid`, campo `action`. */
const BUTTONS = { kind: 'buttons' };

const TRUE_FALSE = [field('/true', 'trueIntent'), field('/false', 'falseIntent')];
const VOICE_SETTINGS = [nested('/noInput', ['settings', 'noInputIntent']), nested('/noMatch', ['settings', 'noMatchIntent'])];
const REPLY_V1 = [BUTTONS, ...VOICE_SETTINGS];

/** Le uscite di ogni tipo di action, come nel catalogo del Design Studio. */
const OUTPUT_CATALOG = {
  intent:              [field('', 'intentName')],
  connect_block:       [field('', 'intentName')],
  reply:               REPLY_V1,
  randomreply:         REPLY_V1,
  replyv2:             [BUTTONS, field('/noInput', 'noInputIntent'), field('/noMatch', 'noMatchIntent')],
  ifonlineagents:      TRUE_FALSE,
  ifonlineagentsv2:    TRUE_FALSE,
  ifopenhours:         TRUE_FALSE,
  invite_human:        TRUE_FALSE,
  remove_human:        TRUE_FALSE,
  jsonconditionmulti:  [array((c) => '/case/' + c._tdCaseId, 'cases', '_tdCaseId', 'intent'), field('/else', 'elseIntent')],
  jsoncondition:       TRUE_FALSE,
  jsoncondition2:      TRUE_FALSE,
  invoke_subagent:     TRUE_FALSE,
  askgpt:              TRUE_FALSE,
  askgptv2:            TRUE_FALSE,
  gpt_task:            TRUE_FALSE,
  gpt_assistant:       TRUE_FALSE,
  ai_prompt:           TRUE_FALSE,
  ai_condition:        [array((b) => '/' + b.label + '/true', 'intents', 'label', 'conditionIntentId'), field('/fallback', 'fallbackIntent'), field('/error', 'errorIntent')],
  webrequestv2:        TRUE_FALSE,
  data_table:          TRUE_FALSE,
  make:                TRUE_FALSE,
  hubspot:             TRUE_FALSE,
  customerio:          TRUE_FALSE,
  brevo:               TRUE_FALSE,
  n8n:                 TRUE_FALSE,
  qapla:               TRUE_FALSE,
  capture_user_reply:  [field('', 'goToIntent')],
  iteration:           [field('/goto', 'goToIntent'), field('/fallback', 'fallbackIntent')],
  dtmf_menu:           [BUTTONS, ...VOICE_SETTINGS, lastCommand('/noInput', 'noInputIntent'), lastCommand('/noMatch', 'noMatchIntent')],
  dtmf_form:           [BUTTONS, ...VOICE_SETTINGS, lastCommand('/noInput', 'noInputIntent'), lastCommand('/noMatch', 'noMatchIntent')],
  speech_form:         [lastCommand('/noInput', 'noInputIntent'), lastCommand('/noMatch', 'noMatchIntent')],
  blind_transfer:      [BUTTONS, ...VOICE_SETTINGS, lastCommand('/true', 'trueIntent'), lastCommand('/false', 'falseIntent')],
  send_whatsapp:       TRUE_FALSE,
};

/**
 * Gli indici di una lista, calcolati una volta per oggetto lista:
 * `outputs`: `fromId -> { toId, params }` (una destinazione per uscita);
 * `blocks`:  `intentId -> { toId, actionId }` per i record del pallino (`kind: 'block'`).
 */
const indexes = new WeakMap();

class ConnectorsV3 {

  /** Il bot e' stato creato dal Design Studio V3: campo `ds_version` del bot (dal 15/10/2026; prima `attributes.dsVersion`). */
  static isV3Bot(bot) {
    const label = bot && bot.ds_version;
    return typeof label === 'string' && label.trim().toLowerCase() === DS_VERSION_V3;
  }

  /** La lista dei connettori del bot (campo `connectors`, dal 15/10/2026; prima `attributes.connectors`), se c'e' ed e' nel formato atteso. */
  static collectionOf(bot) {
    const collection = bot && bot.connectors;
    if (!collection || typeof collection !== 'object' || !Array.isArray(collection.items)) { return null; }
    if (collection.version !== COLLECTION_VERSION) { return null; }
    return collection;
  }

  /** Il bot va eseguito dalla lista: e' V3 e la lista c'e'. */
  static usesCollection(bot) {
    return ConnectorsV3.isV3Bot(bot) && ConnectorsV3.collectionOf(bot) !== null;
  }

  static indexOf(bot) {
    const collection = ConnectorsV3.collectionOf(bot);
    if (!collection) { return null; }
    let index = indexes.get(collection);
    if (index) { return index; }
    index = { outputs: new Map(), blocks: new Map() };
    for (const record of collection.items) {
      if (!record || typeof record.id !== 'string' || !record.to || !record.to.intentId) { continue; }
      const cut = record.id.lastIndexOf('/');
      if (cut <= 0) { continue; }
      const params = record.props && typeof record.props.params === 'string' && record.props.params !== '' ? record.props.params : null;
      index.outputs.set(record.id.substring(0, cut), { toId: record.to.intentId, params });
      if (record.kind === KIND_BLOCK) {
        const parts = record.id.split('/');
        const from = record.from && typeof record.from === 'object' ? record.from : {};
        const intentId = from.intentId || parts[0];
        const actionId = from.actionId || (parts.length === 3 ? parts[1] : null);
        if (intentId && actionId && !index.blocks.has(intentId)) { index.blocks.set(intentId, { toId: record.to.intentId, actionId }); }
      }
    }
    indexes.set(collection, index);
    return index;
  }

  /**
   * Riscrive dalla lista i campi di destinazione del blocco che sta per essere eseguito: il
   * pallino (`attributes.nextBlockAction.intentName`) e ogni uscita delle action che il catalogo
   * conosce. Un'uscita che la lista non ha resta com'e' (vuota o piena); un valore senza `#` (un
   * nome di blocco dei flussi vecchi) resta com'e' anche con il record. Per un bot non V3, o
   * senza lista, non tocca nulla. Restituisce quante uscite ha riscritto, o null se non ha lavorato.
   */
  static projectIntent(bot, intent) {
    if (!intent || !ConnectorsV3.isV3Bot(bot)) { return null; }
    const index = ConnectorsV3.indexOf(bot);
    if (!index) { return null; }
    const intentId = intent.intent_id;
    if (!intentId) { return null; }
    let rewritten = 0;
    rewritten += projectBlockDot(index, intentId, intent);
    for (const action of intent.actions || []) {
      if (!action || typeof action !== 'object' || !action._tdActionId) { continue; }
      const specs = OUTPUT_CATALOG[action._tdActionType] || [];
      for (const spec of specs) {
        for (const slot of resolve(spec, intentId, action, index.outputs)) {
          const entry = index.outputs.get(slot.fromId);
          rewritten += slot.button ? writeButton(slot.button, entry) : write(slot.holder, slot.field, entry);
        }
      }
    }
    winston.debug("(ConnectorsV3) intent " + intentId + ": " + rewritten + " outputs rewritten from the bot's connectors list");
    return rewritten;
  }
}

/**
 * Il pallino del blocco. Con il descrittore (`_tdActionId`) l'uscita si riscrive dal record della
 * sua ancora; senza descrittore, se la lista ha il record del blocco, il descrittore nasce da li'
 * (`addConnectAction` lo accoda alle action come sempre). Un descrittore vecchio senza `_tdActionId`
 * ma con un nome di blocco resta com'e'.
 */
function projectBlockDot(index, intentId, intent) {
  const next = intent.attributes && intent.attributes.nextBlockAction;
  if (next && typeof next === 'object' && next._tdActionId) {
    return write(next, 'intentName', index.outputs.get(intentId + '/' + next._tdActionId));
  }
  const block = index.blocks.get(intentId);
  if (!block) { return 0; }
  if (next && typeof next === 'object' && typeof next.intentName === 'string' && next.intentName !== '') { return 0; }
  if (!intent.attributes || typeof intent.attributes !== 'object') { intent.attributes = {}; }
  intent.attributes.nextBlockAction = { _tdActionType: 'intent', _tdActionId: block.actionId, intentName: '#' + block.toId };
  return 1;
}

/**
 * Le uscite di una action secondo una voce del catalogo: dove sta il campo e l'id dell'ancora.
 * Un contenitore che manca (`settings` della action o dell'ultimo comando) nasce solo se la lista
 * ha un record per quell'uscita; altrimenti l'uscita non c'e' e il JSON resta com'e'.
 */
function resolve(spec, intentId, action, outputs) {
  const base = intentId + '/' + action._tdActionId;
  switch (spec.kind) {
    case 'field':
      return [{ holder: action, field: spec.field, fromId: base + spec.suffix }];
    case 'nested': {
      const fromId = base + spec.suffix;
      let holder = action;
      for (let i = 0; i < spec.path.length - 1; i++) {
        if (holder[spec.path[i]] === undefined || holder[spec.path[i]] === null) {
          if (!outputs.has(fromId)) { return []; }
          holder[spec.path[i]] = {};
        }
        holder = holder[spec.path[i]];
        if (typeof holder !== 'object') { return []; }
      }
      return [{ holder, field: spec.path[spec.path.length - 1], fromId }];
    }
    case 'lastCommandSetting': {
      const fromId = base + spec.suffix;
      const commands = action.attributes && action.attributes.commands;
      if (!Array.isArray(commands) || commands.length === 0) { return []; }
      const last = commands[commands.length - 1];
      if (!last || typeof last !== 'object') { return []; }
      if (!last.settings || typeof last.settings !== 'object') {
        if (!outputs.has(fromId)) { return []; }
        last.settings = {};
      }
      return [{ holder: last.settings, field: spec.field, fromId }];
    }
    case 'buttons': {
      const out = [];
      for (const button of findButtons(action)) {
        if (!button || typeof button !== 'object' || button.type === 'url') { continue; }
        if (typeof button.uid !== 'string' || button.uid === '') { continue; }
        out.push({ holder: button, field: 'action', fromId: base + '/' + button.uid, button });
      }
      return out;
    }
    case 'array': {
      const list = action[spec.array];
      if (!Array.isArray(list)) { return []; }
      const out = [];
      for (const item of list) {
        if (!item || typeof item !== 'object') { continue; }
        out.push({ holder: item, field: spec.field, fromId: base + spec.suffix(item) });
      }
      return out;
    }
    default:
      return [];
  }
}

/** Ogni `buttons[]` dentro l'oggetto, a qualunque profondita', nell'ordine di visita. */
function findButtons(obj) {
  let buttons = [];
  if (Array.isArray(obj)) {
    for (const element of obj) { buttons = buttons.concat(findButtons(element)); }
  } else if (obj && typeof obj === 'object') {
    if (Array.isArray(obj.buttons)) { buttons = buttons.concat(obj.buttons); }
    for (const key in obj) { if (key !== 'buttons') { buttons = buttons.concat(findButtons(obj[key])); } }
  }
  return buttons;
}

/**
 * Riempie `button.action` dalla lista (`#id` piu' la coda `{...}` del record) e rende il bottone
 * di tipo `action`; senza record il bottone resta com'e'. Una coda gia' presente nel bottone
 * sopravvive se il record non ne ha una (lista scritta prima che la coda viaggiasse li').
 */
function writeButton(button, entry) {
  if (!entry) { return 0; }
  const current = typeof button.action === 'string' ? button.action : '';
  const brace = current.indexOf('{');
  const currentId = brace > -1 ? current.substring(0, brace) : current;
  const currentTail = brace > -1 ? current.substring(brace) : '';
  const tail = entry.params !== null ? entry.params : (currentId === '#' + entry.toId ? currentTail : '');
  const value = '#' + entry.toId + tail;
  if (current === value && button.type === 'action') { return 0; }
  button.action = value;
  button.type = 'action';
  return 1;
}

/** Scrive `#id` dal record; senza record, o su un nome di blocco dei flussi vecchi, non tocca nulla. Restituisce 1 se ha cambiato qualcosa. */
function write(holder, field, entry) {
  if (!entry || !entry.toId) { return 0; }
  const current = typeof holder[field] === 'string' ? holder[field] : '';
  if (current !== '' && !current.startsWith('#')) { return 0; }   // un nome di blocco dei flussi vecchi: non si tocca
  const value = '#' + entry.toId;
  if (current === value) { return 0; }
  holder[field] = value;
  return 1;
}

module.exports = { ConnectorsV3, OUTPUT_CATALOG };
