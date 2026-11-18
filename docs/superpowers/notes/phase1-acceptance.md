# Phase 1 local acceptance (2026-11-09)

Stack: `COMPOSE_PROJECT_NAME=tiledesk-exec`, profiles `infra,core,exec`, from the four
`feature/execution-traceability` branches (chatbot `d34d1209`, server, dashboard, executions `16ad33d`;
dev-env `ec31c1e`, then `a88370b` for Step 2). Project `6af2301d8adf5f00136aa7b0`.
Screenshots are in `phase1-acceptance/`.

| Step | Result |
|---|---|
| 0. Rebuild tybot with the root_id fix | PASS |
| 1. Webhook run ending in a failure condition | PASS |
| 2. Scheduled start | PASS (one observation: `source_id` is null) |
| 3. Automation run | PASS |
| 4. Jump across pods (2 replicas, 10 runs) | PASS (needed a round robin in front of tybot, see below) |
| 5. Subagent | PASS (subagent demo agents created for the test, not in the seed) |
| 6. Roles (API and UI) | PASS |
| 7. Flag off | PASS |
| 8. Hot path | RECORDED, over budget at p95: +25 ms per run, about 5.0 ms per action vs the 1–3 ms of §12 |
| 9. Storage | recorded in `phase1-storage.md` |

Accounts: `supervisor@tiledesk.local` (supervisor) and `exec-agent@tiledesk.local` (agent) from
`bin/seed-executions`. `admin@tiledesk.com` cannot be used: it is the server's hard-coded superadmin,
`/project_users/me` answers 500 and the executions API 503 `role_unavailable`. For the admin view I
created `exec-admin@tiledesk.local` with an inline signup + invite (role `admin`), as `bin/seed-executions`
does. It is not in the seed.

## 0. Rebuild tybot (chatbot `d34d1209`, root_id read from Mongoose documents)

```
CHATBOT_PATH=../tiledesk-chatbot bin/exec-rebuild chatbot
  before: sha256:2d3672e5b206...   after: sha256:6fbc2118cbe7...
  tiledesk-exec-chatbot: 6fbc2118cbe7; the old 2d3672e5b206 went with its tag (containerd image store)
COMPOSE_PROJECT_NAME=tiledesk-exec COMPOSE_PROFILES=infra,core,exec bin/dev up --no-deps chatbot
```
The container runs the new image, and `tybotRoute/executions/botIdentity.js` in it reads `root_id`, `_doc.root_id` and `toObject().root_id`.

Cold-cache check: I deleted the cached published bot (`cacheman:cachegoose-cache:faq_kbs:id:6af230488adf5f00136aa986`)
before Step 1's run. Before the fix, that first run was recorded as `test: true`. The cold run `01a1c21a…` now has
`agent_id` = the draft `6af230488adf5f00136aa964` and `test: false`. **PASS.**

## 1. Webhook run that ends in a failure condition

```
POST /api/webhook/b93z3blh76uc10nqtd6iaby0wz8z37mr {"order":"A1"}
  -> {"success":true,"request_id":"support-group-…-64e0ce487f234f8c9c87aee7021a11e6"}
GET /executions/api/v1/projects/<pid>/executions?agent_id=6af230488adf5f00136aa964   (supervisor)
  -> {"_id":"01a1c21a-ac45-70ef-9992-3c4abe52c1bf","agent_name":"Exec demo · webhook","status":"waiting",
      "trigger":{"type":"webhook","source_id":"b93z3blh76uc10nqtd6iaby0wz8z37mr","start_point_id":"start"},
      "steps_count":3,"failure_conditions":1,"test":false}
```
Detail, read with the admin `exec-admin`:
- Steps:
  - `start`: success. Actions `act_total` and `act_status` (setattribute) and `act_goto_check` (intent, exit `jump`).
  - `check`: outcome `failure_condition`, exit `false`. `act_fail_request` (webrequestv2) also has outcome `failure_condition`.
  - `after`: success (reply).
- Execution: `failure_conditions: 1`, `actions_count: 5`, `last_seq: 13`, `missing_seq: []`, `agent_version` 6af230488adf5f00136aa986.
- State before/after for each block (`/state?step_seq=`, changed rows):
  ```
  2  [('order_total', None, 'string', 4, 'act_total'), ('status', None, 'string', 5, 'act_status')]
  7  [('status_code', None, 'number', 4, 'act_fail_request')]
  10 [('transcript', None, 'string', 33, 'act_done')]
  ```
- `/state/history?key=order_total` gives `by: "act_total"`, op `add`, with a hash. `key=status` gives `by: "act_status"`.
- The 23 variables set by the incoming message are rows `by: "message_in"` in `outside`.

Closing from the dashboard (signed in as `exec-admin`):
- Conversation detail → **Resolve**, then the toast "Conversation successfully resolved" (`step1-conversation-resolved.jpg`).
- The execution became `{'status': 'completed', 'end_reason': 'closed', 'ended_at': '2026-11-09T21:00:11.037Z', 'missing_seq': []}`.
- The conversation page shows the **Execution** link (`step1-conversation-execution-link.jpg`).
- The execution page shows the timeline with before → after per block. Values are masked as `••• (4 B)`, and "Changed by" names the action (`step1-admin-execution-detail.jpg`).

**PASS.**

Observations:
- The executions page header still reads "Conversation details" when you reach it from a conversation. It is cosmetic.
- `trace_complete` is `null`, not `true`, on every execution. Only the jobs re-check ever writes it (`false`), so "never false" is the check that applies.

## 2. Scheduled start

What it needs: the route answers 503 until `scheduledStartRules.isConfigured()` is true. That check is env only: `SCHEDULED_START_BACKEND=scheduler` plus `SCHEDULER_SERVICE_URL`, `SCHEDULER_API_TOKEN` and `SCHEDULED_START_TOKEN`. The route also answers 410 unless the webhook has an enabled `scheduled_live`. The happy path never calls the scheduler.

How I set it up:
- dev-env commit `a88370b`: compose/exec.yml passes the three vars through to the server, empty by default (so 503 as before). I also added a README line and gotchas entries.
- I recreated the server with dummy values:
  ```
  SCHEDULED_START_BACKEND=scheduler SCHEDULER_SERVICE_URL=http://scheduler.invalid:9 SCHEDULER_API_TOKEN=local-unused \
    bin/dev up --no-deps server
  ```
- With no `scheduled_live`, the route answered `410 {"error":"Scheduled start is no longer active"}`. The server logged `ENOTFOUND scheduler.invalid` while taking the workflow offline, and swallowed it.
- I wrote `scheduled_live` directly in Mongo, because publish would sync it from a real scheduler, which this env does not have:
  `db.webhooks.updateOne({chatbot_id:"6af230488adf5f00136aa964"},{$set:{scheduled_live:{enabled:true,block_id:"start",schedule:{…daily…},mapping:{source_name:"Local schedule",payload:{origin:"scheduled-acceptance"}}}}})`

```
POST /api/webhook/scheduled-start  x-auth-token: local-scheduled-start-token
  {"id_project":"6af2301d8adf5f00136aa7b0","chatbot_id":"6af230488adf5f00136aa964"}
  -> 202 {"success":true,"request_id":"support-group-…-f0eb7bf160d54ca4a3f2d51e5b06bb3d"}
(wrong token -> 401 {"success":false,"error":"Unauthorized"})
execution 01a1c21d-d607-770c-9edf-786ab5e48ffc:
  trigger {'type': 'scheduled', 'source_id': None, 'start_point_id': 'start'}, test False, steps start/check/after
  history key=origin -> by "message_in" (the mapping payload)
```
Afterwards I unset `scheduled_live`, and Step 7 recreated the server without the dummy scheduler vars. **PASS.**

Observation: for a scheduled start, `source_id` is null. tybot's `detectTrigger` reads `attributes.webhook_id || attributes.chatbot_id`, but the server's scheduled start sets neither in the request attributes; `chatbot_id` goes only into the lead. If the spec wants the chatbot as the source, this needs a fix (server or tybot).

## 3. Automation run

```
POST /api/modules/tilebot/block/6af2301d8adf5f00136aa7b0/6af230488adf5f00136aa9aa/start {"async":true} -> 200 {"success":true}
execution 01a1c21e-4794-72da-8c88-00fcfd3cc307 (agent 6af230488adf5f00136aa995 "Exec demo · automation"):
  trigger {'type': 'automation', 'source_id': None, 'start_point_id': None}
  request_id automation-request-…, conversation_link None, status completed, end_reason completed, duration_ms 35
  steps: start (act_step_a, act_goto_second) success; second (act_step_b) success
```
`end_reason: completed` is only set by the projector on `execution.ended`. **PASS.**

Note: `/api/modules/tilebot/*` is served by the tybot that the server embeds (npm `@tiledesk/tiledesk-tybot-connector` 3.0.2, `pubmodules/tilebot`). That copy builds the `automation-request-…` id and forwards the run to `TILEBOT_ENDPOINT/ext/<bot>`. So the run itself executes in the stack's tybot. `start_point_id` is null because the block comes in the text (`/#start`), not in `attributes.action`.

## 4. Jump across pods

```
bin/exec-disk                      # Mac 77 GB, Docker 35 GB
.exec/scale-chatbot.yml            # not committed: chatbot ports: !reset [], TILEBOT_ENDPOINT=http://tybot-lb, + tybot-lb
.exec/tybot-lb.conf                # nginx:1.27-alpine (already local): upstream tybot { server chatbot:3000; }
docker compose <bin/dev's files> -f .exec/scale-chatbot.yml up -d --no-deps --scale chatbot=2 chatbot tybot-lb
```
The same image ran on both replicas (no build).

Why a round robin was needed: with plain `--scale chatbot=2`, every run stayed on one pod.
- Inside a replica, glibc's address sorting puts the replica's own IP first for `chatbot`. `getent` returns both addresses, but `dns.lookup` always returned its own. So tybot's jump posts never left the pod.
- The server's posts are spread by DNS, but back-to-back calls reuse a keep-alive socket. My first try fired the 10 webhooks 1 s apart: all of them landed on chatbot-1.
- The second try spaced them 7 s apart. The runs were spread (6 on chatbot-1, 4 on chatbot-2), but no run changed pod mid-flow.
- In Kubernetes, a ClusterIP plays the round-robin role, so a local cross-pod test needs one: hence the nginx in front of tybot.

With the round robin, 10 runs 7 s apart (webhook rate limit: 10 per minute):
```
chatbot-1 POST /ext: 10    chatbot-2 POST /ext: 20
per run (log lines with the request id): c1=5 c2=10 for all 10 runs
order in run 1: start on c2 (server -> c2), check on c2 (jump 1 via LB), after on c1 (jump 2 via LB)
```
Every run crossed pods at the `check → after` jump. The check over all 10 executions:
```
01a1c224-195f… waiting steps 3 trace_complete None missing [] last_seq 13 outside_rows 23 bad_outside []
   by {'order_total': ['act_total'], 'status': ['act_status'], 'status_code': ['act_fail_request'], 'transcript': ['act_done']}
… (same for all 10; outside_rows 23 or 25, all by "message_in": department_id/department_name come with some runs)
matched 10
```
No "outside the flow" row for a change made by an action, `trace_complete` never false, `missing_seq` empty. **PASS.**

Restored afterwards:
- `docker compose … rm -sf tybot-lb`, then `bin/dev up --no-deps chatbot`. That removed chatbot-2 and restored port 3001 and `TILEBOT_ENDPOINT=http://chatbot:3000`.
- The override files remain in `.exec/` (gitignored).

## 5. Subagent

`bin/seed-executions` has no agent that calls a subagent, so I created two with an inline script (not committed). I used the importjson route and `start_points/webhook`, then published both, as the seed does:
- "Exec demo · subagent child" `6af236ae5cce2200133a767a` (published …76a1). Block `start`: set `child_x`, reply, `returnstack`.
- "Exec demo · subagent parent" `6af236ae5cce2200133a7682` (published …76b9). Block `start`: set `parent_a`, then `callsubagent` with botId = the child draft and blockName `start`. Its `nextBlockAction` is `#after_return`. Block `after_return`: set `parent_b`, reply. Webhook `f502z80rqw6xnpui3b2cg8v4eqf5ao6l`.

```
POST /api/webhook/f502z80rqw6xnpui3b2cg8v4eqf5ao6l {} -> request support-group-…-f30732cfa4c8406095aed20d646fa937
executions with that request_id in Mongo: 1
01a1c225-b44f-7521-9a57-4a16205a0ccb agent 6af236ae5cce2200133a7682 (parent), status waiting, end_reason None,
  handed_to_bot_id None, steps 3, actions 7, missing_seq []
  2  start         6af236ae5cce2200133a7682 / …76b9  [act_parent_a setattribute, act_call_child callsubagent]
  7  start         6af236ae5cce2200133a767a / …76a1  [act_child_x setattribute, act_child_reply reply, act_return returnstack]
  12 after_return  6af236ae5cce2200133a7682 / …76b9  [act_parent_b setattribute, act_back reply]
```
The subagent's step carries the subagent's agent id and version. No `conversation.bot_replaced` was published:
- `executions-ingest` logged nothing in that window. A server event with no execution would log "conversation event parked".
- The execution did not end with `handed_to_bot`.
- The server publisher skips participant updates whose reason is `subagent_call`.

**PASS.**

Note: the publisher logs nothing on publish, so "check the ingest logs" can only show the absence of a parked or terminal event.

## 6. Roles

API (`E` = 01a1c21a…; supervisor = `supervisor@tiledesk.local`, agent = `exec-agent@`, admin = `exec-admin@`):
```
SUP  list 200 | summary 200 | detail 200 | state 200 | state/history 200
AG   list 403 | summary 403 | detail 403 | state 403 | state/history 403   {"error":"forbidden"}
ADMN list 200 | summary 200 | detail 200 | state 200 | state/history 200
admin@tiledesk.com list 503 {"error":"role_unavailable"}   (superadmin trap, see above)
?grant=… -> 400 (not_available_in_this_version)
```
No values in any response:
- The detail and state responses contain neither the string `"42"` nor `"new"`, and have no `value` field. Only type, size and HMAC hashes are there.
- `sealed_data` holds 8 records for the execution with `alg: RSA-OAEP-256+A256GCM`, `kid: local-20261109`, and `ct`/`iv`/`tag`/`wrapped_key`.

UI (browser pane, http://localhost:8081/dashboard/):
- Supervisor:
  - The Flows list shows the **All executions** button and an **Executions** icon per agent (`step6-supervisor-agents-list.jpg`).
  - The per-agent list shows counters and filters (`step6-supervisor-executions-list.jpg`).
  - The detail timeline shows before → after per block with values masked `•••` (`step6-supervisor-execution-detail.jpg`).
- Agent:
  - The Flows list redirects to "Unauthorized access!" (the existing role rule), so there is no Executions button (`step6-agent-flows-unauthorized.jpg`).
  - The executions route, opened directly, also shows "Unauthorized access!" (`step6-agent-execution-route-unauthorized.jpg`).
  - The conversation detail has no Execution link (`step6-agent-conversation-no-execution-link.jpg`).
- Admin: see Step 1's screenshots.

**PASS.**

## 7. Flag off

```
before: exec:* keys 318 | executions.ingest publish 1040 ack 1040 | exchange publish_in 1040 | executions in Mongo 80
EXECUTIONS_ENABLED=false bin/dev up --no-deps chatbot server
  chatbot: EXECUTIONS_AMQP_URL= EXECUTIONS_ENABLED=false
  server:  EXECUTIONS_AMQP_URL=   log "executions-publisher disabled: EXECUTIONS_AMQP_URL not set"
```
Step 1 again:
- `POST /api/webhook/…` returned `support-group-…-1baeefc77a4a4bfc826d2067d98ffe64`.
- Messages `/start` and `done`, the same as with the flag on.
- tybot params `order_total "42"`, `status "new"`, `status_code 1000`, identical to a flag-on run.
- Closed it with `PUT /api/<pid>/requests/<rid>/close`, the call the dashboard's Resolve makes.

Step 3 again: `POST /api/modules/tilebot/block/…/start {"async":true}` returned 200.

Redis MONITOR across one more webhook run and one more automation run: 261 commands, none on an `exec:` key.

After those runs and the 50 flag-off runs of Step 8:
```
exec:* keys 318 (new keys vs before: 0) | executions.ingest publish 1040 ack 1040 | exchange publish_in 1040 | DLQ 0 | executions 80
```
Keys from the flag-on runs existed before the switch (TTL around 602 000 s), so I compared the scan lists: no new key. The `--pattern 'exec:*'` scan prints nothing new.

Tybot suite: not re-run. It ran after the last tybot commit (`d34d1209`, Task 7b report: 494 passing, 249 failing, failing set identical to `phase1-tybot-baseline.txt`). The image under test is that commit. **PASS.**

## 8. Hot path

Method:
- 50 runs of the demo webhook per mode, serial, 6.5 s apart (webhook rate limit), single chatbot replica.
- Duration of a run: the server's `createdAt` of the first message (`/start`, written when the run starts) to the `createdAt` of the bot's last reply (`done`), read from Mongo `messages`. The same measure works with the flag off, where no `execution.idle` exists.
- Each run has 3 blocks, 5 actions (setattribute ×2, intent, webrequestv2, reply) and 3 messages into tybot (the webhook plus 2 jump posts).

```
flag on : n 50  min 46  p50 54  p95 72  max 76  mean 54.8 ms
flag off: n 50  min 34  p50 40  p95 47  max 54  mean 40.4 ms
delta   :        p50 +14 ms   p95 +25 ms   mean +14.4 ms per run
flag on, from the API: execution start -> last step end (≈ execution.idle): p50 48, p95 60 ms;
  sum of block durations: p50 32, p95 41 ms; 50/50 executions, trace_complete false 0, missing_seq 0
```
Per action, if the whole difference is charged to the 5 actions: p50 2.8 ms, **p95 5.0 ms**, mean 2.9 ms. §12 budgets 1–3 ms per action. The p95 is over that budget; the mean is at its top.

The per-action share cannot be isolated from the end to end:
- the difference also includes the per-block work (block-entry `HGETALL`, `exec:{id}:state` write);
- it includes the per-message resolve calls, three per run;
- a cold execution start adds more.

Redis MONITOR, one webhook run plus one automation run (8 actions, 5 blocks):

| | flag off | flag on |
|---|---|---|
| commands | 261 | 358 (+97) |
| `HGETALL` | 6 | 19 |
| `INCR` | 13 | 35 |
| commands on `exec:` keys | 0 | 56 (22 INCR, 10 GET, 7 SET, 4 HSET, 4 HGET, 4 EXPIRE, 3 EXISTS, 1 EVAL, 1 DEL) |

Some of those are async (not awaited). The flag-on sample was taken just after a restart, so a few of its cache `SETEX`/`GET`s are cold-cache effects.

Everything runs on Docker Desktop on a Mac, where Redis round trips are slower than in a cluster. **RECORDED, over budget at p95.** The controller decides.

## Final state

The stack is back to normal: flag on, one chatbot replica on host port 3001, and the server has no scheduler vars.
- chatbot: `EXECUTIONS_ENABLED=true`, AMQP set. Server log: `executions-publisher listening`.
- A run after the restore was recorded (`01a1c235…` automation, completed).
- tybot-lb and chatbot-2 are removed.
- Accounts and agents this task added to the local data:
  - `exec-admin@tiledesk.local` (admin);
  - the two subagent demo agents, published, with a webhook;
  - about 75 extra executions (all runs above).
