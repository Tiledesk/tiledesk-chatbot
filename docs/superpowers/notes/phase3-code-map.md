# Phase 3 code map (resume & start new) - facts only, read 2026-11-11

Read from: tiledesk-chatbot, tiledesk-executions, tiledesk-server on `feature/execution-traceability`; tiledesk-dashboard on
`feature/execution-graph`; tiledesk-scheduler-service on `feature/scheduler-ui` (it has no execution-traceability branch).
Spec = docs/superpowers/specs/2026-11-09-agent-execution-traceability-design.md.

Short names: CB = /Users/nicocardone/Desktop/DEV/TILEDESK/tiledesk-chatbot/tybotRoute,
EX = /Users/nicocardone/Desktop/DEV/TILEDESK/tiledesk-executions/src,
SV = /Users/nicocardone/Desktop/DEV/TILEDESK/tiledesk-server,
DB = /Users/nicocardone/Desktop/DEV/TILEDESK/tiledesk-dashboard/src/app,
SC = /Users/nicocardone/Desktop/DEV/TILEDESK/tiledesk-scheduler-service.
`ER` = CB/executions/ExecutionRecorder.js (915 lines), `ES` = CB/executions/ExecutionStore.js (272 lines),
`DCP` = CB/tiledeskChatbotPlugs/DirectivesChatbotPlug.js (456 lines), `TC` = CB/engine/TiledeskChatbot.js (787 lines).

Grep facts that frame everything below:
- No checkpoint exists anywhere: no `exec:{id}:cp`, no `Checkpointer`, no `execution.checkpoint` / `execution.resumed` in tybot,
  service contracts or projector (grep: 0 hits).
- No `EXECUTIONS_SERVICE_TOKEN`, `EXECUTIONS_SERVICE_URL`, `EXECUTIONS_CHECKPOINT_TTL` in CB/executions/config.js:29-50 or EX/config.ts:5-26.
  No `VAULT_KEYS`, no decrypt (`privateDecrypt`/unseal) in EX. The private key exists only as a local file
  (tiledesk-dev-env/bin/exec-keys:8 "Nothing reads it in Phase 1; Phase 4 ...").
- No refire route in SV; no `resume` / `start_new` in any audit enum, control list or Activities verb (EX, SV, DB).

---------------------------------------------------------------------------------------------
## 1. Checkpoint: where, what, rerun, existing exec:{id} writes, Redis budget

### 1.1 Where to write it (per action)

The action loop is DCP `nextDirective` -> `process` -> `ER.runAction(handler.execute(..., callback))`:
- before each action: `nextDirective` DCP:191-225. Stop gate first: `ER.checkStopBeforeAction(ctx, {index: next_index, directive})`
  DCP:194-197 (ER:556-583), then `TiledeskChatbot.checkStep` DCP:199 (limits; on error `ER.failed` DCP:213 and an error directive).
- the action runs: `ER.runAction(this.execution, { index: actionIndex, directive }, () => handler.execute(directive, async (stop) => {...}))` DCP:356.
- after each action, inside the directive callback: `ER.afterAction(...)` DCP:380 -> `recordAction` ER:798-849, which already does the
  per-action `HGETALL :parameters` (`readState`, ER:806) together with `nextSeq` (ER:807) in one round trip.
- hard stop after the callback: DCP:381-384; plain `stop` (block ends) DCP:385-388; next action DCP:389-391.
- jumps: `onJump` ER:458-473 (afterAction + blockExit awaited, then transit + lease release) runs from `TilebotService.sendMessageToBot`
  -> `ER.beforeJump` CB/services/TilebotService.js:63 / ER:688-713, bounded by `jumpBudgetMs` (config.js:45, 1000 ms).
- block exit: `recordBlockExit` ER:851-895 writes `exec:{id}:state` (ER:876-881) with the INCR.

Natural write points for the checkpoint (`exec:{id}:cp`):
| Event | Where | cp content |
|---|---|---|
| after action k completed | `recordAction` ER:808 (the `after` HGETALL result is already in hand) | `action_index: k+1, next_action: "run"` |
| soft stop before action k | `checkStopBeforeAction` ER:570-582 | `action_index: k, next_action: "run"` (state = ctx.current) |
| hard stop, k interrupted | `onAbort` ER:213-227 -> `stopHard` ER:591-617 (`ctx._interrupted` = rec of k) | `action_index: k, next_action: "rerun"` |
| hard stop, k not abortable (`hardDegraded`, ER:218-220) | k completes, then DCP:381 `stopHard` | `action_index: k+1, "run"` (written by the after-action write) |
| max_steps / max_time | `nextDirective` DCP:199-213 before k runs | `action_index: k, "run"` (resume resets :step/:started, spec 7.1.5) |
| jump (block exit) | `onJump` ER:458-473, before `setTransit` | `block_id: <target>`? no: target block id is only the jump text (`rec.jumpedTo`, ER:460). See risk R3 |
| lost owner | nothing runs (pod died) | last cp written = after the last completed action |

A checkpoint written "before action k starts" does not exist, so after a pod death the service cannot tell whether action k had
started (risk R4).

### 1.2 Content today vs spec 7.1.5

Spec: `{ version, seq, block_id, action_index, next_action, agent_stack[{agent_id, agent_version, return_block}],
request_state{parameters, locked_intent, locked_action, step, started}, trigger{type, source_id, start_point_id}, written_at }`.

| Field | Source today |
|---|---|
| seq | `ctx._store.nextSeq` (ES:123-133) - the seq of the action.completed that writes the cp |
| block_id / block name | `ctx.step.block_id` (`openStep` ER:784-794), = `faq.intent_id` (TC:368). Re-entry by id works: `getByIntentDisplayName` treats a `#<intent_id>` key as an id query (CB/engine/MongodbBotsDataSource.js:94-97) |
| action_index | `rec.index` = `this.curr_directive_index` (DCP:355). NB: the index is into the directives array built from `reply.actions` AFTER `ConnectorsV3.projectIntent` + `TiledeskChatbotUtil.addConnectAction` (TC:471-476; same in `findBlock` TC:347-353), so a rebuilt array must go through the same two calls |
| agent_version | `ctx.agent_version` = botId of /ext (ER:284); the snapshot keeps existing after a republish (publish forks a new trashed copy, SV/services/chatbotService.js:216-233; nothing deletes old ones) |
| agent_stack | `exec:{id}` hash field `agent_stack` (JSON) - `pushFrame` ES:178-186 / `popFrame` ES:188-199, written by `ER.onSubagentCall` ER:720-733 frame `{agent_id, agent_version, return_block}`. A second, independent stack exists: `subagent:stack:{request_id}` (CB/tiledeskChatbotPlugs/SubagentStack.js:14-16, TTL 24 h :22) holding `{parentId, parentParticipantId, parentToken, nextBlock}` (CB/tiledeskChatbotPlugs/pushCallerSnapshot.js:35-41) - this is the one `DirReturnStack` actually pops (CB/tiledeskChatbotPlugs/directives/DirReturnStack.js:44-45) and its `parentToken` is a bot JWT (:85) |
| request_state.parameters | `TC.requestCacheKey(id) + ':parameters'` = `tilebot:requests:{id}:parameters` (TC:721-724, :603), hash of JSON strings, TTL `FLOW_ATTRIBUTES_TTL` default 15 d refreshed on each write (TC:608-609). Read raw by `readState` ER:81-88 |
| locked_intent | `tilebot:requests:{id}:locked` (CB/tiledeskChatbotPlugs/directives/DirLockIntent.js:52; read TC:541) |
| locked_action | `tilebot:requests:{id}:action:locked` (TC:567, :576) |
| (not in spec) locked mcp | `tilebot:requests:{id}:mcp:locked` (TC:550); if set, `replyToMessage` unlocks it and returns without running anything (TC:90-96) - must be in request_state or cleared on resume |
| step / started | `...:step` (INCR TC:663) and `...:started` (TC:681-686); resets `resetStep` TC:702 / `resetStarted` TC:709. A non-`_tdinternal` message resets both (TC:72-76); a `_tdinternal` resume message would NOT, so the resume path must call them |
| (not in spec) bot id per request | `tilebot:botId_requests:{id}` (index.js:92-97) |
| trigger | `ctx.trigger` from `detectTrigger` CB/executions/trigger.js:10-28; stored in `exec:{id}` hash `trigger` (ES:90) |

Secrets in request_state: `updateRequestAttributes` writes the bot token into `:parameters` as `chatbotToken` and
`chatbot_jwt_token` (CB/utils/TiledeskChatbotUtil.js:704-708; names CB/engine/TiledeskChatbotConst.js:34-35). Spec 7.1.5 says the
token is never stored in the checkpoint, so the cp writer must drop them (secret-named per `isSecretName`
CB/executions/secrets.js:6-11) and the resume must write them back from the minted token.
The sealed copy (`execution.checkpoint`) goes through `Sealer.seal` (CB/executions/Sealer.js:26-47): null without a key, `TOO_LARGE`
over `dataMaxBytes` 256 KB (config.js:40, Sealer.js:29) - a big `transcript` makes the durable checkpoint impossible (risk R6).

### 1.3 Where next_action "rerun" is decided

Only on a hard stop of an abortable action: `onAbort` ER:213-227 sets `rec.interrupted = true; ctx._interrupted = rec` (ER:222-223) when
`isAbortable(rec.directive)` (ER:203-205, set `ABORTABLE` ER:20: wait, webrequest, webrequestv2, gpt_task, ai_prompt, askgpt, askgptv2,
ai_condition, send_whatsapp). `recordAction` turns it into `outcome: 'interrupted'`, `error_code: 'hard_stop'` (ER:814-817, :831);
`stopHard` emits `execution.stopped {mode:'hard', interrupted_action:{index, action_id, type, title}}` (ER:602-609). The service keeps
it as `executions.interrupted_action` (EX/model/execution.ts:43, projector `onStopped` EX/ingest/projector.ts:213-229).
A thrown action error is not a stop: `runAction`'s `onError` ER:479-483 records `error` and ends the chain with idle (no failed).

### 1.4 Where Phase 1/2 already write exec:{id}*

| Key | Writer |
|---|---|
| `exec:req:{req}:{agent}` | `ES.resolve` SET NX / CAS (ES:58-78), alias `setAlias` ES:153; deleted by service write-back on completed/failed (EX/ingest/tybotRedis.ts:45-47) |
| `exec:{id}` hash | created in `resolve` ES:82-95 (`status:'running'`, trigger, agent fields, TTL 7 d); `status` hint ES:263 (`completed` ER:653, `failed` ER:671); `agent_stack` ES:178-199; service HSET status on terminal (tybotRedis.ts:48) |
| `exec:{id}:seq` | ES:123-133 |
| `exec:{id}:state` | `setState` ES:145 from `recordBlockExit` ER:876-881: `{step_seq, raw: <whole :parameters>, blocks_since_kf, delta_bytes_since_kf}` - already a block-level copy of the state |
| `exec:{id}:owner` / `:transit` | ES:220-261 (lease 15 s, heartbeat 5 s, transit 120 s: config.js:46-48) |
| `exec:{id}:stop` | service `setStop` EX/api/tybotControl.ts:31-33 |
| `exec:handoff:{req}` | ES:201 |
| destroy cleanup | EX/api/tybotControl.ts:48-56 deletes seq/state/owner/transit/stop/hash - `:cp` must be added there |

### 1.5 Redis budget (spec 12: per action one GET stop, one HGETALL, one SET cp, one INCR)

Per action today: GET stop (ER:565), INCR + GET `:step`, GET `:started` (checkStep TC:663-682, pre-existing), GET `:action:locked`
(DCP:258, pre-existing), INCR seq + HGETALL in one tick (ER:806-807). The cp SET needs the HGETALL result, so awaited it is a second
round trip per action; options: fire-and-forget with a seq-guarded Lua SET (write only if `cp.seq` > stored), awaited only at park
points (stop, jump, idle, failed). Size: the cp duplicates `:parameters` on every action (same bytes as the HGETALL, now written
back); `exec:{id}:state` already duplicates it once per block.

---------------------------------------------------------------------------------------------
## 2. Resume with no /ext body

### 2.1 Entry point

- `ControlListener.handle` CB/executions/ControlListener.js:15-31 accepts only `{type:'stop', mode:'hard'}` and `{type:'cleanup'}`
  (:27-29) -> `AbortRegistry.abort`. A `{type:'resume'}` branch goes here. It runs on its own duplicated connection (:45-54), started from
  `connectRedis` CB/index.js:804-807 (only with the flag on). The module only gets `tdcache`; the resume driver also needs Mongo
  (bots datasource), `API_ENDPOINT` / `TILEBOT_ENDPOINT` (index.js module scope :46-47, set in `startApp` :723-738) and `MAX_STEPS` /
  `MAX_EXECUTION_TIME` (index.js:26-27, :750-756): inject a callback from index.js.
- Claiming: `ES.acquireLease` ES:220-227 is exactly `SET exec:{id}:owner pod NX PX`. All pods receive the PUBLISH; the NX winner drives.
  `publishControl` discards the receiver count (EX/api/tybotControl.ts:35-37), so the API cannot tell "no pod listening" today.
- Two ways to drive the block once claimed:
  a) resume as a self-jump: post a `_tdinternal` message `/#<block_id>` to `/ext/<agent_version>` like `DirIntent` does
     (CB/tiledeskChatbotPlugs/directives/DirIntent.js:55-80) with `attributes.execution_id` (hint used by `ES.resolve` ES:54-57) and
     `attributes.resume {action_index, next_action}`. Reuses all of /ext (bot load, ctx, lease, gate, token params), but the post goes
     through the service load balancer, so it may land on another pod: hand over with `transit` (ES:247) instead of holding the owner.
  b) local call: factor the /ext body (index.js:50-282) into a function and call it in-process from the listener.
- `/ext` order that matters (index.js): 200 sent at :85, bot load `getBotByIdCache` :114, `ER.onMessageIn` :119 (resolve, lease, stop
  read, `execution.started` only when created), `ER.gateMessage` :121 (the stop flag must be gone before the resumed run arrives -
  the API deletes it per spec 9.4), `updateRequestAttributes` under `message_in` :154-159, `chatbot.replyToMessage` :175,
  `new DirectivesChatbotPlug({... execution: ctx})` :202-216, `processDirectives` :217 (not awaited).

### 2.2 What TiledeskChatbot / DirectivesChatbotPlug need to start at action k

- Block lookup: explicit intent path TC:151-183 (`parseIntent`, `getByIntentDisplayNameCache(botId, name)` :165, then `execIntent` :183).
  `execIntent` TC:367 opens the step (`ER.blockEntry` :368), caches `tilebot:{req}` JSON (:377-380), handles forms (:388-436, may
  `lockIntent`), `execWebhook` (:529, :726-738). `findBlock` TC:308-365 returns the faq (projected) without opening a step.
- Directive array: `TiledeskChatbotUtil.actionsToDirectives(reply.actions)` index.js:200.
- Start index: `processDirectives` hard-codes `this.curr_directive_index = -1` DCP:183, and `nextDirective` uses `curr + 1` DCP:193.
  A `startIndex` in the constructor config (DCP:85-97) -> `curr_directive_index = startIndex - 1` is the whole change.
- Locks: `process` skips actions until the locked action unless `this.message.sender === '_tdinternal'` (DCP:256-263);
  `replyToMessage` skips the locked-intent check for `_tdinternal` (TC:101-102) and does not reset locks for it (TC:57). So a
  `_tdinternal` resume runs from k regardless of locks; restoring `locked_action` is then only for the turn after.
- Limits: `_tdinternal` does not reset `:step` / `:started` (TC:72-76); resume must call `resetStep`/`resetStarted` (TC:702-714)
  as spec 7.1.5 wants.
- New step: the resumed block is a new `step.started` (new step_seq) with actions starting at k; `ctx.prev` comes from
  `exec:{id}:state` (ER:328-335).

### 2.3 Restoring request cache keys

Writers to reuse: `TC.addParameterStatic` (TC:599-611, HSET + EXPIRE + `WriteTap.note`), `DirLockIntent.lockIntent` (DirLockIntent.js:50-56),
`chatbot.lockAction` (TC:565-571), `resetStep`/`resetStarted`. A bulk restore should go outside `WriteTap` (or under a `resume` scope
like `withScope` ER:372-386) so the restored keys are not attributed to an action. While `stopped`, `/ext` blocks before
`updateRequestAttributes` (gate index.js:121 < :154), so `:parameters` is untouched; after `failed`, a new user message creates a new
execution and rewrites `:parameters` (and the old one is no longer resumable, spec 6.2).

### 2.4 Minting the bot token in tybot

- Server mint: `webhookService.generateChatbotToken` SV/services/webhookService.js:77-90:
  `jwt.sign(chatbot.toObject() /* incl. secret */, chatbot.secret, { issuer:'https://tiledesk.com', subject:'bot', audience:'https://tiledesk.com/bots/'+chatbot._id, jwtid: uuidv4() })`.
  The server verifies by the audience id's `+secret` (SV/middleware/passport.js:140-183) and `sub == 'bot'` (:294-314).
- tybot can do it: `jsonwebtoken ^9.0.3` is a dependency (CB/package.json:31) and already used (`pushCallerSnapshot.js:1`, decode only);
  bots are read with `+secret` (`MongodbBotsDataSource.getBotById` CB/engine/MongodbBotsDataSource.js:16; schema `select:false`
  CB/models/faq_kb.js:38-42). `getBotByIdCache` caches that document (secret included) as `cacheman:cachegoose-cache:faq_kbs:id:{id}` (:26-40).
- Which bot: the request participant, i.e. the root (draft) bot, not the snapshot (`participantBotIdFromToken` comment,
  pushCallerSnapshot.js:5-17; webhook conversations add `'bot_' + chatbot._id`, SV/services/webhookConversationService.js:146).
  For an execution inside a subagent the participant is the subagent's root id (= `ctx.agent_id` of that /ext).

### 2.5 Fetching the request

Existing call: `tdclient.getRequestById(requestId)` with the bot token (index.js:447-460, `/ext/:projectId/requests/:requestId/messages`).
But note: block jumps never carry the full request - `DirIntent` posts `request: {request_id, id_project, draft}` only (DirIntent.js:64-68),
same `DirReturnStack` (:79-83) - so every block after the first already runs with a minimal `supportRequest`. Fetching is only needed
for the first-block fields (`department` DCP:146-149, `request.attributes`, channel for `detectTrigger`).

### 2.6 Subagent frames today

`ER.onSubagentCall` ER:720-733 after `requestService.replaceBot(..., reason:'subagent_call')` (DirCallSubagent.js:71-85): alias
`exec:req:{req}:{subagentRootId}` -> execution, frame on `exec:{id}.agent_stack`. `onSubagentReturn` ER:740-749 pops and deletes the alias
(DirReturnStack.js:59-60). The return target and parent token live only in `subagent:stack:{req}` (24 h). A resume inside a subagent
later than 24 h after the call can run, but its `returnstack` finds no `parentId` (DirReturnStack.js:46-50) and stops (risk R7).

---------------------------------------------------------------------------------------------
## 3. Sealed (durable) checkpoint

- Sealer: `Sealer.seal(plain, cfg)` Sealer.js:26-47 (AES-256-GCM + RSA-OAEP-256 wrap, `{alg,kid,wrapped_key,iv,tag,ct,size}`), used via
  `sealInto(ctx, data, field, plain)` ER:149-160 (skips when `ctx._captureData` false - project policy `exec:policy:{p}.capture_data`
  ER:91-102 - and sets `data_missing`). Secrets stripped before sealing by `stripSecrets` (secrets.js:14-25) at each caller.
- Event: spec 8.1 `execution.checkpoint {sealed, cp_seq}`. Emission helper is private `emit(ctx, type, build, seqP)` ER:136-146; a new
  exported method (like `emitStopped` ER:192-201) is needed. "Whenever the execution parks" = `endOfChain` idle ER:646-661, `failed`
  ER:663-677, `stopHard`/`checkStopBeforeAction`/`gateMessage` (stopped) ER:529-617.
- Service: contract absent from the union EX/contracts.ts:218-232 (add `ExecutionCheckpoint`, `ExecutionResumed`). Storage: spec 7.2.4
  `checkpoints {execution_id, seq, sealed...}` unique on `execution_id` - no model exists (EX/model/). `sealed_data` kinds are
  `action|trigger|state_delta|state_keyframe` only (EX/model/sealedData.ts:3), unique `{execution_id, kind, seq}` (:29).
  `executions.has_checkpoint` exists in the model (EX/model/execution.ts:63) and DB model (DB/bots/executions/executions.models.ts:71)
  but nothing sets it.
- Internal endpoint `GET /internal/executions/:id/checkpoint` (spec 8.5): none. EX/api/app.ts:24-62 mounts only `/healthz`, `/metrics` and
  `/executions/api/v1/projects/:projectid/*` behind `requireUser` (user JWT, `sub:'user'`, EX/api/auth.ts:25-55). No service-token
  middleware, no `EXECUTIONS_SERVICE_TOKEN` in EX/config.ts:5-26 or tybot config.js. Unsealing needs the private key in the api
  (spec 7.2.5 `VAULT_KEYS`): not present (Phase 4 material pulled forward, risk R1).

---------------------------------------------------------------------------------------------
## 4. Side effects for the resume confirm

No existing classification: `OutcomeMapper` maps exits only (CB/executions/OutcomeMapper.js:5-6, :17-30); the only per-type set is
`ABORTABLE` (ER:20), which is "can be interrupted", not "calls out". Directive names: CB/tiledeskChatbotPlugs/directives/Directives.js:2-74.
External calls found by reading (httpUtils/axios/tdClient counts):

| Calls an external system (confirm on rerun) | name(s) |
|---|---|
| HTTP to customer endpoints | `webrequest` (DirWebRequest axios :142), `webrequestv2` (:336, :208) |
| LLM / KB (cost, MCP tools may act) | `gpt_task`, `ai_prompt` (+ MCP integration DirAiPrompt.js:361-363), `askgpt`, `askgptv2`, `ai_condition`, `gpt_assistant` |
| messaging out | `email` (DirSendEmail -> tiledesk-client sendEmail), `send_whatsapp`, `whatsapp_attribute` |
| third-party integrations | `make`, `hubspot`, `customerio`, `brevo`, `qapla` |
| writes to Tiledesk / data | `add_kb_content`, `data_table` (services/DataTablesService), `leadupdate`, `add_tags`, `firetiledeskevent`, `web_response` (publishes to the sync caller), `close`, replace/subagent/invite/move (participant changes) |
| no external effect | `code` (vm, DirCode.js:1-5), `setattribute*`, `jsoncondition*`, `iteration`, `flow_log`, `reply*`, `wait`, `intent`, `connect_block`, locks |

The API needs the type of the action that will rerun: for a hard stop it has `interrupted_action.type` (EX/model/execution.ts:43);
for `lost_owner` / other cases only the cp knows (store `next_action_type` in clear in the cp; the api reads Redis with its ACL user).

---------------------------------------------------------------------------------------------
## 5. Start new (server refire)

### 5.1 Stored trigger payload

- Emitted today: `execution.started` carries `sealed_trigger_payload` (ER:337-350): payload = `request.attributes.payload ||
  message.attributes.payload` (:342), `stripSecrets` copy (:344), sealed deferred (:346). Ingest stores it as `sealed_data` kind
  `trigger` (EX/ingest/projector.ts:190) and the contract has it (EX/contracts.ts:91). Missing when no seal key, capture off, or > 256 KB.
- What each trigger stores in that payload:
  - webhook conversation: `attributes.payload = sanitizePayloadKeys(payload)` (SV/services/webhookConversationService.js:126), payload =
    body + `webhook_http_method` + `webhook_query_params` (SV/routes/webhook.js:391-401);
  - scheduled: `live.mapping.payload` (static config, SV/routes/webhook.js:374-375) - a refire can just re-read it, no unseal needed;
  - automation: `/block` puts the whole body minus `async`/`token` into `message.payload.attributes.payload` (CB/index.js:629-632,
    :650-663), including `preloaded_request_id` and `draft`.
- `stripSecrets` masks every secret-named key as `"[secret]"` (secrets.js:3, :19-21): a refire of a payload with `api_key`, `token`... sends
  `"[secret]"` (risk R2).

### 5.2 Trigger identity as recorded

`detectTrigger` CB/executions/trigger.js:10-28: conversations with `attributes.start_type` in scheduled|webhook|trigger -> `source_id =
webhook_id || chatbot_id || (scheduled ? agentId : null)` (:19-21); `start_point_id` = `message.attributes.action` minus `#` (:13-14),
which is the BLOCK id of the start point (`action: '#' + startPoint.block_id`, webhookConversationService.js:174), not a start point id.
Automation: `{type:'automation', source_id: null, start_point_id}` (:16-18) - no webhook id, and the /block message has no
`attributes.action` so `start_point_id` is null too. The webhook id is only recoverable from the request id suffix
`automation-request-{project}-{ObjectId}-{webhook_id}` (SV/services/webhookService.js:51, SV/routes/webhook.js:421).
Connector trigger (`start_type: 'trigger'`): no writer in SV (grep `start_type` across repos: only webhookConversationService.js:126 with
`startType` scheduled|webhook) - nothing to refire today.

### 5.3 Server functions per trigger type

| Trigger | Existing path to reuse | Notes |
|---|---|---|
| scheduled | body of `POST /webhook/scheduled-start` SV/routes/webhook.js:326-387: `Webhook.findOne({id_project, chatbot_id})` :346, `findChatbot` :347, `webhook.scheduled_live` checks :353-359, rate limit `req.app.get("rate_manager").canExecute(id_project, null, 'webhook')` :361-371, `webhookConversationService.start(webhook, chatbot, mapping.payload, {startPoint:{block_id: live.block_id, mapping}, startType:'scheduled', leadId:'scheduled_'+chatbot_id, leadName, extraAttributes:{scheduled_at}})` :373-381 | auth is `x-auth-token` = `SCHEDULED_START_TOKEN` (:330-335); refire needs the same body under user JWT -> extract a shared function |
| webhook (conversation mode) | `checkEnabledAndRateLimit` :28-50 (enabled, start point enabled, rate) + `startConversation` :52-76 (`findChatbot`, `webhookConversationService.start(webhook, chatbot, payload, options)` :65, emits `webhook.triggered` :67) | webhook by `webhook_id` (= trigger.source_id); start point = current `enabledStartPoint(webhook)` (webhookConversationService.js:88-91) |
| automation | `webhookService.run(webhook, payload, dev=false, redis_client)` SV/services/webhookService.js:19-75: loads `webhook.chatbot_id` +secret :24, uses `chatbot.url` id (published) :34-37, new `preloaded_request_id` :51, mints token :54, POSTs `TILEBOT_ENDPOINT/block/{project}/{chatbot}/{webhook.block_id}` :56-67; the route emits `webhook.triggered` (SV/routes/webhook.js:434) | `NODE_ENV==='test'` short-circuits :62-65 |

Mount: `/:projectid/webhooks` is `[passport.authenticate(['basic','jwt']), validtoken, roleChecker.hasRole('admin')]` (SV/app.js:676);
a `/:projectid/executions` router would mount the same way plus an explicit permission check `roleChecker.hasRoleOrTypes(role, types,
permission)` (SV/middleware/has-role.js:186), because custom roles pass `hasRole('admin')` unchecked (spec 10.1). Rate manager:
`app.set('rate_manager', rm)` SV/app.js:288.

### 5.4 How retry_of reaches tybot's execution.started

- Conversations: `webhookConversationService.start` merges `options.extraAttributes` into request attributes
  (webhookConversationService.js:130) -> `requestService.create(... attributes)` :139-152 -> first /ext message carries `request.attributes`
  (`detectTrigger` reads it, trigger.js:11-12). tybot: `onMessageIn` builds `data` at ER:338-340 with parent/previous only - add
  `retry_of` from `message.request.attributes.retry_of`. Contract already accepts it (EX/contracts.ts:89); projector copies it
  (EX/ingest/projector.ts:169-171) but never does `old.retried_as += new id`.
- Automation: no attributes path. `webhookService.run` posts `payload` as the /block body; /block copies the body into
  `attributes.payload` (index.js:660-662). A top-level `retry_of` must be lifted out of the body by /block (like `async`/`token`
  index.js:629-632) into `message.payload.attributes.retry_of`, else it lands inside the sealed trigger payload.

---------------------------------------------------------------------------------------------
## 6. Service changes

- Status table EX/ingest/status.ts:8-16: `stopped: ["destroyed"]`, `failed: ["destroyed"]` (comment :1 already says resume is Phase 3).
  Add `running` to both. `failed` is TERMINAL (:6) and `NOT_TERMINAL = fromStatuses("completed")` (projector.ts:52): with failed->running
  added, `bumpSeq` (projector.ts:194-210) re-derives running/waiting again after resume. Forward-only guard: a stale `execution.failed` /
  `execution.stopped` with a seq below the resume would move running back (projector `finish` :273-292 filters on status only);
  needs a `resumed_seq` guard (risk R5).
- Controls EX/api/controls.ts: `ControlName` :3, `PERM` :10-14, `BY_STATUS` :17-23. Add `resume` (stopped, failed) and `start_new`
  (stopped, failed, completed, destroyed) - both `executions_control`; start_new only for `trigger.type` in scheduled|webhook|trigger|automation
  and never `test` (spec 6.5 note 1); resume needs the 6.5 note 3 checks (cp present, snapshot loadable, conversation open:
  `conversation_closed_at` EX/model/execution.ts:42, no newer execution: `previous_execution_id` of a later one / `exec:req` pointing
  elsewhere). `allowedControls(status, role)` :29 takes only the status: it needs the execution doc for these conditions; it is called in
  the detail route EX/api/routes/executions.ts:289 and in the 409 bodies control.ts:140, :187.
- Routes EX/api/routes/control.ts: pattern to copy = `/:id/stop` :122-169 (body zod, `findOne` FIELDS :28, `isDriven` probe before audit
  :134, `audit` before acting :139/:143, 409 with `allowed`). `Action` type :30 and `audit()` :44-69.
- tybot control EX/api/tybotControl.ts: `ControlMessage.type` :16 is `"stop"|"cleanup"` - add `"resume"`; `setStop` :31; need `DEL
  exec:{id}:stop`, re-SET `exec:req:{req}:{agent}` (deleted by write-back on failed, tybotRedis.ts:45-47) and hash `status` back to
  running (ES `resolve` treats `failed` as terminal, ES:8, :62-63), set `transit` (so the reaper waits), PUBLISH and read the receiver
  count; `cleanup` :48-56 must also DEL `exec:{id}:cp`.
- Audit: `AuditLog.action` enum EX/model/auditLog.ts:20 `["stop_soft","stop_hard","destroy"]` -> add `resume`, `start_new`.
  `recordAudit` EX/api/audit.ts:19-30 publishes `audit.<pid>.<action>`.
- Projector EX/ingest/projector.ts: dispatch `applyEvent` :68-123 - add `execution.resumed` (stopped|failed -> running, clear
  `error`/`end_reason`/`ended_at`? keep history), `execution.checkpoint` (store sealed, `has_checkpoint: true`), and in `onStarted`
  :165-191 a `$addToSet retried_as` on the `retry_of` execution. Server conversation events after a resume: `applyConversation` :351-372
  matches only NOT_TERMINAL executions.
- Reaper EX/jobs/reaper.ts:26-49: `running` + `last_event_at < now-30s` + no owner/transit -> `failLostOwner`. A resumed execution has an
  old `last_event_at` (the stop/fail time): between the API's status write and the pod's `SET owner` the reaper would fail it at once
  unless the API bumps `last_event_at` or sets `transit` first. If no pod picks up, the reaper failing it after 30 s is the fallback.
- Detail/lineage already returned: EX/api/routes/executions.ts:290-295 (`retry_of`, `retried_as`).
- Start-new from the api: `axios.put(...close)` pattern with the caller's JWT exists in control.ts:86-101 (`TILEDESK_API_URL`,
  `authHeader`) - reuse for `POST /:pid/executions/refire`.

---------------------------------------------------------------------------------------------
## 7. Dashboard (DB, branch feature/execution-graph)

- Controls row: DB/bots/executions/execution-detail/execution-detail.component.html:70-78 renders `allowed_controls` generically
  (`"Executions.Controls." + c.name`, disabled by role with tooltip). Logic: `CONTROL_NAMES` component.ts:28 (filter, add `resume`,
  `start_new`), `PendingControl = 'stopping'|'destroying'` :30 (add `resuming`, `starting`), `controls` getter :439-442, `noPermissionKey`
  :444-446, `runControl` :468-490 (dialog per control), `sendControl` :492-518 (typed `Observable<{status}>`), `controlError` :520-536
  (409 reads `allowed`; resume needs `confirm_required {action}` -> reopen the dialog with the warning, and `not_resumable {reason}` ->
  offer Start new, spec 9.4 / 11.5).
- Dialogs: copy `StopDialogComponent` / `DestroyDialogComponent` (DB/bots/executions/shared/stop-dialog.component.ts:6-55,
  destroy-dialog.component.ts:4-8), declared in DB/bots/executions/executions.module.ts:15-16, :27-28. New `ResumeDialogComponent`
  (data: action label, side_effect flag) and `StartNewDialogComponent` (agent name, "current published version"; for automation "cannot
  answer the original sync caller", spec 6.3).
- Models DB/bots/executions/executions.models.ts: `ControlName` :89, `AllowedControl.reason` :95 (`'role'` only; add `'no_checkpoint'`,
  `'conversation_closed'`, `'newer_execution'`, `'test'`, `'not_unattended'`), `Lineage` :134-139 already has `retry_of` / `retried_as`
  (rendered html:57-66).
- Service DB/services/executions.service.ts: `stop` :94-98, `destroy` :100-106 -> add `resume(pid, id, confirm?, reason?)` and
  `startNew(pid, id, reason?)` (202 `{new_execution_hint}`).
- i18n: `Executions.Controls` en.json:4344, it.json:3937.
- Activities: verb union DB/models/activity-model.ts:17-19; filter group + icons DB/activities-new/utils/activity-verbs.constants.ts:35-37,
  :61-63; sentences DB/activities-new/utils/activity-message.util.ts:946-956 (done / tried phrases), :1022-1024 (switch); i18n labels
  en.json:459-461; spec file DB/activities-new/activities-new.executions.spec.ts.
- Server sentences (same verbs): SV/pubmodules/activities/activityMessageUtil.js `EXECUTION_VERBS` :192-199 (en/it/tried), switch
  :362-364; CSV uses `buildExecutionMessage` SV/pubmodules/activities/routes/activity.js:606-607; owner-only filter is a regex
  `^EXECUTION_` (activity.js:66) so new verbs are covered. Mirror mapping `AUDIT_VERBS` SV/pubmodules/executions-publisher/index.js:143-147
  (unknown action -> null -> dropped, :150) must get `resume: EXECUTION_RESUME`, `start_new: EXECUTION_START_NEW`. Docs table
  SV/docs/activities-client.md:195-203.

---------------------------------------------------------------------------------------------
## 8. Scheduler (link only)

- Target `scheduledStart`: POST `${TILEDESK_API_URL}/webhook/scheduled-start`, `x-auth-token`, body = payload, never retried
  (SC/config/targets.yaml:4-13).
- The run log already keeps the response: `finish("success", { result: summarize(result.data) })` SC/src/executor.ts:124, `result` = JSON
  of the target response truncated to 2048 chars (SC/src/runModel.ts:18-19, :34) -> `{success, request_id}` from SV/routes/webhook.js:382.
  The console shows it as raw JSON (SC/web/src/components/RunsTable.tsx:30-71). A "View execution" link = dashboard list with
  `q=<request_id>` (service list filter `q`, EX/api/routes/executions.ts:50). No run id is sent to the server, so `trigger.source_run_id`
  stays empty.
- A refired scheduled run does not go through the scheduler, so it has no scheduler run row.

---------------------------------------------------------------------------------------------
## 9. Risks / unknowns the plan must decide

R1. Private key and internal auth in Phase 3. Start new (webhook/automation payload) and the durable checkpoint need unsealing in the
    api; no keyring, no decrypt, no `EXECUTIONS_SERVICE_TOKEN` exist. Options: (a) pull the api keyring (`VAULT_KEYS`) + internal token
    route into Phase 3; (b) Phase 3 = Redis checkpoint only (7 d) and start new only for scheduled (no payload), durable cp + payload refire
    in Phase 4; (c) server re-reads what it still has (scheduled mapping; nothing for webhooks).

R2. Masked secrets in the stored trigger payload. `stripSecrets` turns secret-named keys into `"[secret]"` (secrets.js:14-25) before
    sealing; a refire would send them. Options: (a) refuse start new when the payload has masked keys (409 with reason); (b) refire with
    masked values and say so in the dialog; (c) seal the raw payload for trigger kind only (contradicts spec 10.2 "never stored").

R3. Checkpoint granularity and jumps. A jump target is only known as text (`rec.jumpedTo`, ER:460); the next block's first cp is written
    after its first action. Options: (a) after a jump the cp keeps the previous block's last action (resume reruns the jump action);
    (b) write a cp `{block_id:<target>, action_index:0}` at the next pod's `blockEntry` (ER:388); (c) resolve the target intent id in
    `onJump` before posting.

R4. Lost owner (pod died) has no "action started" marker. Options: (a) a cheap pre-action cp write (`next_action:"rerun"`, type) before
    `handler.execute` (DCP:356) - +1 SET per action, over the spec 12 budget; (b) treat lost_owner resume as rerun of the next action and
    always confirm if it is a calling type; (c) mark in the hash `exec:{id}` field `in_action` with the same tick as the stop GET.

R5. Status machine after resume. failed is terminal in tybot (ES:8), the service write-back deleted `exec:req` and set hash status failed
    (tybotRedis.ts:45-48), projector `finish`/`onStopped` are status-only guards. Options: (a) API restores `exec:req` (NX: a newer
    execution means not resumable) + hash status + transit, and the projector records `resumed_seq`, ignoring status events with lower
    seq; (b) tybot's resume driver does the Redis restore after winning the lease, API only flips Mongo; (c) resume creates a NEW
    execution id linked `resumed_from` (simplest projection, but contradicts spec 6.1 same-execution model).

R6. Checkpoint size and where request_state lives. Copying the whole `:parameters` on every action doubles the per-action payload, and
    the sealed copy fails over 256 KB (Sealer.js:29). Options: (a) cp = pointer (block, index, stack, trigger, locks) and Redis resume
    uses the live `:parameters` (15 d TTL, untouched while stopped) / `exec:{id}:state`; full parameters only in the sealed parked cp;
    (b) full copy as the spec says, fire-and-forget seq-guarded SET; (c) full copy only at park points (stop/idle/failed/jump), not per
    action - lost_owner then resumes from the last park point.

R7. Subagent resume. Two stacks: `exec:{id}.agent_stack` (frames, no token) and `subagent:stack:{req}` (parentToken + nextBlock, 24 h TTL,
    the one `returnstack` uses). Options: (a) cp copies `subagent:stack` minus tokens and the resume re-mints each parentToken (root id of
    the frame) and re-pushes; (b) not resumable inside a subagent after 24 h (409 `not_resumable: subagent_stack_expired`); (c) resume
    only restores the current agent and lets returnstack fail as today.

R8. Resume entry mechanics and ownership. Options: (a) self-jump `_tdinternal` `/#block` + `attributes.resume` through `/ext` (reuses the
    pipeline; lands on any pod -> use transit; needs `startIndex` in DCP and `resetStep/resetStarted`); (b) local in-process call by the
    NX winner (index.js /ext body extracted into a function). Also: API must know a pod took it (PUBLISH receiver count discarded,
    tybotControl.ts:35-37; reaper fails a resumed execution with old `last_event_at` within one tick, reaper.ts:30-33).

Further unknowns (smaller):
- R9. Resume of an execution stopped while `waiting` (nothing was running): cp is the block exit; is "resume" = back to `waiting` with
  locks restored (no block runs), or not offered? The 6.5 table offers it.
- R10. Automation trigger identity: `source_id`/`start_point_id` are null (trigger.js:16-18); webhook id only in the request-id suffix.
  Options: parse the suffix in `detectTrigger`, or have /block pass `webhook_id`. Also `retry_of` for /block (5.4).
- R11. Connector `trigger` start type has no producer in the server today: start new for it is untestable locally; ship as "not
  offered" or wait for connector-hub.
- R12. Start-new idempotency: a double click (or API retry) fires twice; options: audit_id as idempotency key on the refire, or a
  short Redis NX `exec:{id}:refire` in the api.
- R13. Which snapshot on resume: spec says the recorded `agent_version`; old snapshots are kept (trashed copies,
  chatbotService.js:216-233) but nothing guarantees it (manual deletes) - check `Faq_kb.findById(agent_version)` before accepting.
- R14. `mcp:locked` (TC:90-96) is not in spec 7.1.5 `request_state`; a resume with it set returns without running.
- R15. Scheduler branch: SC has no `feature/execution-traceability`; the link needs no SC code (request_id already in the run result),
  only a dashboard deep link with `q`.
