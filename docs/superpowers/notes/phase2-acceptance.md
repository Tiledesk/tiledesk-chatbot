# Phase 2 local acceptance: stop and destroy (2026-11-10)

Code under test (the Task 14 images, not rebuilt): chatbot `f85336a2` (image e22b629902e1), server `6defd370`
(2ab953852619), executions `979b2bb` (45c997bbbd8f), dashboard `105799616` (734e9a3f17dd), dev-env `de48e90`.
Stack `tiledesk-exec`, profiles `infra,core,exec`, project `6af2301d8adf5f00136aa7b0`. Screenshots are in
`phase2-acceptance/`. Every control was clicked in the dashboard (Stop dialog, Stop now dialog, Destroy dialog);
the results were read from the executions API, Mongo (`tiledesk-executions`, `tiledesk`), Redis and the
container logs. Times are UTC unless the screenshot shows the dashboard's local time (UTC+1).

Users: `exec-demo-owner@` (owner: stop, destroy, Activities), `exec-demo-admin@` (admin), `supervisor@`,
`exec-agent@` (given a temporary custom role in Step 9, then restored). Passwords are in the dev-env seed.

| Step | Result |
|---|---|
| 1. Soft stop during the slow demo | PASS |
| 2. Hard stop during the hang agent | PASS |
| 3. Hard stop during an action without abort support | PASS (temporary Make agent, see the ruling) |
| 4. Stop while waiting, then a user message | PASS |
| 5. Automation with a sync caller | PASS |
| 6. Escalation (soft, then Stop now) | PASS |
| 7. Destroy a stopped webhook execution | PASS (one finding, F1) |
| 8. Reaper (chatbot killed mid-block) | PASS |
| 9. Roles | PASS |
| 10. Flag off | PASS (full suite: one extra failure explained, see below) |
| 11. Latency | RECORDED: +14.5 ms p50 / +12 ms p95 per run (Phase 1 final +13 / +15) |
| 12. Finish | PASS |

Local-env changes made for the run (all restored, see Step 12): the project's plan name was set to `Custom` so
the dashboard opens Activities (its trial plan, `Sandbox`, redirects `/activities` to the upsell page:
`ProjectProfileGuard`, plan C/F only); a temporary agent "Exec demo · slow make (T15 temp)"; a temporary custom
role `t15_exec_control` on `exec-agent@`.

## 1. Soft stop during the slow demo

"Exec demo · slow" (automation; `start`: set + 20 s wait, `second`: set + 20 s wait), started with
`POST /modules/tilebot/block/<pid>/6af2cdb201658600136d161c/start {"async":true}`. As the owner, Stop → Soft
stop 7 s into `start`:
```
01a1c587-7ca4…  stop_soft accepted  status running -> stopping (12:56:00.425)   (step1-owner-soft-stop-stopping.jpg)
start  success  act_slow_a setattribute 3 ms, act_wait_1 wait 20004 ms   ended 12:56:13.275
status stopped, stopped_at 12:56:13.277, stop_mode soft, steps_count 1, actions_count 2
Redis: exec:{id}, :seq, :state, :stop (the :owner lease is released)
```
The current block ran to its end, `second` never started, and the status became `stopped` 2 ms after the block.
Activities (`GET /<pid>/activities`): the owner gets `EXECUTION_STOP_SOFT` (actor Exec Owner, target execution,
`related` agent faq_kb, `actionObj {mode: soft, result: accepted, audit_id}`); the admin's list has no
`EXECUTION_*` verb. Dashboard: the owner's Activities page shows "Exec Owner soft-stopped execution 01a1c5 of
Exec demo · slow" (`step1-owner-activities-execution-rows.jpg`); the admin's page shows none, not even the
admin's own stop of Step 9 (`step1-admin-activities-no-execution-rows.jpg`). **PASS.**

Two earlier tries were too slow to land in `start` (the click arrived in the last block); one of them is the
first escalation try of Step 6. Observation: the Activities sentence for a *rejected* stop reads the same as
an accepted one ("Exec Owner hard-stopped execution …", for `result: rejected:stopped`), and both executions
show as `01a1c5`, the first 6 characters, which many ids share.

## 2. Hard stop during the hang agent

"Exec demo · hang" fired (`POST /webhook/qgwsxw…`), opened, Stop → Hard stop 14 s into the `hang` block:
```
01a1c589-b9df…  audit stop_hard accepted 12:58:34.189   stop_requested_at .192   stopped_at .196  (7 ms)
hang  interrupted  act_hang_request webrequestv2 interrupted 14163 ms
steps: start (success), hang (interrupted); "after" never ran
messages on the conversation: "/start" only (no "after the request")
chatbot log 12:58:34.196: DirWebRequestV2 resbody (empty) -> DirIntent move to intent -> "(TilebotService) execution aborted: jump not posted"
no POST /ext for that request after 12:58:21 (0 "Request Body" lines from 12:58:21 on)
```
The false exit was built by the directive and refused by the backstop. Screenshots `step2-stop-dialog.jpg`,
`step2-hang-hard-stopped-interrupted.jpg`. **PASS.**

## 3. Hard stop during an action without abort support

Ruling: any slow action without abort support. The email action takes ~10 ms here, so a temporary agent was
added: "Exec demo · slow make (T15 temp)" (draft 6af3156fe0adb20013243c96, published 6af3156fe0adb20013243cb2,
webhook `hyrz…xpk6`), block `start` = `make` POST to `http://blackhole/` (DirMake: axios, 20 s timeout, no
signal), then a set attribute `after_make` and a reply "made". Stop → Hard stop 10 s into the Make call:
```
01a1c58b-d19f…  audit stop_hard accepted 13:00:47.345 -> stopping   (step3-stopping-during-make.jpg)
act_make make  success  20008 ms  hard_degraded: true   (ended 13:00:57.177)
status stopped at 13:00:57.179; actions_count 1: act_after_make and act_made never ran; messages: "/start" only
```
The action ran to its 20 s timeout, then the stop applied before the next action (`step3-stopped-make-finished.jpg`).
**PASS.** Observation: the timeline row shows the action as "outcome success time 20.0 s"; `hard_degraded` is in
the API but not shown in the dashboard.

## 4. Stop while waiting

"Exec demo · webhook" run (`01a1c58c-94f0…`, `waiting` after start/check/after), Stop → Soft stop:
```
audit stop_soft accepted 13:01:37.164  status_before waiting  status_after stopped
stop_requested_at = stopped_at = 13:01:37.169      (step4-stopped-at-once.jpg)
POST /<pid>/requests/<rid>/messages {"text":"hello after stop"} as the owner (core has no widget) 13:01:45
-> messages_while_stopped: 1, no bot message after it (transcript: /start, done, hello after stop)
```
**PASS.**

## 5. Automation with a sync caller

`POST /modules/tilebot/block/<pid>/<slow>/start {"async":false}` held open by a script; Stop → Hard stop from
the dashboard 10 s in:
```
caller: start 13:02:19.721, answer 13:02:29.835 (10.1 s)  HTTP 409 {"error":"execution_stopped","execution_id":"01a1c58d-630d-7211-b36b-47c5b0d00c23"}
execution: audit 13:02:29.820, stopped_at .830, start interrupted (act_wait_1 wait interrupted 9898 ms)
```
One answer only (the caller unsubscribes on the first message). `step5-sync-automation-stopping.jpg`. **PASS.**

## 6. Escalation

Hang agent (`01a1c58a-92d8…`), Stop → Soft stop 9 s in: `stopping`, and still `stopping` 10 s later with
**Stop now** offered (`step6-soft-stopping-hang.jpg`); Stop now → dialog "Hard stop — interrupt the current
action now…" (`step6-stop-now-dialog.jpg`) → confirm:
```
audit stop_soft accepted 12:59:24.786 (running -> stopping)
audit stop_hard accepted 12:59:41.354 (stopping -> stopping, escalate)
stopped_at 12:59:41.363 (9 ms after the escalation), hang interrupted 25792 ms, "after" never ran
```
`step6-stopped-after-stop-now.jpg`. **PASS.** The first try landed as the slow demo's last wait ended:
the escalation answered 409 `not_allowed`, the page said "This control is no longer allowed. Allowed now:
Destroy" and the audit has `stop_hard rejected:stopped` (`step6-first-try-late-escalation-409.jpg`), which is
the forward-only rule working.

## 7. Destroy

The stopped webhook execution of Step 4, as the owner: Destroy → "Type 01a1c5 to confirm" → Destroy
(`step7-destroy-dialog.jpg`, `step7-destroyed.jpg`):
```
audit destroy accepted 13:03:01.766 (stopped -> destroyed)
execution: status destroyed, end_reason destroyed, conversation_closed_at = ended_at 13:03:01.803
request: status 1000, closed_at 13:03:01.797, closed_by 6af31268e0adb20013243a69 (Exec Owner)
Redis before: exec:{id}, :seq, :state, :stop, exec:req:<rid>:<agent>
Redis after:  exec:{id} = {status: destroyed} (TTL 604786), exec:req:<rid>:<agent>; nothing else
kept: steps 3, state_changes 27, sealed_data 8
Activities (owner): EXECUTION_STOP_SOFT + EXECUTION_DESTROY with audit_id, status_after destroyed
```
The conversation shows "Chat closed (14:03:01)" and Resolved (`step7-conversation-closed.jpg`); the dashboard
does not print who closed a conversation (for any close), so "by that user" is from `closed_by`.
New message on the conversation (owner, 13:03:25): a new execution `01a1c58e-62a3…` with
`previous_execution_id: 01a1c58c-94f0…`, and `exec:req:<rid>:<agent>` now points to it. **PASS.**

**F1 (finding, tiledesk-chatbot):** that new execution ran no block (the webhook agent has no
`defaultFallback`, the text matched no intent): it emitted `execution.started` only, stayed `running`, and
~40 s later the reaper marked it `failed` / `lost_owner` ("the agent server stopped while running this
block") although nothing crashed. Repro: on a closed or destroyed conversation of "Exec demo · webhook", post
any text; or any first message that resolves to a new execution and matches no block. In Phase 1 it stayed
`running` forever; the Phase 2 reaper turns it into a false failure. Area: tybotRoute/index.js +
ExecutionRecorder (no `endOfChain`/`execution.idle` when no block runs for a message that created the
execution). A message on an existing `waiting` execution that matches nothing is fine (checked: stays waiting).

## 8. Reaper

Hang agent `01a1c58f-0486…` in its `hang` block, owner lease `944081096abe` (PTTL 11585), then
`docker compose -p tiledesk-exec kill chatbot` at 13:04:10.24:
```
13:04:16 … 13:04:48 running;  13:04:49.943 failed  error {code: lost_owner, message: "the agent server stopped while running this block"}
39.7 s after the kill; executions-jobs log {"failed":1,"stopped":0,"msg":"reaper"}
Redis after: exec:{id}, :seq, :state (the :owner key expired)
```
Restarted with `docker compose -p tiledesk-exec start chatbot`: healthy in ~6 s, same image e22b629902e1,
log `(ControlListener) subscribed to exec:control`, `PUBSUB CHANNELS exec:*` → `exec:control`. **PASS.**

## 9. Roles

API on a `waiting` execution (`allowed_controls`):
```
owner      [stop allowed, destroy allowed]
admin      [stop allowed, destroy allowed:false reason role]      POST destroy -> 403
supervisor [stop allowed:false role, destroy allowed:false role]  POST stop/destroy -> 403
agent      detail 403; POST stop/destroy -> 403
custom t15_exec_control (flows_read, executions_read, executions_control) on exec-agent@:
           [stop allowed, destroy allowed:false reason role]      POST destroy -> 403; no EXECUTION_* in Activities
```
Dashboard:
- supervisor: Stop and Destroy both greyed, tooltips "You don't have permission to stop executions" / "Only the
  project owner can destroy executions" (`step9-supervisor-no-enabled-controls.jpg`).
- admin: Stop enabled, Destroy greyed with "Only the project owner can destroy executions"
  (`step9-admin-destroy-disabled-tooltip.jpg`); the admin stopped the email execution `01a1c57c-fb69…`
  (`waiting -> stopped`, audit actor exec-demo-admin, `step9-admin-stopped-email.jpg`).
- custom role: same as the admin (`step9-custom-role-stop-enabled-destroy-disabled.jpg`); it stopped the hang
  execution `01a1c57c-308b…` (audit actor role `t15_exec_control`, `step9-custom-role-stopped.jpg`).
- role editor (new role, as the owner): ticking "Able to stop executions" ticks and greys "Able to view
  executions" and Flows "Able to view" (`step9-role-editor-control-locks-read.jpg`,
  `step9-role-editor-locks-flows-view.jpg`); a click on the locked box does nothing; ticking "Able to view
  execution audit entries in Activities" ticks and locks Reports "Able to view Activities", and unticking it
  releases it. Saved permissions: `["flows_read","executions_read","executions_control"]`.

Restored: `exec-agent@` back to `agent`, role `t15_exec_control` deleted. **PASS.**

Observations: (a) after `PUT /project_users/:id {role}` the server kept answering the old role from
`/project_users/me` until the cachegoose key `<pid>:project_users:iduser:<uid>` was dropped (TTL ~200 s), and
the executions API caches the role 60 s on top; a role change takes up to a few minutes to apply (pre-existing
server cache, not Phase 2 code). (b) The supervisor's Stop tooltip is drawn left of the button and clipped by
the sidebar.

## 10. Flag off

Chatbot only: `COMPOSE_PROJECT_NAME=tiledesk-exec COMPOSE_PROFILES=infra,core,exec EXECUTIONS_ENABLED=false
bin/dev up --no-deps chatbot` (same image e22b629902e1; `EXECUTIONS_ENABLED=false`, `EXECUTIONS_AMQP_URL=` in the
container; `PUBSUB NUMSUB exec:control` 1 -> 0). The server kept its publisher on. Then one webhook run and one
automation run under `redis-cli MONITOR`, the same pair with the flag on just before:

```
flag on : 388 commands, 94 on exec: keys
          22 INCR :seq, 13 GET :stop (= 5 messages + 8 actions: one per message, one per action),
          5 SET/5 GET/5 DEL :owner, 8 EVAL (owner compare-and-delete), 3 SET/3 DEL :transit (3 jumps),
          5 SET/3 GET :state, 4 HSET/3 HGET/2 EXISTS/2 EXPIRE exec:{id}, 3 GET/2 SET/1 DEL exec:req, policy/handoff reads
flag off: 265 commands, 0 on exec: keys
replies: webhook ["/start","done"], flow attributes order_total "42", status "new", status_code 1000 in both modes
         (all 50 flag-on and 50 flag-off latency runs: ["/start","done"])
exec:* keys 1128 and executions 227 before and after the flag-off runs (nothing new)
```

Tybot suite (`REDIS_HOST=localhost REDIS_PORT=6379 npm test` in tybotRoute, chatbot `f85336a2`), failing
titles against `phase1-tybot-baseline.txt` (249):
- run 1, stack flag on: 531 passing / 251 failing = the 249 + "Executions: subagents, replace bot, event
  fixture" (the known flake) + "Executions: hard stop … flag off: no subscription, HttpUtils call options
  unchanged (signal undefined)": `AssertionError: nobody subscribed to exec:control, 1 !== 0`
  (test/executions_hardstop_test.js:378). The test counts subscribers on the shared Redis, and the running
  stack's chatbot is one (the live ControlListener), so this is the environment, not the code.
- `test/executions_*_test.js` alone, stack chatbot flag off: 152 passing, 4 pending, 0 failing.
- run 2, stack chatbot flag off (no live subscriber): 532 passing / 250 failing = the 249 + the known flake.
  Failing set equals the baseline.

**PASS.** Note for later suite runs: stop the stack's chatbot, or run with the flag off, before the full suite;
otherwise the hard-stop flag-off test fails on `PUBSUB NUMSUB`.

## 11. Latency

Phase 1 method: "Exec demo · webhook" (5 actions, 2 jumps), 50 serial runs per mode, 6.5 s apart, one chatbot;
duration = `createdAt` of `/start` to `createdAt` of the last `done` in Mongo `messages`; p95 nearest rank.
Order: flag on (warm, before Step 10), flag off, flag on again after the restore (3 warm-up runs first, not counted).

| | p50 | p95 | mean | max |
|---|---|---|---|---|
| flag on, run 1 (50) | 72 | 89 | 75.5 | 170 (one outlier) |
| flag off (50) | 57.5 | 69 | 57.9 | 75 |
| flag on, run 2 (50) | 73.5 | 81 | 71.8 | 84 |
| flag on, both runs (100) | 72 | 81 | 73.6 | |
| **delta, pooled on vs off** | **+14.5** | **+12** | **+15.7** | |
| delta, run 1 / run 2 | +14.5 / +16 | +20 / +12 | +17.6 / +13.9 | |
| Phase 1 final (11-10) | +13 | +15 | +15.4 | |

Per action (5 actions): +2.9 ms p50, +2.4 ms p95 pooled (worst single run +4.0 ms p95). Flag on, from the API
(run 1): execution start → last step end p50 66 / p95 83 ms, sum of block durations p50 43 / p95 53 ms;
50/50 executions `waiting` with 3 steps. Redis per webhook+automation pair: 94 `exec:` commands (Phase 1: 52),
the difference being the Phase 2 budget (stop GET per action and per message, lease SET/DEL, transit SET/DEL,
owner compare-and-delete).

Reading: the per-run overhead is the same as Phase 1 within the noise (p50 +1.5 ms, p95 −3 ms pooled; the two
flag-on runs differ by 8 ms at p95 between themselves). Absolute times are ~10 ms higher than Phase 1's in both
modes (machine load), so compare deltas. **RECORDED.**

## 12. Finish

Restored:
- chatbot flag on (`bin/dev up --no-deps chatbot` with the profiles, no `EXECUTIONS_ENABLED` override):
  `EXECUTIONS_ENABLED=true`, `EXECUTIONS_AMQP_URL` set, subscribed to `exec:control`, healthy.
- project plan name back to `Sandbox` (Mongo) and its cachegoose key dropped; the API answers `Sandbox`.
- temporary agent deleted (`DELETE /<pid>/webhooks/6af3156f…` and `DELETE /<pid>/faq_kb/6af3156f…`: the draft
  is gone, the published copy trashed); its execution `01a1c58b…` stays as trace.
- `exec-agent@` back to `agent`, role `t15_exec_control` deleted (Step 9).
- dashboard pane signed in again as `exec-demo-admin@`, viewport reset.
- a webhook run after the restore: `01a1c5ad-31bb…` `waiting`, 3 steps.

All 11 containers up (healthchecked ones healthy) on the Task 14 images: chatbot e22b629902e1, server
2ab953852619, executions-api/-ingest/-jobs 45c997bbbd8f, dashboard 734e9a3f17dd. Server `ACTIVITY_HISTORY_ENABLED=true`
and `EXECUTIONS_AMQP_URL` set. The chatbot was killed (Step 8) and recreated twice (Step 10); no image was built.

Left behind (data only): the demo executions of this run (stopped, destroyed, failed, waiting), their audit
entries and `EXECUTION_*` activities; the Task 14 demo executions `01a1c57c-fb69…` (email) and `01a1c57c-308b…`
(hang) are now `stopped` (Step 9). Storage: `phase1-storage.md`, "Phase 2 acceptance" (no change: Mac 70 GB,
Docker 30 GB free at start and end; nothing built, cleaned or pruned).

## Findings and observations

- **F1** (tiledesk-chatbot, tybotRoute/index.js + executions/ExecutionRecorder.js): a message that creates a new
  execution but runs no block (no matching intent, no `defaultFallback`) emits only `execution.started`; the
  execution stays `running` and the reaper fails it ~40 s later as `lost_owner`. Repro in Step 7.
- Activities sentence for a rejected stop reads like an accepted one (Step 1).
- `hard_degraded` is not shown in the dashboard's action row (Step 3).
- Role changes take minutes to apply: server cachegoose `project_users:iduser` key not dropped on
  `PUT /project_users/:id`, plus the executions API's 60 s role cache (Step 9; pre-existing server cache).
- Supervisor Stop tooltip clipped by the sidebar (Step 9).
- The full tybot suite fails the hard-stop flag-off test whenever a live tybot on the same Redis subscribes to
  `exec:control` (Step 10).
- The Activities page needs plan Custom/Plus on a trial project (`ProjectProfileGuard`), so the local default
  project cannot show the `EXECUTION_*` rows without a data change (pre-existing).
