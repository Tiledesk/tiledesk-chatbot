var mongoose = require('mongoose');
var Schema = mongoose.Schema;

/**
 * Read-only mirror of the `namespaces` collection owned by tiledesk-server
 * (models/kb_setting.js). The connector only reads from it — namespaces are
 * created and updated exclusively through the server API — so the schema
 * declares just the fields it needs and stays non-strict for everything else.
 */
var EngineSchema = new Schema({
  name: String,
  type: String,
  apikey: String,
  vector_size: Number,
  index_name: String,
  host: String,
  port: String,
  deployment: String
}, { _id: false, strict: false });

var NamespaceSchema = new Schema({
  id: String,
  id_project: String,
  name: String,
  hybrid: Boolean,
  engine: EngineSchema
}, { strict: false, collection: 'namespaces' });

var namespace = mongoose.model('namespace', NamespaceSchema, 'namespaces');

module.exports = namespace
