# Agent Execution Traceability — Phase 2 (Stop & Destroy) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Owners and admins can soft-stop, hard-stop and destroy an agent execution from its detail page. Every control action is audited, and the audit shows up in the dashboard's Activities page for owners. Custom roles can be given the five executions permissions.

**Architecture:**
- **tybot** gets stop gates (on message arrival and before every action), a lease/transit pair in Redis, and a per-pod AbortRegistry fed by an `exec:control` Redis channel, so a hard stop cuts the running HTTP call or wait.
- **tiledesk-executions (API)** owns control: it validates status and role, writes the audit entry, sets the stop flag, publishes on `exec:control`, writes control statuses directly to Mongo through the projector's forward-only rules, and publishes `audit.recorded`. A reaper in `jobs` fails executions whose pod died.
- **tiledesk-server** consumes `audit.recorded` into Activities and hides `EXECUTION_*` rows from non-owners.
- **Dashboard:** stop and destroy dialogs, an Executions group in Activities, and the permissions in the custom-role editor.

**Tech Stack:**
- tybot: Node 24, CommonJS, node-redis v4, mocha.
- Service: TypeScript ESM, express, zod, mongoose 8, ioredis, amqplib, vitest.
- Server: Node, mongoose 5, amqplib 0.5, mocha.
- Dashboard: Angular 15, Angular Material dialogs, Karma.

**Spec:** `docs/superpowers/specs/2026-11-09-agent-execution-traceability-design.md` (tiledesk-chatbot). Read §6.1, §6.5, §7.1.2, §7.1.4, §7.1.6, §7.2.3, §7.3.1, §8.1, §8.2, §8.4, §9.2, §9.3, §9.6, §10.1, §10.4, §11.5, §11.7, §11.8.

**Phase 1 decisions to respect:** `docs/superpowers/notes/phase1-ledger.md` (Ruling lines).

**Code facts this plan relies on:** a map of the current code, with file:line for every place named below, is in the controller workspace, copied to `docs/superpowers/notes/phase2-code-map.md` before Task 1.

Phase 2 scope is spec §14's Phase 2 row. Resume, start new, checkpoints, `next_action: "rerun"`, data access, the Audit tab and retention settings stay in Phases 3–4.

**Calls made in this plan** (marked *my call* below, for the user's review):
1. **Control statuses are written by the API directly to Mongo, not as AMQP events.** These are `stopping`, `stopped` when nothing is running, and `destroyed`. The API calls the projector's shared forward-only function. The spec's `execution.stopping` / `execution.destroyed` events are not emitted. Reason: the API has no tybot `seq`, and the status is the API's decision anyway.
2. **The audit entry is written once, before acting.** `details.result` is `accepted` or `rejected:<reason>`. It is append-only, so it never gets a second write. A role refusal (403) on a control route is not audited; only data access audits denials (Phase 4).
3. **A conversation closed while an execution is `stopping` / `stopped` keeps the stop status.** It only sets `conversation_closed_at`. The spec's diagram has no closed edge from stopped.
4. **Server sentences.** English goes in `buildDefaultActivityMessage` (list and CSV). Italian goes through a new `buildExecutionMessage(activity, lang)` used by the CSV when `lang=it`. The spec assumed the it/en switch already lived in `buildDefaultActivityMessage`; it does not.
5. **`allowed_controls` becomes `[{name, allowed, reason?}]`.** The names are `stop`, `stop_hard_now` (escalation) and `destroy`. A control not allowed for the status is omitted; one allowed for the status but not for the role has `allowed:false, reason:'role'`.
6. **Hard-stop interruption backstop.** An aborted action's own error branch never continues the chain. The plug callback and `sendMessageToBot` check `ctx.aborted` and stop there.

## Global Constraints

- **Off switch:** with `EXECUTIONS_ENABLED=false`, tybot behaves exactly like 3.0.5. That means no stop-flag reads, no lease, no `exec:control` subscription and no abort plumbing; a directive given `signal: undefined` behaves as today. The server's audit consumer starts only when `EXECUTIONS_AMQP_URL` is set. The dashboard shows no controls when `EXECUTIONS_BASE_URL` is empty.
- **Hot path budget (spec §12):**
  - Per action: one `GET exec:{id}:stop` in addition to Phase 1's calls.
  - Per message: the stop-flag read, the lease `SET NX PX` and the transit `DEL` (jumps only), pipelined with the Phase 1 resolve calls (same tick, same connection).
  - The heartbeat runs on a timer, never on the flow's await path.
  - Every `exec:*` error is caught and logged, and the flow goes on.
- **Redis keys (exact, spec §8.2):**
  - `exec:{id}:owner`: pod id, `PX 15000`. Heartbeat `PEXPIRE` every 5000 ms while a chain runs.
  - `exec:{id}:transit`: timestamp, `PX 120000`. Set before a jump post, deleted when the next pod takes the block.
  - `exec:{id}:stop`: `soft` | `hard`, `EX 604800`.
  - Channel `exec:control`: JSON `{type: "stop"|"cleanup", execution_id, mode?}`.
  - Config: `EXECUTIONS_LEASE_MS` (15000), `EXECUTIONS_HEARTBEAT_MS` (5000), `EXECUTIONS_TRANSIT_MS` (120000).
- **Statuses (spec §6.1).** Allowed transitions:
  - running → waiting | stopping | stopped | completed | failed | destroyed
  - waiting → running | stopped | completed | failed | destroyed
  - stopping → stopped | failed | destroyed
  - stopped → destroyed
  - failed → destroyed
  - completed, destroyed → nothing

  `stopped → running` and `failed → running` are Phase 3 (resume). Terminal for the tybot write-back: completed, failed, destroyed.
- **Controls per status (spec §6.5, Phase 2 subset):**

  | Status | Controls |
  |---|---|
  | running, waiting | stop (soft/hard), destroy |
  | stopping | stop_hard_now, destroy |
  | stopped, failed | destroy |
  | completed, destroyed | none |
- **Permissions (spec §10.1):** stop needs `executions_control` (owner, admin); destroy needs `executions_destroy` (owner); the Activities `EXECUTION_*` rows need `executions_audit_read` (owner). Custom roles get each only through the permission string.
- **Role-editor dependencies:**
  - `executions_*` require `flows_read`.
  - `executions_audit_read` also requires `activities_read`.
  - control, destroy and data_access require `executions_read`.
  - In the editor, ticking a permission ticks and locks its prerequisites.
- **Audit:**
  - Verbs: `EXECUTION_STOP_SOFT`, `EXECUTION_STOP_HARD`, `EXECUTION_DESTROY` (Phase 2).
  - Activity mapping (spec §7.3.1): `actor {type:"user", id, name}`; `target {type:"execution", id, object:{agent_id, agent_name, request_id, status_after, trigger_type}}`; `related {role:"agent", type:"faq_kb", id: agent_id, name: agent_name}`; `actionObj {mode?, reason?, result, audit_id}`.
  - Idempotent on `actionObj.audit_id` (unique sparse index).
  - `audit.recorded` routing key: `audit.<id_project>.<action>`. Server queue: `server.executions.audit`, bound to `audit.#`.
- **Destroy (spec §9.6):**
  - Body `{confirm: <first 6 characters of the execution id>}`.
  - If running or stopping: hard stop, then wait up to 10 s for `stopped`, then proceed anyway.
  - Delete `exec:{id}:seq`, `:state`, `:owner`, `:transit` and `:stop`. Replace `exec:{id}` with a hash holding only `status: destroyed` (TTL 604800). Keep `exec:req:{request_id}:{agent_id}`, so the next message on the conversation resolves to a new execution with `previous_execution_id` = the destroyed one (Phase 1 resolve treats destroyed as terminal) *(my call: the spec deletes both keys, which would lose that link)*.
  - Close the conversation through the server with the caller's JWT, only if it has a conversation link, is not automation, and is not already closed.
  - Status `destroyed`, `end_reason: "destroyed"`. Trace, sealed data and audit are kept.
- **Sync automation callers:** when an automation execution is stopped or a message is blocked, publish `{status:409, payload:{error:"execution_stopped", execution_id}}` on `/webhooks/<request_id>`, once.
- **Repos, branches, rules:**
  - Repos: tiledesk-chatbot, tiledesk-server, tiledesk-executions, tiledesk-dashboard, tiledesk-dev-env, each in its main folder on `feature/execution-traceability` (continue the Phase 1 branches; no worktrees or clones).
  - No push, nothing on stage or prod.
  - Storage rules from the Phase 1 plan apply unchanged (disk thresholds, `tiledesk-exec` project only, no prune).
  - Every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Hard stop during an action whose error branch jumps:** a web request with a `falseIntent` must not start the next block. Test: `hard stop during a web request with falseIntent runs no further block` (Task 4).
2. **Stop arriving while a jump is in transit:** the next pod emits `execution.stopped` and runs nothing. Test: `jump arriving after the stop flag emits stopped and runs nothing` (Task 3).
3. **Destroy when the pod is dead or never acknowledges the hard stop:** destroy still completes after 10 s and the keys are gone. Test: `destroy completes after the 10 s wait when no stopped arrives` (Task 7).
4. **Double clicks and concurrent stop + destroy:** each request gives one audit entry, statuses only move forward, and the second stop on a `stopped` execution is 409. Test: `concurrent stop and destroy end destroyed with two audit entries` (Task 7).
5. **An admin exporting the Activities CSV** must not get `EXECUTION_*` rows. Test: `csv for admin excludes EXECUTION_ verbs` (Task 10).

---

## Before you start

- [x] The code map is in the repo: `docs/superpowers/notes/phase2-code-map.md` (committed with this plan).
- [ ] Check every repo is on `feature/execution-traceability` and clean, and run the disk check (Storage).
- [ ] Baselines:
  - **tybot:** the failing set equals `docs/superpowers/notes/phase1-tybot-baseline.txt` (249).
  - **service:** `npx vitest run` is green.
  - **server:** the executions-publisher and activities tests pass.
  - **dashboard:** the executions specs pass with the local Karma harness.

---

## Part A — tybot (tiledesk-chatbot, `tybotRoute/`)

### Task 1: Control keys in ExecutionStore + config

**Files:**
- Modify: `executions/ExecutionStore.js`, `executions/config.js`
- Test: `test/executions_store_control_test.js` (Redis)

**Interfaces — produces:**
- `store.getStop(id) → Promise<'soft'|'hard'|null>`
- `store.acquireLease(id, pod, ms) → Promise<boolean>` (`SET NX PX`)
- `store.renewLease(id, pod, ms) → Promise<boolean>` (Lua: `PEXPIRE` only if the value equals `pod`)
- `store.releaseLease(id, pod) → Promise<void>` (Lua compare-and-delete)
- `store.setTransit(id, ms) → Promise<void>`
- `store.clearTransit(id) → Promise<void>`
- `getConfig()` gains `leaseMs` (15000), `heartbeatMs` (5000) and `transitMs` (120000), from `EXECUTIONS_LEASE_MS`, `EXECUTIONS_HEARTBEAT_MS` and `EXECUTIONS_TRANSIT_MS`.
- All methods return null/false/void on Redis errors and never throw (as in Phase 1).

- [ ] **Step 1: Failing tests:**
  - `getStop returns null, then the value set by SET exec:{id}:stop hard`
  - `acquireLease is exclusive: second pod gets false`
  - `renewLease by a non-owner does not extend the TTL`
  - `releaseLease by a non-owner keeps the key`
  - `setTransit sets PX ≈ 120000; clearTransit deletes it`
  - `config defaults 15000/5000/120000`
  - `methods resolve null/false when the client rejects`
- [ ] **Step 2:** Run `REDIS_HOST=localhost REDIS_PORT=6379 npx mocha test/executions_store_control_test.js --exit` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS. Then run the full suite: the failing set must equal the baseline.
- [ ] **Step 5:** Commit `feat(executions): stop flag, lease and transit keys`.

### Task 2: Lease and transit in the recorder

**Files:**
- Modify: `executions/ExecutionRecorder.js` (`onMessageIn`, `beforeJump`, `endOfChain`, plus new private `startHeartbeat` / `stopHeartbeat`)
- Test: `test/executions_lease_test.js`

**Interfaces:**
- Consumes: Task 1's store methods.
- Produces:
  - `ctx.pod` = `os.hostname()`.
  - `ctx.leased: boolean`.
  - `ctx._heartbeat` (an unref'd interval).
- Rules:
  - `onMessageIn`, after resolve: run `acquireLease`, plus `clearTransit` when the message carried `attributes.execution_id` (a jump), in the same tick as the stop read of Task 3 (`Promise.all`). If the lease is not acquired, the message is still processed, just without a heartbeat (spec §7.1.4).
  - Heartbeat: `renewLease` every `heartbeatMs` while the chain runs.
  - `beforeJump`: `setTransit`, then `releaseLease` and stop the heartbeat, before the post. These are added to the bounded promise (Phase 1's `withinBudget`).
  - `endOfChain` and the Task 3 stop paths: `releaseLease` and stop the heartbeat.
  - Flag off: nothing of this runs.

- [ ] **Step 1: Failing tests:**
  - `a chain holds exec:{id}:owner = pod while it runs and releases it at the end`
  - `heartbeat keeps the lease alive past leaseMs during a 20 s wait block (use leaseMs 300, heartbeatMs 100)`
  - `a jump sets transit and releases the lease; the next /ext clears transit and takes the lease`
  - `a second concurrent message on the same request does not take the lease and still runs`
  - `flag off: no owner/transit keys`
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS. Run the full suite and compare with the baseline.
- [ ] **Step 5:** Commit `feat(executions): lease, heartbeat and transit`.

### Task 3: Stop gates (soft stop and blocked messages)

**Files:**
- Modify: `executions/ExecutionRecorder.js` (new exported methods), `index.js` (`/ext`, between the resolve at ~l.118 and the `TiledeskChatbot` construction), `tiledeskChatbotPlugs/DirectivesChatbotPlug.js` (`nextDirective`)
- Test: `test/executions_stop_test.js`

**Interfaces — produces:**
- `ExecutionRecorder.gateMessage(ctx, message) → Promise<'run'|'blocked'>`. It reads `getStop`.
  - Stop set and the message is an internal jump (`sender === "_tdinternal"`): emit `execution.stopped {mode, last_seq}` (once per chain) and return `'blocked'`.
  - Stop set and the message is a user message: emit `execution.message_while_stopped {}` and return `'blocked'`.
  - In both blocked cases, for automation: publish the 409 WebResponse once (`tdcache.publish('/webhooks/'+request_id, …)`), and release the lease.
  - Returns `'run'` when no stop is set and when ctx is null.
- `ExecutionRecorder.checkStopBeforeAction(ctx, {index, directive}) → Promise<boolean>` (true = stop here).
  - Reads `getStop`. If set: run `blockExit` with the step outcome unchanged, emit `execution.stopped {mode, last_seq}`, release the lease, publish the 409 for automation, and set `ctx._stopped = true`, so `endOfChain` emits nothing.
- `ctx._stopped`, `ctx.aborted` (Task 4).
- In `index.js`: `if (ctx && await ExecutionRecorder.gateMessage(ctx, message) === 'blocked') return;`. The HTTP response has already been sent (200).
- In `nextDirective`, before `checkStep`: `if (this.execution && await ExecutionRecorder.checkStopBeforeAction(this.execution, …)) return null;`. A null directive makes `process` call `theend`.
- `OUTCOME_RANK` gains `interrupted: 3`; it is used in Task 4.

- [ ] **Step 1: Failing tests** (static bots, Redis, fake emitter, as in Phase 1):
  - `soft stop set during action 1 stops before action 2: execution.stopped {mode:'soft'}, no action.completed for action 2, no execution.idle`
  - `jump arriving after the stop flag emits stopped and runs nothing`
  - `a user message while stopped emits message_while_stopped and the bot sends nothing (mock server receives no message)`
  - `automation sync caller receives 409 execution_stopped once`
  - `flag off: no stop read (proxied client records zero GETs on exec:*)`
  - `per-action Redis budget: exactly one extra GET per action`
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS. Run the full suite and compare with the baseline.
- [ ] **Step 5:** Commit `feat(executions): soft stop and blocked messages`.

### Task 4: Hard stop — AbortRegistry, ControlListener, abortable directives

**Files:**
- Create: `executions/AbortRegistry.js`, `executions/ControlListener.js`
- Modify:
  - `executions/ExecutionRecorder.js`: register an AbortController per ctx; abort-aware `afterAction` (outcome `interrupted`); `beforeJump` returns `'skip'` when `ctx.aborted`.
  - `services/TilebotService.js` `sendMessageToBot`: skip the post when beforeJump resolves to `'skip'`, and call the callback as if posted.
  - `tiledeskChatbotPlugs/DirectivesChatbotPlug.js`: `context.signal = this.execution?.signal`; in the action callback, if `this.execution?.aborted` → stop (no `nextDirective`), after `afterAction`.
  - `utils/HttpUtils.js`: copy `options.signal` into the axios options.
  - Pass `signal: this.context.signal` in: DirWebRequest, DirWebRequestV2 (both axios calls), DirGptTask, DirAiPrompt, DirAskGPT, DirAskGPTV2, DirAiCondition, DirSendWhatsapp (each of their `httpUtils.request` / axios option objects).
  - DirWait: keep the timer handle and clear it on abort, calling the callback with no further action.
  - `index.js` `connectRedis`: start the ControlListener when enabled.
- Test: `test/executions_hardstop_test.js`

**Interfaces — produces:**
- `AbortRegistry.register(executionId) → AbortController`, `AbortRegistry.abort(executionId) → boolean`, `AbortRegistry.release(executionId)`.
- `ControlListener.start(tdcache)` subscribes to `exec:control`.
  - `{type:'stop', mode:'hard', execution_id}` → `AbortRegistry.abort`.
  - `{type:'cleanup', execution_id}` → abort as well.
  - Malformed JSON is ignored with a warn.
- `ctx.signal`, `ctx.aborted` (set by the abort listener).
- On abort:
  - The current action's `action.completed` gets `outcome:'interrupted'`, `error_code:'hard_stop'`.
  - `execution.stopped {mode:'hard', interrupted_action:{index, action_id, type, title}, last_seq}`.
  - The step outcome is `interrupted`.
- Actions without abort support (DirSendEmail, DirCode and any directive not listed above) run to completion, get `hard_degraded: true` on their `action.completed`, and the stop takes effect before the next action (Task 3's gate sees `hard`).

- [ ] **Step 1: Failing tests:**
  - `hard stop during a 20 s wait ends within 1 s with interrupted + execution.stopped {mode:'hard', interrupted_action}`
  - `hard stop during a web request with falseIntent runs no further block` (the endpoint hangs; the abort fires; no step.started for the false block; no jump posted)
  - `hard stop during an action without abort support → that action completes with hard_degraded true, then stopped before the next action`
  - `ControlListener ignores malformed messages`
  - `flag off: no subscription, HttpUtils call options unchanged (signal undefined)`
  - `abort of an execution not on this pod is a no-op`
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS. Run the full suite and compare with the baseline.
- [ ] **Step 5:** Commit `feat(executions): hard stop with abortable directives`.

---

## Part B — tiledesk-executions

### Task 5: Contracts, statuses and projector for stop and destroy

**Files:**
- Modify: `src/contracts.ts`, `src/ingest/status.ts`, `src/ingest/projector.ts`, `src/model/execution.ts`, `src/ingest/tybotRedis.ts`
- Test: `test/status.test.ts`, `test/projector.stop.test.ts`, `test/contracts.test.ts`

**Interfaces — produces:**
- **Contracts:**
  - `ExecutionStopped` (tybot, seq): data `{mode:'soft'|'hard', interrupted_action?:{index, action_id|null, type|null, title|null}, last_seq}`.
  - `ExecutionMessageWhileStopped` (tybot, seq): data `{}`.
- **Statuses:** `STATUSES` adds `stopping`, `stopped`, `destroyed`, with transitions exactly as in Global Constraints. `TERMINAL = completed | failed | destroyed`.
- **Execution model:** adds `stop_mode`, `stopped_at`, `stop_requested_at`, `messages_while_stopped` (Number), `conversation_closed_at`, `interrupted_action`.
- **Projector handlers:**
  - `execution.stopped` → status `stopped` (from running, waiting or stopping), plus `stop_mode`, `stopped_at`, `interrupted_action`.
  - `execution.message_while_stopped` → `$inc messages_while_stopped`.
  - `conversation.closed` on stopping/stopped → set `conversation_closed_at` only, status unchanged (*my call 3*).
  - `bumpSeq` keeps never rewriting stopping/stopped/destroyed.
- **Exported for the API:** `applyControlStatus(executionId: string, idProject: string, to: 'stopping'|'stopped'|'destroyed', set: Record<string,unknown>, opts?: {onTerminal?}) → Promise<{changed: boolean, from: string|null}>`.
  - It uses `canTransition` in a `findOneAndUpdate` filtered on `status ∈ fromStatuses(to)`.
  - `destroyed` calls `onTerminal` with status `destroyed`.
- `TerminalInfo.status` includes `destroyed`; `writeBackTerminal` handles it.

- [ ] **Step 1: Failing tests:**
  - `status table matches the constraint list (every pair)`
  - `execution.stopped from running → stopped with interrupted_action`
  - `message_while_stopped counts`
  - `conversation.closed on stopped keeps stopped and sets conversation_closed_at`
  - `applyControlStatus stopped→destroyed changes once; a second call returns changed:false`
  - `completed→stopped refused`
  - `late action.completed after stopped does not move the status`
  - `contracts accept the two new event types and reject unknown modes`
- [ ] **Step 2:** Run `TEST_MONGO_URI=mongodb://localhost:27018 npx vitest run test/status.test.ts test/projector.stop.test.ts test/contracts.test.ts` (start `exec-test-mongo` on 27018 if missing; check disk first) → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS, plus `npm run typecheck`.
- [ ] **Step 5:** Commit `feat: stop and destroy statuses in contracts and projector`.

### Task 6: API infrastructure — body parser, Redis, AMQP publisher, audit log

**Files:**
- Create: `src/api/tybotControl.ts`, `src/api/auditPublisher.ts`, `src/model/auditLog.ts`, `src/api/audit.ts`
- Modify: `src/api/app.ts` (`express.json({limit:'16kb'})` on the API router), `src/api/auth.ts` (keep `name` from the JWT's firstname+lastname, fallback email), `src/main.ts` (api: init the tybot Redis and the audit publisher; jobs: init the tybot Redis), `src/config.ts` (no new keys; reuse `TYBOT_REDIS_URL`, `AMQP_URL`), `src/db.ts` (register AuditLog)
- Test: `test/audit.test.ts`, `test/tybotControl.test.ts` (real Redis, gated by `REDIS_URL`)

**Interfaces — produces:**
- `tybotControl`:
  - `setStop(id, mode) → Promise<void>` (`SET exec:{id}:stop mode EX 604800`)
  - `publishControl(msg) → Promise<void>` (`PUBLISH exec:control`)
  - `isDriven(id) → Promise<{owner: boolean, transit: boolean}>`
  - `cleanup(id) → Promise<void>` (deletes `exec:{id}:seq|state|owner|transit|stop` and rewrites `exec:{id}` to `{status:'destroyed'}` with EX 604800, as in Global Constraints; the request key is kept)
  - Each throws `ControlUnavailableError` when Redis is not configured or errors; routes map it to 503.
- **AuditLog model:**
  - Fields: `{audit_id (uuid, unique), at, actor:{user_id, email, name, role}, id_project, execution_id, agent_id, action, reason?, details:{mode?, result, status_before?, status_after?}, ip, user_agent}`.
  - Indexes: `{id_project, at:-1}`, `{execution_id, at:-1}`, TTL on `at` of 365 days.
  - Insert only, never updated.
- `recordAudit(entry, display: {actor_name, agent_name, request_id, status_after, trigger_type}) → Promise<AuditLog>`:
  - inserts the entry;
  - publishes `audit.recorded` (routing `audit.<id_project>.<action>`, payload = entry plus display) through the confirm-channel publisher;
  - a publish failure is logged and never fails the request (the audit document is the authority).
- `auditPublisher` uses a lazy connection with a 10 s publish timeout, and is a no-op with a warn when `AMQP_URL` is unset.

- [ ] **Step 1: Failing tests:**
  - `recordAudit inserts once and publishes audit.recorded with the display context`
  - `publish failure does not throw`
  - `AuditLog has no update path (schema has no update methods used; test asserts the TTL and unique indexes)`
  - `setStop/publishControl/isDriven/cleanup against Redis`
  - `cleanup leaves exec:{id} = {status:destroyed} and keeps exec:req`
  - `requireUser exposes name`
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS, plus typecheck and build.
- [ ] **Step 5:** Commit `feat(api): control plumbing and append-only audit log`.

### Task 7: Control routes — stop, destroy, allowed_controls

**Files:**
- Create: `src/api/routes/control.ts`, `src/api/controls.ts`
- Modify: `src/api/app.ts` (mount), `src/api/routes/executions.ts` (`GET /:id` uses `allowedControls`)
- Test: `test/api.control.test.ts` (Mongo + Redis; the server close stubbed with a local express)

**Interfaces — produces:**
- `allowedControls(status, role: ProjectRole) → {name:'stop'|'stop_hard_now'|'destroy', allowed:boolean, reason?:'role'}[]` (pure; tables in Global Constraints).
- `POST /projects/:pid/executions/:id/stop`, body `{mode:'soft'|'hard'}`, requires `executions_control`:
  - Order: validate → load the execution (project-scoped, 404) → check the status allows it (else 409 `{error:'not_allowed', allowed}`) → `recordAudit` (STOP_SOFT / STOP_HARD, result accepted; a 409 writes result `rejected:<status>`) → `setStop` → branch on the status:
    - **waiting**, or **running** with no owner and no transit: `applyControlStatus(stopped)`, `stop_mode`.
    - **running** with owner or transit: `applyControlStatus(stopping)`, plus `publishControl` for hard.
    - **stopping + hard** (escalation): `setStop(hard)` and `publishControl`.
  - Reply 202 `{status}`.
- `POST /projects/:pid/executions/:id/destroy`, body `{confirm}`, requires `executions_destroy`:
  - The confirm must equal the first 6 characters of the id, else 400 `{error:'confirm_mismatch'}`.
  - Order:
    1. `recordAudit(DESTROY)`.
    2. If running or stopping: `setStop(hard)` and `publishControl(stop hard)`, then poll Mongo every 250 ms, up to 10 s, for `stopped`.
    3. `publishControl(cleanup)`.
    4. `cleanup(id)`.
    5. Close the conversation via `PUT {TILEDESK_API_URL}/{pid}/requests/{request_id}/close` with the caller's auth header, only when `conversation_link && !conversation_closed_at`. A close failure is logged and recorded in the response as `close: 'failed'`; it does not stop the destroy.
    6. `applyControlStatus(destroyed, {end_reason:'destroyed', ended_at})`.
  - Reply 200 `{status:'destroyed', close}`.
- `GET /:id` → `allowed_controls: allowedControls(status, res.locals.role)`.

- [ ] **Step 1: Failing tests:**
  - `stop soft on running with owner → stopping, flag soft, audit accepted`
  - `stop on waiting → stopped directly`
  - `stop hard publishes on exec:control`
  - `stop on completed → 409 with allowed and an audit rejected entry`
  - `supervisor → 403, no audit`
  - `custom role with executions_control → 202`
  - `destroy wrong confirm → 400`
  - `destroy on stopped → keys gone, close called with the caller's JWT, status destroyed`
  - `destroy completes after the 10 s wait when no stopped arrives` (use a short wait override in tests)
  - `concurrent stop and destroy end destroyed with two audit entries`
  - `allowed_controls per status and role`
  - `Redis down → 503 control_unavailable, no audit written`
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. The audit is written after validation and before side effects (*my call 2*).
- [ ] **Step 4:** PASS, plus typecheck and build.
- [ ] **Step 5:** Commit `feat(api): stop and destroy routes with audit`.

### Task 8: Reaper job

**Files:**
- Create: `src/jobs/reaper.ts`
- Modify: `src/jobs/main.ts` (run after the gap check in the same tick)
- Test: `test/reaper.test.ts`

**Interfaces — produces:** `reap(now, deps = {isDriven, applyControlStatus, failLostOwner}) → Promise<{failed:number, stopped:number}>`.
- A **running** execution with no owner, no transit and `last_event_at` older than 30 s → `failed` with `error {code:'lost_owner', message:'the agent server stopped while running this block'}`, through the projector's finish path (write-back included).
- A **stopping** execution with no owner → `stopped` (`stop_mode` kept).
- Batches of 200 per tick. Redis unavailable → skip the tick with a warn.
- `failLostOwner(id)` is exported from the projector, reusing `finish`.

- [ ] **Step 1: Failing tests:**
  - `running with owner is left alone`
  - `running, no owner, transit fresh → left alone`
  - `running, no owner, no transit, last_event 31 s ago → failed lost_owner and write-back called`
  - `stopping without owner → stopped`
  - `Redis down → no changes`
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(jobs): reaper for lost owners`.

---

## Part C — tiledesk-server

### Task 9: Audit consumer → Activities

**Files:**
- Modify: `pubmodules/executions-publisher/index.js` (add `startAuditConsumer()` called from `listen()`), `pubmodules/activities/models/activity.js` (unique sparse index on `actionObj.audit_id`), `pubmodules/activities/activityMessageUtil.js` (EXECUTION_* cases in `buildDefaultActivityMessage`, English; new export `buildExecutionMessage(activity, lang)` for it/en), `pubmodules/activities/routes/activity.js` (CSV uses `buildExecutionMessage` for `EXECUTION_*` verbs with `lang`), `docs/activities-client.md` (the three verbs, their sentences and their actionObj)
- Test: `pubmodules/executions-publisher/test/audit-consumer.test.js` (fake channel), `pubmodules/activities/test/execution-messages.test.js`

**Interfaces — produces:**
- `startAuditConsumer({channelFactory?})`:
  - Asserts the queue `server.executions.audit` (durable), binds `audit.#` on `tiledesk.executions`, prefetch 20.
  - For each message:
    - parses it and maps it to an Activity (Global Constraints mapping; verb from `action`: `stop_soft` → `EXECUTION_STOP_SOFT`, `stop_hard` → `EXECUTION_STOP_HARD`, `destroy` → `EXECUTION_DESTROY`);
    - saves it if `process.env.ACTIVITY_HISTORY_ENABLED === 'true'`, otherwise acks without saving;
    - a duplicate `audit_id` (E11000) is acked;
    - other errors are nacked with requeue after 1 s.
  - Invalid JSON is acked (logged) — the server has no DLQ for this queue.
  - Uses the promise API on its own channel of the existing lazy connection.
- **Sentences** (English):
  - `"<actor> soft-stopped execution <short id> of <agent>"`
  - `"<actor> hard-stopped execution <short id> of <agent>"`
  - `"<actor> destroyed execution <short id> of <agent>"`
  - with `" · \"<reason>\""` appended when a reason is present.
- **Italian:** "ha fermato (soft) / ha fermato (hard) / ha eliminato l'esecuzione <id> di <agent>".

- [ ] **Step 1: Failing tests:**
  - `audit.recorded becomes one Activity with the mapped fields`
  - `duplicate audit_id saves once`
  - `ACTIVITY_HISTORY_ENABLED false → acked, nothing saved`
  - `sentences en/it for each verb`
  - `consumer not started without EXECUTIONS_AMQP_URL`
- [ ] **Step 2:** Run `NODE_ENV=test npx mocha pubmodules/executions-publisher/test/*.js pubmodules/activities/test/*.js --exit` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(executions): mirror execution audit into Activities`.

### Task 10: Owner-only EXECUTION_* rows

**Files:**
- Modify: `pubmodules/activities/routes/activity.js` (`GET /` and `GET /csv`)
- Test: `pubmodules/activities/test/execution-filter.test.js` (Mongo, like the existing route tests)

**Interfaces — produces:** `canReadExecutionAudit(projectuser) → boolean`: role `owner`, or a custom role whose `_doc.rolePermissions` includes `executions_audit_read`. When it is false, both routes add `verb: {$not: /^EXECUTION_/}`, combined with any requested `$in` (for `/csv`, normalise the existing array assignment to `$in` first).

- [ ] **Step 1: Failing tests:**
  - `owner sees EXECUTION_ rows`
  - `admin does not (list)`
  - `csv for admin excludes EXECUTION_ verbs`
  - `custom role with executions_audit_read sees them`
  - `requested activities=EXECUTION_DESTROY for admin returns none`
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(activities): execution audit rows for owners only`.

---

## Part D — tiledesk-dashboard

### Task 11: Permissions and the custom-role editor

**Files:**
- Modify: `src/app/utils/permissions.constants.ts` (add `EXECUTIONS_CONTROL`, `EXECUTIONS_DESTROY`, `EXECUTIONS_DATA_ACCESS`, `EXECUTIONS_AUDIT_READ`), `src/app/users-new-role/users-new-role.component.{ts,html}` (new section "Executions" with the five permissions; tick-and-lock dependencies), `src/assets/i18n/en.json` + `it.json` (section and child labels if the editor's labels become translatable — keep the existing hard-coded English style if not)
- Test: `src/app/users-new-role/users-new-role.executions.spec.ts`

**Interfaces — produces:** `PERMISSION_DEPENDENCIES: Record<string, string[]>` in `permissions.constants.ts`, exactly the Global Constraints rules.
- Ticking a child ticks its prerequisites and disables them while any dependent is ticked.
- Unticking the last dependent re-enables them.
- Saving keeps them.

- [ ] **Step 1: Failing specs:**
  - `ticking executions_control ticks and locks executions_read and flows_read`
  - `ticking executions_audit_read also locks activities_read`
  - `unticking the dependent unlocks`
  - `a stored role with executions_read loads with it ticked`
- [ ] **Step 2:** Run with the local harness → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS. Run `npx ng build`, then `rm -rf .angular/cache`.
- [ ] **Step 5:** Commit `feat(roles): executions permissions with dependencies`.

### Task 12: Controls on the execution detail

**Files:**
- Create: `src/app/bots/executions/shared/stop-dialog.component.ts`, `shared/destroy-dialog.component.ts`
- Modify: `executions.models.ts` (`AllowedControl {name, allowed, reason?}`; `ExecutionDetail.allowed_controls: AllowedControl[]`), `services/executions.service.ts` (`stop(pid, id, mode) → Observable<{status}>`, `destroy(pid, id, confirm) → Observable<{status, close}>`), `execution-detail.component.{ts,html,scss}` (control row), `executions.module.ts` (MatDialogModule, MatRadioModule, FormsModule), `en.json` + `it.json` (`Executions.Controls.*`, `Executions.Dialogs.*`)
- Test: `execution-detail.controls.spec.ts`, `stop-dialog.component.spec.ts`, `destroy-dialog.component.spec.ts`

**Interfaces — produces:**
- **Control row:**
  - one button per allowed control;
  - `allowed:false` → disabled, with tooltip "Only the project owner can destroy executions" (destroy) or "You don't have permission to stop executions" (stop);
  - `stop_hard_now` → a direct hard stop with a confirm.
- **Stop dialog (§11.5):**
  - Radio soft / hard.
  - The hard text names the current action from the last running step's last action.
  - Returns the mode or null.
- **Destroy dialog (§11.5):**
  - Text plus an input "Type <first 6 chars> to confirm".
  - The button is enabled only on an exact match.
- **After a control:**
  - An optimistic chip (`stopping…` / `destroying…`) until the next poll returns the new status.
  - On 409 the chip reverts and the server's `allowed` list shows as a message.
  - On 503, "Controls are temporarily unavailable".
  - Polling (Phase 1, paced by responses) continues while running/stopping.

- [ ] **Step 1: Failing specs:**
  - `controls rendered from allowed_controls; disabled with tooltip when allowed is false`
  - `stop dialog returns soft/hard; hard text names the current action`
  - `destroy button disabled until the 6 chars match`
  - `optimistic stopping chip then reverts on 409 with the reason`
  - `stop_hard_now calls stop(hard)`
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS. Run `npx ng build`, then `rm -rf .angular/cache`.
- [ ] **Step 5:** Commit `feat(executions): stop and destroy from the detail page`.

### Task 13: Executions group in Activities

**Files:**
- Create: `src/app/activities-new/components/activities-execution-link/activities-execution-link.component.{ts,html,scss}` (same shape as activities-bot-link)
- Modify: `activities-new/utils/activity-verbs.constants.ts` (groupKey union + `'Executions'`; three definitions; icons — reuse existing svgs: stop → `assets/img/activities/<closest existing>`, destroy → the delete icon used by FAQ_KB_DELETE), `activities-new/utils/activity-message.util.ts` (three `renderActivity` cases; the execution id comes from `target.id`, the agent from `related.id`/`related.name`), `activities-new.component.{ts,html}` (link cell using `executionLink(projectId, related.id, target.id)` from `bots/executions/execution-links.ts`; hide the Executions filter group unless the user is owner or has `executions_audit_read`), `activities-new.module.ts` (declare the component), `en.json` + `it.json` (`ActivitiesNew.FilterGroup.Executions`, `ActivitiesNew.FilterVerb.EXECUTION_*`)
- Test: `activities-new.executions.spec.ts`

**Interfaces — produces:** the rendered sentence matches the server's English sentence (Task 9); the link opens the execution detail.

- [ ] **Step 1: Failing specs:**
  - `EXECUTION_STOP_HARD renders "<actor> hard-stopped execution <id> of <agent>"`
  - `execution link targets bots/<agent>/executions/<id>`
  - `Executions group hidden for admin, shown for owner`
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS. Run `npx ng build`, then `rm -rf .angular/cache`.
- [ ] **Step 5:** Commit `feat(activities): executions audit rows`.

---

## Part E — local environment and acceptance

### Task 14: dev-env wiring and demo agents

**Files** (tiledesk-dev-env):
- Modify:
  - `compose/exec.yml`: `executions-api` and `executions-jobs` get `TYBOT_REDIS_URL` and `AMQP_URL`; the server gets `ACTIVITY_HISTORY_ENABLED=true` in the exec profile.
  - `bin/seed-executions`: add "Exec demo · hang", a webhook agent whose web request goes to an address that never answers (`http://10.255.255.1/`) with a 120 s timeout and a `falseIntent` block, for hard stops; and "Exec demo · email", which sends one email (an action without abort support), for `hard_degraded`.
  - README exec section: how to stop and destroy from the UI.

- [ ] **Step 1:** Implement and run `bin/exec-disk`. Rebuild the four images with `bin/exec-rebuild`, recreate the stack, and run `bin/seed-executions` twice (idempotent). Check the hang agent really hangs (a curl to the webhook gives an execution running for over 60 s), and that the executions-api logs show the Redis and AMQP connections.
- [ ] **Step 2:** Commit `feat(exec): phase 2 wiring and demo agents`.

### Task 15: Phase 2 local acceptance

**Files:**
- Create (tiledesk-chatbot): `docs/superpowers/notes/phase2-acceptance.md` and screenshots under `docs/superpowers/notes/phase2-acceptance/`.

Each scenario runs on the local stack, through the dashboard (browser) and checked through the API, Redis and Mongo:

- [ ] **Step 1: Soft stop during the slow demo.** The current block finishes, no next block starts, the status becomes stopped, and the Activities row is visible for the owner and absent for the admin.
- [ ] **Step 2: Hard stop during the hang agent.** It stops within 1 s with `interrupted`, the false block never runs, and the tybot logs show no further `/ext` for that execution.
- [ ] **Step 3: Hard stop during the email agent.** The action has `hard_degraded`, and the stop applies before the next action.
- [ ] **Step 4: Stop while waiting** (a webhook conversation between turns): stopped at once. A user message is then blocked (no bot reply) and `messages_while_stopped` is 1.
- [ ] **Step 5: Automation with a sync caller,** stopped mid-run: the caller gets 409 `execution_stopped`.
- [ ] **Step 6: Escalation.** Soft stop during the 20 s wait shows stopping; "Hard stop now" stops it within 1 s.
- [ ] **Step 7: Destroy** a stopped webhook execution. The conversation is closed by that user (visible in the conversation), the execution's Redis keys are gone except `exec:{id}` = `{status: destroyed}` and the request key, the status is destroyed, and the Activities row appears. A new message on that conversation starts a new execution with `previous_execution_id`.
- [ ] **Step 8: Reaper.** Kill the chatbot container mid-block (the hang agent); within about 45 s the execution is failed with `lost_owner`. Restart the chatbot.
- [ ] **Step 9: Roles.** A supervisor sees no enabled controls; an admin can stop but destroy is disabled with its tooltip; a custom role with control only behaves the same; the role editor locks the prerequisites.
- [ ] **Step 10: Flag off.** No `exec:*` reads per action (Redis MONITOR), and replies are identical. The tybot suite's failing set equals the baseline.
- [ ] **Step 11: Latency.** Re-measure as in Phase 1 (50 runs on and off) and compare with Phase 1's final numbers (+13 ms p50 / +15 ms p95 per run).
- [ ] **Step 12: Finish.** Restore the stack, add a storage entry, and commit the notes with "docs: phase 2 local acceptance results".
