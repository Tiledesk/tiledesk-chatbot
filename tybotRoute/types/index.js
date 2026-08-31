/**
 * Shared JSDoc type declarations for the tybotRoute engine.
 *
 * This module deliberately contains NO runtime code. It exists so the shapes a
 * later TypeScript conversion needs are declared once, in one place, and can be
 * pulled into any file with a JSDoc typedef-import line naming this module,
 * e.g. `import('../types').DirectiveContext` -- see the headers of
 * BaseDirective.js, directives/registry.js and engine/RequestParameters.js for
 * the exact form. (The line is not spelled out here: a typedef tag written
 * inside this file's own doc comment would be parsed as a real declaration and
 * would collide with the definition below.)
 *
 * There is no build step and no `.ts` file: the typedefs below are read by the
 * editor (see `jsconfig.json` at the repo root, `checkJs` on) and are inert at
 * runtime. Requiring this module is safe from anywhere -- it imports nothing,
 * so it can never take part in a require cycle.
 *
 * The shapes are DESCRIPTIVE, not prescriptive: they were derived from what the
 * code actually builds and reads today (DirectivesChatbotPlug.processDirectives
 * builds the context; BaseDirective hoists from it; the directives read off
 * `this.context`). Several of them are intersected with `Record<string, any>`
 * because they are Tiledesk API wire objects that carry many more fields than
 * the engine touches -- narrowing those is a later, separate exercise.
 */

/* ------------------------------------------------------------------------- *
 * Wire objects (open shapes: only the fields the engine reads are declared)
 * ------------------------------------------------------------------------- */

/**
 * The support request the flow is running for.
 *
 * @typedef {{
 *   id_project?: string,
 *   request_id?: string,
 *   department?: { _id?: string } & Record<string, any>,
 *   draft?: boolean
 * } & Record<string, any>} SupportRequest
 */

/**
 * The bot document backing the running chatbot.
 *
 * `root_id` is the published-vs-draft discriminator: a draft/root copy has no
 * `root_id`, and the analytics calls in DirectivesChatbotPlug key off that.
 *
 * @typedef {{ root_id?: string, _id?: string } & Record<string, any>} Bot
 */

/**
 * The running chatbot engine instance (`TiledeskChatbot`), as seen by a
 * directive. Only the surface the directives and the dispatcher actually use is
 * declared here.
 *
 * @typedef {{
 *   bot?: Bot,
 *   MAX_STEPS?: number,
 *   MAX_EXECUTION_TIME?: number,
 *   _lastIntentId?: string,
 *   currentLockedAction?: (requestId: string) => Promise<string|null|undefined>
 * } & Record<string, any>} ChatbotLike
 */

/**
 * The reply message that produced the directives currently being executed.
 *
 * @typedef {{
 *   intent_id?: string,
 *   attributes?: {
 *     intent_info?: { intent_id?: string, intent_name?: string } & Record<string, any>
 *   } & Record<string, any>
 * } & Record<string, any>} Reply
 */

/**
 * The inbound message being processed.
 *
 * @typedef {{
 *   text?: string,
 *   attributes?: Record<string, any>
 * } & Record<string, any>} Message
 */

/* ------------------------------------------------------------------------- *
 * Cache
 * ------------------------------------------------------------------------- */

/**
 * The cache surface the engine and the directives rely on.
 *
 * This is the subset of `TdCache` (tybotRoute/cache/TdCache.js) that callers use; it
 * is declared structurally so the in-memory test doubles satisfy it too. Every
 * method listed here exists on TdCache -- nothing aspirational.
 *
 * @typedef {{
 *   get: (key: string) => Promise<string|null>,
 *   set: (key: string, value: any, options?: { EX?: number } & Record<string, any>) => Promise<void>,
 *   del: (key: string) => Promise<void>,
 *   hget: (dictKey: string, key: string) => Promise<string|null>,
 *   hset: (dictKey: string, key: string, value: any, options?: { EX?: number } & Record<string, any>) => Promise<void>,
 *   hgetall: (dictKey: string) => Promise<Record<string, string>|null>,
 *   hdel: (dictKey: string, key: string) => Promise<void>,
 *   expire: (key: string, seconds: number) => Promise<void>,
 *   subscribe: (topic: string, callback: (message: string, topic: string) => void) => Promise<void>,
 *   unsubscribe: (topic: string) => Promise<void>,
 *   connect: (callback?: (err?: Error) => void) => Promise<void>
 * }} TdCacheLike
 */

/* ------------------------------------------------------------------------- *
 * Directives
 * ------------------------------------------------------------------------- */

/**
 * The action payload carried by a directive.
 *
 * The three underscore-prefixed fields are set by the flow designer and read by
 * the dispatcher (DirectivesChatbotPlug):
 *  - `_tdActionId`    identifies the block; also the action-lock key.
 *  - `_tdActionTitle` the human block name, used for analytics.
 *  - `_tdThenStop`    stops directive processing after this action.
 *
 * Everything else is directive-specific, hence the open shape.
 *
 * @typedef {{
 *   _tdActionId?: string,
 *   _tdActionTitle?: string,
 *   _tdThenStop?: boolean,
 *   name?: string
 * } & Record<string, any>} Action
 */

/**
 * A single directive as parsed out of a reply and handed to `execute()`.
 *
 * `name` is matched case-insensitively against the directive registry
 * (see tybotRoute/tiledeskChatbotPlugs/directives/registry.js).
 *
 * @typedef {{ name: string, action?: Action }} Directive
 */

/**
 * The continuation a directive invokes when it is done.
 *
 * Passing `stop === true` ends directive processing for this reply; anything
 * else (including no argument) continues with the next directive.
 *
 * @typedef {(stop?: boolean) => void} DirectiveCallback
 */

/**
 * The object every directive's constructor receives.
 *
 * Built once per reply by `DirectivesChatbotPlug.processDirectives()` and
 * passed unchanged to each handler; `BaseDirective` hoists `tdcache`,
 * `requestId`, `projectId`, `token` and `API_ENDPOINT` off it onto `this`.
 *
 * `log` is NOT set by the dispatcher today -- a handful of directives read
 * `context.log` and get `undefined`. It is declared optional to keep the shape
 * honest about what those directives expect.
 *
 * @typedef {object} DirectiveContext
 * @property {string} [projectId]                 Project the request belongs to (`supportRequest.id_project`).
 * @property {ChatbotLike} [chatbot]              The running chatbot engine instance.
 * @property {Message} [message]                  The inbound message being processed.
 * @property {string} [token]                     Tiledesk API token for this request.
 * @property {SupportRequest} [supportRequest]    The support request being served.
 * @property {Reply} [reply]                      The reply whose directives are executing.
 * @property {string} [requestId]                 `supportRequest.request_id`; the cache-key root.
 * @property {string} [API_ENDPOINT]              Tiledesk API base URL.
 * @property {string} [TILEBOT_ENDPOINT]          Tilebot service base URL.
 * @property {string} [departmentId]              `supportRequest.department._id`, when present.
 * @property {TdCacheLike} [tdcache]              Cache used for flow attributes and locks.
 * @property {string} [HELP_CENTER_API_ENDPOINT]  Help Center API base URL.
 * @property {any} [log]                          Legacy; read by some directives, never set by the dispatcher.
 */

/**
 * A directive handler class as stored in the registry: constructible from a
 * `DirectiveContext` and exposing `execute()`.
 *
 * @typedef {new (context: DirectiveContext) => { execute: (directive: Directive, callback: DirectiveCallback, ...rest: any[]) => any }} DirectiveClass
 */

// Types only. Nothing to export at runtime; the empty object keeps `require()`
// of this module harmless (and cycle-free) for anyone who reaches for it.
module.exports = {};
