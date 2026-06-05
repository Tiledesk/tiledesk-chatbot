const winston = require('../utils/winston');
const { NodesDataSourceV4 } = require('./NodesDataSource-V4.js');
const { MessageSenderV4 } = require('./MessageSender-V4.js');
const state = require('./state-V4.js');

// Handler per tipo di nodo. Aggiungere qui i nuovi type man mano che si migrano.
const HANDLERS = {
  start: require('./nodes/start-V4.js'),
  reply: require('./nodes/reply-V4.js'),
  replyv2: require('./nodes/replyv2-V4.js'),
  close: require('./nodes/close-V4.js'),
  defaultFallback: require('./nodes/defaultFallback-V4.js'),
};

// Comandi di avvio conversazione accettati dal server:
//  - "\start" (backslash): inviato esplicitamente (es. chat-cli, bot legacy v3);
//  - "/start"  (slash): inviato dal server in autostart per i chatbot nuovi.
const START_COMMANDS = ['\\start', '/start'];
const MAX_STEPS = 50; // guard anti-loop sul walk del grafo

function makeToken() {
  return Date.now() + '-' + Math.random().toString(36).slice(2);
}

/**
 * Context variabili per il fill `{{...}}`: attributi della request in Redis +
 * le chiavi standard chatbot_id / chatbot_name / conversation_id.
 */
async function buildParams(ctx) {
  const { tdcache, requestId, bot, botId } = ctx;
  let params = {};
  try {
    const { TiledeskChatbot } = require('../engine/TiledeskChatbot.js'); // lazy: evita cicli
    params = (await TiledeskChatbot.allParametersStatic(tdcache, requestId)) || {};
  } catch (err) {
    winston.error('(TiledeskChatbotV4) allParametersStatic error: ', err);
  }
  params.chatbot_id = botId;
  params.chatbot_name = (bot && bot.name) || '';
  params.conversation_id = requestId;
  return params;
}

/**
 * Motore di esecuzione per i chatbot Design Studio V4 (modello a `nodes`).
 *
 * Entrypoint: `reply(ctx)` — nuovo turno utente. Azzera il controllo no_input
 * pendente, risolve il nodo di ingresso ed esegue il turno.
 */
async function reply(ctx) {
  const { botId, requestId, message, tdcache } = ctx;
  const text = ((message && message.text) || '').trim();
  // Bottone "action": il widget invia il nodo target esplicito in attributes.action.
  const action = (message && message.attributes && message.attributes.action) || null;

  // Nuovo input utente → invalida un eventuale no_input pendente di un replyv2.
  await state.clearUserInput(tdcache, requestId);

  const ds = new NodesDataSourceV4(botId);
  const nodes = await ds.getNodes();
  if (!nodes || nodes.length === 0) {
    winston.warn(`(TiledeskChatbotV4) nessun nodo per bot ${botId}: niente da eseguire.`);
    return;
  }

  const entryNode = await resolveEntryNode({ text, action, nodes, tdcache, requestId });
  if (!entryNode) {
    winston.warn(`(TiledeskChatbotV4) nessun nodo di ingresso risolto (text="${text}").`);
    return;
  }

  await runTurn(ctx, nodes, entryNode);
}

/**
 * Esegue un turno a partire da `entryNode`: costruisce sender + turn token, cammina
 * il grafo, invia l'idle-ack se nulla è stato inviato, e schedula l'eventuale
 * no_input. Riusato anche dal timer no_input.
 */
async function runTurn(ctx, nodes, entryNode) {
  const { projectId, requestId, token, tdcache, tilebotEndpoint, bot } = ctx;
  const turnToken = makeToken();
  await state.setTurn(tdcache, requestId, turnToken);
  const params = await buildParams(ctx);

  const sender = new MessageSenderV4({
    projectId,
    requestId,
    token,
    tilebotEndpoint,
    botName: (bot && bot.name) || 'bot',
    params,
    tdcache,
    turnToken,
  });

  const pendingNoInput = await walk({ entryNode, nodes, sender, tdcache, requestId });

  // Nessun messaggio visibile → ack nascosto per non lasciare il widget in attesa.
  if (!sender.hasSent()) {
    await sender.sendIdleAck();
  }

  // replyv2 con no_input connesso → schedula il timer.
  if (pendingNoInput) {
    scheduleNoInput(ctx, pendingNoInput);
  }
}

/**
 * Nodo di ingresso:
 * - `\start`/`/start`                     → nodo `start` (azzera lo stato);
 * - `attributes.action` (bottone action)  → nodo target esplicito;
 * - testo = bottone in attesa             → nodo collegato;
 * - input non riconosciuto su un nodo con `no_match` (replyv2) → nodo no_match;
 * - altrimenti                            → `defaultFallback`.
 */
async function resolveEntryNode({ text, action, nodes, tdcache, requestId }) {
  if (START_COMMANDS.includes(text)) {
    await state.clearState(tdcache, requestId);
    winston.verbose('(TiledeskChatbotV4) entry: START → nodo start');
    return NodesDataSourceV4.startNode(nodes);
  }

  if (action) {
    const nodeId = String(action).replace(/^#/, '');
    const target = NodesDataSourceV4.byId(nodes, nodeId);
    if (target) {
      winston.verbose('(TiledeskChatbotV4) entry: action button → nodo ' + nodeId);
      return target;
    }
    winston.verbose('(TiledeskChatbotV4) action "' + action + '" non risolve a un nodo, provo awaitingButtons/no_match/fallback');
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

  // no_match (replyv2): input non riconosciuto mentre siamo su un nodo con no_match.
  if (saved && saved.noMatchNode) {
    const target = NodesDataSourceV4.byId(nodes, saved.noMatchNode);
    if (target) {
      winston.verbose('(TiledeskChatbotV4) entry: no_match → nodo ' + saved.noMatchNode);
      return target;
    }
  }

  winston.verbose('(TiledeskChatbotV4) entry: input non riconosciuto ("' + text + '") → defaultFallback');
  return NodesDataSourceV4.fallbackNode(nodes);
}

/**
 * Cammina il grafo dal nodo di ingresso finché un nodo si ferma o chiude.
 * @returns {object|null} il `noInput` pendente se un nodo (replyv2) si è fermato
 *   con un no_input connesso; altrimenti null.
 */
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
      return null;
    }

    const result = handler.execute(node);

    if (result.messages && result.messages.length > 0) {
      await sender.sendV4Messages(result.messages, result.buttonSlotMap);
    }

    if (result.close) {
      await state.clearState(tdcache, requestId);
      return null;
    }

    if (result.stop) {
      await state.setState(tdcache, requestId, {
        currentNodeId: node.id,
        awaitingButtons: result.awaitingButtons || null,
        noMatchNode: result.noMatchNode || null,
      });
      return result.noInput || null;
    }

    node = NodesDataSourceV4.byId(nodes, result.next);
  }

  if (steps >= MAX_STEPS) {
    winston.error(`(TiledeskChatbotV4) raggiunto MAX_STEPS (${MAX_STEPS}): possibile ciclo nel grafo.`);
  }
  return null;
}

/**
 * Schedula il connettore `no_input` di un replyv2: setta una variabile di controllo
 * e, allo scadere del timeout, se l'utente NON ha risposto (la variabile è ancora
 * la stessa), esegue il nodo no_input. Timer in-process (perso al restart, come V3).
 */
function scheduleNoInput(ctx, noInput) {
  const { botId, tdcache, requestId } = ctx;
  const inputToken = makeToken();

  state.setUserInput(tdcache, requestId, inputToken).then(() => {
    setTimeout(async () => {
      try {
        const current = await state.getUserInput(tdcache, requestId);
        if (current !== inputToken) {
          winston.verbose('(TiledeskChatbotV4) no_input: utente ha risposto → skip');
          return;
        }
        winston.verbose('(TiledeskChatbotV4) no_input timeout → eseguo nodo ' + noInput.nodeId);
        await state.clearUserInput(tdcache, requestId);
        // Rileggi i nodi (il grafo può essere cambiato) ed esegui il no_input.
        const freshNodes = await new NodesDataSourceV4(botId).getNodes();
        const target = NodesDataSourceV4.byId(freshNodes, noInput.nodeId);
        if (!target) {
          winston.warn('(TiledeskChatbotV4) no_input: nodo ' + noInput.nodeId + ' non trovato.');
          return;
        }
        await runTurn(ctx, freshNodes, target);
      } catch (err) {
        winston.error('(TiledeskChatbotV4) no_input error: ', err);
      }
    }, noInput.timeoutMs);
  });
}

module.exports = { reply };
