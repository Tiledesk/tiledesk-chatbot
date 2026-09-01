const fs = require('fs');
const path = require('path');
const winston = require('../utils/winston');

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
 * This module lives at tybotRoute/directives/ and walks the directive modules
 * in this folder and its domain subfolders (ai/, integrations/, conversation/,
 * flow/, agents/, data/, bot/, tiledesk/), recursively, building the
 * directive-name -> class map from those declarations. Adding a directive is
 * therefore a one-file change: create the file in the subfolder its domain
 * belongs to, declare `static directiveNames`, done. No registration list to
 * keep in sync, and the subfolder a directive lives in has no effect on the
 * map it produces.
 *
 * Files with no class declaring `directiveNames` simply contribute nothing.
 * That covers the helpers that share this tree -- Directives.js and
 * BaseDirective.js, the base class the directives extend, which declares no
 * `directiveNames` of its own -- and the currently undispatched DirCondition,
 * DirDisableInputText and DirMessageToBot. Note the lookup is
 * `hasOwnProperty`, not a plain property read, so a subclass's inherited
 * `directiveNames` is never mistaken for its own declaration.
 */

/**
 * Type-only imports (erased at runtime, so no require and no cycle).
 *
 * @typedef {import('../types').DirectiveClass} DirectiveClass
 * @typedef {Record<string, DirectiveClass>} DirectiveRegistry
 *   Maps a lowercase directive name to the class that handles it. Several names
 *   may map to the same class.
 */

const DIRECTIVES_DIR = __dirname;

/**
 * Lists every `.js` module under `dir`, recursively, as a path relative to
 * DIRECTIVES_DIR (e.g. `ai/DirAskGPT.js`), skipping this file itself. Sorted so
 * the scan order -- and therefore any duplicate-name error -- is deterministic.
 *
 * @param {string} dir
 * @returns {string[]}
 */
function listDirectiveFiles(dir) {
  /** @type {string[]} */
  const found = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...listDirectiveFiles(full));
    } else if (entry.name.endsWith('.js') && full !== __filename) {
      found.push(path.relative(DIRECTIVES_DIR, full));
    }
  }

  return found.sort();
}

/**
 * Scans the directive modules in this folder and its subfolders, recursively,
 * and builds the directive-name -> class map from their `static directiveNames`
 * declarations.
 *
 * @returns {DirectiveRegistry}
 * @throws {Error} if two different classes claim the same directive name.
 */
function buildRegistry() {
  /** @type {DirectiveRegistry} */
  const registry = {};

  const files = listDirectiveFiles(DIRECTIVES_DIR);

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
