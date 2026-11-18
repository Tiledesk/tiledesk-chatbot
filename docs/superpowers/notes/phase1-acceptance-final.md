# Phase 1 end-to-end acceptance on the final code (2026-11-10)

Code under test: chatbot `71c49c78` (fix wave `fed8e6fe`), server `eebc7aa8`, executions `22617f1`,
dashboard `26997f121`, dev-env `a88370b` (then `d62fdb6`, see T1/T2). Stack `COMPOSE_PROJECT_NAME=tiledesk-exec`,
profiles `infra,core,exec`, project `6af2301d8adf5f00136aa7b0`. Same method and users as the first run
(`phase1-acceptance.md`). Screenshots are in `phase1-acceptance-final/`.

| Item | Result |
|---|---|
| Rebuild of the 4 images, containers on the final code | PASS |
| 1. Webhook run with a failure condition, closed from the dashboard | PASS |
| 2. Scheduled start, `trigger.source_id` = agent root id (T5) | PASS |
| 3. Automation run | PASS |
| 4. Jump across pods (2 replicas + round robin, 10 runs) | PASS |
| 5. Subagent | PASS |
| 6. Roles (API and UI) | PASS |
| 7. Flag off | PASS |
| S1/V1 `conversation.closed` with `closed_by` null / missing | PASS (crafted envelopes; no API route omits `closed_by`) |
| S1 `execution.started` with `agent_name` null | PASS (crafted envelope) |
| S2 write-back on an expired `exec:{id}` hash | PASS |
| S3 close with a replace-bot child | PASS |
| S4 "Vars changed" counts non-reserved keys | PASS (10 instead of 25–27; see the observation) |
| S5 CORS allow-list | PASS |
| T1/T2 broker down 32 s: buffer, order, no crash | PASS |
| T1/T2 ingest comes back after the broker | FAIL on the first try (local env: no restart policy), PASS after dev-env `d62fdb6` |
| D1 agent switch in the executions list | PASS |
| D2 detail keeps updating with slow answers | PASS (3 s delay injected on every executions request) |
| D3 deletion shown as deleted in the history drawer | PASS |
| D4 no "Unauthorized" flash on direct load | PASS |
| Custom role with / without `executions_read` | PASS |
| 8. Hot path | RECORDED: +13 ms p50, +15 ms p95 per run (first run +14 / +25) |

Accounts: `supervisor@`, `exec-agent@` (seed), `exec-admin@tiledesk.local` (admin, from the first run). New in this
run, not in the seed: `exec-custom@tiledesk.local` (custom role `exec_reader`), `exec-custom2@tiledesk.local`
(custom role `exec_noperm`), and four demo agents: "Exec demo · replace parent/child" (S3, webhook
`9kclpbjhhbfp8synum53i0kn8xxh19tu`), "Exec demo · delete var" (D3), "Exec demo · slow" (D2, two 20 s waits).

## Rebuild

`bin/exec-disk` (Mac 77 GB, Docker 35 GB), then from the dev-env folder, one at a time (`*_PATH` from `.env`:
`../tiledesk-chatbot`, `../tiledesk-server`, `../tiledesk-executions`, `../tiledesk-dashboard`, the main folders):

| image | before | after | built |
|---|---|---|---|
| `tiledesk-exec-chatbot` | 6fbc2118cbe7 | bb6ba7a19d39 | 07:36:23Z |
| `tiledesk-exec-server` | 2a2359e52996 | d70854137a71 | 07:36:40Z |
| `tiledesk-exec-executions-api` | de41dc5a96d8 | d137bd14f483 | 07:36:54Z |
| `tiledesk-exec-dashboard` | 14e63b6c1c72 | fb5fb9be2b43 | 07:38:08Z |

Each old id "went with its tag (containerd image store)". Then `bin/dev up -d` (same project and profiles):
all 10 containers healthy, each on the new id. Every commit is from 2026-11-09 ≤ 23:27, every image from
2026-11-10 07:36–07:38. The code in the running containers:
- chatbot: `tybotRoute/executions/TraceEmitter.js` has `windowMax` (T1); `trigger.js` has the scheduled fallback `agentId` (T5).
- server: `pubmodules/executions-publisher/index.js` has `closed_by: request.closed_by || null` (V1) and the connect timeout (V2). Log: `executions-publisher listening`.
- executions: `dist/config.js` and `dist/api/app.js` read `EXECUTIONS_CORS_ORIGINS` (S5). Logs: `api started`, `ingest consuming`.
- dashboard: `main.6f375ab3619cff4d.js`; `assets/i18n/en.json` and chunk `1395.295d15bab6b8477a.js` have the new `Executions.Ops` labels (D3).

**PASS.**

## 1. Webhook run with a failure condition

```
POST /api/webhook/b93z…37mr {"order":"A1"} -> 202 request support-group-…-bf4bb8f8…
01a1c466-eac7… agent 6af230488adf5f00136aa964 "Exec demo · webhook" status waiting
  trigger {webhook, b93z…37mr, start}  steps 3  actions 5  failure_conditions 1  test false  missing_seq []  last_seq 13
  start  success  jump   [act_total, act_status, act_goto_check(jump)]
  check  failure_condition false  [act_fail_request webrequestv2 failure_condition]
  after  success  [act_done]
  state changed rows: 2 order_total/act_total, status/act_status · 7 status_code/act_fail_request · 10 transcript/act_done
```
This was the first run after the chatbot restart (cold bot cache): `test: false` and `agent_id` = the draft, so the
root_id fix holds. Closed from the dashboard as `exec-admin` (Resolve, `step1-conversation-resolved.jpg`):
`completed / closed`, `missing_seq []`. The conversation shows the Execution link
(`step1-conversation-execution-link.jpg`); the execution page shows the timeline (`step1-admin-execution-detail.jpg`).
**PASS.**

## 2. Scheduled start

Server recreated with `SCHEDULED_START_BACKEND=scheduler SCHEDULER_SERVICE_URL=http://scheduler.invalid:9
SCHEDULER_API_TOKEN=local-unused`, as in the first run.
```
no scheduled_live -> 410 "Scheduled start is no longer active"; wrong token -> 401
db.webhooks.updateOne({chatbot_id:"6af230488adf5f00136aa964"},{$set:{scheduled_live:{enabled:true,block_id:"start",…}}})
POST /api/webhook/scheduled-start -> 202 request support-group-…-6f733022…
01a1c468-de83… trigger {'type': 'scheduled', 'source_id': '6af230488adf5f00136aa964', 'start_point_id': 'start'}
history key=origin -> by message_in
```
`source_id` is now the agent's root id (first run: null). Afterwards `scheduled_live` was unset and the server
recreated without the scheduler vars (all three empty). **PASS.**

## 3. Automation run

```
POST /api/modules/tilebot/block/<pid>/6af230488adf5f00136aa9aa/start {"async":true} -> 200
01a1c469-2655… "Exec demo · automation" completed / completed, trigger {automation, null, null},
  conversation_link None, duration_ms 32, steps start (act_step_a, act_goto_second), second (act_step_b)
```
**PASS.**

## 4. Jump across pods

`.exec/scale-chatbot.yml` and `.exec/tybot-lb.conf` were still there. Same command as the first run
(compose files of bin/dev plus the override): `up -d --no-deps --scale chatbot=2 chatbot tybot-lb`.
10 webhook runs 7 s apart:
```
chatbot-1 POST /ext: 19   chatbot-2 POST /ext: 11
per run (log lines with the request id): c1=10 c2=5 for 9 runs, c1=5 c2=10 for 1 run  -> every run used both pods
all 10: waiting, steps 3, trace_complete None, missing_seq [], last_seq 13
  by {order_total: act_total, status: act_status, status_code: act_fail_request, transcript: act_done}
state_changes by message_in per run: 23 or 25 rows, none on order_total/status/status_code/transcript
```
Restored: `rm -sf tybot-lb`, `bin/dev up -d --no-deps chatbot` (chatbot-2 removed, port 3001,
`TILEBOT_ENDPOINT=http://chatbot:3000`). **PASS.**

## 5. Subagent

```
POST /api/webhook/f502…ao6l {} -> support-group-…-797fa847…  executions with that request_id: 1
01a1c46b-96ed… parent, waiting, handed_to_bot_id None, steps 3, actions 7, missing_seq []
  2  start         6af236ae…7682 / …76b9  [act_parent_a, act_call_child]
  7  start         6af236ae…767a / …76a1  [act_child_x, act_child_reply, act_return]
  12 after_return  6af236ae…7682 / …76b9  [act_parent_b, act_back]
```
The subagent step carries the subagent's id and version; ingest logged nothing (no parked or terminal event). **PASS.**

## 6. Roles

```
SUP  list 200 | summary 200 | detail 200 | state 200 | history 200
AG   all five 403 {"error":"forbidden"}
ADMN all five 200
admin@tiledesk.com all five 503 role_unavailable (superadmin trap, as before)
grant= on state and state/history -> 400 not_available_in_this_version
```
No values: detail + state contain neither `"42"` nor `"new"` nor a `value` field; `sealed_data` has 8 records for
the execution (`alg`, `kid`, `wrapped_key`, `iv`, `tag`, `ct`). UI: supervisor sees **All executions** and the
per-agent Executions icon (`step6-supervisor-agents-list.jpg`); the agent opening the executions route directly gets
"Unauthorized access!" (`step6-agent-execution-route-unauthorized.jpg`). **PASS.**

## 7. Flag off

```
before: exec:* keys 866 | executions.ingest publish 706 ack 706 | exchange publish_in 706 | DLQ 2 | executions 161
EXECUTIONS_ENABLED=false bin/dev up -d --no-deps chatbot server
  chatbot EXECUTIONS_ENABLED=false, EXECUTIONS_AMQP_URL=   server: "executions-publisher disabled"
webhook run: messages ['/start','done'], flowAttributes order_total "42", status "new"; closed (PUT …/close) 200
automation run: 200
Redis MONITOR (webhook + automation): 266 commands, 0 on exec: keys
after those and the 50 flag-off runs: exec:* keys 866 (new: 0) | publish 706 ack 706 | publish_in 706 | DLQ 2 | executions 161
```
(The queue counters restarted at 0 with the broker restart of T1/T2; before and after were read in the same broker life.)
Tybot suite not re-run here (the fix wave's own run covers `fed8e6fe`). **PASS.**

## Fix batch

### S1/V1: `conversation.closed` with `closed_by` null or missing

No API route closes a conversation without `closed_by`: `PUT /requests/:id/close`, user-request, `\close` message
actions and the chat21 webhook all pass one. The only callers that omit it are scheduled jobs
(`requestTaskSchedulerAgenda`, unresponsive requests after 2 days). So two envelopes were published to
`tiledesk.executions` (`exec.<pid>.conversation.closed`) through the management API, on real waiting requests of Step 4:
```
DLQ before 2
A: data.closed_by = null          (request …4fc81a8a) -> 01a1c469-c9dd completed / closed
B: data without closed_by         (request …513e0c6f) -> 01a1c469-e56a completed / closed
DLQ after 2
```
The 2 messages already in the DLQ are old (routing keys `exec.P1.*`, from 2026-11-09). **PASS.**

### S1: `agent_name` null

A crafted execution (`test: true`, request `acceptance-s1-…`): `execution.started` with `agent_name: null` and
`source_id: null`, `step.started` with `block_id`/`block_name` null, `step.completed`, `execution.ended`.
Result `01a1c4ff-0000-7000-8000-9f3a24858ce4`: `agent_name None`, completed / completed, steps 1, last_seq 4.
DLQ 2 -> 2, no ingest warnings. **PASS.**

### S2: write-back on an expired hash

```
01a1c46a-00f9… (waiting): keys exec:<id>, exec:<id>:state, exec:<id>:seq, TTL 604630
DEL exec:<id> -> 1; PUT …/close -> 200; execution completed / closed
EXISTS exec:<id> -> 0
control (01a1c46a-1c88…, hash present): status running -> completed, TTL 604625 -> 604623 (kept)
TTL scan of all 621 exec:* keys: none at -1
```
**PASS.**

### S3: close with a replace-bot child

Two new agents: "Exec demo · replace parent" (set `parent_p`, `replacebotv3` to the child, block `start`) and
"Exec demo · replace child" (set `child_y`, reply).
```
run A: parent 01a1c46d-526f completed / handed_to_bot (to …1328); child 01a1c46d-52ac waiting (parent_execution_id = parent)
  request attributes.execution_id = the child
  PUT …/close -> parent completed / handed_to_bot, child completed / closed
run B: same start; a crafted conversation.closed carrying the PARENT's execution_id (terminal)
  -> child 01a1c46d-a299 waiting -> completed / closed   (before the fix only the named execution matched)
```
DLQ unchanged. **PASS.**

### S4: "Vars changed"

The list now shows 10 for a webhook run (first run: 25–27), 9 for the scheduled run, 5 for the automation
(first run 13). The 10 are the non-reserved keys that changed: `order_total`, `status`, `status_code` (by actions)
plus `api_base_url`, `chatbot_id`, `order`, `payload`, `start_type`, `userFullname`, `webhook_http_method`
(by `message_in`, not flagged reserved by tybot). `transcript` is reserved and no longer counted.
**PASS** per the ruling (non-reserved keys). Observation: the review's "4 user changes" is not what the column
shows; message-in variables that tybot does not mark reserved still count.

### S5: CORS

```
EXECUTIONS_CORS_ORIGINS empty: OPTIONS …/executions Origin http://example.test -> 401, no Access-Control-* header
.exec/cors.yml (gitignored) sets EXECUTIONS_CORS_ORIGINS=http://example.test; recreated executions-api only
  preflight Origin http://example.test -> 204, Access-Control-Allow-Origin: http://example.test,
    Allow-Headers: Authorization,Content-Type, Allow-Methods: GET,POST, Vary: Origin
  preflight Origin http://evil.test    -> 204 without Access-Control-Allow-Origin (the browser refuses it)
  GET with Origin example.test -> 200 + ACAO; with evil.test -> 200, no ACAO
restored: executions-api recreated without the override (no CORS var, preflight 401 again)
```
**PASS.** Minor: the unlisted preflight still gets 204 with the Allow-Methods/Headers, only without ACAO.

### T1/T2: broker down

`docker compose -p tiledesk-exec stop rabbitmq`, 4 webhook runs 6.5 s apart and one automation run, start after 32 s.
- Conversations answered while the broker was down: each `["/start","done"]`.
- tybot: `RestartCount 0`, same `StartedAt`; no TraceEmitter warning, no crash.
- The buffered events reached the queue about 40 s after the broker was back (transport backoff up to 30 s): 61 messages
  (4 × 13 + 9).
- `executions-ingest` logged `amqp connection lost, exiting so the pod restarts` and **stayed Exited (1)**: the
  local services have no restart policy. Started by hand, it consumed the 61 events, DLQ 2 -> 2.
- Order (from `events_seen` insertion order): 0 out-of-order seqs; runs in sequence c91a, e29e, fc28, 15b2, 2f1b.
- The 4 webhook executions: waiting, steps 3, actions 5, last_seq 13, `missing_seq []`, `trace_complete` None;
  the automation `01a1c46f-2f1b` completed / completed.

Dev-env fix `d62fdb6` (`compose/exec.yml`: `restart: on-failure` on the three executions services, Kubernetes'
role locally). Second outage (30 s, one webhook run): ingest showed `restarting`, RestartCount 9 during the outage,
then `running healthy`; the run's execution `01a1c470-c1f8` arrived with last_seq 13 and `missing_seq []`.
**PASS** after the dev-env fix.

### D1: agent switch

Executions list of "Exec demo · webhook" (waiting 89, 25 rows, webhook triggers; `d1-list-agent-a-webhook.jpg`),
select switched to "Exec demo · automation": URL `…/bots/6af230488adf5f00136aa995/executions`, counters
running 0 / waiting 0 / failed 0 / stopped 0, 4 automation rows (`d1-list-agent-b-automation.jpg`). Back to webhook:
URL `…/6af230488adf5f00136aa964/executions`, waiting 89, 25 rows. **PASS.**

### D2: slow answers

"Exec demo · slow" (two blocks of 20 s waits) run as automation, detail page opened while `running`. In the page,
every request to `/executions/api/` was sent 3 s late (XMLHttpRequest `send` delayed; the poll period is 2 s):
```
sent 7, done 7, aborted 0
t=1 s running | 1 block   t=16 s running | 2 blocks   t=36 s completed | 2 blocks
```
(`d2-detail-updated-under-3s-delay.jpg`). **PASS.**

### D3: deletion in the history drawer

"Exec demo · delete var": `start` sets `temp_x`, `second` deletes it (`delete` action) and sets `after_delete`.
API history `[('act_set_tmp','add'), ('act_del_tmp','del', hash_after null)]`. The block shows
`temp_x  ••• (3 B) → —  delete temp_x` (`d3-block-delete-row.jpg`); the drawer shows `start added ••• (3 B)` and
`second deleted —` (`d3-history-drawer-deleted.jpg`). **PASS.**

### D4: direct load

The list and a detail URL loaded in a same-origin iframe, its text sampled every 25 ms for 9 s: "Unauthorized" and
"permission" never appeared; the list had its 25 rows at 241 ms. The direct loads of Steps 6 and D1 (full reloads)
showed no flash either. **PASS** (no comparison against the old build).

### Custom role

Created through the server roles API (`POST /<pid>/roles`, as admin): `exec_reader` `["executions_read"]` and
`exec_noperm` `["lead_read"]`; two users signed up and invited with those roles.
`GET /<pid>/project_users/me` returns an array with one project_user:
```
{"role": "exec_reader", "roleType": 1, "permissions": [], "rolePermissions": ["executions_read"], "status": "active", …}
{"role": "exec_noperm", "roleType": 1, "permissions": [], "rolePermissions": ["lead_read"], …}
```
So `/me` does carry `rolePermissions` (the role's permissions); `permissions` stays the user's own (empty).
This settles the T14 open question.
```
exec_reader: list 200 | detail 200 | state 200      exec_noperm: list 403 | detail 403 | state 403 {"error":"forbidden"}
```
The dashboard, signed in as the `exec_reader` user, shows the executions list (`custom-role-executions-list.jpg`). **PASS.**

## 8. Hot path

Same method: 50 serial webhook runs per mode, 6.5 s apart, one chatbot replica; duration = `createdAt` of `/start` to
`createdAt` of the last `done` in Mongo `messages`. Flag on first (warm), then flag off.

| | first run (11-09) | this run (11-10) |
|---|---|---|
| flag on p50 / p95 / mean | 54 / 72 / 54.8 ms | 60 / 73 / 62.8 ms (max 161, one outlier) |
| flag off p50 / p95 / mean | 40 / 47 / 40.4 ms | 47 / 58 / 47.4 ms |
| delta p50 / p95 / mean | +14 / +25 / +14.4 ms | **+13 / +15 / +15.4 ms** |
| per action (5 actions), p95 | 5.0 ms | **3.0 ms** |
| Redis commands, webhook + automation, off → on | 261 → 358 (+97) | 266 → 346 (+80) |
| commands on `exec:` keys | 56 | 52 (22 INCR, 8 GET, 7 SET, 4 HSET, 4 EXPIRE, 4 HGET, 2 EXISTS, 1 DEL) |

Flag on, from the API: execution start → last step end p50 55, p95 67 ms; sum of block durations p50 35, p95 43 ms;
50/50 executions, `trace_complete` false 0, `missing_seq` 0.

Reading: the p95 overhead dropped from +25 to +15 ms per run (3.0 ms per action, at the top of §12's 1–3 ms),
the p50 is the same. Both modes are 6–11 ms slower than on 11-09 (machine load: the flag-off baseline moved too), so
compare deltas, not absolutes. The pipelining (T3) cuts round trips more than commands: `MULTI/EXEC` 2 and `EVAL` 3
appear in the flag-on sample, `EXISTS` went 3 -> 2 on `exec:` keys. This run's flag-on sample was warm; the first
run's was taken right after a restart.

## What differed from the first run

- `trigger.source_id` of a scheduled run is the root id (was null).
- `vars_changed` 10 (was 25–27).
- `?grant=` on the execution detail answers 200: only `state` and `state/history` refuse it (400). That is the
  code since `a79b9a7`; the first run did not say which route it called.
- ingest does not come back by itself after a broker loss in the local stack until dev-env `d62fdb6`.
- Latency as above.

## Final state

Flag on (chatbot `EXECUTIONS_ENABLED=true`, server `executions-publisher listening`), one chatbot on port 3001,
`TILEBOT_ENDPOINT=http://chatbot:3000`, no tybot-lb, executions-api with no CORS variable, broker up, server
without scheduler vars, all containers healthy, executions services `restart: on-failure`. A run after the
restore was recorded (`01a1c482-a8da…` automation, completed). `.exec/scale-chatbot.yml`, `tybot-lb.conf` and
`cors.yml` remain, inactive (gitignored). Storage: `phase1-storage.md`, "after e2e re-run".
