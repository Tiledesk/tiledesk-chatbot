var mongoose = require('mongoose');
var Schema = mongoose.Schema;

/**
 * Read-only view of the Design Studio V4 `nodes` collection.
 *
 * Questo runtime esegue SOLO i chatbot v3 (collection `faqs`). I chatbot
 * editati nel Design Studio V4 vivono nella collection `nodes` (schema v4),
 * che il runtime non sa eseguire. Questo model serve UNICAMENTE a RILEVARE
 * se un bot è "v4" (cioè ha almeno un node) così che l'engine possa fermarsi.
 *
 * Collection allineata a tiledesk-server-V4/models/node.js (`collection: 'nodes'`).
 * `strict: false`: non ci interessa lo shape completo, solo `id_faq_kb`.
 */
var NodeSchema = new Schema({
  id_faq_kb: { type: String, index: true }
}, { collection: 'nodes', strict: false });

module.exports = mongoose.models.node || mongoose.model('node', NodeSchema);
