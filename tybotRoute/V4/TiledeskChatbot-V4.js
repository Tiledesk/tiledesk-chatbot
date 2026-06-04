const winston = require('../utils/winston');
const { NodesDataSourceV4 } = require('./NodesDataSource-V4.js');
const { MessageSenderV4 } = require('./MessageSender-V4.js');
const state = require('./state-V4.js');

// Handler per tipo di nodo. Aggiungere qui i nuovi type man mano che si migrano.
const HANDLERS = {
  start: require('./nodes/start-V4.js'),
  reply: require('./nodes/reply-V4.js'),
  close: require('./nodes/close-V4.js'),
  defaultFallback: require('./nodes/defaultFallback-V4.js'),
};

// Comandi di avvio conversazione accettati dal server:
//  - "\start" (backslash): inviato esplicitamente (es. chat-cli, bot legacy v3);
//  - "/start"  (slash): inviato dal server in autostart per i chatbot nuovi
//    (tiledesk-server-V4 pubmodules/trigger/rulesTrigger.js → messageService.send system "/start").
// Il motore V4 deve riconoscerli entrambi, altrimenti l'avvio dal widget non parte.
const START_COMMANDS = ['\\start', '/start'];
const MAX_STEPS = 50; // guard anti-loop sul walk del grafo

/**
 * Motore di esecuzione per i chatbot Design Studio V4 (modello a `nodes`).
 *
 * Entrypoint unico: `reply(ctx)`. Determina il nodo di ingresso (start / bottone
 * cliccato / defaultFallback), cammina il grafo seguendo gli slot `direct`,
 * invia i messaggi via `MessageSenderV4` e persiste lo stato su Redis.
 *
 * Il percorso V3 del runtime resta invariato: questo motore è invocato SOLO dal
 * dispatcher in `index.js` quando il bot è V4 (ha `nodes`).
 */
async function reply(ctx) {
  const { botId, projectId, requestId, token, message, tdcache, tilebotEndpoint, bot } = ctx;
  const text = ((message && message.text) || '').trim();

  const ds = new NodesDataSourceV4(botId);
  const nodes = await ds.getNodes();
  if (!nodes || nodes.length === 0) {
    winston.warn(`(TiledeskChatbotV4) nessun nodo per bot ${botId}: niente da eseguire.`);
    return;
  }

  // Variabili per il fill `{{...}}` del testo: attributi della request salvati in
  // Redis (variabili utente) + le chiavi standard chatbot_id / chatbot_name /
  // conversation_id (vedi TiledeskChatbotConst). allParametersStatic è un helper
  // statico del motore V3 (lazy-require per evitare cicli di import).
  let params = {};
  try {
    const { TiledeskChatbot } = require('../engine/TiledeskChatbot.js');
    params = (await TiledeskChatbot.allParametersStatic(tdcache, requestId)) || {};
  } catch (err) {
    winston.error('(TiledeskChatbotV4) allParametersStatic error: ', err);
  }
  params.chatbot_id = botId;
  params.chatbot_name = (bot && bot.name) || '';
  params.conversation_id = requestId;

  const sender = new MessageSenderV4({
    projectId,
    requestId,
    token,
    tilebotEndpoint,
    botName: (bot && bot.name) || 'bot',
    params,
  });

  const entryNode = await resolveEntryNode({ text, nodes, tdcache, requestId });
  if (!entryNode) {
    winston.warn(`(TiledeskChatbotV4) nessun nodo di ingresso risolto (text="${text}").`);
    return;
  }

  await walk({ entryNode, nodes, sender, tdcache, requestId });
}

/**
 * Nodo di ingresso:
 * - `\start`            → nodo `start` (e azzera lo stato);
 * - testo = un bottone in attesa → nodo target del bottone;
 * - altrimenti          → `defaultFallback` (input non riconosciuto).
 */
async function resolveEntryNode({ text, nodes, tdcache, requestId }) {
  if (START_COMMANDS.includes(text)) {
    await state.clearState(tdcache, requestId);
    winston.verbose('(TiledeskChatbotV4) entry: START → nodo start');
    return NodesDataSourceV4.startNode(nodes);
  }

  const saved = await state.getState(tdcache, requestId);
  if (saved && Array.isArray(saved.awaitingButtons)) {
    const btn = saved.awaitingButtons.find((b) => b.value === text);
    if (btn) {
      const target = NodesDataSourceV4.byId(nodes, btn.nextNode);
      if (target) {
        winston.verbose('(TiledeskChatbotV4) entry: bottone "' + text + '" → nodo ' + btn.nextNode);
        return target;
      }
    }
  }
  winston.verbose('(TiledeskChatbotV4) entry: input non riconosciuto ("' + text + '") → defaultFallback');
  return NodesDataSourceV4.fallbackNode(nodes);
}

/** Cammina il grafo dal nodo di ingresso finché un nodo si ferma o chiude. */
async function walk({ entryNode, nodes, sender, tdcache, requestId }) {
  let node = entryNode;
  let steps = 0;

  while (node && steps < MAX_STEPS) {
    steps++;
    winston.verbose('(TiledeskChatbotV4) visito nodo: ' + node.type + ' (' + node.id + ')');
    const handler = HANDLERS[node.type];

    if (!handler) {
      // Fallback sicuro: tipo non ancora migrato → avvisa e fermati (no crash, no logica V3).
      winston.warn(`(TiledeskChatbotV4) tipo di nodo non supportato: '${node.type}' (id ${node.id}).`);
      await sender.sendText(`Tipo di nodo non ancora supportato dal runtime V4: ${node.type}`);
      return;
    }

    const result = handler.execute(node);

    if (result.messages && result.messages.length > 0) {
      await sender.sendV4Messages(result.messages, result.buttonSlotMap);
    }

    if (result.close) {
      await state.clearState(tdcache, requestId);
      return;
    }

    if (result.stop) {
      await state.setState(tdcache, requestId, {
        currentNodeId: node.id,
        awaitingButtons: result.awaitingButtons || null,
      });
      return;
    }

    node = NodesDataSourceV4.byId(nodes, result.next);
  }

  if (steps >= MAX_STEPS) {
    winston.error(`(TiledeskChatbotV4) raggiunto MAX_STEPS (${MAX_STEPS}): possibile ciclo nel grafo.`);
  }
}

module.exports = { reply };
