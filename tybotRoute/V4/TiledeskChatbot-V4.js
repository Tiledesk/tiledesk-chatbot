const winston = require('../utils/winston');
const { NodesDataSourceV4 } = require('./NodesDataSource-V4.js');
const { MessageSenderV4 } = require('./MessageSender-V4.js');
const state = require('./state-V4.js');
const { chooseNext, firstSlot } = require('./slots-V4.js');
const { createVariables } = require('./variables-V4.js');
const { createServices } = require('./services/index.js');

// Handler per tipo di nodo. Aggiungere qui i nuovi type man mano che si migrano.
const HANDLERS = {
  // core conversazionale
  start: require('./nodes/start-V4.js'),
  reply: require('./nodes/reply-V4.js'),
  replyv2: require('./nodes/replyv2-V4.js'),
  randomreply: require('./nodes/randomreply-V4.js'),
  close: require('./nodes/close-V4.js'),
  defaultFallback: require('./nodes/defaultFallback-V4.js'),
  // logica / navigazione (Fase 1)
  wait: require('./nodes/wait-V4.js'),
  delete: require('./nodes/delete-V4.js'),
  hmessage: require('./nodes/hmessage-V4.js'),
  flow_log: require('./nodes/flow_log-V4.js'),
  leadupdate: require('./nodes/leadupdate-V4.js'),
  connect_block: require('./nodes/connect_block-V4.js'),
  capture_user_reply: require('./nodes/capture_user_reply-V4.js'),
  replacebotv3: require('./nodes/replacebotv3-V4.js'),
  'setattribute-v2': require('./nodes/setattribute-v2-V4.js'),
  condition: require('./nodes/condition-V4.js'),
  jsoncondition: require('./nodes/jsoncondition-V4.js'),
  iteration: require('./nodes/iteration-V4.js'),
  // routing / operatore (Fase 2)
  agent: require('./nodes/agent-V4.js'),
  department: require('./nodes/department-V4.js'),
  move_to_unassigned: require('./nodes/move_to_unassigned-V4.js'),
  clear_transcript: require('./nodes/clear_transcript-V4.js'),
  add_tags: require('./nodes/add_tags-V4.js'),
  ifopenhours: require('./nodes/ifopenhours-V4.js'),
  ifonlineagentsv2: require('./nodes/ifonlineagentsv2-V4.js'),
  // HTTP / integrazioni (Fase 3)
  webrequestv2: require('./nodes/webrequestv2-V4.js'),
  web_response: require('./nodes/web_response-V4.js'),
  email: require('./nodes/email-V4.js'),
  whatsapp_static: require('./nodes/whatsapp_static-V4.js'),
  whatsapp_attribute: require('./nodes/whatsapp_attribute-V4.js'),
  send_whatsapp: require('./nodes/send_whatsapp-V4.js'),
  // AI / LLM / KB (Fase 4)
  ai_prompt: require('./nodes/ai_prompt-V4.js'),
  askgptv2: require('./nodes/askgptv2-V4.js'),
  gpt_assistant: require('./nodes/gpt_assistant-V4.js'),
  ai_condition: require('./nodes/ai_condition-V4.js'),
  add_kb_content: require('./nodes/add_kb_content-V4.js'),
};

// Comandi di avvio conversazione accettati dal server:
//  - "\start" (backslash): inviato esplicitamente (es. chat-cli, bot legacy v3);
//  - "/start"  (slash): inviato dal server in autostart per i chatbot nuovi.
const START_COMMANDS = ['\\start', '/start'];
// Guard anti-loop sul walk del grafo. Alzato a 500 perché `iteration` re-entra nel
// nodo una volta per item NELLO STESSO walk (il corpo del loop si ricollega): un
// loop su N item con corpo di K nodi consuma ~N*(K+1) step.
const MAX_STEPS = 500;

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
  const { projectId, requestId, token, tdcache, tilebotEndpoint, bot, botId } = ctx;
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

  // HandlerContext: passato a ogni handler. `params` è un getter così riflette i
  // refresh fatti dopo le action che scrivono variabili.
  const variables = createVariables(tdcache, requestId);
  const services = createServices({ projectId, requestId, token, apiEndpoint: ctx.apiEndpoint, tdcache });
  const handlerCtx = {
    tdcache,
    requestId,
    projectId,
    token,
    tilebotEndpoint,
    botId,
    bot,
    sender,
    message: ctx.message,
    nodes,
    variables,
    services,
    get params() {
      return sender.params;
    },
    fill(text) {
      return sender.filler.fill(text || '', { ...sender.params });
    },
  };

  const pendingNoInput = await walk({ entryNode, nodes, sender, tdcache, requestId, handlerCtx });

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
async function walk({ entryNode, nodes, sender, tdcache, requestId, handlerCtx }) {
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

    // Contratto handler retro-compatibile: i 5 handler storici sono sincroni e
    // ignorano il 2° argomento; i nuovi sono `async execute(node, ctx)`.
    let result;
    try {
      result = await Promise.resolve(handler.execute(node, handlerCtx));
    } catch (err) {
      winston.error(`(TiledeskChatbotV4) errore handler '${node.type}' (${node.id}): `, err);
      if (handlerCtx && handlerCtx.variables) {
        await handlerCtx.variables.set('flowError', String((err && err.message) || err));
        await sender.refreshParams();
      }
      // Instrada al ramo errore se esiste (error/false/fallback), altrimenti termina.
      const errTarget = firstSlot(node, ['error', 'false', 'fallback']);
      if (errTarget) {
        node = NodesDataSourceV4.byId(nodes, errTarget);
        continue;
      }
      return null;
    }
    result = result || {};

    if (result.messages && result.messages.length > 0) {
      await sender.sendV4Messages(result.messages, result.buttonSlotMap);
    }

    // Action che ha scritto variabili → ricarica i params del sender (così i reply
    // successivi vedono i nuovi valori).
    if (result.touchedVariables) {
      await sender.refreshParams();
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

    node = NodesDataSourceV4.byId(nodes, chooseNext(node, result));
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
