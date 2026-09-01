const mongoose = require('mongoose');
const Namespace = require("../models/namespace");
const winston = require('../utils/winston');

/**
 * Namespace lookups that go straight to MongoDB.
 *
 * The engine of a namespace carries the vector store credential. Since
 * tiledesk-server 2.22.7 the API scrubs it (`engine.apikey`) from every
 * namespace it returns, so that the platform-wide key cannot be harvested by
 * anything holding a token — see stripNamespaceSecrets in routes/kb.js. The
 * connector still has to put that key in the request it sends to the LLM
 * microservice, so it reads it from the database it is already connected to
 * instead of having the API hand it out over HTTP.
 */
class NamespaceService {

  constructor() {
    // Instance field so tests can substitute a stub for the model.
    this.model = Namespace;
  }

  // The connector runs without a database when it is fed static bots (tests,
  // embedded usage): querying then would just stall on mongoose buffering.
  isConnected() {
    return mongoose.connection.readyState === 1;
  }

  /**
   * Engine of a namespace, credential included, or null when it cannot be read.
   * Always scoped by project: a namespace id alone must never be enough to
   * reach another project's namespace.
   */
  async getEngine(namespace_id, id_project) {
    if (!namespace_id || !id_project) {
      winston.debug("NamespaceService getEngine: namespace_id and id_project are both required");
      return null;
    }

    if (!this.isConnected()) {
      winston.warn("NamespaceService getEngine: no database connection, the vector store apikey cannot be read (check MONGODB_URI)");
      return null;
    }

    try {
      const namespace = await this.model
        .findOne({ id: namespace_id, id_project: id_project })
        .select('engine')
        .lean()
        .exec();

      if (!namespace) {
        winston.warn("NamespaceService getEngine: namespace " + namespace_id + " not found for project " + id_project);
        return null;
      }

      return namespace.engine || null;
    } catch (err) {
      winston.error("NamespaceService getEngine error: ", err);
      return null;
    }
  }

}

var namespaceService = new NamespaceService();
module.exports = namespaceService;
