const winston = require('./winston');

/**
 * I connettori degli agenti V3 (Design Studio V3, dal 12/10/2026).
 *
 * Un agente V3 tiene i suoi collegamenti nella LISTA `bot.attributes.connectors`, non nei campi
 * delle action (`trueIntent`, `falseIntent`, `intentName`, `goToIntent`, `elseIntent`,
 * `cases[].intent`, `nextBlockAction.intentName`, ...): sul server quei campi possono essere
 * vuoti. Le direttive non cambiano di una riga: prima che un blocco venga eseguito, questo
 * modulo RISCRIVE i campi delle sue action dalla lista, cosi' ogni direttiva legge quello che
 * ha sempre letto. Per un agente che non e' V3, o che e' V3 ma non ha ancora la lista, non fa
 * nulla: resta la logica V2 di sempre, campi alla mano.
 *
 * I bottoni delle reply NON passano da qui: e' il widget a mandare al bot `button.action`
 * com'e', e quel testo il Design Studio lo scrive sempre, anche nei V3.
 *
 * Il catalogo delle uscite e' la copia di `connectors/connector-catalog.ts` del Design Studio:
 * stessi tipi, stessi campi, stessi suffissi degli id. Se cambia di la', cambia anche qui.
 *
 * Formato della lista: `{ version: 1, updatedAt, items: [{ id, from: { intentId, actionId, slot },
 * to: { intentId }, kind, props? }] }`, dove `id` = `${intentId}/${actionId}${suffisso}/${toIntentId}`.
 */

const COLLECTION_VERSION = 1;
const DS_VERSION_V3 = 'v3';

const field = (suffix, name) => ({ kind: 'field', suffix, field: name });
const nested = (suffix, path) => ({ kind: 'nested', suffix, path });
const lastCommand = (suffix, name) => ({ kind: 'lastCommandSetting', suffix, field: name });
const array = (suffix, arrayName, idField, name) => ({ kind: 'array', suffix, array: arrayName, idField, field: name });

const TRUE_FALSE = [field('/true', 'trueIntent'), field('/false', 'falseIntent')];
const REPLY_V1 = [nested('/noInput', ['settings', 'noInputIntent']), nested('/noMatch', ['settings', 'noMatchIntent'])];
const VOICE_SETTINGS = REPLY_V1;

/** Le uscite di ogni tipo di action, come nel catalogo del Design Studio (bottoni esclusi). */
const OUTPUT_CATALOG = {
  intent:              [field('', 'intentName')],
  connect_block:       [field('', 'intentName')],
  reply:               REPLY_V1,
  randomreply:         REPLY_V1,
  replyv2:             [field('/noInput', 'noInputIntent'), field('/noMatch', 'noMatchIntent')],
  ifonlineagents:      TRUE_FALSE,
  ifonlineagentsv2:    TRUE_FALSE,
  ifopenhours:         TRUE_FALSE,
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
  dtmf_menu:           [...VOICE_SETTINGS, lastCommand('/noInput', 'noInputIntent'), lastCommand('/noMatch', 'noMatchIntent')],
  dtmf_form:           [...VOICE_SETTINGS, lastCommand('/noInput', 'noInputIntent'), lastCommand('/noMatch', 'noMatchIntent')],
  speech_form:         [lastCommand('/noInput', 'noInputIntent'), lastCommand('/noMatch', 'noMatchIntent')],
  blind_transfer:      [...VOICE_SETTINGS, lastCommand('/true', 'trueIntent'), lastCommand('/false', 'falseIntent')],
  send_whatsapp:       TRUE_FALSE,
};

/** L'indice `fromId -> intentId di arrivo` di una lista, calcolato una volta per oggetto lista. */
const indexes = new WeakMap();

class ConnectorsV3 {

  /** Il bot e' stato creato dal Design Studio V3 (`attributes.dsVersion`). */
  static isV3Bot(bot) {
    const label = bot && bot.attributes && bot.attributes.dsVersion;
    return typeof label === 'string' && label.trim().toLowerCase() === DS_VERSION_V3;
  }

  /** La lista dei connettori del bot, se c'e' ed e' nel formato atteso. */
  static collectionOf(bot) {
    const collection = bot && bot.attributes && bot.attributes.connectors;
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
    index = new Map();
    for (const record of collection.items) {
      if (!record || typeof record.id !== 'string' || !record.to || !record.to.intentId) { continue; }
      const cut = record.id.lastIndexOf('/');
      if (cut <= 0) { continue; }
      index.set(record.id.substring(0, cut), record.to.intentId);   // una destinazione per uscita
    }
    indexes.set(collection, index);
    return index;
  }

  /**
   * Riscrive dalla lista i campi di destinazione del blocco che sta per essere eseguito: il
   * pallino (`attributes.nextBlockAction.intentName`) e ogni uscita delle action che il catalogo
   * conosce. Un'uscita che la lista non ha viene svuotata; un valore senza `#` (un nome di blocco
   * dei flussi vecchi) resta com'e'. Per un bot non V3, o senza lista, non tocca nulla.
   * Restituisce quante uscite ha riscritto, o null se non ha lavorato.
   */
  static projectIntent(bot, intent) {
    if (!intent || !ConnectorsV3.isV3Bot(bot)) { return null; }
    const index = ConnectorsV3.indexOf(bot);
    if (!index) { return null; }
    const intentId = intent.intent_id;
    if (!intentId) { return null; }
    let rewritten = 0;
    const next = intent.attributes && intent.attributes.nextBlockAction;
    if (next && typeof next === 'object' && next._tdActionId) {
      rewritten += write(next, 'intentName', index.get(intentId + '/' + next._tdActionId));
    }
    for (const action of intent.actions || []) {
      if (!action || typeof action !== 'object' || !action._tdActionId) { continue; }
      const specs = OUTPUT_CATALOG[action._tdActionType] || [];
      for (const spec of specs) {
        for (const slot of resolve(spec, intentId, action)) {
          rewritten += write(slot.holder, slot.field, index.get(slot.fromId));
        }
      }
    }
    winston.debug("(ConnectorsV3) intent " + intentId + ": " + rewritten + " outputs rewritten from the bot's connectors list");
    return rewritten;
  }
}

/** Le uscite di una action secondo una voce del catalogo: dove sta il campo e l'id dell'ancora. */
function resolve(spec, intentId, action) {
  const base = intentId + '/' + action._tdActionId;
  switch (spec.kind) {
    case 'field':
      return [{ holder: action, field: spec.field, fromId: base + spec.suffix }];
    case 'nested': {
      let holder = action;
      for (let i = 0; i < spec.path.length - 1; i++) {
        if (holder[spec.path[i]] === undefined || holder[spec.path[i]] === null) {
          // il campo annidato non c'e': se la lista ha una destinazione per questa uscita, la strada si crea
          holder[spec.path[i]] = {};
        }
        holder = holder[spec.path[i]];
        if (typeof holder !== 'object') { return []; }
      }
      return [{ holder, field: spec.path[spec.path.length - 1], fromId: base + spec.suffix }];
    }
    case 'lastCommandSetting': {
      const commands = action.attributes && action.attributes.commands;
      if (!Array.isArray(commands) || commands.length === 0) { return []; }
      const last = commands[commands.length - 1];
      if (!last || typeof last !== 'object') { return []; }
      if (!last.settings || typeof last.settings !== 'object') { last.settings = {}; }
      return [{ holder: last.settings, field: spec.field, fromId: base + spec.suffix }];
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

/** Scrive `#id` o svuota; restituisce 1 se ha cambiato qualcosa. */
function write(holder, field, toId) {
  const current = typeof holder[field] === 'string' ? holder[field] : '';
  if (!toId) {
    if (current === '') { return 0; }
    if (!current.startsWith('#')) { return 0; }   // un nome di blocco dei flussi vecchi: non si tocca
    holder[field] = '';
    return 1;
  }
  const value = '#' + toId;
  if (current === value) { return 0; }
  holder[field] = value;
  return 1;
}

module.exports = { ConnectorsV3, OUTPUT_CATALOG };
