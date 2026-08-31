const fs = require('fs');
const path = require('path');
const winston = require('../../utils/winston');

/**
 * Directive registry.
 *
 * Every directive class declares the directive names it handles:
 *
 *   class DirBrevo extends BaseDirective {
 *     static directiveNames = [Directives.BREVO];
 *     ...
 *   }
 *
 * A class may declare several names (DirReply handles `reply`, `dtmf_form`,
 * `dtmf_menu`, ... ; DirMessage handles `hmessage` and `message`), so the map
 * is many-names-to-one-class.
 *
 * This module walks the directive modules in this folder and builds the
 * directive-name -> class map from those declarations, so adding a directive is
 * a one-file change: create the file, declare `static directiveNames`, done.
 * No registration list to keep in sync.
 *
 * Files with no class declaring `directiveNames` (helpers such as
 * Directives.js, and the currently undispatched DirCondition,
 * DirDisableInputText and DirMessageToBot) simply contribute nothing.
 */

/**
 * Type-only imports (erased at runtime, so no require and no cycle).
 *
 * @typedef {import('../../types').DirectiveClass} DirectiveClass
 * @typedef {Record<string, DirectiveClass>} DirectiveRegistry
 *   Maps a lowercase directive name to the class that handles it. Several names
 *   may map to the same class.
 */

const DIRECTIVES_DIR = __dirname;
const SELF = path.basename(__filename);

/**
 * Scans the directive modules in this folder and builds the
 * directive-name -> class map from their `static directiveNames` declarations.
 *
 * @returns {DirectiveRegistry}
 * @throws {Error} if two different classes claim the same directive name.
 */
function buildRegistry() {
  /** @type {DirectiveRegistry} */
  const registry = {};

  const files = fs.readdirSync(DIRECTIVES_DIR)
    .filter((file) => file.endsWith('.js') && file !== SELF)
    .sort();

  for (const file of files) {
    const exported = require(path.join(DIRECTIVES_DIR, file));
    if (!exported || typeof exported !== 'object') {
      continue;
    }
    for (const candidate of Object.values(exported)) {
      if (typeof candidate !== 'function') {
        continue;
      }
      const names = Object.prototype.hasOwnProperty.call(candidate, 'directiveNames')
        ? candidate.directiveNames
        : null;
      if (!Array.isArray(names)) {
        continue;
      }
      for (const name of names) {
        if (typeof name !== 'string' || name.length === 0) {
          winston.error("(directives/registry) Ignoring invalid directive name declared by " + candidate.name + " in " + file);
          continue;
        }
        const existing = registry[name];
        if (existing && existing !== candidate) {
          throw new Error(
            "(directives/registry) Duplicate directive name '" + name + "': claimed by both " +
            existing.name + " and " + candidate.name + " (" + file + ")"
          );
        }
        registry[name] = candidate;
      }
    }
  }

  return registry;
}

/**
 * The registry used by DirectivesChatbotPlug to dispatch a directive.
 *
 * @type {DirectiveRegistry}
 */
const directiveRegistry = buildRegistry();

module.exports = { directiveRegistry, buildRegistry };
