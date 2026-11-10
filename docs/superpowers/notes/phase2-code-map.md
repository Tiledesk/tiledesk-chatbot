# Phase 2 code map (facts only, read from feature/execution-traceability in all four repos)

Short names: CB = /Users/nicocardone/Desktop/DEV/TILEDESK/tiledesk-chatbot/tybotRoute,
EX = /Users/nicocardone/Desktop/DEV/TILEDESK/tiledesk-executions/src,
SV = /Users/nicocardone/Desktop/DEV/TILEDESK/tiledesk-server,
DB = /Users/nicocardone/Desktop/DEV/TILEDESK/tiledesk-dashboard/src/app.

---------------------------------------------------------------------------------------------
## A. tybot (CB)

### A1. executions/ExecutionRecorder.js (642 lines)

Module-private helpers (not exported): `warn` :21, `parametersKey` :25, `readState(ctx)` :32, `captureData(store,idProject)` :42,
`withinBudget(p,ms)` :56, `defer(job)` :69, `emit(ctx,type,build,seqP)` :87, `sealInto` :100, `sealableState` :114,
`countChanged` :124, `actionRecord` :134, `isAutomation(ctx)` :138 (`request_id.startsWith('automation-request-')`),
`openStep` :517, `recordAction` :531, `recordBlockExit` :578, `writeExecutionId` :625.
Constants: `OUTCOME_RANK = { success:0, failure_condition:1, error:2 }` :13 (no `interrupted`; an unknown outcome compares as NaN and is ignored in the step outcome, :586-588).

Export: `module.exports = ExecutionRecorder` :642, a plain object with these members:

| member | line | signature / behaviour |
|---|---|---|
| `init` | 145 | `init({ store, apiEndpoint } = {})` called from index.js:797 |
| `_resetForTests` / `_drainForTests` | 150 / 155 | test hooks |
| `onMessageIn` | 160 | `async onMessageIn({ message, bot, botId, requestId, projectId, token, store } = {})` -> ctx or null. Resolves/creates execution via `store.resolve`, builds ctx, emits `execution.started` when `resolved.created`, then `writeExecutionId` (fire-and-forget PUT of attributes.execution_id) unless automation |
| `withScope` | 237 | `withScope(ctx, name, fn)` message_in / jump_params write labelling |
| `blockEntry` | 253 | `async blockEntry(ctx, { blockId, blockName })` -> reads state, `openStep` -> emits `step.started`; sets `ctx.step` |
| `runAction` | 306 | `runAction(ctx, { index, directive }, fn)` wraps `handler.execute`; returns `fn()` untouched when `!ctx \|\| !ctx.step \|\| ctx._failed`. Sets up `WriteTap.runAction` ALS store with `onJump` hook; on sync throw / rejection calls `afterAction`+`blockExit`+`endOfChain` and rethrows |
| `afterAction` | 360 | `afterAction(ctx, args)` idempotent per index; `recordAction` emits `action.completed` |
| `blockExit` | 377 | `blockExit(ctx)` idempotent per step; emits `step.completed`, writes state |
| `endOfChain` | 383 | `async endOfChain(ctx)`; no-op if `ctx.jumpInFlight \|\| _failed \|\| _chainEnded`; automation -> `execution.ended` + `setStatusHint('completed')`; conversation -> `execution.idle` |
| `failed` | 399 | `async failed(ctx, { error_code, message })` -> `execution.failed` + `setStatusHint('failed')` |
| `beforeJump` | 423 | `beforeJump(message)` called by TilebotService.sendMessageToBot; adds `payload.attributes.execution_id`; returns promise bounded by `jumpBudgetMs` |
| `onSubagentCall` / `onSubagentReturn` | 453 / 473 | alias + agent_stack frames |
| `onHandedToBot` | 485 | `execution.handed_to_bot` + `setHandoff` |
| `wrapTheEnd` | 497 | wraps `theend` so blockExit+endOfChain run once |

ctx shape (built in onMessageIn, ExecutionRecorder.js:182-203):
```js
ctx = { execution_id, id_project, agent_id /*root id*/, agent_version /*botId*/, agent_name, request_id, test, trigger,
  step: null, current: null, prev: null, scopes: { message_in:Set, jump_params:Set }, kf: { blocks_since, delta_bytes },
  jumpInFlight: false, _store, _cfg, _projectKey, _captureData, _hasState, _blocks, _failed, _chainEnded }
```
ctx.step (openStep :517): `{ seq, block_id, block_name, started_at, actions:[], outcome, exit_taken, before, stateless, exitPending }`.
There is NO `signal`, `abort`, `stopFlag`, `owner` or `lease` field in ctx today. Where ctx lives: `chatbot.execution = ctx` (index.js:146),
`DirectivesChatbotPlug.execution` (DirectivesChatbotPlug.js:94 `this.execution = config.execution || null`); directives reach it as
`this.context.chatbot.execution` (the DirectivesChatbotPlug `context` object, built :158-170, has no execution/signal key).

Emission: `emit(ctx, type, build, seqP)` :87 does `await store.nextSeq(execution_id)` (INCR `exec:{id}:seq`), then `defer()` (setImmediate) builds
`buildEnvelope({ctx,seq,type,data})` and `getEmitter().emit(envelope)`. `emit` is private: a new event type (e.g. `execution.stopped`,
`execution.message_while_stopped`) needs a new exported method on ExecutionRecorder (or exporting `emit`).
Envelope = TraceEmitter.js:`buildEnvelope` (`event_version:1,type,execution_id,seq,at,id_project,agent_id,agent_version,request_id,pod:os.hostname(),data`).
TraceEmitter.emit routes to `exec.<id_project>.<type>` (TraceEmitter.js:44); transport = executions/amqpTransport.js (topic exchange `tiledesk.executions`, confirm channel, publish-only, no consume).

Event types emitted today (complete list): `execution.started` (:223 in onMessageIn), `step.started` (openStep :525), `action.completed` (recordAction :561),
`step.completed` (recordBlockExit :610), `execution.idle` (:392), `execution.ended` (:388), `execution.failed` (:405), `execution.handed_to_bot` (:489).
NOT emitted anywhere: `execution.stopping/stopped/resumed/checkpoint/destroyed/message_while_stopped`, `audit.recorded`.

Other executions/ files: `OutcomeMapper.js` (`mapOutcome({action,jumpedTo,error})` -> `success|failure_condition|error`, no `interrupted`),
`WriteTap.js` (AsyncLocalStorage; `runAction({executionId,stepSeq,actionIndex,actionId,requestId,onJump},fn)`, `current()`),
`config.js` (`getConfig()` env reader, `isEnabled()`; no stop/lease/control settings yet), `trigger.js`, `botIdentity.js` (`rootIdOf`), `Sealer.js`, `StateDiff.js`, `secrets.js`.

### A2. executions/ExecutionStore.js (211 lines) - `class ExecutionStore` over `tdcache.client` (node-redis v4); every method swallows errors and returns null/void

Exports `{ ExecutionStore, TERMINAL }` :211; `TERMINAL = ['completed','failed','destroyed']` :7; `TTL = 604800`, `HANDOFF_TTL = 600`.
Methods: `constructor(redisClient)` :28, `resolve({requestId,agentId,hintedExecutionId,meta,withState})` :41, `nextSeq(id)` :116, `getState(id)` :128,
`setState(id,value)` :138, `setAlias(requestId,agentId,executionId)` :146, `deleteAlias` :154, `_hSetIfExists(id,field,value)` :162, `_stack(id)` :166,
`pushFrame` :171, `popFrame` :181, `setHandoff(requestId,value)` :194, `setStatusHint(id,status)` :202.

Redis keys used today:
- `exec:req:{request_id}:{agent_id}` string EX 7d (helper `reqKey` :17; also subagent alias)
- `exec:{id}` hash (`execKey` :18): fields `id_project, agent_id, agent_version, agent_name, request_id, test, trigger(JSON), status('running' at creation), created_at, agent_stack(JSON)` ; EX 7d
- `exec:{id}:seq` counter; `exec:{id}:state` JSON (StateRecorder snapshot); `exec:handoff:{request_id}` EX 600 s
- `exec:policy:{id_project}` hash field `capture_data` (read only, ExecutionRecorder.js:47)
Not present anywhere in tybot: `exec:{id}:owner`, `exec:{id}:transit`, `exec:{id}:stop`, `exec:{id}:cp`, channel `exec:control`. (grep: no occurrences.)
`resolve` decides reuse by `hGet(exec:{id},'status')`; only `completed|failed|destroyed` count as terminal (:7, :47-52, :55). A hash status of `stopped`/`stopping` would therefore be REUSED (not terminal), which is what the design wants. Tests: test/executions_store_test.js.

### A3. Redis client creation / subscribe

- `TdCache` class: CB/TdCache.js. `connect()` :19-58 creates TWO node-redis v4 clients: `this.client` (:24, `redis.createClient({url:`redis://${host}:${port}`, password})`) and `this.subscriberClient` (:46-47, same options) - a dedicated pub/sub connection ALREADY exists. No username (ACL user) option; password only.
- Wrapper methods: `publish(key,value)` :158 (`this.client.publish`), `subscribe(topic, callback)` :162 (`subscriberClient.subscribe(topic, msg => callback(msg, topic))`, throws if callback missing), `unsubscribe(topic)` :176 (unsubscribes the whole channel). No `pSubscribe`.
- Instantiated in index.js:734 (`tdcache = new TdCache({host:settings.REDIS_HOST, port:settings.REDIS_PORT, password:settings.REDIS_PASSWORD})`), connected in `connectRedis()` index.js:784-799; `ExecutionRecorder.init({ store: new ExecutionStore(tdcache.client), apiEndpoint })` index.js:797 (the natural place for a ControlListener to call `tdcache.subscribe('exec:control', cb)`).
- Only existing subscribe use: index.js:689 `await tdcache.subscribe(topic, listener)` for `/webhooks/<request_id>` (sync automation) and index.js:681 `tdcache.unsubscribe(topic)` inside the listener. One subscription per sync request, unsubscribed on first message.
- `redis` ^4.7.1, `amqplib` ^0.10.9, `uuid` ^11.1.1, `axios` ^1.21.0 (package.json in tybotRoute and repo root).

### A4. DirectivesChatbotPlug.js (439 lines) - CB/tiledeskChatbotPlugs/DirectivesChatbotPlug.js

- `constructor(config)` :84-96; `this.execution = config.execution || null` :94.
- `processDirectives(theend)` :131: `this.theend = ExecutionRecorder.wrapTheEnd(this.execution, theend)` :132; builds `this.context` :158-170; `this.curr_directive_index = -1` :174; `const next_dir = await this.nextDirective(directives)` :178; `await this.process(next_dir)` :180.
- `nextDirective(directives)` :190-231: `TiledeskChatbot.checkStep(...)` :192 (the existing "before each action" gate; increments `:step`, checks MAX_STEPS / MAX_EXECUTION_TIME). On error: analytics + `ExecutionRecorder.failed(...)` :206 + returns `this.errorMessage(go_on.error)` (a message directive with `_tdThenStop:true`).
  `nextDirective` is called (a) at :178 for the first action, (b) in the lock-skip branch of `process` (~:251), (c) in the callback after each action :370, (d) unknown-handler branch :333. So it runs once per action to be run = the natural stop-flag point.
- `process(directive)` :237: null directive -> `return this.theend()` :241; lock check :247-254 (uses `chatbot.currentLockedAction`); handlers map :257-327 (`new HandlerClass(context)` :336 - every directive gets the same `context` object, so `context.signal` would be seen by every directive's constructor/`this.context`).
- Action run: `ExecutionRecorder.runAction(this.execution, { index: actionIndex, directive }, () => handler.execute(directive, async (stop) => {...}))` :343. Inside the callback: analytics :344-366, `ExecutionRecorder.afterAction(...)` :367, `if (stop) return this.theend()` :368-371, else `nextDirective` :372 + recursive `process` :373.
- index.js does NOT await `processDirectives` (index.js:211 `directivesPlug.processDirectives( () => {...})`), so the /ext handler returns while actions are still running; a hard stop therefore needs the AbortRegistry, not the HTTP handler.
- checkStep itself: CB/engine/TiledeskChatbot.js:658 (`static async checkStep(_tdcache, requestId, max_steps, max_execution_time)`; keys `...:step`, `...:started`).
- `/ext` pipeline into the block: `TiledeskChatbot.execIntent` engine/TiledeskChatbot.js:367-368 calls `ExecutionRecorder.blockEntry`; intent parameters with jump scope :169-178.

### A5. Long-running directives (dir = CB/tiledeskChatbotPlugs/directives/)

HTTP client facts first:
- `CB/utils/HttpUtils.js` `request(options, callback)` :8-48 builds `axios_options = {url, method, params, headers, data?, timeout?, httpsAgent?}` and calls `axios(axios_options)` :31. `options.signal` is NOT copied (only `timeout` was added). Adding `signal: options.signal` there would cover every `httpUtils.request` caller. Error path: `callback(error, null)` :42; an aborted axios call surfaces as `error.code === 'ERR_CANCELED'` (CanceledError).
- `services/AIService.js` only has `speechToText` (httpUtils.request :25). `services/KbService.js` (httpUtils.request :21,60,82: getNamespace, addUnansweredQuestion, addAnsweredQuestion). `services/IntegrationService.js` (httpUtils :85). No LLM SDK clients anywhere: all LLM/KB calls are plain axios through httpUtils.request.
- DirectiveS get `context` only; none has any signal today.

| Directive | Long wait (file:line) | Client | AbortSignal possible? |
|---|---|---|---|
| DirWait | `setTimeout(() => callback(), action.millis)` DirWait.js:64 (millis clamped 1000..20000 for the `parameter` form; `action.millis` from the designer is unclamped) | timer, no handle kept | clear the timer on abort (store handle) |
| DirWebRequest (v1) | `this.myrequest(...)` :73; `myrequest` :126, `axios(axios_options)` :142, raw `axios`, NO timeout, no maxContentLength | axios directly | add `signal` to `axios_options` |
| DirWebRequestV2 | `this.#myrequest(...)` :110; `#myrequest` :314, `axios(axios_options)` :336 with `timeout` (default 20000 ms via `#webrequest_timeout(action,20000,1,300000)` :97, :383); formData URL fields `axios.get(field.value,{responseType:'stream'})` :208 | axios directly | add `signal` in both places |
| DirGptTask | OpenAI call `httpUtils.request(HTTPREQUEST, ...)` :202 (url `process.env.OPENAI_ENDPOINT + "/chat/completions"` :122); quota check `httpUtils.request` :329 and :359 (a second call) | httpUtils.request | via HttpUtils change; HTTPREQUEST object is local |
| DirAiPrompt (also exports DirAiTask) | LLM call `httpUtils.request` :446 (`AI_endpoint + apiEndpoint`); quota :674 and :704; MCP/other :955; `axios.head(source)` :974 | httpUtils (+ one axios.head) | same |
| DirAskGPT | `httpUtils.request` :144 (`kb_endpoint + "/qa"`); quota :259 | httpUtils | same |
| DirAskGPTV2 | `/qa` call `httpUtils.request` :408; namespaces fetch :654; also `kbService.addAnsweredQuestion/addUnansweredQuestion` :468/:490 (fire-and-forget) | httpUtils | same |
| DirAiCondition | `/ask` call `httpUtils.request` :367; quota :603, :633 | httpUtils | same |
| DirSendEmail | `await this.tdClient.sendEmail(message)` DirSendEmail.js:63 -> `@tiledesk/tiledesk-client` `TiledeskClient.myrequest` (node_modules/@tiledesk/tiledesk-client/index.js:2190 sendEmail, :2601 myrequest builds its own `axios_settings`, no signal/timeout) | third-party client over axios | NOT without changing the client library (degrade to soft) |
| DirSendWhatsapp | `httpUtils.request` :102 | httpUtils | same |
| DirCode | `evaluateJavascriptExpression` is synchronous (TiledeskExpression.js `vm` with `timeout: 200` at :255, :318) | node vm | n/a (200 ms bound, cannot be aborted mid-run) |
| others worth knowing | DirAssistant (OpenAI threads) `httpUtils.request` :296,351,406,434 + polling `setTimeout` wait :375; DirDocparseExtract `httpUtils.request` :477 + `setTimeout` :314; DirAddKbContent :183,219,250,274; DirMake/DirHubspot/DirCustomerio/DirBrevo raw `axios(axios_options)` (:198/:207/:206/:232); DirQapla :127; DirWhatsappByAttribute :80 | | |

CONSEQUENCE found while reading the error paths (abort does not stop the flow by itself): on `err` these directives run their normal failure branch.
- DirGptTask.js:79 and :139 `await this.#executeCondition(false, ...)` then `callback(true)`; without a falseIntent `callback()` continues to the next action.
- DirWebRequestV2.js:117-125: error -> `#executeCondition(false,...)` (a block JUMP through `tilebotService.sendMessageToBot`) or continues.
- DirWebRequest.js:77-81: `callback()` on err (continues).
- Quota checks (`/quotes/tokens`) resolve `true` on err (DirGptTask.js:~329-335 `if (err) resolve(true)`), so an aborted quota call lets the action proceed.
- DirAskGPT.js:148 reads `resbody.answer` BEFORE checking `err` (resbody is null on error -> TypeError in an async callback); an abort (or any HTTP error) there is an unhandled rejection today.
So an abort needs a guard outside the directives (e.g. ctx.aborted checked in the `runAction` callback / `TilebotService.sendMessageToBot` / `DirectivesChatbotPlug` callback), otherwise the interrupted action jumps to its error exit and the chain continues.

### A6. index.js /ext and /block

- `router.post('/ext/:botid')` index.js:49. Order: validate (:51-53), `message = req.body.payload` :60, private-note skip :75-79, `validateRequestId` :82 then `res.status(200).send({"success":true})` :84 (the HTTP answer is sent here, before anything runs), set `tilebot:botId_requests:<req>` :89-93, `isBotBubble` skip :98, bot load `getBotByIdCache` :113, **execution resolved at :118**:
  `const ctx = executionsEnabled() ? await ExecutionRecorder.onMessageIn({ message, bot, botId, requestId, projectId, token }) : null;`
  then `new TiledeskChatbot(...)` :120-137, `chatbot.execution = ctx` :146, updateRequestAttributes/transcript under `withScope('message_in')` :149-165, `chatbot.replyToMessage(message)` :168, then `new DirectivesChatbotPlug({... execution: ctx})` :196-210 and `processDirectives` :211.
  A "stop flag check before running anything" fits between :118 and :120 (ctx is known, no TiledeskChatbot built, no side effects yet; res already answered 200 so "answer 200, run nothing" is already satisfied; just `return` after emitting). `ctx._store.client` is the Redis client; `ctx.execution_id` the key. The check must also cover jumps (jump messages arrive as `/ext` with `sender:"_tdinternal"` and `payload.attributes.execution_id`).
- `router.post('/exec/:botid')` index.js:277 (used by `tilebotService.executeBlock`) has NO ExecutionRecorder wiring at all (no ctx, `new DirectivesChatbotPlug` at index.js:383 without `execution`; a third construction at index.js:470 (`/ext/:projectId/requests/:requestId/messages`) also without). Currently only referenced in a commented line (DirIntent.js:74).
- `router.post('/block/:project_id/:bot_id/:block_id')` index.js:612: does NOT create the execution. It builds `request_id = "automation-request-<project>-<uuid>"` (or `body.preloaded_request_id`) :628-636, a message `{payload:{recipient, text:"/#"+block_id, id_project, request:{request_id,draft}, attributes:{payload: body}}, token}` :644-659 and posts it to `/ext/<bot_id>` through `tilebotService.sendMessageToBot` (async :663 or sync :687-697). The execution (trigger `automation`) is therefore created in `/ext` :118 (`detectTrigger` in executions/trigger.js).
- Sync caller wait: index.js:671-697: `topic = `/webhooks/${request_id}`` :674; `listener = async (message, topic) => { await tdcache.unsubscribe(topic); json = JSON.parse(message); status = json.status || 200; return res.status(status).send(json.payload); }` :676-685; `await tdcache.subscribe(topic, listener)` :689; then `tilebotService.sendMessageToBot(message, bot_id, ...)` :694. No timeout on the subscription.
- WebResponse publish (exact): DirWebResponse.js:57-70:
```js
let webResponse = { status: filled_status, payload: json }
const topic = `/webhooks/${this.requestId}`;
this.tdcache.publish(topic, JSON.stringify(webResponse));   // :70, not awaited
```
  So a stop notice for a sync caller is the same call with `{status: 409, payload: {error:"execution_stopped", execution_id}}`; `tdcache.publish` is CB/TdCache.js:158.

---------------------------------------------------------------------------------------------
## B. tiledesk-executions (EX)

Stack: TypeScript ESM, express 4, zod, mongoose 8, ioredis 5, amqplib 0.10, axios, pino, vitest (package.json). Modes `api|ingest|jobs` (src/main.ts:11, :54).

### B1. API

- src/api/app.ts (50 lines): `createApp(opts)` :20. `API_PREFIX = "/executions/api/v1"` :18. Mount :39-40:
```ts
api.use("/projects/:projectid", requireUser(opts.auth), requirePermission("executions_read", { apiUrl: opts.apiUrl }));
api.use("/projects/:projectid/executions", executionsRouter());
```
  CORS (only if `EXECUTIONS_CORS_ORIGINS`) :34-38 allows methods `["GET","POST"]`. **There is no `express.json()` / body parser anywhere in app.ts** (grep: none), so `POST .../stop` bodies are not parsed today. Error handler :44-48 -> 500 `internal_error`. No metrics for control.
- src/api/routes/executions.ts (336 lines), `executionsRouter()` :192, `Router({mergeParams:true})`. Routes (all GET):
  `GET /` :195 (list), `GET /summary` :227, `GET /:id` :252, `GET /:id/state` :286, `GET /:id/state/history` :313. No POST/PUT/DELETE route exists.
- allowed_controls: hard-coded `allowed_controls: [],` at routes/executions.ts:273 inside the `GET /:id` response (`{ execution: toExecution(exec), steps, allowed_controls: [], lineage:{parent,previous,retry_of,retried_as} }` :270-280). The handler does not read `res.locals.role`.
- Mappers: `toRow` :111 (list row: _id, agent_id, agent_name, status, end_reason, trigger, started_at, duration_ms, steps_count, failure_conditions, vars_changed, trace_complete, test), `toExecution` :129 (adds id_project, agent_version, request_id, conversation_link, error, handed_to_bot_id, actions_count, ended_at, last_event_at, last_seq, missing_seq, has_checkpoint, has_data, retention), `toStep` :161. Explicit field lists (ROW_FIELDS :104) so internal fields never leak.
- List status filter accepts all seven statuses `LIST_STATUSES` :11, `enumList` :15. Summary counts only running/waiting/failed/stopped :243. `refuseGrant` :87 returns 400 `not_available_in_this_version` for any `grant=`.
- src/api/permissions.ts (28 lines):
```ts
export const PERMISSIONS = ["executions_read","executions_control","executions_destroy","executions_data_access","executions_audit_read"] as const;  // :1-7
STANDARD_ROLES: owner = all five; admin = read+control+data_access; supervisor = read; agent = none   // :17-22
export function can(subject: ProjectRole, perm: Permission): boolean  // :24 ; custom role -> subject.permissions.includes(perm)
```
- src/api/auth.ts (71 lines): `requireUser(cfg)` :23 sets `res.locals.user = { id, email, authHeader: "JWT <token>" }` (:43-44; `AuthUser` interface :8-12). Only `_id`/`id`, and `email` are read from the JWT payload; firstname/lastname are not read although the server signs `user.toObject()` into the token (server routes/auth.js: `jwt.sign(userJson,...)`, e.g. :377, :644). `requirePermission(perm, {apiUrl})` :53 calls `getProjectRole(pid, user.authHeader)` and sets `res.locals.role = ProjectRole` (:63) = `{ role: string, permissions: string[] }` (src/api/permissions.ts:11). No user name, no project_user id/name from `/me` is kept (src/api/projectRole.ts:59-66 reads only `role` and `rolePermissions`). 401/403/503(`role_unavailable`) behaviour :29-68.
- src/api/projectRole.ts: `getProjectRole` :28, GET `{TILEDESK_API_URL}/{pid}/project_users/me` :46, 60 s cache keyed sha256(auth)+pid :35-72, `RoleForbiddenError`/`RoleUnavailableError`, `PROJECT_ID_RE` :15.
- Config (src/config.ts, 35 lines): `PORT, MONGO_URI, AMQP_URL?, TYBOT_REDIS_URL?, TILEDESK_API_URL?, GLOBAL_SECRET?, GLOBAL_SECRET_OR_PUB_KEY?, GLOBAL_SECRET_ALGORITHM, JWT_AUDIENCE, JWT_ISSUER, DEFAULT_RETENTION_TRACE_DAYS(90), DEFAULT_RETENTION_DATA_DAYS(30), TEST_RETENTION_DAYS(7), INGEST_PREFETCH(50), INGEST_SHUTDOWN_TIMEOUT_MS, EXECUTIONS_CORS_ORIGINS` :5-26. No `EXECUTIONS_SERVICE_TOKEN`, no `VAULT_KEYS`, no Redis-ACL or control timeout settings.

### B2. Models (src/model/*.ts) and db.ts

Files: execution.ts, step.ts, sealedData.ts, stateChange.ts, stateManifest.ts, eventSeen.ts, pendingConversationEvent.ts, retention.ts. `src/db.ts:10` `models = [Execution, Step, SealedData, StateManifest, StateChange, EventSeen, PendingConversationEvent]`; `connectDb` :12 (`autoIndex:false`), `ensureIndexes` :18 creates indexes for those only.
There is NO `audit_log`, `grants`, `checkpoints` or `settings` model yet (grep "audit" finds only the permission string).
Execution schema (src/model/execution.ts:5-57): `_id` (String = execution_id), `id_project, agent_id, agent_name, agent_version, test, request_id, conversation_link, trigger{type,source_id,start_point_id,source_run_id}, status (String, required, free text), activity_seq, idle_seq, end_reason, error{code,message,step_seq}, handed_to_bot_id, failure_conditions, steps_count, actions_count, changed_keys, vars_changed, started_at, ended_at, last_event_at, duration_ms, last_seq, parent_execution_id, previous_execution_id, retry_of, retried_as[], trace_complete, missing_seq[], gap_checked_at, gap_checked_seq, has_checkpoint, has_data, retention{trace_until,data_until}, retention_final`. Indexes :60-66 (incl. TTL on `retention.trace_until`). `status` values the projector writes today: `running|waiting|completed|failed` only.

### B3. Projector and status table

- src/ingest/status.ts (22 lines): `STATUSES = ["running","waiting","completed","failed"]` :2 ("Phase 1 statuses (spec §6.1, restricted)"), `TERMINAL = ["completed","failed"]` :5,
```ts
const NEXT = { running:["waiting","completed","failed"], waiting:["running","completed","failed"], completed:[], failed:[] };  // :7-12
canTransition(from,to) :15 ; fromStatuses(to) :20
```
  No `stopping/stopped/destroyed` and no resume edges (`failed -> running`, `stopped -> running`).
- src/ingest/projector.ts (464 lines): `applyEvent(e, opts)` :66 switch :69-105 handles `conversation.closed|bot_left|bot_replaced` (-> `applyConversation` :259), `execution.started` :76, `step.started` :79, `action.completed` :83, `step.completed` :87, `execution.idle` :90, `execution.ended` :94, `execution.failed` :98, `execution.handed_to_bot` :101. Every tybot event first runs `upsertExecution` :114-141 (upsert by `_id`, `$setOnInsert status:"running"`).
  Key mechanics a stop status must live with:
  - `NOT_TERMINAL = fromStatuses("completed")` :50 = `[running, waiting]`.
  - `bumpSeq` :179-198 (called on every `step.started` / `action.completed` / `execution.idle`) rewrites `status` to `waiting` or `running` for any status in NOT_TERMINAL, from `activity_seq` vs `idle_seq`. `stopping`/`stopped` are not in NOT_TERMINAL so they would survive a bump, but they are also excluded from `finish()` (:204-221, filter `status: {$in: fromStatuses(to)}`) and from `endTargets` :310 (`status: {$in: NOT_TERMINAL}`): a `conversation.closed` for a `stopped` execution would not complete it (it gets parked 10 min :285-297 and then expires).
  - `finish(e, to, set, opts)` :204 is the only terminal writer; calls `opts.onTerminal(info)` (`TerminalInfo.status: "completed"|"failed"` :34) -> `writeBackTerminal` in tybotRedis.ts.
  - No `destroyed` terminal; `TerminalInfo` type and tybotRedis write-back would need `destroyed`.
- src/contracts.ts (233 lines): `EventEnvelope = z.discriminatedUnion("type", [ExecutionStarted, StepStarted, ActionCompleted, StepCompleted, ExecutionIdle, ExecutionEnded, ExecutionFailed, ExecutionHandedToBot, ConversationClosed, ConversationBotLeft, ConversationBotReplaced])` :200-212. `ActionCompleted.outcome` is `z.string()` :121 (accepts `interrupted`), `hard_degraded` optional boolean already present :125.
  **Unknown types are invalid**: src/ingest/consumer.ts:65-71 `EventEnvelope.parse(...)` failure -> `log.warn("invalid event, dead-lettered")`, `ingestEvents.inc({type:"invalid", result:"dlq"})`, `channel.nack(msg,false,false)` -> DLQ `executions.ingest.dlq`. So any `execution.stopping|stopped|resumed|checkpoint|destroyed|message_while_stopped` published before contracts.ts learns them lands in the DLQ. The queue binding is `exec.#` only (consumer.ts:159-163 `bindQueue(QUEUE, EXCHANGE, "exec.#")`), so `audit.<pid>.<action>` routing keys never reach ingest.
  `eventKey(e)` contracts.ts:229: `conversation.*` -> `${type}:${request_id}:${at}`; else `${execution_id}:${seq}`. Events from the api have no tybot seq counter: `exec:{id}:seq` is INCR'd by tybot only (ExecutionStore.nextSeq :116), so api-emitted `execution.stopping/destroyed` need a seq source (INCR on the same Redis key is possible, or a different dedupe key).
- Server-event base: contracts.ts:173-186 (`execution_id` nullable, no seq, no agent_*/pod).

### B4. src/ingest/tybotRedis.ts (41 lines)

Module-level `let client: Redis | undefined` (ioredis) :15; `initTybotRedis(url?)` :18 (`new Redis(url,{maxRetriesPerRequest:2})`, no-op + warn when `TYBOT_REDIS_URL` unset); `closeTybotRedis()` :27; `writeBackTerminal(info, redis=client)` :34: `COMPARE_AND_DELETE` Lua on `exec:req:{request_id}:{agent_id}` :39 and `HSET_IF_EXISTS` Lua on `exec:{id}` field `status` :40. Called from src/main.ts:44 ONLY in `ingest` mode (`initTybotRedis(cfg.TYBOT_REDIS_URL)`); the `api` and `jobs` modes never open a Redis connection (main.ts:41-51). ioredis is the client in this service (tybot uses node-redis v4); the URL is a plain `TYBOT_REDIS_URL` (ACL user would be in the URL).

### B5. src/jobs/*

`jobs/main.ts` (28 lines): `startJobs(intervalMs = JOBS_INTERVAL_MS(15000), gapCheck = recheckGaps)` :10; `setInterval(tick, intervalMs)` :23; a tick is skipped while the previous round runs (`running` promise :11-22); returns an async stop function. Only one job: `jobs/gaps.ts` `recheckGaps(now)` :13 (executions with `missing_seq`, `gap_checked_at` older than 60 s -> `trace_complete:false`). No reaper, no Redis, no AMQP in jobs mode. main.ts:50 `closers.push(startJobs())`. Retention = Mongo TTL indexes only.

### B6. AMQP in the api process

None. The api mode (main.ts:41-43) starts only the express app; `amqplib` is used in src/ingest/consumer.ts only: `startIngest(cfg)` :140 does `amqp.connect(cfg.AMQP_URL)` :146, `createChannel` :147 (NOT a confirm channel), `assertExchange("tiledesk.executions","topic",{durable:true})` :162, asserts DLQ/queue. Constants `EXCHANGE`, `QUEUE`, `DLQ` exported at consumer.ts:10-12. On connection loss it calls `process.exit(1)` (:144-153). `AMQP_URL` is documented as "ingest only" in README. No publisher helper exists in the service.

---------------------------------------------------------------------------------------------
## C. tiledesk-server (SV)

### C1. pubmodules/executions-publisher/index.js (230 lines)

- Transport: lazy `getChannel()` :55-87 (own connection, `connectWithTimeout` :35, `createConfirmChannel` :69, `assertExchange("tiledesk.executions","topic",{durable:true})` :76). `amqpTransport.publish(routingKey, buffer)` :89-114 (confirm callback, 10 s timeout). `send(routingKey, envelope)` :116 (fire-and-forget, test override `transportOverride`). `publishEvent(type, request, extraData)` :142-158 builds the envelope (`event_version:1,type,execution_id,at,id_project,request_id,data`) with key `exec.<id_project>.<type>`.
- `listen()` :162-215: returns early if `EXECUTIONS_AMQP_URL` unset :163; listens on `requestEvent` `request.close` :168, `request.participants.update` :182 (bot_left / bot_replaced; skips `data.reason` in `subagent_call|subagent_return` :187), `request.participants.leave` :203. Exports `{listen, _setTransportForTests, _setConnectTimeoutForTests, _amqpTransport}` :225-230. **Publish-only: no consume code.**
- Registration: SV/pubmodules/pubModulesManager.js:638-649 (`this.executionsPublisher = require('./executions-publisher'); this.executionsPublisher.listen();`), i.e. inside `pubModulesManager.init` (called from app.js:213). SV/jobs.js (the job-worker entry) never requires executions-publisher or calls pubModulesManager.init (jobs.js:72-107 only wires cache, queue, appRules, jobsManager listeners incl. `listenActivityArchiver` :105). So today the publisher listens only in the API process.
- Existing AMQP consumers in the server (none in pubmodules/activities or analytics): `pubmodules/queue/chat21WebhookWorker.js:80-120` (amqplib callback API: `ch.assertQueue(config.queueName,{durable:true})`, `bindQueue`, `ch.consume(queue, handler, {noAck:false})`, ack / `nack(msg,false,true)` after `requeueDelayMs`, `ch.prefetch`); `pubmodules/queue/reconnect.js:205-224` and `reconnectFanout.js:111-138` (generic consumers with reconnect logic); `utils/jobs-worker-queue-manager/queueManagerClassV2.js:198-219`. All use `require('amqplib/callback_api')`; the executions-publisher uses the promise API `require("amqplib")`.

### C2. pubmodules/activities

- Model: pubmodules/activities/models/activity.js. `ActivitySchema` :168-215: `actor{type,id,name}` (required), `verb` (String, required, indexed) :176, `actionObj` (Object, free) :182, `target` (Object, required) :186, `related` (`RelatedActivitySchema`: `role,type,id,name,object`) :192, `involvedUserIds[String]` (indexed, filled by `pre('save')` :217 from actor.id when actor.type==='user', `target.object.id_user`, `related.object.id_user`/related.id if type user, request participantsAgents), `id_project` (required), `timestamps:true`. Indexes :227-231 incl. the only TTL `ActivitySchema.index({ createdAt: 1 }, { expireAfterSeconds })` :231, TTL from `ACTIVITY_EXPIRATION_TIME` (seconds, default 30 d) :4-16. No unique/sparse index on `actionObj.audit_id` exists.
- How activities are saved: `pubmodules/activities/activityArchiver.js` - module-private `async function save(activity)` :15 (`await activity.save()`, logs on error; not exported), each listener builds `new Activity({id_project, actor: activityActorUtil.actorFromReq(req)|..., verb, actionObj, target, related?})` then `save(activity)` (e.g. FAQ_KB_CREATE :524-535). Singleton `ActivityArchiver` with `listen()` :148; exported `module.exports = activityArchiver` :753; `pubmodules/activities/index.js` exports `{ activityArchiver, activityRoute }`.
- ACTIVITY_HISTORY_ENABLED: only checked inside `listen()` activityArchiver.js:153-160 (`process.env.ACTIVITY_HISTORY_ENABLED || "false"`; `!== "true"` -> logs "disabled" and `return 0`). `listen()` is started via `jobsManager.listenActivityArchiver` (SV/jobsManager.js:67-72) from pubModulesManager.js:724-727 and jobs.js:105. A direct `new Activity().save()` from another module does not check the flag.
- Route mounting: pubModulesManager.js:158-160 `app.use('/:projectid/activities', [passport.authenticate(['basic','jwt'],{session:false}), validtoken, roleChecker.hasRole('admin')], this.activityRoute)`. `hasRole('admin')` loads `req.projectuser` (with `_doc.rolePermissions` for custom roles), so the route handlers can read `req.projectuser.role` and `req.projectuser._doc.rolePermissions`.
- `GET /` pubmodules/activities/routes/activity.js:53: query `{id_project}`; `start_date`/`end_date` (DD/MM/YYYY via moment) :63-84; `agent_id` (this is a TEAMMATE user id, matched against `involvedUserIds`, `target.object.id_user._id`, `actor.id`) :86-93; verbs: `if (req.query.activities) query.verb = { $in: req.query.activities.split(',') }` :97-101; sort/direction/page; `limit` (default 40, max 100; chart mode 1000) :10-49; response `{perPage, count, activities: activities.map(activityMessageUtil.enrichActivityWithMessage)}` :122-131. This is the single place where `EXECUTION_*` verbs would be removed for non-owners.
- `GET /csv` activity.js:148: limit 100000 per page :149; same filters; `query.verb = verbs` (assigns the ARRAY directly, not `$in`) :215-218; `lang` query param :224-227; result built by nested `function buildCsv(activities, lang)` :537-678 (defined inside the route handler) and `res.csv(csvActivitiesToReturn, true)` :257-ish; columns: `message, activity_id, createdAt, updatedAt, project_id, actor_name, actor_id, actor_type, verb, target_user_fullname, target_email, target_type, target_user_id, actionObj_email, actionObj_id_project, actionObj_project_name, actionObj_role, actionObj_user_available, target_id, target_createdAt, target_createdBy, target_role, target_user_available` :624-651.
- Sentences: `pubmodules/activities/activityMessageUtil.js` (336 lines): `buildDefaultActivityMessage(activity)` :171-308 is a single `switch (activity.verb)` (`REQUEST_ASSIGNED_AUTO` ... `KB_CONTENT_DELETE`, `default: return null` :306); **English only, no it/en switch** (strings concatenated, e.g. `case 'FAQ_KB_PUBLISH': return actor + ' published chatbot ' + chatbotLabel(activity)` :269-270). `enrichActivityWithMessage(activity)` :310-316 adds `message` when non-null. Exports :318-336.
  The it/en switch exists only in activity.js: `translateString(string, lang)` :~270-380 and `buildMsg_PROJECT_USER_UPDATE|DELETE|INVITE|REQUEST_CREATE(…, lang, …)` used by buildCsv for those four verbs (:566-584); every other verb (incl. all FAQ_KB_*/KB_*) falls through to the English `buildDefaultActivityMessage` (:544, :586-588). So the design's "it/en switch in buildDefaultActivityMessage" does not match the code.
- docs/activities-client.md EXISTS (864 lines, Italian): sections `API` :20, `Modello dati Activity` :101, `Catalogo verb` :148 (chatbot table :183-189, KB :195), phrase templates it/en tables e.g. :342-348 (`FAQ_KB_PUBLISH` row :348), `actionObj` per verb :303+.

### C3. middleware/has-role.js (332 lines)

- `class RoleChecker` :6; `ROLES` hierarchy :13-21 (guest<user<teammate<agent<supervisor<admin<owner, each lists the roles it includes).
- `hasRole(role)` :182 -> `hasRoleOrTypes(role)`.
- `hasRoleOrTypes(role, types, permission)` :186: types check first (`isTypesAsFunction` :83; 'bot'/'subscription' principals) :213-223; loads `req.projectuser` via `projectUserService.getWithPermissions(req.user._id, projectid, req.user.sub)` :237 when not already set; sets `req.projectuser` :249; standard role -> `hierarchicalRoles.includes(role)` :263-269 else 403 `you dont have the required role.`; **custom role -> `return that.hasPermission(permission)(req,res,next)`** :270-273 (with `permission` undefined => `next()` at :143-146, i.e. every custom role passes any `hasRole(x)` route; confirmed gap).
- `hasPermission(permission)` :109: reads `project_user._doc.rolePermissions` :137; undefined permission -> next :143; permission in list -> next else 403 :148-156.
- `projectUserService.getWithPermissions(id_user, id_project, user_sub)` SV/services/projectUserService.js:45-63: `get(...)` (Project_user.findOne {id_project,id_user,status:'active'}, cached) then `getPermissions(project_user.role, id_project)` :65 (Role.findOne {name, id_project}) and `project_user._doc.rolePermissions = role.permissions` :55.
- `/project_users/me`: SV/routes/project_user.js:500 `router.get('/me', [passport..., validtoken, roleChecker.hasRoleOrTypes('agent', ['subscription'])], ...)` returns `res.json([pu])` with `pu = req.projectuser.toJSON()` :507-510 (model has `toJSON:{virtuals:true}` models/project_user.js:89). `rolePermissions` lives on `_doc`, which toJSON serialises; still unconfirmed live (Phase 1 ledger: "live check in T22/T23").
- Standard `owner` is the only role named OWNER in `models/roleConstants.js` (`OWNER:'owner'`, `ADMIN`, `SUPERVISOR`, `AGENT`, ...). Custom roles: models/role.js (`name`, `permissions[]`, `id_project`).

### C4. PUT /:projectid/requests/:requestid/close

- Route: SV/routes/request.js:333 `router.put('/:requestid/close', async function (req,res) {...})`; mounted app.js:635 `app.use('/:projectid/requests', [passport.authenticate(['basic','jwt'],{session:false}), validtoken, roleChecker.hasRoleOrTypes('agent', ['bot','subscription'])], request)`.
- Body: only `req.body.force` is read (:366). `closed_by = req.user.id` :344. If the caller's project-user role is not owner/admin, it must be among `request.participantsAgents` else 403 (:346-361); a bot/subscription principal (no `req.projectuser`) skips that check. Calls `requestService.closeRequestByRequestId(request_id, projectid, false, true, closed_by, force)` :366 (services/requestService.js:1389), which emits `request.close` (requestService.js:1431/1459) that the executions-publisher turns into `conversation.closed` (publisher :168-180, `closed_by: request.closed_by`).
- Sibling: `PUT /:requestid/replace` request.js:511; reason passthrough :577-581.

### C5. docs/activities-client.md - exists (see C2).

---------------------------------------------------------------------------------------------
## D. tiledesk-dashboard (DB = src/app)

### D1. Activities page (DB/activities-new)

- Filter definitions: DB/activities-new/utils/activity-verbs.constants.ts
  - `interface ActivityFilterOptionDefinition { id: string; groupKey: 'Conversations' | 'Assignments' | 'Team' | 'Chatbot' | 'KnowledgeBase'; }` :7-10 (a new group needs the union extended)
  - `ACTIVITY_FILTER_OPTION_DEFINITIONS: ActivityFilterOptionDefinition[]` :12-33, entry shape `{ id: 'FAQ_KB_PUBLISH', groupKey: 'Chatbot' },` (:27)
  - `ACTIVITY_ICON_BY_VERB: Record<string,string>` :35-56, entry `FAQ_KB_PUBLISH: 'assets/img/activities/flow-published.svg',` (:50); `DEFAULT_ACTIVITY_ICON` :58
- How filters are built and sent: activities-new.component.ts:1701-1707 `buildActivityFilterOptions()`:
```ts
this.activityFilterOptions = ACTIVITY_FILTER_OPTION_DEFINITIONS.map((option) => ({
  id: option.id,
  name: this.translate.instant(`ActivitiesNew.FilterVerb.${option.id}`),
  group: this.translate.instant(`ActivitiesNew.FilterGroup.${option.groupKey}`),
}));
```
  Template: ng-select with `[items]="activityFilterOptions" bindLabel="name" bindValue="id" groupBy="group"` (activities-new.component.html:56). Selected verbs are joined `arrayOfSelectedActivity = selectedActivities.join(',')` (ts:335-337) and sent as `activities=<VERB1,VERB2>` in the query string (ts:345-349, 371-375, 411-415, 1062-1067). Service: activities-service/activities.service.ts `getUsersActivities(querystring, pagenumber)` -> `GET {SERVER_BASE_URL}{projectId}/activities?page=N&<qs>` ; `downloadActivitiesAsCsv` -> `/activities/csv?...&lang=` . i18n keys: `ActivitiesNew.FilterGroup.<groupKey>` and `ActivitiesNew.FilterVerb.<VERB>` in assets/i18n/en.json (groups today: Conversations, Assignments, Team, Chatbot ("AI Agent"), KnowledgeBase); 15 language files exist (ar az de en es fr it kk pt ru sr sv tr uk uz), each has `ActivitiesNew`.
- Rendering a row: `enrichActivity()` ts:439-451 sets `activity.renderedMessage = renderActivity(activity)`; `renderActivity` DB/activities-new/utils/activity-message.util.ts:946 is a `switch (verb)` of English template strings, e.g. `case 'FAQ_KB_DELETE': return `${actor} deleted chatbot ${chatbot}`;` :1016; at the end `if (activity.message) return activity.message; return verb || 'Unknown activity'` :1130-1135 - so an unknown verb falls back to the server-built `message` (enrichActivityWithMessage). Icons: `getActivityIcon(verb)` :1145 -> `ACTIVITY_ICON_BY_VERB[verb] || DEFAULT_ACTIVITY_ICON`. `normalizeActivityVerb` :872, `effectiveVerb` :886.
- Template: first `<td>` branches for REQUEST_CLOSE / REQUEST_CREATE / assignment / team verbs; "All other verbs (assignments, chatbot, KB, fallback)" cell at activities-new.component.html:~826-870 renders `getActivityParts(activity)` (ts:1504, returns `{before, link, after, requestId, kbSource, actorLink, actorProfileId, actorIsBot, namespaceLink, namespaceId, afterNamespace, chatbotLink, chatbotId}`) with `<activities-bot-link>` / `<activities-teammate-link>` and `goToChatbotCds(activity)` (ts:1211) for the chatbot link. `chatbotIdFromActivity` (activity-message.util.ts:172) uses `activity.target?.id` first - for an EXECUTION_* activity `target.id` is the execution id, the agent is in `related`.
- `activities-bot-link` as a link model: DB/activities-new/components/activities-bot-link/activities-bot-link.component.ts (16 lines): selector `activities-bot-link`, `@Input() label=''`, `@Input() highlighted=false`, `@Output() linkClick = new EventEmitter<MouseEvent>()`, `onClick(event)` emits; html: `<span class="activities-bot-link" [class.highlight]="highlighted" (click)="onClick($event)"><span class="activities-bot-link__label">{{ label }}</span></span>`. Declared in activities-new.module.ts:30-32 (declarations list; imports MatDialogModule, MatMenuModule, MatTooltipModule already there). Execution deep link helper already exists: DB/bots/executions/execution-links.ts `executionLink(projectId, agentId, executionId): ExecutionLink | null` (`{commands:['/project',pid,'bots',agentId,'executions',id]}`), `validExecutionId`, `executionAgentId`.
- Types: DB/models/activity-model.ts `ActivityVerb` union (ends in `| string` so new verbs type-check) :1-20, `ActivityRecord` :58-91 (`actor, verb, actionObj, target, message, date, renderedMessage...`; no `related` field declared).
- Retention note: page text uses `appConfigService.getConfig().activityExpirationTime` (ts:1715-1737).

### D2. Custom role editor (DB/users-new-role)

- Files: users-new-role.component.{ts (986 lines),html (141),scss,spec.ts}, users-new-role.module.ts.
- Declaration: `interface PermissionSection { key; title; parentLabel; type; expanded; children: {key; label}[] }` (ts:30-36). The sections array is in the component (ts:~95-330). The Flows section:
```ts
{ key: 'flowsManagement', title: 'Flows', parentLabel: 'Select all', type: 'checkbox', expanded: false,
  children: [ { key: PERMISSIONS.FLOWS_READ, label: 'Able to view' }, { key: PERMISSIONS.FLOW_ADD, ...}, ...
              { key: PERMISSIONS.FLOW_WEBHOOK_DELETE, label: 'Able to delete Webhooks' } ] },   // ts:221-240
```
  Labels are hard-coded English strings (not translate keys). HTML renders `section.children` with `mat-checkbox [formControl]="form.get(child.key)"` (html:~85-99), parent checkbox `onParentToggle(section)`.
- Form: `buildForm()` ts:682-720 makes a boolean control per child key and per section key, syncs parent<->children via `valueChanges` :709-722; `onValuesChanges()` :729; `getRoleById()` :621-655 patches only keys that exist in some section (`section.children.some(child => child.key === permission)`), so a stored permission that is not a section child is dropped on the next edit-save; `syncAfterPatch()` ts:~657; `submit()` ts:879 -> `getSelectedPermissions()` ts:~940-955 (all form keys with value true, which includes the section parent keys, see `_getSelectedPermissions` :957 vs `__getSelectedPermissions` :961) -> `rolesService.createNewRole` / `updateRole`.
- **No dependency handling exists** between permissions (no tick-and-lock): only parent/child select-all syncing (ts:709-722, 858-865).
- `utils/permissions.constants.ts` (DB/utils): `export const PERMISSIONS = {...}`; relevant existing keys `FLOWS_READ:'flows_read'`, `ACTIVITIES_READ:'activities_read'` (:~90). Phase 1 added only `EXECUTIONS_READ: 'executions_read'` at :163 (last entry). **Missing: `executions_control`, `executions_destroy`, `executions_data_access`, `executions_audit_read`. `executions_read` is NOT in any users-new-role section either** (grep EXECUTIONS in users-new-role: none), so a custom role cannot be granted it in the UI today.
- `canViewExecutions(role, matchedPermissions)` DB/bots/executions/executions.models.ts:174-178 (owner/admin/supervisor true; agent false; custom -> includes `PERMISSIONS.EXECUTIONS_READ`). Callers: bots-list.component.ts:523, executions-list.component.ts:109, execution-detail.component.ts:127, flow-webhooks-logs.component.ts:116, ws-requests-msgs.component.ts:986.

### D3. Execution detail + dialogs

- DB/bots/executions/execution-detail/execution-detail.component.html:66-69:
```html
<!-- controls come from the API (empty in Phase 1) -->
<div *ngIf="d.allowed_controls?.length" class="ex-controls">
  <button *ngFor="let c of d.allowed_controls" type="button" class="ex-btn" disabled>{{ ("Executions.Controls." + c) | translate }}</button>
</div>
```
  `allowed_controls: string[]` in `ExecutionDetail` (executions.models.ts:122). **`Executions.Controls.*` keys do not exist** in assets/i18n/en.json (`Executions` key list: OpenExecution, ViewExecutions, Executions, AllExecutions, NeedAttention, NotConfigured, AllAgents, Last24h, SearchId, Trigger, StatusLabel, AnyStatus, WithFailureConditions, Period, LoadError, Retry, Loading, LoadMore, EmptyNone, EmptyFiltered, ClearFilters, ShowAllTriggers, TraceIncomplete, Status, Triggers, Periods, Columns, Outcomes, Detail, FlowState, History, Ops). `Executions` exists only in en.json and it.json. `Executions.Status.{running,waiting,stopping,stopped,failed,completed,destroyed}` exist. The spec (execution-detail.component.spec.ts:131-137) already tests the row with `allowed_controls: ['stop']`. Scss `.ex-controls` / `.ex-btn` in execution-detail.component.scss:34.
  Polling in the detail component: `timer(POLL_MS)` 2 s while running/stopping (execution-detail.component.ts:222-240). Status chip: shared/execution-status-chip.component.ts already styles `stopping`/`stopped`/`destroyed`.
  ExecutionsService (DB/services/executions.service.ts, providedIn root): `list`, `summary`, `get(projectId,id)`, state/history; base `EXECUTIONS_BASE_URL` via `appConfigService.getConfig()` (`baseUrl()` :40, `url()` :52, `headers()` :57 uses `Authorization: this.TOKEN`); no stop/resume/destroy methods yet.
  ExecutionsModule (executions.module.ts) imports: CommonModule, TranslateModule, MatIconModule, MatTooltipModule, ExecutionsRoutingModule - **no MatDialogModule and no FormsModule**.
- Existing MatDialog patterns (to copy):
  - `this.dialog.open(CloneBotComponent, {...data})` + `dialogRef.afterClosed().subscribe(res => ...)` bots-list.component.ts:827-845; component with `@Inject(MAT_DIALOG_DATA) public data`, `public dialogRef: MatDialogRef<CloneBotComponent>` (bots/bots-list/clone-bot/clone-bot.component.ts:21-22); template with `<h1 mat-dialog-title>` / `<mat-dialog-content>` / buttons.
  - `DB/widget_components/widget-domains-withelist-modal/widget-domains-withelist-modal.component.{ts,html}`: `<h2 mat-dialog-title>`, `<mat-dialog-content>` containing a `matInput` form field with `formControlName`, `<mat-dialog-actions align="center">` with `<button mat-button class="mat-dialog-close-btn" (click)="onNoClick()">` and `<button mat-button class="mat-dialog-ok-btn" (click)="onSave()" [disabled]=...>`; closes with `this.dialogRef.close(value)` / `close(null)` (ts:170/174). This is the closest "text input + Cancel/OK" dialog.
  - `DB/ws_requests/ws-requests-msgs/modal-chatbot-reassignment/modal-chatbot-reassignment.component.html`: ng-select inside `<div mat-dialog-content>`, `mat-dialog-actions` cancel/OK.
  - Non-Material confirm: `components/modals/modal-delete/modal-delete.component.{html,ts}` (Bootstrap `.modal`, inputs `translateMap`, `objectId`, outputs `confirmDeleteModal`, `closeDeleteModal`); no type-to-confirm variant exists anywhere (grep).

---------------------------------------------------------------------------------------------
## E. Cross-cutting facts that matter for the plan

1. tybot-side signal plumbing does not exist: no AbortController anywhere in CB (grep AbortController in tybotRoute excluding node_modules: no match). The only single choke points are `HttpUtils.request` (utils/HttpUtils.js:8), `DirectivesChatbotPlug.context` (:158) and `ExecutionRecorder.runAction` (:306).
2. Hard-stop abort of an HTTP call goes down the directive's normal error branch (see A5), which can post a block jump (`executeCondition(false,…)` -> `tilebotService.sendMessageToBot` -> `ExecutionRecorder.beforeJump` -> `/ext`). A stopped execution's `/ext` would then be blocked by the stop-flag check at index.js:118-120, which is probably the intended backstop; the DirGptTask-style `callback(true)` paths also run `assignAttributes` writes after the abort.
3. `/ext` returns 200 before any work (index.js:84) and `processDirectives` is not awaited (index.js:211): the whole action chain runs detached from the HTTP request, lease/heartbeat/abort must be tied to ctx/pod, not to the request lifetime.
4. The service api currently has no Redis, no AMQP, no body parser, no audit/grants models; `jobs` has no Redis/AMQP. Adding control means new connections in api and jobs, `express.json()`, and new models in `src/db.ts:10`.
5. Projector/ingest: unknown event types go to the DLQ (consumer.ts:65-71); `status.ts` has 4 statuses; `stopped` executions are ignored by conversation-end handling; `bumpSeq` only rewrites running/waiting.
6. Server: `buildDefaultActivityMessage` is English only; owner-only filtering of EXECUTION_* verbs has to be done in both `GET /` (activity.js:97-101) and `GET /csv` (:215-218); the audit consumer must check `ACTIVITY_HISTORY_ENABLED` itself (the flag only gates `ActivityArchiver.listen`); executions-publisher is registered only in the API process (pubModulesManager.js:640), not in jobs.js.
7. Dashboard: `executions_read` is not selectable in the role editor yet; `Executions.Controls.*` and dialog strings exist in no i18n file; `ExecutionsModule` lacks MatDialogModule/FormsModule.
