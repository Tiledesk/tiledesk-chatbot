var mongoose = require('mongoose');
var Schema = mongoose.Schema;

/**
 * Read-only mirror of the `integrations` collection owned by tiledesk-server
 * (models/integrations.js). Integrations are created and updated exclusively
 * through the server API — the connector only reads them — so the schema
 * declares just what it needs and stays non-strict for everything else.
 */
var IntegrationSchema = new Schema({
  id_project: String,
  name: String,
  value: Object
}, { strict: false, collection: 'integrations' });

var integration = mongoose.model('integration', IntegrationSchema, 'integrations');

module.exports = integration
