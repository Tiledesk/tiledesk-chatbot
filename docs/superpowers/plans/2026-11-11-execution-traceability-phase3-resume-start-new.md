# Agent Execution Traceability — Phase 3 (Resume & Start new) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Owners and admins can resume a stopped or failed execution from where it stopped, and start a new run of an unattended execution with input they provide. Both are audited and mirrored to Activities.

**Architecture:**
- **tybot**
  - Writes a checkpoint pointer to Redis after every action.
  - Sends a sealed full checkpoint to the service whenever an execution parks.
  - Resumes an execution when the service asks on `exec:control`. The pod that wins `SET owner NX` mints the bot token and posts an internal self-jump to `/ext`. `/ext` restores the request state and runs the block from the saved action.
- **tiledesk-executions**
  - Gets the private keyring and an internal service token (both pulled forward from Phase 4).
  - Stores durable checkpoints and serves them to tybot.
  - Owns the resume and start-new routes. Start new goes through a new server refire route, using the caller's JWT and the input the user provides.
- **tiledesk-server** gets the refire route and the two new Activities verbs.
- **Dashboard** gets the Resume and Start new controls and dialogs.

**Tech Stack:** as Phase 2. tybot: Node, CommonJS, node-redis v4, mocha. Service: TS ESM, express, zod, mongoose 8, ioredis, vitest. Server: Node, mongoose 5, mocha. Dashboard: Angular 15, Karma (local harness).

**Spec:**
- `docs/superpowers/specs/2026-11-09-agent-execution-traceability-design.md` (tiledesk-chatbot). Read §6.1–6.5, §7.1.2–7.1.6, §7.3, §8.1–8.5, §9.4, §9.5, §10.1–10.4 and §11.5.
- Code facts: `docs/superpowers/notes/phase3-code-map.md`. Every file:line below comes from it, as does the R-numbered list of risks.

## Decisions

**User decisions (2026-11-11):**
- U1. The service keyring and the internal service token are part of Phase 3. This covers resume past the Redis checkpoint TTL and start new with stored input for webhook and automation runs.
- U2. Start new asks the user for the input.
  - The dialog is prefilled with the stored input structure.
  - Fields that were masked as `[secret]` start empty and must be filled in.
  - The user can edit any value. The input sent is exactly what the user confirms.

**My calls** (each closes a code-map risk; for the user's review):
- C1 (R3) **Checkpoint at block entry.** When a jump lands, the next pod writes `{block_id: <new block>, action_index: 0}` at `blockEntry`. After each completed action k it writes `action_index: k+1`.
- C2 (R4) **No "action started" marker** (it would exceed the spec §12 budget). The checkpoint stores `next_action_type`.
  - Resume asks for confirmation whenever the action about to run is a calling type (side-effect table, Task 6), after a hard stop or a lost owner.
  - A soft stop or a failure before the action started still records `next_action: "run"`, but the dialog warns the same way, because the service cannot tell for sure.
- C3 (R5) **Same execution id on resume.**
  - The API restores Redis before it publishes: `exec:req` with NX (if it exists and points elsewhere the run is `not_resumable: newer_execution`), the hash status back to `running`, `DEL :stop`, and `transit`.
  - It moves Mongo forward through `applyControlStatus(running, {resumed_at, last_event_at: now})`.
  - The projector records `resumed_from_seq` and ignores status events with a lower seq.
- C4 (R6) **The Redis checkpoint is a pointer,** with no `:parameters`. While an execution is stopped, `:parameters` is untouched (the gate blocks before `updateRequestAttributes`).
  - The sealed parked checkpoint carries the full `request_state`, minus `chatbotToken` and `chatbot_jwt_token`.
  - Over 256 KB, the sealed copy is skipped. That run can then only be resumed while the Redis pointer and `:parameters` are alive.
- C5 (R7) **Subagent stack.** The checkpoint copies `subagent:stack:{req}` without tokens. On resume, if the Redis stack has expired, it is re-pushed with each `parentToken` re-minted for the frame's root bot.
- C6 (R8) **Resume entry.** `ControlListener` takes `{type:"resume"}`. The `SET owner NX` winner loads the checkpoint (Redis, then the service), mints the token, sets `transit`, and posts a `_tdinternal` message `/#<block_id>` to `/ext/<agent_version>` with `attributes.resume = {execution_id, action_index, next_action, from_seq}`.
  - The API reads the PUBLISH receiver count; 0 returns 503 `no_agent_server`.
- C7 (R9) **Resuming a run stopped while waiting** runs no block. The API sets the status back to `waiting`, clears `:stop` and restores `exec:req`. There is no publish.
- C8 (R10) **Automation trigger identity.** `detectTrigger` takes the webhook id from the `automation-request-{p}-{oid}-{webhook_id}` suffix. `/block` lifts a top-level `retry_of` out of the body.
- C9 (R11) **Connector triggers.** Start new is not offered for `trigger` type yet (`reason: 'unsupported_trigger'`), because no producer exists.
- C10 (R12) **Start-new idempotency.** `SET exec:{id}:refire NX EX 30` in the API. A second click gets 409 `already_started`.
- C11 (R13) **Snapshot check.** Resume checks that the recorded `agent_version` still loads, via the server's `GET /:pid/faq_kb/:id` with the caller's JWT. On 404 it returns 409 `not_resumable: version_gone`.
- C12 (R14) **MCP lock.** `request_state` includes `mcp_locked`, and resume clears it.
- C13 (R15) **No scheduler change.** A refired scheduled run has no scheduler run row, as the spec says.
- C14 **Branches.** Phase 3 work continues on `feature/execution-traceability` in chatbot, server, executions and dev-env. In the dashboard it continues on `feature/execution-graph`, which already carries the traceability work and moved the detail page under Monitor.

## Global Constraints

- **Off switch:** with `EXECUTIONS_ENABLED=false`, tybot behaves exactly like 3.0.5: no checkpoint writes, no resume handling, `startIndex` unused. The new server route is only mounted when `EXECUTIONS_AMQP_URL` is set. The dashboard shows no new controls when `EXECUTIONS_BASE_URL` is empty.
- **Redis (exact):**
  - `exec:{id}:cp` is a JSON string, TTL `EXECUTIONS_CHECKPOINT_TTL` (default 604800 s). It is written with a seq-guarded Lua script (write only if `cp.seq` > stored seq), fire-and-forget, never on the awaited path.
  - Channel `exec:control` gains `{type:"resume", execution_id}`.
  - `exec:{id}:refire` is `NX EX 30`.
  - Destroy cleanup also deletes `exec:{id}:cp`.
- **Checkpoint shape (Redis pointer):**

  ```
  { version: 1, seq, block_id, action_index, next_action: "run"|"rerun", next_action_type, agent_version,
    agent_stack, subagent_stack (no tokens), locks: { intent, action, mcp }, trigger, written_at }
  ```

  The sealed parked checkpoint adds `request_state.parameters` (without `chatbotToken` / `chatbot_jwt_token`).
- **Hot-path budget (spec §12):** one `SET` of the checkpoint per action, in addition to Phase 2's calls, never awaited.
- **Events (spec §8.1):**
  - `execution.checkpoint {sealed, cp_seq}`.
  - `execution.resumed {from_seq, checkpoint_unsealed: boolean}`.
  - `execution.started` gains `retry_of` for start new.
- **Status (adds to Phase 2):** stopped → running | waiting; failed → running. After resume, `failed` is no longer terminal for the same execution while it runs.
- **Controls (spec §6.5):**
  - **Resume** applies to stopped and failed, and needs all of these:
    - a checkpoint (Redis or durable);
    - an open conversation (or an automation run);
    - no newer execution on the conversation;
    - not a test run;
    - the agent version still loadable.
  - **Start new** applies to stopped, failed, completed and destroyed, and needs:
    - an unattended trigger (`scheduled|webhook|automation`; `trigger` is unsupported per C9);
    - not a test run.
  - Both need `executions_control`.
- **`allowed_controls` reasons:** add `no_checkpoint`, `conversation_closed`, `newer_execution`, `test_run`, `not_unattended`, `unsupported_trigger`, `version_gone`.
- **Audit:**
  - Actions `resume` and `start_new`; verbs `EXECUTION_RESUME` and `EXECUTION_START_NEW`.
  - `details` holds `{confirm?, rerun_action?, new_execution_hint?, input_provided: true, masked_filled: n}`. Never the input values.
- **Internal API:**
  - `GET /internal/executions/:id/checkpoint`, header `x-executions-service-token: <EXECUTIONS_SERVICE_TOKEN>`.
  - Mounted only when the token is set.
  - Never reachable through the public ingress path (`/executions/api/v1`).
- **Keyring:** `VAULT_KEYS` is a JSON map `{kid: PEM private key}` (read once at start). Unsealing is a pure function, `unseal(sealed, keyring) → Buffer`. It throws `UnknownKid` / `BadSeal`, which map to 500 `unseal_failed` without detail.
- **Repos, branches, rules:**
  - Work in the main folders (C14). No worktrees (not even temporary), never `git stash`, no push, nothing on stage.
  - Storage rules as in Phase 2 (`tiledesk-exec` project only, no prune, `df -h /` ≥ 15 GiB before builds).
  - Every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A resume that no pod picks up** (all pods restarting, or the flag turned off): the API answers 503 `no_agent_server`. When the publish is accepted but the claim never happens, the reaper fails the execution `lost_owner` after transit expires; it is never stuck in `running`. Test: `resume with no subscriber returns 503 and changes nothing` (Task 7).
2. **A stale `execution.failed` arriving after the resume** (out-of-order ingest): the status stays `running`. Test: `events older than resumed_from_seq do not move the status` (Task 5).
3. **Double resume clicks:** the second gets 409 (status no longer stopped or failed), there is one audit entry per accepted request, and only one pod runs. Test: `two concurrent resumes run the block once` (Task 3, tybot NX).
4. **Start new with masked fields left empty:** 400 `missing_input {fields}`, no audit, no refire. Test: `start new rejects empty masked fields` (Task 8).
5. **Resume after the 7-day Redis TTL:** the durable checkpoint is unsealed and the run continues. With no durable copy (over 256 KB, or capture off), the control shows `no_checkpoint`. Test: `resume falls back to the durable checkpoint` (Task 3), `allowed_controls shows no_checkpoint when neither copy exists` (Task 6).

---

## Before you start

- [ ] Every repo is clean on its branch (C14), and the disk check passes.
- [ ] Baselines: tybot failing set = `docs/superpowers/notes/phase1-tybot-baseline.txt` (249) plus the known subagents fixture flake; service `npx vitest run` green with `TEST_MONGO_URI` and `REDIS_URL`; server executions-publisher and activities tests green; dashboard executions specs green with the local harness.
- [ ] Commit `docs/superpowers/notes/phase3-code-map.md` together with this plan.

## Part A — tybot (`tybotRoute/`)

### Task 1: Checkpoint writer

**Files:**
- Create: `executions/Checkpointer.js`.
- Modify:
  - `executions/ExecutionStore.js`: `setCheckpoint(id, cp)` (Lua seq guard), `getCheckpoint(id)`.
  - `executions/config.js`: `checkpointTtlS`, from `EXECUTIONS_CHECKPOINT_TTL`, default 604800.
  - `executions/ExecutionRecorder.js`: the write points below.
- Test: `test/executions_checkpoint_test.js` (Redis).

**Interfaces — produces:**
- `Checkpointer.build(ctx, {block_id, action_index, next_action, next_action_type, subagentStack}) → object`, the pointer shape from Global Constraints.
- `Checkpointer.sealedPark(ctx, pointer, parametersRaw) → Promise<void>`. It strips the two token keys, seals `{...pointer, request_state: {parameters}}` through `sealInto`, and emits `execution.checkpoint {sealed, cp_seq}`. Over 256 KB it emits nothing and logs.
- **Write points:**
  - `blockEntry`: `action_index: 0` (C1).
  - `recordAction` after action k: k+1, `run`.
  - `checkStopBeforeAction` (soft stop before k): k, `run`.
  - `stopHard` with `_interrupted`: k, `rerun`.
  - `nextDirective` limit failure: k, `run`.
  - Park points: idle, failed and stopped call `sealedPark` with the `:parameters` already read at that point.
- `next_action_type` = the directive name of the action at `action_index`. The block's directive array is in hand at every write point.
- `subagent_stack` = `subagent:stack:{req}` with every `parentToken` removed.

- [ ] **Step 1: Failing tests:**
  - `after each action exec:{id}:cp points at the next action`;
  - `a jump landing writes action_index 0 for the new block`;
  - `hard stop of an abortable action writes rerun at that action`;
  - `soft stop writes run at the next action`;
  - `checkpoint never contains chatbotToken or chatbot_jwt_token`;
  - `an older seq never overwrites a newer checkpoint`;
  - `idle, stopped and failed emit execution.checkpoint with a sealed payload`;
  - `over 256 KB no execution.checkpoint is emitted`;
  - `flag off: no cp key, no checkpoint event`;
  - `per-action Redis budget: exactly one extra SET per action, not awaited`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS. Full suite against the baseline.
- [ ] **Step 5:** Commit `feat(executions): checkpoints`.

### Task 2: Start-new support in tybot

**Files:**
- Modify:
  - `executions/trigger.js` (C8);
  - `executions/ExecutionRecorder.js` (`retry_of` in `execution.started` data, from `message.request.attributes.retry_of` or `message.attributes.retry_of`);
  - `index.js` `/block` (lift `retry_of` out of the body into `message.payload.attributes.retry_of`, as is done for `async` and `token`).
- Test: `test/executions_retry_test.js`.

- [ ] **Step 1: Failing tests:**
  - `automation source_id is the webhook id from the request id`;
  - `execution.started carries retry_of from request attributes`;
  - `/block lifts retry_of out of the payload`.
- [ ] **Steps 2–4:** RED → implement → GREEN. Full suite against the baseline.
- [ ] **Step 5:** Commit `feat(executions): retry_of and automation trigger id`.

### Task 3: Resume driver

**Files:**
- Create: `executions/ResumeDriver.js`.
- Modify:
  - `executions/ControlListener.js`: the `resume` branch calls an injected `onResume(executionId)`.
  - `index.js`: wire `onResume` with the bots datasource, endpoints and limits. `/ext` handles `attributes.resume` before `TiledeskChatbot` is built.
  - `tiledeskChatbotPlugs/DirectivesChatbotPlug.js`: `startIndex` in the config.
  - `executions/ExecutionRecorder.js`: `onResumed(ctx, {from_seq, checkpoint_unsealed})` emits `execution.resumed`.
  - `executions/config.js`: `serviceUrl` from `EXECUTIONS_SERVICE_URL`, `serviceToken` from `EXECUTIONS_SERVICE_TOKEN`.
- Test: `test/executions_resume_test.js` (Redis, static bots, a fake service for the durable checkpoint).

**Interfaces:**
- `ResumeDriver.handle(executionId, deps) → Promise<'started'|'not_owner'|'no_checkpoint'|'bot_gone'>`. Its steps:
  1. `acquireLease`; on false, return `not_owner`.
  2. `getCheckpoint`. If absent, `GET {serviceUrl}/internal/executions/:id/checkpoint` with the token, `checkpoint_unsealed: true`. If that fails, emit `execution.failed {error:{code:'resume_failed', message:'no checkpoint'}}` and release.
  3. Load bot `agent_version` with `+secret`. If missing, emit `execution.failed {error:{code:'resume_failed', message:'agent version not found'}}`.
  4. Mint the token as `webhookService.generateChatbotToken` does (code map §2.4), for the request participant's root bot.
  5. Restore: `:parameters` from the durable copy only (the Redis path keeps the live hash), plus the two token keys with the new token; locks; clear `mcp:locked`; `resetStep` / `resetStarted`; re-push `subagent:stack` with re-minted tokens when it is missing (C5).
  6. `setTransit`, release the lease, and post the self-jump (C6).
- In `/ext`, when `attributes.resume` is present and the execution id matches the resolved one:
  - skip the stop gate;
  - build the plug with `startIndex = action_index`;
  - emit `execution.resumed` once;
  - run the actions from `startIndex` of block `block_id`, without re-running the block's earlier actions.

- [ ] **Step 1: Failing tests:**
  - `resume runs the block from the checkpoint action, not from the start`;
  - `rerun re-executes the interrupted action`;
  - `two concurrent resumes run the block once`;
  - `resume falls back to the durable checkpoint`;
  - `resume restores locks and clears mcp lock`;
  - `resume resets step and started`;
  - `resume inside a subagent re-pushes the stack with fresh tokens`;
  - `missing agent version emits execution.failed resume_failed`;
  - `flag off: resume messages are ignored`.
- [ ] **Steps 2–4:** RED → implement → GREEN. Full suite against the baseline.
- [ ] **Step 5:** Commit `feat(executions): resume driver`.

## Part B — tiledesk-executions

### Task 4: Keyring, unseal and the internal checkpoint API

**Files:**
- Create: `src/crypto/unseal.ts`, `src/api/internal.ts`, `src/model/checkpoint.ts`.
- Modify:
  - `src/config.ts`: `VAULT_KEYS`, `EXECUTIONS_SERVICE_TOKEN`.
  - `src/api/app.ts`: mount `/internal` only when the token is set, outside `/executions/api/v1`.
  - `src/db.ts`.
- Test: `test/unseal.test.ts` (seal with tybot's algorithm in the test, then unseal), `test/internal.test.ts`.

**Interfaces — produces:**
- `unseal(sealed: SealedBlob, keyring: Map<string, KeyObject>) → Buffer`. AES-256-GCM, RSA-OAEP-256, `kid` lookup.
- `Checkpoint` model: `{execution_id (unique), cp_seq, sealed, created_at}`, upserted forward-only on `cp_seq`.
- `GET /internal/executions/:id/checkpoint`:
  - `x-executions-service-token` compared in constant time, else 401;
  - the stored checkpoint unsealed, else 404;
  - every call is logged with `execution_id` only.

- [ ] **Step 1: Failing tests:**
  - `unseal round-trips a tybot seal`;
  - `unknown kid throws`;
  - `tampered tag throws`;
  - `internal checkpoint needs the token`;
  - `internal checkpoint returns the unsealed pointer`;
  - `internal routes are absent without the token`.
- [ ] **Steps 2–4:** RED → implement → GREEN, then typecheck and build.
- [ ] **Step 5:** Commit `feat: keyring, unseal and internal checkpoint api`.

### Task 5: Contracts, statuses and projector for resume

**Files:**
- Modify: `src/contracts.ts` (`ExecutionCheckpoint`, `ExecutionResumed`), `src/ingest/status.ts` (Global Constraints), `src/ingest/projector.ts`, `src/model/execution.ts` (`resumed_from_seq`, `resumed_at`, `has_checkpoint`).
- Test: `test/projector.resume.test.ts`.

**Interfaces:**
- `execution.checkpoint` → upsert `Checkpoint`, set `has_checkpoint: true`.
- `execution.resumed` → `resumed_from_seq = data.from_seq`; status running if not already.
- `onStarted` with `retry_of` → `$addToSet retried_as` on the old execution.
- Status-moving handlers ignore events whose `seq < resumed_from_seq`.

- [ ] **Step 1: Failing tests:**
  - `checkpoint event stores the sealed copy and sets has_checkpoint`;
  - `events older than resumed_from_seq do not move the status`;
  - `retry_of adds to retried_as`;
  - `status table allows stopped→running|waiting and failed→running`.
- [ ] **Steps 2–4:** RED → implement → GREEN, then typecheck.
- [ ] **Step 5:** Commit `feat: resume in contracts and projector`.

### Task 6: Side-effect table and allowed controls

**Files:**
- Create: `src/api/sideEffects.ts`.
- Modify: `src/api/controls.ts` (signature becomes `allowedControls(execution, role, ctx)`), `src/api/routes/executions.ts` (detail), `src/api/routes/control.ts` (409 bodies).
- Test: `test/controls.phase3.test.ts`.

**Interfaces — produces:**
- `CALLING_TYPES: ReadonlySet<string>` = the "calls an external system" and "writes to Tiledesk / data" rows of code map §4.
- `isCalling(type) → boolean`.
- `allowedControls(execution, role, {cpPresent: boolean})` → adds `resume` and `start_new` with the reasons from Global Constraints. `version_gone` is only known at resume time, so it is never listed here.

- [ ] **Step 1: Failing tests:**
  - `resume listed for stopped with checkpoint, open conversation, no newer execution`;
  - `resume not allowed for test runs`;
  - `start_new listed only for unattended triggers`;
  - `allowed_controls shows no_checkpoint when neither copy exists`;
  - `webrequest is calling, setattribute is not`.
- [ ] **Steps 2–4:** RED → implement → GREEN.
- [ ] **Step 5:** Commit `feat(api): phase 3 controls`.

### Task 7: Resume route

**Files:**
- Modify: `src/api/routes/control.ts`, `src/api/tybotControl.ts` (`restoreForResume`, `publishControl` returns the receiver count, `cleanup` also deletes `:cp`), `src/model/auditLog.ts` (actions).
- Test: `test/api.resume.test.ts` (Mongo, Redis, a stub server for `faq_kb`).

**Interfaces:**
- `POST /projects/:pid/executions/:id/resume`, body `{confirm?: boolean, reason?}`, requires `executions_control`. Order:
  1. Validate, load, check `allowedControls` (409 `not_allowed`).
  2. Probe Redis (R3 of Phase 2).
  3. Snapshot check (C11).
  4. Side-effect check: the next action from the checkpoint is calling, it is a `rerun` / lost owner / soft stop, and there is no `confirm` → 409 `confirm_required {action: {index, type, title}}`. No audit.
  5. `recordAudit(resume)`.
  6. C7 waiting branch, or `restoreForResume` (C3) + `applyControlStatus(running)` + `publishControl({type:'resume'})`. Receiver count 0 → revert to the previous status and Redis state, then 503 `no_agent_server`.
  7. Reply 202 `{status}`.

- [ ] **Step 1: Failing tests:**
  - `resume of a stopped execution restores redis and publishes`;
  - `confirm_required for a calling action without confirm`;
  - `confirm true proceeds`;
  - `waiting-stopped resume goes back to waiting without publish`;
  - `newer execution → not_resumable`;
  - `version gone → not_resumable`;
  - `resume with no subscriber returns 503 and changes nothing`;
  - `supervisor → 403`;
  - `one audit entry per accepted resume`.
- [ ] **Steps 2–4:** RED → implement → GREEN, then typecheck and build.
- [ ] **Step 5:** Commit `feat(api): resume`.

### Task 8: Start-new routes

**Files:**
- Create: `src/api/routes/startNew.ts`.
- Modify: `src/api/app.ts`.
- Test: `test/api.startnew.test.ts`.

**Interfaces:**
- `GET /projects/:pid/executions/:id/start-new/input`, requires `executions_control`, start_new allowed:
  - Unseals the stored trigger payload and returns `{input, masked: string[]}`.
  - `masked` lists the JSON paths whose stored value is `"[secret]"`; in `input` those are set to `null`.
  - No stored payload (capture off, or none): `{input: {}, masked: []}`.
  - Scheduled: the stored mapping payload.
  - Audited as part of start_new only if the start happens (U2; the input shown is the caller's own project data, gated by `executions_control`).
- `POST /projects/:pid/executions/:id/start-new`, body `{input: object, reason?}`:
  - Validate: every masked path from the GET must be non-empty, else 400 `missing_input {fields}`, no audit.
  - Idempotency NX (C10).
  - `recordAudit(start_new, {input_provided: true, masked_filled: n})`.
  - `POST {TILEDESK_API_URL}/{pid}/executions/refire` with the caller's JWT, body `{chatbot_id: agent_id, trigger, payload: input, retry_of: id}`.
  - Reply 202 `{status:'started', request_id?}`. A server error gives 502 `refire_failed` (the audit stays).

- [ ] **Step 1: Failing tests:**
  - `input returns the stored payload with masked fields nulled`;
  - `start new rejects empty masked fields`;
  - `start new posts to refire with the caller jwt and retry_of`;
  - `second start new within 30 s → 409 already_started`;
  - `not allowed for test runs or connector triggers`.
- [ ] **Steps 2–4:** RED → implement → GREEN, then typecheck and build.
- [ ] **Step 5:** Commit `feat(api): start new`.

## Part C — tiledesk-server

### Task 9: Refire route and Activities verbs

**Files:**
- Create: `routes/executions-refire.js`.
- Modify:
  - `app.js` (mount `/:projectid/executions` like `/webhooks`, plus `hasRoleOrTypes(role, types, 'executions_control')`, only when `EXECUTIONS_AMQP_URL` is set);
  - `routes/webhook.js` (extract `startScheduledRun(...)` and `startWebhookConversation(...)` so both routes share them);
  - `pubmodules/executions-publisher/index.js` (`AUDIT_VERBS`);
  - `pubmodules/activities/activityMessageUtil.js` (en/it, done/tried sentences);
  - `docs/activities-client.md`.
- Test: `test/executions-refire.test.js`, `pubmodules/activities/test/execution-messages.test.js` (extend).

**Interfaces:**
- `POST /:pid/executions/refire {chatbot_id, trigger:{type, source_id, start_point_id}, payload, retry_of}`:
  - **scheduled:** the shared scheduled path, `extraAttributes.retry_of`.
  - **webhook:** `Webhook.findOne({id_project, webhook_id: source_id})` + the shared conversation path, `extraAttributes.retry_of`.
  - **automation:** `webhookService.run(webhook, {...payload, retry_of})`.
  - Rate limit as for each path. Unknown type → 400. Reply `{request_id}`.
- **Sentences:**
  - English: `"<actor> resumed execution <id> of <agent>"`, `"<actor> started a new run of execution <id> of <agent>"`.
  - Italian: `"ha ripreso l'esecuzione <id> di <agent>"`, `"ha avviato una nuova esecuzione da <id> di <agent>"`.
  - Rejected attempts use the existing "tried" form.

- [ ] **Step 1: Failing tests:**
  - `refire scheduled creates a conversation with retry_of`;
  - `refire webhook uses the stored webhook`;
  - `refire automation calls webhookService.run with retry_of`;
  - `agent role → 403`;
  - `route absent without EXECUTIONS_AMQP_URL`;
  - `audit resume/start_new map to the new verbs and sentences en/it`.
- [ ] **Steps 2–4:** RED → implement → GREEN.
- [ ] **Step 5:** Commit `feat(executions): refire route and resume/start-new activities`.

## Part D — tiledesk-dashboard (`feature/execution-graph`)

### Task 10: Resume and Start new on the execution detail

**Files:**
- Create: `bots/executions/shared/resume-dialog.component.ts`, `shared/start-new-dialog.component.ts`.
- Modify:
  - `executions.models.ts` (`ControlName`, reasons);
  - `services/executions.service.ts` (`resume(pid, id, confirm?)`, `startNewInput(pid, id)`, `startNew(pid, id, input)`);
  - `execution-detail.component.{ts,html}` (`CONTROL_NAMES`, pending `resuming` / `starting`, `controlError` for `confirm_required` and `not_resumable`);
  - `executions.module.ts`;
  - en/it i18n.
- Test: `resume-dialog.component.spec.ts`, `start-new-dialog.component.spec.ts`, `execution-detail.phase3.spec.ts`.

**Interfaces:**
- **Resume dialog (spec §11.5):**
  - Text: "Continues from "<action title>"".
  - When the action is calling: the warning sentence and a confirm. Resume then sends `confirm: true`.
  - For automation: "The original caller won't get the answer" (spec §6.3).
- **Start new dialog (U2):**
  - Agent name and "uses the current published version".
  - A JSON editor (textarea with live parse validation) prefilled from `startNewInput`.
  - Masked fields are listed as required; the button stays disabled until the JSON parses and every masked path is non-empty.
  - Sends exactly the edited object.
- **Errors:**
  - `not_resumable` shows its reason and offers Start new when allowed.
  - `already_started` shows "A new run was just started".
  - `missing_input` highlights the fields.
- After start new: a link to the new execution when `retried_as` appears on the next poll.

- [ ] **Step 1: Failing specs:**
  - `resume dialog shows the action and asks confirm for calling actions`;
  - `confirm_required reopens the dialog with the warning`;
  - `start new prefilled, disabled until masked fields are filled`;
  - `invalid JSON keeps start disabled`;
  - `not_resumable offers start new`.
- [ ] **Steps 2–4:** RED → implement → GREEN. `npx ng build`, then `rm -rf .angular/cache`.
- [ ] **Step 5:** Commit `feat(executions): resume and start new`.

### Task 11: Activities verbs in the dashboard

**Files:** the verb union, verb constants (Executions group), message util, en/it, `activities-new.executions.spec.ts` (code map §7).

- [ ] **Step 1: Failing specs:** `EXECUTION_RESUME and EXECUTION_START_NEW render the server sentences (done and tried)`.
- [ ] **Steps 2–4:** RED → implement → GREEN, then build.
- [ ] **Step 5:** Commit `feat(activities): resume and start-new rows`.

## Part E — local environment and acceptance

### Task 12: dev-env wiring

- **Files** (tiledesk-dev-env): `compose/exec.yml` and `bin/exec-keys`:
  - `executions-api` gets `VAULT_KEYS` from the local private key file (exec-keys writes the JSON map) and `EXECUTIONS_SERVICE_TOKEN`;
  - the chatbot gets `EXECUTIONS_SERVICE_URL=http://executions-api:3000` and the same token.
- **README:** resume and start new from the UI.
- [ ] Rebuild the four images (`bin/exec-rebuild`), recreate, and seed twice. Check that the api logs "keyring loaded (1 key)" and that `/internal` answers 401 without the token. Commit `feat(exec): phase 3 wiring`.

### Task 13: Phase 3 acceptance

Create (tiledesk-chatbot) `docs/superpowers/notes/phase3-acceptance.md` and screenshots. On the local stack, as the demo owner (sign-in details from the seed file, never written in the notes):

1. Hard stop of the hang agent, then resume with confirm: the web request runs again and the run continues to its false/true exit.
2. Soft stop during the slow demo, then resume: it continues from the next action, the 20 s wait is not repeated, and the trace shows `execution.resumed`.
3. Failed by `max_steps` (or a lost owner), then resume: the limits count from zero.
4. Redis checkpoint deleted by hand, then resume: the durable checkpoint is used (`checkpoint_unsealed: true`).
5. Start new on a webhook run with a secret field: the dialog requires it, the new execution has `retry_of`, and the old one shows `retried_as`.
6. Start new on an automation run, and on a scheduled run.
7. Activities rows for resume and start new, owner-only.
8. Flag off: tybot behaves as 3.0.5, and the suite matches the baseline.
9. Latency: re-measure as Phase 2; per-action overhead within +1 ms of Phase 2.

Commit `docs: phase 3 local acceptance results`.
