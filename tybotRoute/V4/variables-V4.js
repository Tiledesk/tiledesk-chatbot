const winston = require('../utils/winston');

/**
 * Facade sulle VARIABILI di conversazione del motore V4.
 *
 * Le variabili vivono nell'hash Redis `tilebot:requests:<requestId>:parameters`
 * (stesso store del runtime V3): riusiamo i metodi statici di `engine/TiledeskChatbot.js`
 * (`addParameterStatic`/`allParametersStatic`/`getParameterStatic`/`deleteParameterStatic`).
 *
 * È il PUNTO UNICO da cui gli handler V4 leggono/scrivono variabili: così un `reply`
 * successivo (dopo `sender.refreshParams()`) vede subito i valori scritti da un'action.
 */
function createVariables(tdcache, requestId) {
  // lazy require per evitare cicli di import con l'engine V3.
  const engine = () => require('../engine/TiledeskChatbot.js').TiledeskChatbot;

  return {
    async get(name) {
      if (!tdcache || name == null) return null;
      try {
        return await engine().getParameterStatic(tdcache, requestId, name);
      } catch (err) {
        winston.error('(variables-V4) get error: ', err);
        return null;
      }
    },

    async set(name, value) {
      if (!tdcache || name == null) return;
      try {
        await engine().addParameterStatic(tdcache, requestId, name, value);
      } catch (err) {
        winston.error('(variables-V4) set error: ', err);
      }
    },

    async delete(name) {
      if (!tdcache || name == null) return;
      try {
        await engine().deleteParameterStatic(tdcache, requestId, name);
      } catch (err) {
        winston.error('(variables-V4) delete error: ', err);
      }
    },

    async all() {
      if (!tdcache) return {};
      try {
        return (await engine().allParametersStatic(tdcache, requestId)) || {};
      } catch (err) {
        winston.error('(variables-V4) all error: ', err);
        return {};
      }
    },
  };
}

module.exports = { createVariables };
