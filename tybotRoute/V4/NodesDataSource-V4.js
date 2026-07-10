const Node = require('../models/node.js');
const winston = require('../utils/winston');

/**
 * Datasource dei nodi V4 (Design Studio V4).
 *
 * Legge la collection `nodes` (model `../models/node.js`) per un bot e offre
 * gli helper di navigazione del grafo. Sola lettura: il runtime esegue il
 * flow, non lo modifica.
 */
class NodesDataSourceV4 {

  constructor(botId) {
    if (!botId) {
      throw new Error('NodesDataSourceV4: botId è obbligatorio');
    }
    this.botId = botId;
  }

  /** Tutti i nodi del bot (lean → plain object). */
  async getNodes() {
    const nodes = await Node.find({ id_faq_kb: this.botId }).lean().exec();
    winston.debug(`(NodesDataSourceV4) caricati ${nodes ? nodes.length : 0} nodi per bot ${this.botId}`);
    return nodes || [];
  }

  /** Nodo di ingresso (`type: 'start'`). */
  static startNode(nodes) {
    return (nodes || []).find((n) => n.type === 'start') || null;
  }

  /** Primo nodo `defaultFallback`. */
  static fallbackNode(nodes) {
    return (nodes || []).find((n) => n.type === 'defaultFallback') || null;
  }

  /** Nodo per id. */
  static byId(nodes, id) {
    if (!id) return null;
    return (nodes || []).find((n) => n.id === id) || null;
  }

  /**
   * Slot di forward "diretto" di un nodo: lo slot con key `direct`, altrimenti
   * (back-compat) il primo slot disponibile. Ritorna l'id del nodo target o null.
   */
  static directNext(node) {
    const slots = (node && node.slots) || [];
    // SOLO lo slot 'direct' = forward automatico. NIENTE fallback a slots[0]:
    // un nodo con soli slot 'button' deve FERMARSI e attendere il click, non
    // auto-navigare al target di un bottone.
    const direct = slots.find((s) => s.key === 'direct');
    return direct ? (direct.nextNode || null) : null;
  }

  /** Mappa { buttonId -> nextNode } per gli slot con key 'button' (routing dei bottoni). */
  static buttonSlotMap(node) {
    const map = {};
    for (const s of (node && node.slots) || []) {
      if (s.key === 'button') map[s.id] = s.nextNode || null;
    }
    return map;
  }

  /** Target del nodo associato a una specifica slot key (es. da un bottone). */
  static nextBySlotKey(node, key) {
    const slots = (node && node.slots) || [];
    const slot = slots.find((s) => s.key === key);
    return slot ? (slot.nextNode || null) : null;
  }

  /** Target del nodo associato a uno specifico `slot.id` (routing per id: rami
   *  `ai_condition`, analogo ai bottoni). Funziona anche sui vecchi slot
   *  `intent_<id>` dei bot legacy, perché `slot.id === branch.id` è invariato. */
  static nextBySlotId(node, id) {
    if (!id) return null;
    const slots = (node && node.slots) || [];
    const slot = slots.find((s) => s.id === id);
    return slot ? (slot.nextNode || null) : null;
  }
}

module.exports = { NodesDataSourceV4 };
