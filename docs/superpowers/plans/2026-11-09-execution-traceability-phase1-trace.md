# Agent Execution Traceability — Phase 1 (Trace) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every agent execution is recorded block by block, with the whole flow state before and after each block, and can be browsed from the dashboard's agents list. Everything runs locally, starting from the production baseline.

**Architecture:** tybot gets a self-contained `tybotRoute/executions/` folder. It resolves an execution per conversation and agent in Redis, records block and action events and flow-state deltas, seals the values, and publishes them on the AMQP exchange `tiledesk.executions` without blocking the flow. tiledesk-server publishes the conversation end events on the same exchange. A new TypeScript service, `tiledesk-executions`, projects the events into Mongo (ingest) and serves a read API (api). The dashboard adds an Executions entry on the agent cards, plus list and detail pages under `bots/`.

**Tech Stack:**
- **tybot:** Node 24, CommonJS, mocha, node-redis v4, amqplib, node `crypto`, `AsyncLocalStorage`.
- **server:** Node, amqplib 0.5.
- **service:** Node 22+, TypeScript ESM, Express, zod, pino, mongoose 8, amqplib, ioredis, vitest. Tests use a throwaway container from the `mongo:7` image already on this machine, never mongodb-memory-server, which downloads its own binary (see Storage).
- **dashboard:** Angular 15, Karma.

**Spec:** `docs/superpowers/specs/2026-11-09-agent-execution-traceability-design.md` (in this worktree). Read §6, §7.1, §7.2, §7.3, §7.4, §8, §10.1, §10.2, §11.1–§11.4, §11.8 and §14.1 before starting.

**This plan covers Phase 1 of §14 only.** Phases 2 (stop, destroy, audit, Activities), 3 (checkpoints, resume, start new) and 4 (grants, values, data view, Audit tab, retention settings) get their own plans after Phase 1 passes local acceptance (Task 23).

Phase 1 calls not spelled out in the spec (all marked *my call* for the user's review):
- Action input/output capture (request and response bodies, prompts) moves to Phase 4, together with the data view that shows it. Phase 1 seals the trigger payload and the flow variable values only.
- Between blocks, the previous block's state-after is kept in `exec:{id}:state`. Phase 3's checkpoint will replace this key.
- The parent link on replace bot goes through `exec:handoff:{request_id}`.
- The Executions entry shows when the dashboard config has `EXECUTIONS_BASE_URL`. That is the deployment-level switch, matching tybot's global `EXECUTIONS_ENABLED`.
- Idempotency uses an `event_key` (server events have no `seq`).

## Global Constraints

- **Off switch:** `EXECUTIONS_ENABLED` defaults to `false`. When off, tybot behaves exactly as 3.0.5: no `exec:*` keys, no publish, no extra Redis calls. The server publisher registers no listeners when `EXECUTIONS_AMQP_URL` is unset.
- **Never block the flow:**
  - Sealing, hashing and publishing are never awaited by the flow.
  - Awaited Redis calls in the flow:
    - per action: one `HGETALL` of `:parameters` and one `INCR` (seq);
    - per block: one more `HGETALL` (block entry), plus the `exec:{id}:state` write at block exit;
    - per message: the resolve calls.
  - Any `exec:*` Redis or broker error is caught and logged, and the flow goes on.
- **Exchange and queues:**
  - Exchange `tiledesk.executions`: topic, durable.
  - Routing key: `exec.<id_project>.<type>`.
  - Queue `executions.ingest` bound to `exec.#`; DLQ `executions.ingest.dlq`.
  - Messages are persistent, `contentType: application/json`.
- **Event envelope** (exact): `{ event_version: 1, type, execution_id, seq, at (ISO), id_project, agent_id, agent_version, request_id, pod, data }`. Server events have no `seq`.
- **Redis keys** (exact, TTL 604800 s unless stated):
  - `exec:req:{request_id}:{agent_id}`
  - `exec:{id}` (hash)
  - `exec:{id}:seq`
  - `exec:{id}:state`
  - `exec:handoff:{request_id}` (TTL 600 s)
  - `exec:policy:{id_project}` (read only, field `capture_data`; absent means `true`)
- **IDs:** `execution_id` is a uuid v7 (`uuid` package `v7`). `agent_id` = `bot.root_id || botId`, `agent_version` = `botId`, `test` = `!bot.root_id`.
- **Sealing:**
  - AES-256-GCM data key wrapped with RSA-OAEP (SHA-256). Record `alg: "RSA-OAEP-256+A256GCM"`, plus `kid`, `wrapped_key`, `iv`, `tag`, `ct` (base64) and `size`.
  - No public key → nothing sealed, `data_missing: true` on the event.
- **Secrets:** a name is secret when, lowercased, it equals `authorization` or `password`, or contains `token`, `key` or `secret`. The bot `secret` field counts too. Secret values are recorded as `[secret]`: name and op only, no hash, no value.
- **State tracking:**
  - Value hash: hex `HMAC-SHA256(projectKey, rawValue)`, with `projectKey = HMAC-SHA256(EXECUTIONS_STATE_HASH_KEY, id_project)` *(my call: per-project key, §15)*. No hash key → hashes are `null`.
  - Values over `EXECUTIONS_STATE_VALUE_MAX_BYTES` (default `262144`) get `omitted: "too_large"` and are not sealed.
  - A keyframe is written at an execution's first block, then every `EXECUTIONS_STATE_KEYFRAME_EVERY` (20) blocks, or once deltas since the last keyframe reach `EXECUTIONS_STATE_KEYFRAME_MAX_DELTA_BYTES` (1048576).
- **Roles for every Phase 1 route** (`executions_read`): owner, admin and supervisor get it; agent does not; a custom role needs `executions_read` in its permissions.
- **Branches and commits:**
  - Branch `feature/execution-traceability` in every repo.
  - Bases: chatbot `af406feb` (3.0.5), server `68700f80` (3.3.1), dashboard `d07380426` (2.8.40), dev-env `origin/main`; the new service starts from an empty `main`.
  - No push, nothing on stage or prod.
  - Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Dashboard strings:** through the translate pipe, English first (`src/assets/i18n/en.json`).

## Storage

The disk is shared with other sessions and applications, so this work checks its own footprint and cleans up only what it created.

**Measured 2026-11-09:**
- Mac data volume: 89 GB free of 460 GB.
- Docker Desktop disk: 46 GB free of 125 GB, with 47.9 GB of images. Other stacks run there too: `saggio-*`, `tiledesk-cpv2-*`, and `testcontainers` from another session.
- `~/.npm`: 9.4 GB, so most installs resolve from the cache.

**Expected for Phase 1:** about 10 GB at peak.

| What | Size |
|---|---|
| `node_modules` in the 4 worktrees | ~3.5 GB (server 1.5, dashboard 0.75, chatbot 0.2, service 0.2) |
| Angular build cache | up to ~1 GB |
| First image build | ~6 GB (server 3.2, chatbot 2.1, executions ~0.3, dashboard 0.1) |
| Mongo and Redis data | < 1 GB |

The real risk is image rebuilds: each rebuild of server or chatbot leaves the old image behind (2–3 GB) unless it is removed.

**Rules:**
- **Check before every `npm ci`, image build, `bin/dev up` and `--scale`.** Run `bin/exec-disk` (Task 22; before Task 22 exists, run its two commands by hand):
  - `df -g /System/Volumes/Data | awk 'NR==2{print $4}'` (free GB on the Mac);
  - `docker run --rm alpine df -BG / | awk 'NR==2{print $4}'` (free GB in Docker).
- **Thresholds.** Stop and tell the user when the Mac has less than **20 GB** free, or Docker has less than **15 GB** free. Never free space by deleting anything you did not create.
- **Never run** `docker system prune`, `docker image prune`, `docker volume prune`, `docker builder prune`, or any `rm`/`rmi` outside the list below. Never touch `tiledesk-dev*`, `tiledesk-cpv2-*`, `saggio-*` or `testcontainers*` images, containers or volumes, or another session's worktree.
- **A separate compose project.** The dev stack runs with `COMPOSE_PROJECT_NAME=tiledesk-exec`, so its images (`tiledesk-exec-*`), containers and volumes (`tiledesk-exec_*`) are ours alone. It does not overwrite the `tiledesk-dev-*` images other sessions use, and cleanup can target it by name.
- **Only the services Phase 1 needs:** profiles `infra,core,exec`. `compose/exec.yml` adds the `exec` profile to `dashboard` and `proxy`, so chat21, cds, ionic, widget and the 6 GB `llm` image are neither built nor started.
- **Rebuilds go through `bin/exec-rebuild <service>`** (Task 22). It records the current image id of `tiledesk-exec-<service>`, rebuilds, and removes the old id only when it is now untagged and unused.
- **Tests reuse local images.** `redis:7` and `mongo:7` are already present: `docker run -d --rm --name exec-test-redis -p 6379:6379 redis:7` and `docker run -d --rm --name exec-test-mongo -p 27018:27017 mongo:7`. The service tests read `TEST_MONGO_URI=mongodb://localhost:27018/exec-test-<random>` and drop their database at the end. No mongodb-memory-server and no testcontainers downloads.
- **Installs:** `npm ci --prefer-offline --no-audit --no-fund`.
- **Angular build cache:** after each dashboard build or test run, delete it with `rm -rf .angular/cache` (inside the dashboard worktree only).
- **Stop the test containers** at the end of each working session: `docker stop exec-test-redis exec-test-mongo`.
- **Record the usage.** Write `bin/exec-disk` output and `docker system df` into `docs/superpowers/notes/phase1-storage.md` at the start, after Task 22, and after Task 23.
- **Cleanup after Phase 1** (only on the user's go-ahead; Phase 2 reuses all of it):
  - `docker compose -p tiledesk-exec down` (add `-v` only if the user wants the local data gone);
  - `docker images 'tiledesk-exec-*' -q | xargs docker rmi`;
  - remove the `node_modules` and `.angular` folders in the four worktrees.

## Review Focus

1. **First two messages of a conversation reach two tybot pods at once:** one execution, not two. Test: `ExecutionStore resolve is single under concurrency` (Task 3).
2. **Broker unreachable at start or mid-run:** the flow answers as usual. The buffer stops at `EXECUTIONS_BUFFER_MAX`, drops are counted, and nothing throws. Test: `TraceEmitter survives a failing transport` (Task 2).
3. **Raw values:**
   - The Code action writes raw, non-JSON strings, and `transcript` can grow past 256 KB. The diff works on raw strings and reports type `string`.
   - An oversized value keeps its hash and size, gets `omitted: "too_large"` and has no sealed value.
   - Test: `diffStates handles raw and oversized values` (Task 4).
4. **Events arrive duplicated or out of order** (a jump across pods; a `step.completed` before its `step.started`): the projection ends in the same documents, and the status never moves back. Test: `projector is order- and duplicate-tolerant` (Task 12).
5. **The conversation closes before tybot wrote `execution_id` into the request attributes:** the server event carries `execution_id: null`, and ingest matches the live execution by `request_id`. Test: `conversation.closed without execution_id completes by request_id` (Task 12).

---

## Before you start

- [ ] **Worktrees.**
  - **tybot:** the design worktree already exists at `/Users/nicocardone/Desktop/DEV/TILEDESK/tiledesk-chatbot.worktrees/execution-traceability`, branch `feature/execution-traceability` on top of `af406feb` (docs commits only).
  - **server, dashboard, dev-env:** create the worktrees:

```bash
git -C /Users/nicocardone/Desktop/DEV/TILEDESK/tiledesk-server worktree add -b feature/execution-traceability ../tiledesk-server.worktrees/execution-traceability 68700f80
```

```bash
git -C /Users/nicocardone/Desktop/DEV/TILEDESK/tiledesk-dashboard worktree add -b feature/execution-traceability ../tiledesk-dashboard.worktrees/execution-traceability d07380426
```

```bash
git -C /Users/nicocardone/Desktop/DEV/TILEDESK/tiledesk-dev-env worktree add -b feature/execution-traceability ../tiledesk-dev-env.worktrees/execution-traceability origin/main
```

  - The dev-env main checkout has uncommitted changes in `compose/ai.yml` and `compose/core.yml` that are not ours. Never edit them there.

- [ ] **Check the disk** (see Storage) and write the first entry of `docs/superpowers/notes/phase1-storage.md`. Stop if a threshold is not met.

- [ ] **Baseline the tybot suite before any change.**
  - Start the test Redis: `docker run -d --rm --name exec-test-redis -p 6379:6379 redis:7`.
  - Run: `cd tybotRoute && npm ci --prefer-offline --no-audit --no-fund && REDIS_HOST=localhost REDIS_PORT=6379 API_ENDPOINT=http://localhost:10002 TILEBOT_ENDPOINT=http://localhost:10001 npm test 2>&1 | tail -40`.
  - Save the pass/fail list to `docs/superpowers/notes/phase1-tybot-baseline.txt`. A test that already fails here is not a regression later.

---

## Part A — tybot (`tiledesk-chatbot`, `tybotRoute/`)

All new modules live in `tybotRoute/executions/` (CommonJS). Tests go in `tybotRoute/test/executions_*_test.js`, so `npm test` picks them up. Tests that need Redis use `REDIS_HOST` / `REDIS_PORT`, like the existing suite.

### Task 1: Config, secrets and Sealer

**Files:**
- Create: `tybotRoute/executions/config.js`, `tybotRoute/executions/secrets.js`, `tybotRoute/executions/Sealer.js`
- Test: `tybotRoute/test/executions_sealer_test.js`, `tybotRoute/test/helpers/executionsTestKeys.js` (generates an RSA-3072 keypair once per run, plus `openSealed(sealed, privateKeyPem)` for tests only)

**Interfaces:**
- Produces:
  - `getConfig(): { enabled, stateEnabled, amqpUrl, sealPublicKeyPem, sealKid, bufferMax, dataMaxBytes, stateValueMaxBytes, keyframeEvery, keyframeMaxDeltaBytes, hashKey }`.
    - Reads `process.env` on every call, like `AnalyticsClient`.
    - `amqpUrl` falls back to `AMQP_MANAGER_URL`.
    - `stateEnabled` defaults to `enabled`.
    - `EXECUTIONS_SEAL_PUBLIC_KEY` may be a PEM, or a base64-encoded PEM (decode when it does not start with `-----BEGIN`).
  - `isSecretName(name: string): boolean` and `stripSecrets(value: any): any` (deep copy; secret-named keys become `"[secret]"`).
  - `Sealer.seal(plain: any, cfg): SealedBlock | null`, where `SealedBlock = {alg, kid, wrapped_key, iv, tag, ct, size}`.
  - `Sealer.projectHashKey(idProject, hashKey): Buffer | null` and `Sealer.valueHash(projectKey: Buffer | null, raw: string): string | null`.

- [ ] **Step 1: Write the failing tests**
  - `seal → openSealed round-trips {a:1,b:"x"}`
  - `seal returns null without a public key`
  - `sealed block has alg "RSA-OAEP-256+A256GCM" and the configured kid`
  - `isSecretName`: true for `Authorization`, `api_key`, `accessToken`, `password`, `client_secret`; false for `order_total`, `lastUserText`
  - `stripSecrets({headers:{Authorization:"x"}, body:{n:1}})` deep-equals `{headers:{Authorization:"[secret]"}, body:{n:1}}`
  - `valueHash` is stable for the same project and value, differs across projects, and is `null` without a hash key
- [ ] **Step 2: Run them to see them fail.** `cd tybotRoute && npx mocha test/executions_sealer_test.js --exit`. Expected: FAIL, modules not found.
- [ ] **Step 3: Implement the three modules.** Use node `crypto`:
  - `publicEncrypt` with `oaepHash: 'sha256'` for the wrapped key;
  - `createCipheriv('aes-256-gcm')` with a 12-byte IV;
  - `size` is the plaintext byte length.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(executions): config, secret rules and envelope sealer"`

### Task 2: TraceEmitter and AMQP transport

**Files:**
- Create: `tybotRoute/executions/TraceEmitter.js`, `tybotRoute/executions/amqpTransport.js`
- Modify: `tybotRoute/package.json` (add `amqplib`, the current major) and the root `package.json` (same dependency, since the Docker image installs from the root)
- Test: `tybotRoute/test/executions_emitter_test.js`

**Interfaces:**
- Produces:
  - `class TraceEmitter { constructor({transport, bufferMax, pod}); emit(envelope): void; flush(): Promise<void>; stats(): {published, dropped, buffered} }`.
  - `getEmitter(): TraceEmitter`: a lazy singleton built from `getConfig()` and `createAmqpTransport`.
  - `setEmitterForTests(emitter | null)`.
  - `buildEnvelope({ctx, seq, type, data}): Envelope`. `ctx` is the ExecutionContext of Task 7. `pod` comes from `os.hostname()`.
  - `createAmqpTransport(url): {publish(routingKey, buffer): Promise<void>, close(): Promise<void>}`.
    - Confirm channel, `assertExchange('tiledesk.executions','topic',{durable:true})`, `persistent: true`.
    - Reconnects with backoff from 1 s up to 30 s.
    - `publish` rejects while disconnected.

- [ ] **Step 1: Write the failing tests** (with a fake transport):
  - `emit publishes with routing key exec.<project>.<type> in emit order`
  - `emit never throws and returns synchronously`
  - `TraceEmitter survives a failing transport`: the transport rejects every call. `emit` × (bufferMax + 5) does not throw, `stats().dropped === 5`, and the oldest entries are the ones dropped. When the transport recovers, `flush()` publishes the buffered entries in order.
  - `buildEnvelope carries event_version 1 and all envelope fields`
- [ ] **Step 2: Run them to see them fail.** `npx mocha test/executions_emitter_test.js --exit`
- [ ] **Step 3: Implement.**
  - On rejection, the entry goes back to the head of the buffer, and a 1 s retry timer drains it.
  - When dropping, drop the oldest entry *(my call: later events, such as the terminal ones, matter more)*.
  - Log one `winston.warn` per minute while `dropped` grows.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(executions): non-blocking trace emitter with bounded buffer"`

### Task 3: ExecutionStore

**Files:**
- Create: `tybotRoute/executions/ExecutionStore.js`
- Test: `tybotRoute/test/executions_store_test.js` (needs Redis)

**Interfaces:**
- Consumes: a node-redis v4 client (`tdcache.client`).
- Produces: `class ExecutionStore { constructor(redisClient) }` with:
  - `resolve({requestId, agentId, hintedExecutionId, meta}): Promise<{executionId, created, previousExecutionId, parentExecutionId} | null>`
    - Algorithm: spec §7.1.3. `meta = {id_project, agent_version, agent_name, test, trigger}`.
    - Creation: `SET exec:req:… id NX EX 604800`. If the `SET` loses, re-`GET` and return `created:false`.
    - On creation, write `HSET exec:{id}` meta plus `status:'running'`, then `EXPIRE`.
    - If the request key pointed to a terminal execution (status `completed` | `failed` | `destroyed`), return its id as `previousExecutionId`.
    - Read `exec:handoff:{request_id}` (JSON `{parent_execution_id, to_agent_id}`). If `to_agent_id === agentId`, delete it and return `parentExecutionId`.
    - Returns `null` on any Redis error.
  - `nextSeq(id): Promise<number | null>`: `INCR`, then `EXPIRE` only when the result is 1.
  - `getState(id): Promise<{step_seq, raw, blocks_since_kf, delta_bytes_since_kf} | null>` and `setState(id, value): Promise<void>` (JSON in `exec:{id}:state`).
  - `setAlias(requestId, agentId, executionId)`, `deleteAlias(requestId, agentId)`, `pushFrame(id, frame)`, `popFrame(id)` (`agent_stack` JSON field of `exec:{id}`).
  - `setHandoff(requestId, value)` and `setStatusHint(id, status)`.

- [ ] **Step 1: Write the failing tests:**
  - `resolve creates then reuses`
  - `ExecutionStore resolve is single under concurrency`: 10 parallel `resolve` calls for the same request and agent return one id, and exactly one has `created:true`
  - `hinted id wins when it exists`
  - `terminal status starts a new execution with previousExecutionId`
  - `alias resolves a subagent to the parent execution`
  - `handoff gives parentExecutionId once`
  - `nextSeq counts from 1`
  - `resolve returns null when the client throws`
- [ ] **Step 2: Run them to see them fail.** `REDIS_HOST=localhost REDIS_PORT=6379 npx mocha test/executions_store_test.js --exit`
- [ ] **Step 3: Implement `ExecutionStore`.**
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(executions): redis execution store (resolve, seq, state, alias)"`

### Task 4: StateDiff (pure)

**Files:**
- Create: `tybotRoute/executions/StateDiff.js`
- Test: `tybotRoute/test/executions_statediff_test.js`

**Interfaces:**
- Consumes: `isSecretName`, `Sealer.valueHash` (Task 1); `TiledeskChatbotUtil.userFlowAttributes` (`utils/TiledeskChatbotUtil.js:979`).
- Produces:
  - `valueType(raw: string | null): 'string'|'number'|'boolean'|'object'|'array'|'null'|'secret'`. Non-JSON raw → `'string'`.
  - `isReserved(key): boolean`: true when `userFlowAttributes({[key]: 1})` drops the key.
  - `diffStates(before, after, opts): {changes: Change[], sealedValues: {[key]: {before?, after?}}, deltaBytes: number}`.
    - `before` and `after` are raw maps (`Record<string,string>`, `HGETALL` output; `null` = empty).
    - `opts = {projectKey, valueMaxBytes, attribute: (key) => string}`.
    - `Change = {key, op: 'add'|'set'|'del', type, size, hash_before?, hash_after?, reserved, by, omitted?, secret?}`.
  - `buildManifest(raw, {projectKey}): {key, type, size, hash, reserved}[]`.
  - `shouldKeyframe({isFirstBlock, blocksSinceKeyframe, deltaBytesSinceKeyframe}, cfg): boolean`.

- [ ] **Step 1: Write the failing tests:**
  - `unchanged keys are not in changes`
  - `add / set / del ops`
  - `by comes from attribute(key)`
  - `diffStates handles raw and oversized values`:
    - `{x: "plain text not json"}` gives type `string`;
    - a 300 KB value gives `omitted:"too_large"`, `size` 307200, a non-null `hash_after`, and no entry in `sealedValues`.
  - `secret keys carry secret:true, no hashes, no sealed value`
  - `reserved true for lastUserText and _tdX, false for order_total`
  - `buildManifest lists every key without values`
  - `shouldKeyframe`:
    - true on the first block;
    - true at 20 blocks;
    - true at 1048576 delta bytes;
    - false otherwise.
- [ ] **Step 2: Run them to see them fail.** `npx mocha test/executions_statediff_test.js --exit`
- [ ] **Step 3: Implement.** `size` is the UTF-8 byte length of the raw value (the after value; the before value for `del`). `deltaBytes` is the sum of the sizes of the changed, not-omitted values.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(executions): flow state diff, manifest and keyframe policy"`

### Task 5: WriteTap and the four writer one-liners

**Files:**
- Create: `tybotRoute/executions/WriteTap.js`
- Modify:
  - `tybotRoute/engine/TiledeskChatbot.js`: `addParameterStatic` (~l.588) and `deleteParameterStatic` (~l.639)
  - `tybotRoute/tiledeskChatbotPlugs/TiledeskRequestVariables.js`: `set`, `delete`
- Test: `tybotRoute/test/executions_writetap_test.js`

**Interfaces:**
- Produces:
  - `WriteTap.runAction({executionId, stepSeq, actionIndex, actionId, requestId, onJump}, fn)`
  - `WriteTap.runScope(name: 'message_in'|'jump_params', requestId, fn)`
  - `WriteTap.note(requestId, key, op: 'set'|'del')`
  - `WriteTap.current(): Store | undefined`, where `Store = {kind: 'action'|'scope', name?, requestId, writes: Map<key, op>, ...actionFields}`
- `note` is a no-op (one boolean check) when `getConfig().enabled` is false, and ignores a store whose `requestId` differs.

- [ ] **Step 1: Write the failing tests:**
  - `note inside runAction records the key`
  - `note survives awaits and timers inside the action`
  - `nested runAction isolates writes`
  - `note outside any store is ignored`
  - `runScope message_in records keys`
  - `different requestId is ignored`
  - `addParameterStatic notes 'set'`, using a stub `_tdcache`
  - `TiledeskRequestVariables.delete notes 'del'`
- [ ] **Step 2: Run them to see them fail.** `npx mocha test/executions_writetap_test.js --exit`
- [ ] **Step 3: Implement.** `AsyncLocalStorage`. The writer change is one line each, after the Redis write succeeds: `WriteTap.note(requestId, name, 'set')` (or `'del'`).
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(executions): write tap on the flow variable writers"`

### Task 6: OutcomeMapper

**Files:**
- Create: `tybotRoute/executions/OutcomeMapper.js`
- Test: `tybotRoute/test/executions_outcome_test.js`

**Interfaces:**
- Produces: `mapOutcome({action, jumpedTo: string | null, error}): {outcome: 'success'|'failure_condition'|'error', exit_taken: string | null}`.
  - Normalize `jumpedTo` and the exit fields:
    - strip a leading `/`;
    - strip the JSON params suffix (`{…}`);
    - compare the `#id` forms.
  - Failure exits: `falseIntent`, `noMatchIntent`, `noInputIntent`, `errorIntent`.
  - Success exits: `trueIntent`, `elseIntent`, `fallbackIntent`, `goToIntent`.
  - `exit_taken` is the matching field name without the `Intent` suffix (e.g. `"false"`, `"noMatch"`), `"jump"` for any other jump, and `null` without a jump. An `error` always wins.

- [ ] **Step 1: Write the failing tests:**
  - web request, false exit → `failure_condition` / `"false"`
  - true exit → `success` / `"true"`
  - `noMatchIntent` → `failure_condition`
  - `fallbackIntent` → `success`
  - `jumpedTo "/#abc{\"x\":1}"` matches `falseIntent "#abc"`
  - no jump → `success` / `null`
  - error → `error`
- [ ] **Step 2: Run them to see them fail.** `npx mocha test/executions_outcome_test.js --exit`
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(executions): outcome mapper from exits"`

### Task 7: ExecutionRecorder and the block lifecycle hooks

**Files:**
- Create: `tybotRoute/executions/ExecutionRecorder.js`, `tybotRoute/executions/trigger.js`
- Modify:
  - `tybotRoute/index.js`: `/ext/:botid` (l.46–242), the text-answer branch, and `startApp` (build the store when `tdcache` connects)
  - `tybotRoute/engine/TiledeskChatbot.js`: `execIntent` (l.357), and the intent parameters at ~l.168
  - `tybotRoute/tiledeskChatbotPlugs/DirectivesChatbotPlug.js`: `processDirectives`, `nextDirective` (`checkStep` error), `process` (around `handler.execute`, l.333)
- Test: `tybotRoute/test/executions_lifecycle_test.js` (static bots, Redis, with the emitter replaced by `setEmitterForTests`), plus the bot fixture `tybotRoute/test/executions_lifecycle_bot.js`

**Interfaces:**
- Consumes: Tasks 1–6.
- Produces:
  - `ExecutionContext` (plain object): `{execution_id, id_project, agent_id, agent_version, agent_name, request_id, test, trigger, step: {seq, block_id, block_name, started_at, actions: [], outcome, exit_taken} | null, current: raw-map | null, prev: raw-map | null, scopes: {message_in: Set, jump_params: Set}, kf: {blocks_since, delta_bytes}, jumpInFlight: boolean}`.
  - `detectTrigger(message, requestId, botId): {type, source_id, start_point_id}`:
    - `automation-request-` → `automation`;
    - `request.attributes.start_type` in `scheduled` | `webhook` | `trigger` → that type, with `source_id` = `webhook_id` or `chatbot_id`;
    - `start_point_id` = `message.attributes.action` without its `#`;
    - otherwise `channel`, when `request.channel.name` exists and is not `chat21`, else `widget`.
  - `ExecutionRecorder` (all methods are no-ops returning `null` when disabled, or when `ctx` is `null`):
    - `onMessageIn({message, bot, botId, requestId, projectId, token, store}): Promise<ctx | null>`
      - Resolves with `hintedExecutionId = message.attributes?.execution_id`.
      - On create, emits `execution.started` with `trigger`, `agent_name`, `test`, `parent_execution_id?`, `previous_execution_id?` and `sealed_trigger_payload?`. The payload is `stripSecrets(request.attributes.payload)`; it is sealed only when `capture_data` is not `"false"`.
      - `capture_data` is read from `HGET exec:policy:{id_project} capture_data`. It is cached per project for 60 s in process memory, so the policy read is not a per-message Redis call. The same flag gates the sealed state values.
      - Also on create: writes `execution_id` into the request attributes, fire-and-forget, through `TiledeskClient.updateRequestAttributes`; skipped for `automation-request-` ids.
      - Loads `ctx.prev` from `getState`.
    - `withScope(ctx, name, fn)`
    - `blockEntry(ctx, {blockId, blockName})`
      - `HGETALL`, then outside changes = `diffStates(ctx.prev, before)`. Attribution: `message_in` if the key is in `scopes.message_in`, `jump_params` if in `scopes.jump_params`, else `external`.
      - Keyframe decision. On a keyframe: `state_manifest` plus `sealed_state` of the whole state. Otherwise: `sealed_state` of the changed values only.
      - Emits `step.started` with `step_seq` (= this event's seq), `block_id`, `block_name`, `state_vars`, `outside_changes`, `state_keyframe`, `state_manifest`, `sealed_state?`.
    - `runAction(ctx, {index, directive}, fn)`: `WriteTap.runAction` with `onJump`.
    - `afterAction(ctx, {index, directive, startedAt, jumpedTo, error})`: idempotent per index.
      - `HGETALL`, then the delta against `ctx.current`. Attribution: the action id when the tap saw the key, else `external`.
      - `mapOutcome`.
      - Emits `action.completed` (§8.1 fields; `hard_degraded` and `sealed` are omitted in Phase 1).
    - `blockExit(ctx)`: idempotent per step.
      - Step outcome = the worst of its actions (`error` > `failure_condition` > `success`); `exit_taken` = the last action's.
      - Emits `step.completed` with `step_seq`, `outcome`, `exit_taken`, `duration_ms`, `state_vars`, `changed_keys`.
      - Writes `setState`.
    - `endOfChain(ctx)`: when `!ctx.jumpInFlight`:
      - conversation → `execution.idle {last_seq}`;
      - automation → `execution.ended {end_reason:'completed'}` plus `setStatusHint('completed')`.
    - `failed(ctx, {error_code, message})`: emits `execution.failed` and `setStatusHint('failed')`.
- Hook placement (one call each):
  - `/ext`: `const ctx = await ExecutionRecorder.onMessageIn(...)` right after the bot is loaded. Wrap `updateRequestAttributes` + `updateConversationTranscript` in `ExecutionRecorder.withScope(ctx, 'message_in', …)`. Set `chatbot.execution = ctx` and pass `execution: ctx` in the `DirectivesChatbotPlug` config. Text-answer branch: `blockExit` + `endOfChain`.
  - `execIntent`: `await ExecutionRecorder.blockEntry(this.execution, {blockId: faq.intent_id, blockName: faq.intent_display_name})` at the top.
  - Intent parameters (~l.168): change `this.addParameter(key, value)` to `await`, inside `withScope(this.execution, 'jump_params', …)` *(spec §7.1.2)*.
  - `process`:
    - wrap `handler.execute(...)` in `runAction`;
    - in the callback, `await afterAction(...)` before `if (stop)`;
    - synchronous throws and rejections become `error` (a `try` around the `execute` call).
    - `jumpedTo` is the value captured by `onJump` (Task 8).
  - `theend`: in `processDirectives`, wrap the given `theend` so it calls `blockExit` then `endOfChain` once.
  - `nextDirective` `checkStep` error: `ExecutionRecorder.failed(ctx, {error_code: go_on.error_code, message: go_on.error})`.

- [ ] **Step 1: Write the bot fixture.** One bot with:
  - `start`, whose actions are: `setattribute order_total = 42`; `setattribute status = "new"`; `intent #check`.
  - `check`, whose actions are: a web request v2 to `http://localhost:10003/fail` (the test server answers 500) with `falseIntent #after`.
  - `after`: a reply `"done"`.
- [ ] **Step 2: Write the failing tests:**
  - `flag off: no events, no exec:* keys`: `SCAN exec:*` is empty and the reply flow is unchanged.
  - `start emits execution.started then step.started (keyframe, manifest has the message_in keys) …`
  - `set attribute deltas are attributed to their action ids`
  - `web request false exit maps to failure_condition`
  - `three step.completed, one execution.idle at the end, seqs strictly increasing`
  - `/start{"a":1} records a as jump_params in outside_changes`
  - `max steps exceeded emits execution.failed max_steps_exceeded`: run with `CHATBOT_MAX_STEPS=2`.
  - `no extra awaited Redis call per action beyond HGETALL+INCR`: count calls on a proxied client.
- [ ] **Step 3: Run them to see them fail.** `REDIS_HOST=localhost REDIS_PORT=6379 npx mocha test/executions_lifecycle_test.js --exit`
- [ ] **Step 4: Implement `ExecutionRecorder`, `detectTrigger` and the hooks.**
- [ ] **Step 5: Run the tests.** Expected: PASS.
- [ ] **Step 6: Run the full suite with the flag off.**
  - Run: `npm test` (same env as the baseline).
  - Expected: no test that passed in `phase1-tybot-baseline.txt` now fails.
- [ ] **Step 7: Commit.** `git commit -m "feat(executions): record blocks, actions and flow state in the engine"`

### Task 8: Jumps across blocks and pods

**Files:**
- Modify: `tybotRoute/services/TilebotService.js` (`sendMessageToBot`, l.33), `tybotRoute/executions/ExecutionRecorder.js`
- Test: `tybotRoute/test/executions_jump_test.js` (two `startApp` instances on two ports with separate `TILEBOT_ENDPOINT`s cannot share module state, so simulate the second pod by clearing the in-memory `ctx` and reading `exec:{id}:state`)

**Interfaces:**
- Consumes: `WriteTap.current().onJump` (Task 7).
- Produces:
  - `ExecutionRecorder.beforeJump(message): Promise<void>`. When an action store is active:
    1. `await onJump(message.payload.text)`, which records `jumpedTo`, runs `afterAction` and `blockExit`, and sets `ctx.jumpInFlight = true`;
    2. sets `message.payload.attributes = {...(message.payload.attributes || {}), execution_id}`.
  - `sendMessageToBot` calls `await ExecutionRecorder.beforeJump(message)` before the HTTP post, keeping its callback signature. A rejection inside `beforeJump` is logged, and the post goes on.

- [ ] **Step 1: Write the failing tests:**
  - `the jump message carries attributes.execution_id`
  - `step.completed of the jumping block is emitted before the next block's step.started`
  - `next block's outside_changes are empty when nothing changed between blocks`. A fresh ctx loads `prev` from `exec:{id}:state`. This is the cross-pod case, and the one that would otherwise show "outside the flow".
  - `a server-side attribute write between blocks shows as by:"external"`: write the hash directly between blocks.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests, and Task 7's lifecycle test again.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(executions): record block exit before a jump and carry execution_id"`

### Task 9: Subagents, replace bot, and the event fixture

**Files:**
- Modify:
  - `tybotRoute/tiledeskChatbotPlugs/directives/DirCallSubagent.js`: around the `replaceBot` call (l.76) and the `sendSupportMessage` (l.104)
  - `tybotRoute/tiledeskChatbotPlugs/directives/DirReturnStack.js` (l.58)
  - `DirReplaceBot.js`, `DirReplaceBotV2.js`, `DirReplaceBotV3.js`
  - `tybotRoute/services/RequestService.js` (`replaceBot` passes `data` through unchanged; callers add `reason`)
- Create: `tybotRoute/test/fixtures/executions-events.sample.json` (written by the test below and committed)
- Test: `tybotRoute/test/executions_subagent_test.js`, built on the existing `conversation-call-subagent_bots.js`

**Interfaces:**
- Produces:
  - **Call subagent:**
    - `replaceBot` data gets `reason: "subagent_call"`.
    - After it returns, and before `sendSupportMessage`: `store.setAlias(requestId, resbody.replaced_bot_root_id, ctx.execution_id)` and `store.pushFrame(ctx.execution_id, {agent_id, agent_version, return_block})`.
  - **Return stack:** `reason: "subagent_return"`, `deleteAlias`, `popFrame`.
  - **Replace bot (V1–V3):**
    - emit `execution.handed_to_bot {to_bot_id}`;
    - `store.setHandoff(requestId, {parent_execution_id, to_agent_id})`, where `to_agent_id` is the replaced root id when the response has it, else the requested bot id.

- [ ] **Step 1: Write the failing tests:**
  - `subagent steps share the parent's execution_id and carry the subagent's agent_id`
  - `return removes the alias`
  - `replace call body has reason subagent_call / subagent_return`: capture it on the mock server
  - `replace bot emits handed_to_bot and the next bot's execution.started has parent_execution_id`
  - `writes every envelope seen in this file to test/fixtures/executions-events.sample.json`: dedupe by type, keeping one of each
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests and the full suite.** Expected: PASS, and no regressions against the baseline.
- [ ] **Step 5: Commit.** `git commit -m "feat(executions): subagent alias, replace-bot lineage, event fixture"`

---

## Part B — tiledesk-server

### Task 10: Replace reason and `executions-publisher`

**Files:**
- Modify:
  - `routes/request.js`: `PUT /:requestid/replace` (l.511). Read `req.body.reason`, keep it only when it is `subagent_call` or `subagent_return`, and put it in the options passed to `setParticipantsByRequestId`.
  - `services/requestService.js`: both `request.participants.update` emits (~l.1757 and ~l.2599) add `reason: options && options.reason`.
  - `pubmodules/pubModulesManager.js`: load and `listen()` the new module next to `analyticsPublisher` (l.628).
- Create: `pubmodules/executions-publisher/index.js`
- Test: `pubmodules/executions-publisher/test/executions-publisher.test.js` (same style as `analytics-publisher.test.js`: no DB, a fake transport)

**Interfaces:**
- Produces:
  - `listen()`: returns without registering anything when `EXECUTIONS_AMQP_URL` is unset.
  - `_setTransportForTests(t: {publish(routingKey, buffer)})`.
  - Envelope: `{event_version:1, type, execution_id, at, id_project, request_id, data: {request_id, execution_id, bot_id, closed_by?, to_bot_id?}}`, routing key `exec.<id_project>.<type>`.
  - Listeners:
    - `request.close` → `conversation.closed`, when the request's participants contain a `bot_` id or `attributes.execution_id` is set. Only `request.close` *(my call: `close.extended` carries the same request)*.
    - `request.participants.update` with a removed `bot_*`:
      - `reason` is `subagent_*` → nothing;
      - an added `bot_*` → `conversation.bot_replaced` with `to_bot_id`;
      - otherwise → `conversation.bot_left`.
    - `request.participants.leave` with a `member` starting `bot_` → `conversation.bot_left`.
  - `execution_id` = `request.attributes?.execution_id || null`.
  - The amqplib transport: confirm channel, exchange as in the Global Constraints, a lazy connect. Errors are logged and never thrown.

- [ ] **Step 1: Write the failing tests**, one per listener rule above, plus:
  - `no listeners without EXECUTIONS_AMQP_URL`
  - `a request without bot participants publishes nothing`
  - `closed without execution_id attribute publishes execution_id null`
- [ ] **Step 2: Run them to see them fail.** `NODE_ENV=test npx mocha pubmodules/executions-publisher/test/*.js --exit`
- [ ] **Step 3: Implement.** Then add a case to the existing replace tests in `test/requestRoute.js` (search `replace`) asserting that the emitted `request.participants.update` carries `reason`.
- [ ] **Step 4: Run the tests.**
  - `NODE_ENV=test npx mocha pubmodules/executions-publisher/test/*.js --exit`: PASS.
  - `NODE_ENV=test npx mocha test/requestRoute.js --grep replace --exit` (needs a local Mongo, like the existing suite): PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(executions): publish conversation end events; replace accepts a subagent reason"`

---

## Part C — tiledesk-executions (new service)

Repo: `/Users/nicocardone/Desktop/DEV/TILEDESK/tiledesk-executions`. Set it up with `git init -b main`, an empty first commit, then `git checkout -b feature/execution-traceability`. No remote. The layout follows `tiledesk-scheduler-service`: ESM, `tsconfig.build.json`, vitest, a multi-stage Dockerfile.

### Task 11: Scaffold, config and event contracts

**Files:**
- Create:
  - `package.json`: name `tiledesk-executions`, version `0.1.0`, `"type": "module"`, engines `>=22`.
    - Scripts: `build`, `typecheck`, `test`, `start:api` (`node dist/main.js api`), `start:ingest`, `start:jobs`.
  - `tsconfig.json`, `tsconfig.build.json`, `vitest.config.ts`, `Dockerfile`, `.gitignore`, `README.md`
  - `src/config.ts`, `src/log.ts` (pino), `src/metrics.ts` (prom-client registry), `src/contracts.ts`, `src/main.ts` (switches on `api` | `ingest` | `jobs`)
- Test: `test/contracts.test.ts`, `test/fixtures/executions-events.sample.json` (copied from tybot Task 9)

**Interfaces:**
- Produces:
  - `loadConfig(env): Config`, validated by zod.
    - Keys: `PORT` (3000), `MONGO_URI`, `AMQP_URL`, `TYBOT_REDIS_URL`, `TILEDESK_API_URL`, `GLOBAL_SECRET`, `GLOBAL_SECRET_OR_PUB_KEY`, `JWT_AUDIENCE` (`https://tiledesk.com`), `JWT_ISSUER` (`https://tiledesk.com`).
    - Retention defaults: `DEFAULT_RETENTION_TRACE_DAYS` (90), `DEFAULT_RETENTION_DATA_DAYS` (30), `TEST_RETENTION_DAYS` (7).
    - `INGEST_PREFETCH` (50).
  - `EventEnvelope`: a zod schema, discriminated on `type`, covering:
    - `execution.started`, `step.started`, `action.completed`, `step.completed`
    - `execution.idle`, `execution.ended`, `execution.failed`, `execution.handed_to_bot`
    - `conversation.closed`, `conversation.bot_left`, `conversation.bot_replaced`
    - Data fields as in spec §8.1. `seq` is required for tybot types and absent for `conversation.*`.
  - `eventKey(e): string`: `${execution_id}:${seq}` for tybot events, `${type}:${request_id}:${at}` for server events *(my call)*.

- [ ] **Step 1: Write the failing tests:**
  - `every event in the tybot fixture parses`
  - `unknown type is rejected`
  - `tybot event without seq is rejected`
  - `server event without seq parses`
  - `eventKey forms`
  - `loadConfig applies defaults`
- [ ] **Step 2: Run them to see them fail.** `npm ci && npx vitest run test/contracts.test.ts`
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests and `npm run typecheck`.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat: scaffold tiledesk-executions with event contracts"`

### Task 12: Mongo models and the projector

**Files:**
- Create: `src/db.ts`, `src/model/*.ts`, `src/ingest/status.ts`, `src/ingest/projector.ts`
- Test: `test/projector.test.ts` (test Mongo from `TEST_MONGO_URI`, see Storage), `test/status.test.ts`

**Interfaces:**
- Produces:
  - **Models:** `Execution`, `Step`, `SealedData`, `StateManifest`, `StateChange`, `EventSeen`.
    - Fields and indexes as in spec §7.2.4 and §8.3, for these six collections.
    - `EventSeen` is keyed by unique `event_key`, with a 2-day TTL.
    - TTL indexes on `retention.trace_until` (executions, steps, manifests, changes) and on `data_until` (sealed_data).
  - `canTransition(from, to): boolean`: from §6.1, restricted to the Phase 1 statuses: `running`, `waiting`, `completed`, `failed`.
  - `applyEvent(e: EventEnvelope, now = new Date()): Promise<{matched: boolean}>`. Rules:
    - **Every tybot event** upserts the execution:
      - `$setOnInsert {id_project, agent_id, request_id, status:'running', started_at: at, test:false}`;
      - `$max {last_seq: seq, last_event_at: at}`.
    - **`execution.started`:**
      - sets `agent_name`, `agent_version`, `test`, `trigger`, the lineage fields, `started_at`;
      - `conversation_link` = `request_id`, unless it starts `automation-request-`;
      - `retention` = started + 90 / 30 days (7 / 7 for test runs);
      - the sealed trigger payload goes to `sealed_data` with kind `trigger`.
    - **`step.started`:**
      - upserts the step `{execution_id, seq: step_seq, agent_id, agent_version, block_id, block_name, started_at}`;
      - increments `steps_count` only on insert;
      - `outside_changes` → `state_changes` (`action_id: null`, `seq = step_seq`);
      - on a keyframe → `state_manifests {seq: step_seq, step_seq, at:'before', vars}`;
      - `sealed_state` → `sealed_data` (kind `state_keyframe` or `state_delta`).
    - **`action.completed`:**
      - adds the action to `step.actions`, keyed by `index`; the step is upserted if missing;
      - increments `actions_count`;
      - `state_delta` → `state_changes`, with `action_id` and `seq`.
    - **Changed variables:** for every `state_changes` write (outside changes and action deltas), `$addToSet` the key into `execution.changed_keys`, and set `vars_changed` to the array's size.
    - **`step.completed`:**
      - sets the step's end fields, `state_vars` and `changed_keys`;
      - when the outcome is `failure_condition`, increments `failure_conditions` once per step (guarded by the step's `counted` flag).
    - **`execution.idle`** → `waiting`, plus the gap check.
    - **`execution.ended`** → `completed` (`end_reason:'completed'`), `ended_at`, `duration_ms`, the gap check, plus the terminal write-back (Task 13).
    - **`execution.failed`** → `failed` with `error {code, message, step_seq}`, plus the write-back.
    - **`execution.handed_to_bot`** → sets `handed_to_bot_id`.
    - **`conversation.closed`** / **`bot_left`** / **`bot_replaced`:**
      - Match non-terminal executions by `request_id` (and `_id` when `execution_id` is given).
      - The status becomes `completed`, with `end_reason` `closed`, `handed_to_human` or `handed_to_bot` respectively.
      - No match → `{matched:false}`.
    - **Statuses only move forward** (`canTransition`). Duplicate events are filtered before the projector (Task 13), but the projector stays idempotent anyway: upserts are keyed by `step_seq` or `(execution_id, seq, key)`.
  - **Gap check:** `missing_seq` = the seqs in `1..last_seq-1` that are not in `events_seen` for this execution; sets `gap_checked_at`.

- [ ] **Step 1: Write the failing tests:**
  - `status forward-only table`: `completed → waiting` is false; `waiting → running` is true; `running → failed` is true
  - `started + steps + actions build the execution and its steps`
  - `projector is order- and duplicate-tolerant`: applying the fixture's events in reverse order, with every event applied twice, gives the same documents as applying them in order (compare on the key fields)
  - `failure_conditions counted once per step`
  - `conversation.closed without execution_id completes by request_id`
  - `closed for an unknown request returns matched:false and writes nothing`
  - `idle with a missing seq records missing_seq`
- [ ] **Step 2: Run them to see them fail.** `npx vitest run test/projector.test.ts test/status.test.ts`
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(ingest): mongo models and order-tolerant projector"`

### Task 13: Ingest consumer, terminal write-back, gap re-check job

**Files:**
- Create: `src/ingest/consumer.ts`, `src/ingest/tybotRedis.ts`, `src/jobs/gaps.ts`, `src/jobs/main.ts`
- Test: `test/consumer.test.ts` (fake amqplib channel), `test/tybotRedis.test.ts` (real Redis via `REDIS_URL`; skipped when unset), `test/gaps.test.ts`

**Interfaces:**
- Consumes: `applyEvent`, `eventKey` (Tasks 11–12).
- Produces:
  - `startIngest(cfg)`:
    - asserts the exchange; asserts the queue `executions.ingest` with `x-dead-letter-exchange: ''` and `x-dead-letter-routing-key: 'executions.ingest.dlq'`; asserts the DLQ; binds `exec.#`; sets prefetch `INGEST_PREFETCH`.
  - `handleMessage(msg, channel)`:
    - JSON parse or zod failure → `nack(requeue=false)` (DLQ);
    - insert `events_seen` → duplicate key → `ack`;
    - `applyEvent` → `ack`;
    - error → delete the `events_seen` row, `nack(requeue=true)` after 1 s.
  - `writeBackTerminal({execution_id, request_id, agent_id, status})`:
    - deletes `exec:req:{request_id}:{agent_id}` only when its value equals `execution_id` (Lua compare-and-delete);
    - sets `HSET exec:{id} status`.
  - `recheckGaps(now)`: for executions whose `missing_seq` is non-empty and `gap_checked_at < now - 60 s`, recompute; still missing → `trace_complete:false`, else clear `missing_seq`. The `jobs` deployment runs it every 15 s.
  - Metrics (registry from `src/metrics.ts`, served on `/metrics` by every deployment):
    - `executions_ingest_events_total{type,result}`, with `result` one of `applied` | `duplicate` | `dlq` | `retry` | `unmatched`;
    - `executions_ingest_lag_seconds` (histogram of `now - at`);
    - `executions_gaps_marked_total`.

- [ ] **Step 1: Write the failing tests:**
  - `invalid json is dead-lettered`
  - `duplicate is acked without a second projection`
  - `projection error requeues and releases events_seen`
  - `compare-and-delete leaves a newer execution's key alone`
  - `recheckGaps marks trace_complete false after 60 s`
- [ ] **Step 2: Run them to see them fail.** `npx vitest run test/consumer.test.ts test/tybotRedis.test.ts test/gaps.test.ts`
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(ingest): amqp consumer, dlq, terminal write-back, gap re-check"`

### Task 14: API auth and project roles

**Files:**
- Create: `src/api/auth.ts`, `src/api/projectRole.ts`, `src/api/permissions.ts`
- Test: `test/auth.test.ts` (signs test JWTs; stubs the server `/me` with a local express)

**Interfaces:**
- Produces:
  - `requireUser(cfg): RequestHandler`
    - Accepts `Authorization: JWT <t>` or `Bearer <t>`.
    - Verifies HS256 with `GLOBAL_SECRET`, or RS256 with `GLOBAL_SECRET_OR_PUB_KEY`.
    - Requires `aud` and `iss` as configured, and `sub === 'user'`.
    - Sets `res.locals.user = {id, email, authHeader}`.
    - Responds 401 `{error:'unauthorized'}`.
  - `getProjectRole(pid, authHeader): Promise<{role: string, permissions: string[]}>`
    - Calls `GET {TILEDESK_API_URL}/{pid}/project_users/me`, forwarding the caller's header.
    - Accepts an object or a one-element array.
    - `permissions` comes from `rolePermissions` when present, else `[]`.
    - Cache: 60 s, keyed by `sha256(authHeader)+pid`.
    - A 401 or 403 from the server becomes 403.
  - `can({role, permissions}, perm: 'executions_read'): boolean`: owner, admin and supervisor are true; agent is false; any other role → `permissions.includes(perm)`.
  - `requirePermission(perm): RequestHandler`: 403 `{error:'forbidden'}`.

- [ ] **Step 1: Write the failing tests:**
  - `expired or bad-signature token → 401`
  - `sub other than user → 401`
  - `supervisor can read, agent cannot`
  - `custom role with executions_read can, without cannot`
  - `role is cached for 60 s`
  - `server 401 → 403`
- [ ] **Step 2: Check what `/me` actually returns.** Start the local stack (Task 22 can come first if needed). Call `GET /api/<pid>/project_users/me` as a custom-role user, and write down whether `rolePermissions` is present (spec §15). If it is not, note it in `docs/` of this repo and keep `[]`. Custom roles are then denied in Phase 1 (fail closed).
- [ ] **Step 3: Run the tests to see them fail, implement, run them to see them pass.** `npx vitest run test/auth.test.ts`
- [ ] **Step 4: Commit.** `git commit -m "feat(api): jwt auth and project role permissions"`

### Task 15: Read routes: list, summary, detail

**Files:**
- Create: `src/api/app.ts` (express app: `/healthz`, `/metrics`, router mounted at `/executions/api/v1`), `src/api/routes/executions.ts`
- Test: `test/api.executions.test.ts` (supertest + the test Mongo, with the role stubbed)

**Interfaces:**
- Consumes: the models (Task 12), `requireUser` and `requirePermission('executions_read')` (Task 14).
- Produces:
  - **`GET /projects/:pid/executions`**
    - Query: `agent_id`, `trigger` (comma list; `unattended` = `scheduled,webhook,trigger,automation`), `status` (comma list), `has_failures` (bool), `test` (absent = exclude tests), `from`, `to`, `q` (exact `_id` or `request_id`), `limit` (25 by default, at most 100), `cursor`.
    - Response: `{items: ExecutionRow[], next_cursor: string | null}`.
    - Sort: `started_at` desc, then `_id` desc. The cursor is base64 JSON `{started_at, _id}`.
    - `ExecutionRow`: `_id`, `agent_id`, `agent_name`, `status`, `end_reason`, `trigger`, `started_at`, `duration_ms`, `steps_count`, `failure_conditions`, `vars_changed`, `trace_complete`, `test`.
  - **`GET /projects/:pid/executions/summary?agent_ids=a,b&since=24h`**
    - `since` is `<n>h`, `<n>d`, or an ISO date.
    - Response: `{agents: {[agent_id]: {running, waiting, failed, stopped, last_started_at}}}`, counting executions started since `since` by their current status; tests excluded.
  - **`GET /projects/:pid/executions/:id`**
    - Response: `{execution, steps, allowed_controls: [], lineage: {parent, previous, retry_of, retried_as}}`.
    - Each step also carries `outside: [{key, by}]`, from `state_changes` with `action_id: null` (names only).
    - 404 when the execution is in another project.
  - `vars_changed` comes from the execution document (maintained by the projector, Task 12); `changed_keys` is not returned in the list.

- [ ] **Step 1: Write the failing tests:**
  - `list filters by agent, status and unattended trigger`
  - `cursor pages without overlap`
  - `tests hidden by default`
  - `q finds by request_id`
  - `summary counts per agent`
  - `detail returns steps in seq order with outside names`
  - `other project → 404`
  - `agent role → 403`
- [ ] **Step 2: Run them to see them fail, implement, run them to see them pass.** `npx vitest run test/api.executions.test.ts`
- [ ] **Step 3: Commit.** `git commit -m "feat(api): list, summary and detail routes"`

### Task 16: State view and variable history

**Files:**
- Create: `src/api/stateView.ts` (pure), and in `src/api/routes/executions.ts` the routes `GET …/:id/state` and `GET …/:id/state/history`
- Test: `test/stateView.test.ts`, `test/api.state.test.ts`

**Interfaces:**
- Produces:
  - `buildStateView({manifests, changes, stepSeq}): {step_seq, vars: VarView[]}`.
    - `VarView = {key, reserved, before: {type, size, hash} | null, after: {…} | null, changed: boolean, by: string | null}`.
    - Manifest K = the latest manifest with `step_seq ≤ S`.
    - **before(S)** = the manifest's vars, plus the changes with `seq > K` and (`step_seq < S`, or `step_seq == S` and `action_id == null`), applied in seq order.
    - **after(S)** = the manifest's vars, plus the changes with `seq > K` and `step_seq ≤ S`.
    - `changed` = presence differs, or hashes differ (when hashes are `null`, any change record for the key in step S counts as changed).
    - `by` = the last change of that key in step S (`action_id`, or the `by` label).
    - Secret vars keep `type:'secret'`. Values are never returned in Phase 1.
  - `buildHistory(changes, key): {seq, step_seq, action_id, by, op, type, size, hash_before, hash_after}[]`.
  - Route `…/state?step_seq=N[&at=before|after]` returns `buildStateView` (`at` is accepted and ignored: the view always carries both sides). Route `…/state/history?key=k` returns `buildHistory`. Both require `executions_read`.
  - A request with `grant=` → 400 `{error:'not_available_in_this_version'}`.

- [ ] **Step 1: Write the failing tests:**
  - `before of a keyframe step equals its manifest`
  - `after applies the step's action deltas`
  - `outside changes count in before(S), not in after(S-1)`
  - `a deleted key has after null and changed true`
  - `state 20 blocks after a keyframe rebuilds from deltas`
  - `history lists every change of one key in order`
  - `route never returns a value field`
- [ ] **Step 2: Run them to see them fail, implement, run them to see them pass.** `npx vitest run test/stateView.test.ts test/api.state.test.ts`
- [ ] **Step 3: Run the whole service suite and the typecheck.** `npm test && npm run typecheck`: PASS.
- [ ] **Step 4: Commit.** `git commit -m "feat(api): flow state view and variable history"`

---

## Part D — tiledesk-dashboard

Worktree: `tiledesk-dashboard.worktrees/execution-traceability`.
- Tests: `npx ng test --watch=false --browsers=ChromeHeadless --include='<glob>'`.
- Build check: `npx ng build --configuration development`.

### Task 17: Config, ExecutionsService, permission key

**Files:**
- Modify:
  - `src/dashboard-config-template.json`: add `"EXECUTIONS_BASE_URL": "${EXECUTIONS_BASE_URL}"`
  - `src/dashboard-config.json`: add `"EXECUTIONS_BASE_URL": ""`
  - `src/app/utils/permissions.constants.ts`: add `EXECUTIONS_READ: 'executions_read'`
- Create: `src/app/services/executions.service.ts`, `src/app/bots/executions/executions.models.ts`
- Test: `src/app/services/executions.service.spec.ts` (HttpClientTestingModule)

**Interfaces:**
- Produces:
  - `ExecutionsService`:
    - `isConfigured(): boolean`: false when the value is empty, or still holds the literal `${…}`.
    - `list(projectId, params): Observable<ExecutionPage>`
    - `summary(projectId, agentIds: string[], since = '24h'): Observable<Summary>`
    - `get(projectId, id): Observable<ExecutionDetail>`
    - `state(projectId, id, stepSeq): Observable<StateView>`
    - `history(projectId, id, key): Observable<VarHistoryEntry[]>`
  - Base URL from `appConfigService.getConfig().EXECUTIONS_BASE_URL`. The auth header is built the same way as `analytics.service.ts`.
  - The model types mirror Tasks 15–16 exactly.

- [ ] **Step 1: Write the failing spec:**
  - `isConfigured false for "" and "${EXECUTIONS_BASE_URL}"`
  - `list builds the query string and joins the base URL`
  - `summary joins agent_ids with commas`
- [ ] **Step 2: Run it to see it fail, implement, run it to see it pass.** `--include='src/app/services/executions.service.spec.ts'`
- [ ] **Step 3: Commit.** `git commit -m "feat(executions): dashboard config and executions service"`

### Task 18: Entry from the agents list

**Files:**
- Modify: `src/app/bots/bots-list/bots-list.component.ts` (`listenToProjectUser`, ~l.324), `bots-list.component.html` (the card `cl-card-action-group` next to the `leaderboard` button; the card `more_vert` menu; the page header next to the create buttons), `bots-list.component.scss`, `src/assets/i18n/en.json`
- Test: `src/app/bots/bots-list/bots-list.component.spec.ts` (extend the existing spec)

**Interfaces:**
- Consumes: `ExecutionsService` (Task 17).
- Produces:
  - `PERMISSION_TO_VIEW_EXECUTIONS`: true for owner, admin and supervisor; false for agent; for any other role, `matchedPermissions.includes(PERMISSIONS.EXECUTIONS_READ)`. The UI shows only when `executionsService.isConfigured()`.
  - Visible card ids → one `summary(...)` call after the list loads, stored in `executionsBadge[agentId] = {attention: failed+stopped, running: boolean}`.
  - **Card:** icon button `manage_history`, tooltip "Executions", shown for every agent type.
    - A red badge with `attention` when it is above 0, with the tooltip "{{n}} executions need attention in the last 24 hours".
    - A blue dot when `running`.
  - **Menu:** item "Executions".
  - **Header:** link "All executions".
  - **Navigation:** `project/:pid/bots/:root_id/executions` and `project/:pid/bots/executions`. Use the root id: `bot.root_id || bot._id`, as the agent id elsewhere.

- [ ] **Step 1: Write the failing specs:**
  - `button hidden when not configured`
  - `button hidden for agent role`
  - `badge shows failed+stopped count`
  - `click navigates to the agent executions route with the root id`
- [ ] **Step 2: Run them to see them fail, implement, run them to see them pass.** `--include='src/app/bots/bots-list/**/*.spec.ts'`
- [ ] **Step 3: Commit.** `git commit -m "feat(executions): executions entry and badges on agent cards"`

### Task 19: Routes and the executions list page

**Files:**
- Create: `src/app/bots/executions/executions.module.ts`, `executions-routing.module.ts`, `executions-list/executions-list.component.{ts,html,scss}`, `shared/execution-status-chip.component.ts`
- Modify:
  - `src/app/app.routing.ts`: add these routes **before** `project/:projectid/bots` (l.1324) and before `project/:projectid/bots/:faqkbid/:type` (l.1520):
    - `{ path: 'project/:projectid/bots/executions', loadChildren: …ExecutionsModule, canActivate: [AuthGuard] }`
    - `{ path: 'project/:projectid/bots/:botid/executions', loadChildren: …ExecutionsModule, canActivate: [AuthGuard] }`
  - `src/assets/i18n/en.json`
- Test: `executions-list.component.spec.ts`

**Interfaces:**
- Produces:
  - Module child routes: `''` → `ExecutionsListComponent`; `':executionid'` → `ExecutionDetailComponent` (Task 20).
  - The list follows spec §11.3:
    - agent switcher;
    - filters: search id, trigger (defaults to unattended), status, "with failure conditions", period (defaults to 7 days);
    - clickable status counters;
    - columns: Status, Trigger, Started, Blocks, Failure cond., Vars changed, Duration; plus an Agent column in the all-agents view;
    - a warning icon when `trace_complete === false`;
    - Load more (cursor);
    - the two empty states.
  - Polling: every 10 s while any visible row is `running`. Stops on destroy.
  - Permission: the component checks `PERMISSION_TO_VIEW_EXECUTIONS` (same rule as Task 18) and shows the dashboard's usual "no permission" view otherwise.
  - `ExecutionStatusChip`: one chip per status, with the colors and the struck "destroyed" of §11.3. All statuses are defined, so later phases add no new chips.

- [ ] **Step 1: Write the failing specs:**
  - `route bots/:botid/executions resolves to the list, not FaqComponent`: RouterTestingModule with the real `appRoutes`
  - `default filter requests trigger=unattended and from = now-7d`
  - `load more appends with next_cursor`
  - `polling stops when no row is running`
  - `empty state text with and without filters`
- [ ] **Step 2: Run them to see them fail, implement, run them to see them pass.** `--include='src/app/bots/executions/**/*.spec.ts'`
- [ ] **Step 3: Commit.** `git commit -m "feat(executions): executions list page under bots"`

### Task 20: Execution detail: timeline, Flow state panel, Flow state tab

**Files:**
- Create: `src/app/bots/executions/execution-detail/execution-detail.component.{ts,html,scss}`, `shared/flow-state-panel.component.{ts,html,scss}`, `shared/var-history-drawer.component.ts`
- Modify: `src/assets/i18n/en.json`
- Test: `execution-detail.component.spec.ts`, `flow-state-panel.component.spec.ts`

**Interfaces:**
- Consumes: `get`, `state`, `history` (Task 17).
- Produces, following spec §11.4:
  - **Header:** agent, trigger, version, status chip, error code, short id, started, duration, conversation link (when `conversation_link` is set), lineage strip.
    - No control buttons in Phase 1. `allowed_controls` is empty; the button row renders from it, so Phase 2 only fills it.
  - **Tabs:** Timeline and Flow state. The Audit tab is Phase 4.
  - **Timeline:**
    - one row per step: time, outcome icon, block name, outcome, "{{n}} vars changed", duration;
    - an [All] / [Not successful] toggle;
    - a thin row between steps when `step.outside` is not empty: "{{n}} variables changed by the incoming message ({{keys}})" for `message_in`, or "{{n}} variables changed outside the flow" for `external`;
    - expanding a step shows its actions (type, title, outcome, exit, error code) and a `FlowStatePanel` loaded on demand with `state(step.seq)`.
  - **`FlowStatePanel`:**
    - Inputs: `vars: VarView[]`, `actionTitles: {[action_id]: string}`, `showSystem = false`.
    - Changed variables first and highlighted.
    - Values masked as `••• (size)` with the type. "= unchanged" when `!changed`.
    - "Changed by": the action title, "incoming message", "block parameters" or "outside the flow".
    - The "Show system variables" toggle shows the `reserved` variables.
  - **Flow state tab:**
    - a dropdown over the steps and a Before / After toggle;
    - the whole state at that point;
    - clicking a variable opens `VarHistoryDrawer` with `history(key)`;
    - "show all" after 50 variables *(my call, §15)*.
  - **Polling:** every 2 s while `running`, otherwise none.

- [ ] **Step 1: Write the failing specs:**
  - `outside row text for message_in and external`
  - `panel sorts changed first and masks values`
  - `system variables hidden until toggled`
  - `by labels map action ids to titles`
  - `Flow state tab switches before/after`
  - `history drawer lists changes in order`
  - `polling only while running`
- [ ] **Step 2: Run them to see them fail, implement, run them to see them pass.** `--include='src/app/bots/executions/**/*.spec.ts'`
- [ ] **Step 3: Build.** `npx ng build --configuration development`. Expected: success, no new warnings in the executions files. Then `rm -rf .angular/cache`.
- [ ] **Step 4: Commit.** `git commit -m "feat(executions): execution detail with timeline and flow state"`

### Task 21: Links from the conversation and the webhook logs

**Files:**
- Modify:
  - the conversation detail component that renders request attributes (find it: `grep -rn "attributes" src/app/ws_requests --include=*.html -l`, then look for where `request.attributes` is shown)
  - `src/app/bots/flow-webhooks-logs/flow-webhooks-logs.component.{ts,html}`
  - `src/assets/i18n/en.json`
- Test: the specs of those components (add cases)

**Interfaces:**
- Produces:
  - "Execution ↗" when `request.attributes.execution_id` is set and the user has `PERMISSION_TO_VIEW_EXECUTIONS`. It links to `project/:pid/bots/:agent/executions/:execution_id`. The agent is the bot participant's root id; if it is unknown, use `project/:pid/bots/executions?q=<execution_id>`.
  - On the webhook logs page: "View executions" → `project/:pid/bots/:botid/executions`.

- [ ] **Step 1: Write the failing specs:** `link shown only with execution_id and permission`, `webhook logs link target`.
- [ ] **Step 2: Run them to see them fail, implement, run them to see them pass, build.**
- [ ] **Step 3: Commit.** `git commit -m "feat(executions): links from conversation detail and webhook logs"`

---

## Part E — local environment and acceptance

### Task 22: dev-env `exec` profile, keys, seed

**Files** (in `tiledesk-dev-env.worktrees/execution-traceability`):
- Modify:
  - `components.sh`: add `"executions|Tiledesk/tiledesk-executions|main|Dockerfile|exec"` (not on GitHub yet, so `EXECUTIONS_PATH` is required)
  - `bin/dev`: add `compose/exec.yml` to `COMPOSE_FILES` the same way as the other files
  - `compose/nginx/tiledesk.conf`: `location /executions/api/` → `http://executions-api:3000`, path kept
  - `.env.example`: add `EXECUTIONS_PATH=` and the exec lines
  - `.gitignore`: add `.exec/`
  - `docs/gotchas.md`: one entry per surprise met while doing this
- Create:
  - `compose/exec.yml`:
    - services `executions-api`, `executions-ingest`, `executions-jobs` (one image, commands `api` | `ingest` | `jobs`), profile `exec`, Mongo database `tiledesk-executions` on the infra Mongo;
    - **environment additions merged into the existing services:**
      - `chatbot`: `EXECUTIONS_ENABLED`, `EXECUTIONS_AMQP_URL`, `EXECUTIONS_SEAL_PUBLIC_KEY`, `EXECUTIONS_SEAL_KID`, `EXECUTIONS_STATE_HASH_KEY`
      - `server`: `EXECUTIONS_AMQP_URL`
      - `dashboard`: `EXECUTIONS_BASE_URL=/executions/api/v1/`
    - adds the profile `exec` to `dashboard` and `proxy` (`profiles: [ui, exec]`), so `infra,core,exec` starts them without chat21, cds, ionic, widget or llm (see Storage);
    - Do not edit `compose/core.yml` or `compose/ui.yml`.
  - `bin/exec-disk`: prints the Mac and Docker free GB (the two commands in Storage), and exits 1 when either is under its threshold (20 GB / 15 GB).
  - `bin/exec-rebuild <service>`:
    - runs `bin/exec-disk` first;
    - records `docker image inspect tiledesk-exec-<service> -f '{{.Id}}'`;
    - runs `COMPOSE_PROJECT_NAME=tiledesk-exec bin/dev build <service>`;
    - removes the recorded id with `docker rmi` only if it differs from the new one and `docker ps -a --filter ancestor=<id>` is empty.
  - `bin/exec-keys`: writes `.exec/exec.env`. It creates an RSA-3072 keypair (public key base64 for tybot, private key kept for Phase 4), a `kid` (`local-<date>`) and a 32-byte hash key. It is idempotent: it never overwrites an existing file.
  - `bin/seed-executions`: idempotent; through the server API as the seeded admin:
    - creates and publishes "Exec demo · webhook" (webhook start, the blocks of Task 7's fixture, the failing request pointing at a closed port);
    - creates and publishes "Exec demo · automation" (two set-attribute blocks);
    - adds a supervisor user and an agent user to the project;
    - prints their ids and the webhook URL.

- [ ] **Step 1: Bring the stack up.**
  - `bin/exec-disk`, then `COMPOSE_PROJECT_NAME=tiledesk-exec EXECUTIONS_ENABLED=true COMPOSE_PROFILES=infra,core,exec bin/dev up`, with `CHATBOT_PATH`, `SERVER_PATH`, `DASHBOARD_PATH` and `EXECUTIONS_PATH` pointing at the four feature worktrees.
  - Then `bin/seed`, `bin/exec-keys` and `bin/seed-executions`.
- [ ] **Step 2: Smoke test.**
  - `bin/smoke` passes.
  - `curl -s localhost:8081/executions/api/healthz` returns `{"ok":true}`.
  - `docker compose -p tiledesk-exec logs executions-ingest` shows the queue bound. Record the after-Task-22 entry in `phase1-storage.md`.
- [ ] **Step 3: Commit.** `git commit -m "feat: exec profile for tiledesk-executions, keys and seed"`

### Task 23: Phase 1 local acceptance

**Files:**
- Create: `docs/superpowers/notes/phase1-acceptance.md` (in the tybot worktree). For each scenario: what was run, what was seen, pass or fail.

- [ ] **Step 1: Webhook run that ends in a failure condition.**
  - Fire the seeded webhook.
  - Expected:
    - the execution appears under the agent with trigger `webhook`;
    - its blocks show before/after state;
    - `order_total` and `status` are attributed to their set-attribute actions;
    - the web-request block shows `failure_condition`, and `failure_conditions` is 1;
    - the status is `waiting`, then `completed` (`closed`) after closing the conversation from the dashboard.
- [ ] **Step 2: Scheduled start.**
  - Call the server's `POST /webhook/scheduled-start` with the shared-secret header (read its env name in `routes/webhook.js` ~l.377 and set it in `compose/exec.yml`).
  - Expected: trigger `scheduled` and `start_point_id` set.
- [ ] **Step 3: Automation run.**
  - `POST /api/modules/tilebot/block/<pid>/<bot>/<block>` with `async: true`.
  - Expected: no conversation link, status `completed` (`execution.ended`).
- [ ] **Step 4: Jump across pods.**
  - `bin/exec-disk`, then `COMPOSE_PROJECT_NAME=tiledesk-exec bin/dev up -d --scale chatbot=2` (same image, no new build), then fire the webhook 10 times.
  - Expected: every execution has no "outside the flow" row for changes made by actions, and `trace_complete` is never false.
- [ ] **Step 5: Subagent.**
  - Run a seeded agent that calls a subagent.
  - Expected: one execution, with the subagent's steps carrying the subagent's agent id. No `conversation.bot_replaced` was published (check the ingest logs).
- [ ] **Step 6: Roles.**
  - As the supervisor: list and detail work, and no values are visible.
  - As the agent: the API answers 403, and there is no Executions button.
- [ ] **Step 7: Flag off.**
  - Restart with `EXECUTIONS_ENABLED=false` and repeat Steps 1 and 3.
  - Expected:
    - the same replies;
    - `docker compose -p tiledesk-exec exec redis redis-cli --scan --pattern 'exec:*'` prints nothing;
    - the queue gets no new messages.
  - The tybot suite matches the baseline.
- [ ] **Step 8: Measure the hot path.**
  - With the flag on and off, time 50 webhook runs end to end (first message → `execution.idle`). Record the p95 difference per action next to §12's 1–3 ms budget.
- [ ] **Step 9: Record the storage.** Add the after-Task-23 entry to `phase1-storage.md`, and list what the Storage cleanup would free. Do not run the cleanup without the user's go-ahead.
- [ ] **Step 10: Commit the notes.** `git commit -m "docs: phase 1 local acceptance results"`. Report to the user before planning Phase 2.
