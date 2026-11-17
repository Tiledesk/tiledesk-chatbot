# Phase 3 local acceptance: resume and start new (2026-11-11)

Code under test (the images already on the stack, not rebuilt): chatbot `5e036086` (image 8ad0fc000d07), server
`3b47bcf6` (61e73891194b), executions `a26c4961` (59dc723b7220), dashboard `8e1654c9` on `feature/execution-graph`
(c47501bb8a00), dev-env `4b8aa44a`. Stack `tiledesk-exec`, profiles `infra,core,exec`, project
`6af2301d8adf5f00136aa7b0`. Screenshots are in `phase3-acceptance/` (the dashboard shows local time, UTC+1; the
times below are UTC).

Method, as in Phase 2: every Resume and Start new was clicked in the dashboard as `exec-demo-owner@` (signed in
through the dashboard's login form); stops that only set up a scenario were sent to the executions API
(`POST …/executions/:id/stop`) with the same owner's JWT. API calls used a JWT from `POST /api/auth/signin` with the
seed's test accounts, kept in a private scratch file and never printed. Results were read from the executions API,
Mongo (`tiledesk-executions`, `tiledesk`), Redis, the container logs and a temporary exclusive AMQP queue bound to
`exec.#` on `tiledesk.executions` (a 20-line amqplib script in the ingest container; the queue went away with it).
Sealed blobs were never printed.

| # | Scenario | Result |
|---|---|---|
| 1 | Hard stop of the hang agent, resume with confirm | PASS |
| 2 | Soft stop during the slow demo, resume | PASS |
| 3 | Failed by `max_steps`, resume: limits from zero | PASS (failure induced, see below; finding F2) |
| 4 | Redis checkpoint deleted, resume from the durable one | PASS |
| 5 | Start new on a webhook run with a secret field | PASS |
| 6 | Start new on an automation run and on a scheduled run | PASS with variants (finding F1) |
| 7 | Activities rows for resume and start new, owner-only | PASS |
| 8 | Flag off | PASS (suite = baseline + known flake) |
| 9 | Latency | PASS, narrowly at p50: +0.9 ms per action vs Phase 2 (p95 −0.4 ms) |

Local-env changes made for the run, all restored (see Finish): a temporary automation-mode webhook on "Exec demo ·
slow" (Scenario 6), a temporary `scheduled_live` on the "Exec demo · webhook" webhook (Scenario 6), the project's plan
name set to `Custom` for the Activities page (Scenario 7), the chatbot recreated flag off and back on (Scenario 8).

## 1. Hard stop of the hang agent, then resume with confirm

"Exec demo · hang" fired (`POST /api/webhook/qgwsxw…`), execution `01a1ca3a-cdd2-76bf-83b5-54e3c84761c8`. Stop → Hard
stop 81 s into the `hang` block (`s1-hang-hard-stopped.jpg`):
```
audit stop_hard accepted 10:51:35.442 (running -> stopping); stopped_at 10:51:35.467, stop_mode hard
hang  interrupted  act_hang_request webrequestv2 interrupted 81566 ms
Redis exec:{id}:cp = {seq 9, block_id hang, action_index 0, next_action "rerun", next_action_type webrequestv2, ...}
durable checkpoint (Mongo checkpoints) cp_seq 9, sealed
allowed_controls: destroy, resume, start_new
```
Resume → the dialog names the action ("Continues from "GET never answers"", `s1-resume-dialog.jpg`); Resume → the
API answers 409 `confirm_required` and the dialog reopens with "This action calls an external system and may already
have reached it. Run it again?" (`s1-resume-confirm-required.jpg`, ruling P10); Resume again:
```
audit resume accepted 10:52:12.809  {confirm: true, rerun_action: {index: 0, type: webrequestv2}, stopped -> running}
tybot /ext message _tdinternal "/#hang", attributes.resume {action_index 0, next_action rerun, from_seq 9, checkpoint_unsealed false}
execution: resumed_at 10:52:12.833, resumed_from_seq 9, resumed_seq 11 (same execution id)
step 12 hang      failure_condition  act_hang_request webrequestv2  119991 ms  (the request ran again, to its 120 s timeout)
step 15 after     success            act_after reply 23 ms  -> message "after the request" 10:54:12.865
status waiting (4 steps)
```
The web request ran again and the run took its false exit to `after` (`s1-resumed-running.jpg`,
`s1-false-exit-after.jpg`). **PASS.** Observation: after the resume the header still reads "hard stop · interrupted
"GET never answers"" next to the `waiting` status (stale stop info).

## 2. Soft stop during the slow demo, then resume

"Exec demo · slow" (automation; `start`: set + 20 s wait + jump; `second`: 20 s wait + set), started with
`POST /api/modules/tilebot/block/<pid>/6af2cdb201658600136d161c/start {"async":true}`, execution
`01a1ca3c-d277-7397-a73e-f90f9276f899`; soft stop 4 s into `start`:
```
stop_soft accepted 10:52:30.570 -> stopping; stopped_at 10:52:46.150 (after act_wait_1, 20008 ms)
Redis cp = {seq 6, block_id start, action_index 2, next_action "run", next_action_type intent}
```
Resume (dialog: "Continues from where it stopped." plus the automation note "The original caller won't get the
answer", `s2-resume-dialog.jpg`; no confirmation, the next action is a jump) at 10:53:16.019:
```
step 2  start   act_slow_a setattribute 4 ms, act_wait_1 wait 20008 ms          (before the stop)
step 9  start   act_goto_second intent 1 ms   <- resumed at action_index 2: the 20 s wait did not run again
step 12 second  act_wait_2 wait 20006 ms, act_slow_b setattribute 6 ms
status completed 10:53:36.084; resumed_at 10:53:16.035, resumed_from_seq 6, resumed_seq 8
```
`resumed_seq` is written by the projector from the `execution.resumed` event (seq 8; tybot log shows the resume
attributes `{from_seq: 6, checkpoint_unsealed: false}`); Scenarios 3 and 4 show the event itself on the bus.
`s2-slow-soft-stopped.jpg`, `s2-resumed-continues-at-jump.jpg`. **PASS.**

## 3. Failed by `max_steps`, then resume

Variant (labelled): reaching 1000 actions needs a loop agent, so the failure was induced on the real limit check.
On a new slow run (`01a1ca3f-2255-7679-962d-e2ab9682d892`), 7 s into the 20 s wait, the request's step counter was set
by hand to the limit: `SET tilebot:requests:<rid>:step 1000 KEEPTTL` (it read 0). The next action's
`TiledeskChatbot.checkStep` then failed it:
```
execution.failed seq 5  error {code: max_steps_exceeded, message: "Anomaly detection. MAX ACTIONS (1000) exeeded.", step_seq 2}  10:55:17.650
:step after the failure: 1001;  Redis cp {seq 5, block_id start, action_index 2, next_action run, next_action_type intent}
allowed_controls: destroy, resume, start_new
```
Resume (`s3-failed-max-steps.jpg`, `s3-resume-dialog.jpg`) at 10:55:32.902:
```
bus: execution.resumed seq 7 {from_seq: 5, checkpoint_unsealed: false}
:step right after the resume: 0, :started reset (new timestamp); :step at the end: 2
step 8 start (act_goto_second intent), step 11 second (wait 20004 ms + set) -> completed 10:55:52.959
```
The limits counted from zero (spec 7.1.5) and the run finished. **PASS.** Finding **F2**: the step that was running
when `max_steps` hit (seq 2) is never closed. Before the resume the timeline shows it with an empty circle and "–";
during the resume it shows "running… 37 s" with a ticking clock (`s3-resumed-open-step-shows-running.jpg`); after the
run completed it is still "–", no outcome, no duration (`s3-completed-failed-step-left-open.jpg`).

## 4. Redis checkpoint deleted by hand, then resume

Slow run `01a1ca40-7fb4-767a-9e41-e0f991568d1e`, soft-stopped (stopped 10:56:47.100). Redis cp `{seq 6, start, action_index
2}`, durable checkpoint cp_seq 6, sealed. Then `DEL exec:{id}:cp` (`EXISTS` → 0) and Resume in the dashboard:
```
executions-api log: "internal checkpoint: served" (execution 01a1ca40…) 10:57:03.405
bus: execution.checkpoint seq 7 {sealed: present, cp_seq: 6}
     execution.resumed   seq 8 {from_seq: 6, checkpoint_unsealed: true}  10:57:03.416
tybot /ext attributes.resume {action_index 2, checkpoint_unsealed: true, from_seq 6, next_action run}
step start (jump only, 4 ms), step second -> completed 10:57:23.450
```
`s4-resumed-from-durable-checkpoint.jpg`. **PASS.**

## 5. Start new on a webhook run with a secret field

"Exec demo · webhook" fired with `{"order_id":"A-1001","customer":{"name":"Ada","api_key":"<demo value>"},"items":[1,2]}`
→ `01a1ca41-5cd7-75fc-a722-acfffa1e747c` (`waiting`), soft-stopped (→ `stopped` at once). Start new:
```
GET …/start-new/input -> {"input":{…,"customer":{"name":"Ada","api_key":null},…,"webhook_http_method":"POST"},"masked":["customer.api_key"]}
dialog: "These fields were hidden as secrets when stored. Fill them in: customer.api_key required"; Start new disabled
                                                                   (s5-start-new-dialog-masked-required.jpg)
POST start-new with api_key null (API) -> 400 {"error":"missing_input","fields":["customer.api_key"]}
api_key typed in the dialog -> "filled", Start new enabled (s5-start-new-dialog-masked-filled.jpg) -> clicked
audit start_new accepted 10:57:54.314 {input_provided: true, masked_filled: 1}   (no input values in the audit)
new execution 01a1ca41-d4bd-713b-bcbf-609c82496238: execution.started {retry_of: 01a1ca41-5cd7…, trigger webhook b93z…}
  request attributes retry_of = old id; payload = exactly the confirmed input; status waiting, 3 steps
old: lineage.retried_as [01a1ca41-d4bd…];  new: lineage.retry_of 01a1ca41-5cd7…
second POST within 30 s -> 409 {"error":"already_started"}
```
The old page shows "retried as 01a1ca41 ↗" and "New execution started" (`s5-old-execution-retried-as.jpg`); the new
one "retry of 01a1ca41 ↗" (`s5-new-execution-retry-of.jpg`). **PASS.** Observations: both ids print as `01a1ca41`
(the 6-character prefix collides, as in Phase 2); the prefill carries the server-added `webhook_http_method`, so it is
sent back as part of the payload.

## 6. Start new on an automation run, and on a scheduled run

**Automation, as the seed fires it (direct `/modules/tilebot/block` call).** On the completed slow run
`01a1ca3c…` (Scenario 2), Start new is offered; the dialog shows `{}` (`s6-automation-no-webhook-dialog.jpg`); Start new →
the page says "The new execution could not be started. Try again." (`s6-automation-no-webhook-refire-failed.jpg`):
```
executions-api: "start new: refire failed" status 404 -> 502 refire_failed
server refire: trigger {type automation, source_id null} -> findProjectWebhook(pid, null) -> 404 webhook_not_found
audit start_new "accepted" 10:58:38.755 and an Activities row "started a new run" although nothing started
```
This is finding **F1**. The seeded "Exec demo · automation" is fired the same way (seed curl line), so the README's
"Try it on … Exec demo · automation" fails the same way.

**Automation through an automation webhook (variant).** A temporary automation-mode webhook was added to the slow
agent (`POST /api/<pid>/webhooks {chatbot_id, block_id: start, async: true}` → `p46e…l2he`, deleted afterwards) and
fired with `{"note":"t13 automation","run":1}` → `01a1ca43-06f7-750b-b2e0-4964debcb520`, trigger
`{automation, source_id p46e…l2he}` (C8), completed in 40 s. Start new with the prefill unchanged
(`s6-automation-webhook-dialog.jpg`):
```
audit start_new accepted 11:00:10.574 {masked_filled: 0}
new 01a1ca43-e8e5-75cb-ab93-645937ea1060: execution.started {retry_of: 01a1ca43-06f7…, trigger automation p46e…}
  new request id automation-request-<pid>-6af44aba…08b6-p46e… (not the stored one); completed 11:00:50.655
old lineage.retried_as [01a1ca43-e8e5…]   (s6-automation-webhook-retried-as.jpg)
```
**Scheduled (variant).** No scheduled demo agent and no scheduler here. The two scheduled runs of the Phase 1
acceptance (on "Exec demo · webhook") were `waiting`; `01a1c468-de83-765f-85ad-d49bbc7499df` was soft-stopped, and the
webhook got a temporary `scheduled_live {enabled: true, block_id: "start"}` in Mongo (README recipe; removed
afterwards). Its Resume is greyed (`no_checkpoint`: a Phase 1 run), Start new is offered with `{"origin":
"scheduled-acceptance"}` (`s6-scheduled-dialog-resume-greyed.jpg`):
```
audit start_new accepted 11:00:49.728
new 01a1ca44-8200-70eb-bdf4-7459a265eb12: execution.started {retry_of: 01a1c468…, trigger {scheduled, source_id 6af23048…a964, start_point start}}
  status waiting, 3 steps; request attributes start_type scheduled, scheduled_at, retry_of
old lineage.retried_as [01a1ca44-8200…]   (s6-scheduled-retried-as.jpg)
```
No scheduler run row exists for it (C13). **PASS with variants**; F1 open for direct `/block` automation runs.
Observation: the automation prefill includes the server's own `request_id`, `preloaded_request_id`,
`webhook_http_method` and `webhook_query_params`; sent back unchanged they did not hurt (the server set a new request
id), but they are not user input.

## 7. Activities rows for resume and start new, owner-only

`GET /api/<pid>/activities` as the owner: 4 `EXECUTION_RESUME` (Scenarios 1–4) and 4 `EXECUTION_START_NEW`
(Scenarios 5–6, including the failed one of F1), actor Exec Owner, target the execution with
`{agent_id, agent_name, request_id, status_after, trigger_type}`, related faq_kb, `actionObj {result: accepted,
audit_id}`; no input value in any of them (the filled secret appears in no audit or activity of these verbs). As the
admin: no `EXECUTION_*` verb at all. Dashboard (project plan temporarily `Custom`, as in Phase 2): the owner's page
shows "Exec Owner resumed execution 01a1ca of Exec demo · slow", "Exec Owner started a new run of execution 01a1c4 of
Exec demo · webhook" (`s7-owner-activities-resume-start-new.jpg`); the admin's page shows only "New conversation"
rows (`s7-admin-activities-no-execution-rows.jpg`). **PASS.**

Observation: the new conversation's `REQUEST_CREATE` activity (any role that sees Activities) carries the request
attributes, including the webhook payload with the refilled secret. The original webhook run does the same with the
original value, so this is pre-existing, not Phase 3.

## 8. Flag off

Chatbot only: `COMPOSE_PROJECT_NAME=tiledesk-exec COMPOSE_PROFILES=infra,core,exec EXECUTIONS_ENABLED=false bin/dev up -d
--no-build --no-deps chatbot` (same image 8ad0fc000d07; `EXECUTIONS_ENABLED=false`, `EXECUTIONS_AMQP_URL` empty;
`PUBSUB NUMSUB exec:control` 1 → 0). One webhook run and one automation run under `redis-cli MONITOR`, the same pair with
the flag on just before:
```
flag on : 454 lines, 138 on exec: keys (96 client commands + 42 run inside Lua scripts)
          client: 23 INCR :seq, 13 GET :stop, 13 EVAL :cp (seq-guarded checkpoint write), 8 HGET exec:{id},
          5 SET :owner, 5 EVAL :owner (compare-and-delete), 5 SET/3 GET :state, 3 SET/3 DEL :transit,
          2 GET/2 SET/1 EVAL exec:req, 2 HSET, 2 EXPIRE, 2 EVAL exec:{id}, 2 GET exec:handoff
flag off: 270 lines, 0 on exec: keys
webhook replies ["/start","done"], order_total "42", status "new", status_code 1000, request status 200 in both modes
the sync automation call ({"async":false}) timed out at 20 s in BOTH modes: the automation demo sends no reply (pre-existing)
executions 358 and exec:* keys 2405 before and after the flag-off runs (nothing new); all 50 flag-off latency runs ["/start","done"]
```
Phase 2's 94 `exec:` lines counted the Lua-internal commands too; on the same count Phase 3 adds 13 checkpoint writes
(EVAL + its GET + SET inside the script) for the pair's 8 actions and 5 block entries/parks, which is the §12 budget
(one checkpoint write per action, never awaited).

Tybot suite (`REDIS_HOST=localhost REDIS_PORT=6379 npm test` in tybotRoute, chatbot `5e036086`), stack chatbot flag
off (no live subscriber on `exec:control`), failing titles against `phase1-tybot-baseline.txt` (249):
- full suite: 571 passing, 4 pending, 250 failing = the 249 + "Executions: subagents, replace bot, event fixture"
  ("call subagent and return", the known flake). No baseline title missing.
- `test/executions_*_test.js` alone: 191 passing, 4 pending, 0 failing (the flake passes).

Restored: chatbot recreated without the override: `EXECUTIONS_ENABLED=true`, AMQP and service URL set, log
"(ControlListener) subscribed to exec:control", `NUMSUB` 1, healthy. **PASS.**

## 9. Latency

Phase 2 method: "Exec demo · webhook" (5 actions, 2 jumps), 50 serial runs per mode, 6.5 s apart, one chatbot, 3
warm-up runs not counted; duration = `createdAt` of `/start` to `createdAt` of the last `done` in Mongo `messages`;
p95 nearest rank. Order: flag on, flag off, flag on again.

| | p50 | p95 | mean | max |
|---|---|---|---|---|
| flag on, run 1 (50) | 71 | 96 | 75.2 | 218 (one outlier) |
| flag off (50) | 51 | 76 | 53.7 | 107 |
| flag on, run 2 (50) | 68 | 78 | 72.2 | 223 (one outlier) |
| flag on, both runs (100) | 70 | 86 | 73.7 | |
| **delta per run, pooled on vs off** | **+19** | **+10** | **+20.0** | |
| delta per action (/5) | +3.8 | +2.0 | +4.0 | |
| Phase 2 per action (11-10) | +2.9 | +2.4 | +3.1 | |
| **Phase 3 − Phase 2, per action** | **+0.9** | **−0.4** | **+0.9** | |

All 100 flag-on runs ended `waiting` with 3 steps; all 150 transcripts were `["/start","done"]`. Reading: within the
+1 ms per action target at p50 and p95, but only just at p50. The flag-off run is 6.5 ms faster at p50 than Phase 2's
(57.5), which widens the delta; the two flag-on runs differ by 3 ms at p50 and 18 ms at p95 between themselves, so
the +0.9 ms is inside the noise of one flag-off sample. **PASS** (narrow).

## Finish

Restored:
- chatbot flag on (Scenario 8), subscribed to `exec:control`, healthy, same image.
- project plan name back to `Sandbox` and its cachegoose key dropped; the API answers `Sandbox`.
- temporary automation webhook on "Exec demo · slow" deleted (`DELETE /api/<pid>/webhooks/<chatbot_id>`; project has
  its 5 webhooks again); `scheduled_live` unset on the "Exec demo · webhook" webhook.
- AMQP tap stopped (its exclusive queue is gone; `executions.ingest.dlq` holds the same 2 old Phase 1 messages it had,
  rejected 2 days ago); the dashboard pane is signed in as `exec-demo-admin@`, viewport reset.
- left inside the ingest container: `/tmp/tap.js` and `/tmp/dlq.js` (root-owned `/tmp`, removed on the next recreate).

All 11 containers up on the images above. No image built, nothing pruned, no product code touched. Left behind (data
only): the executions of this run (`01a1ca3a…` waiting; `01a1ca3c…`, `01a1ca3f…`, `01a1ca40…`, `01a1ca43…` (both),
completed; `01a1ca41-5cd7…` and `01a1c468…` stopped; `01a1ca41-d4bd…`, `01a1ca44…` waiting), the 300 latency/flag runs,
their audit entries and `EXECUTION_*` activities.

## Findings and observations

- **F1** (start new offered but always fails for automation runs started by a direct `/block` call):
  `POST /modules/tilebot/block/<pid>/<bot>/start` runs get `trigger {type: automation, source_id: null}`;
  `allowed_controls` offers `start_new`, the server's refire looks the webhook up by `source_id`
  (tiledesk-server `routes/executions-refire.js`, `findProjectWebhook` returns null for a null id → 404
  `webhook_not_found`), the API answers 502 `refire_failed` and the page says "could not be started. Try again.",
  which will never succeed. The audit and the Activities row still say "started a new run" (audit before acting, the
  deferred Task 7 minor). Fix options: `allowedControls` returns `start_new` not allowed (reason e.g.
  `unsupported_trigger`/`no_trigger_source`) when an automation trigger has no `source_id`
  (tiledesk-executions `src/api/controls.ts`), or the refire re-runs `/block` for such runs. Also the dev-env README
  suggests Start new on "Exec demo · automation", which the seed fires this way.
- **F2** (step left open after `max_steps` / `max_time`): `ExecutionRecorder.failed` (tybotRoute
  `executions/ExecutionRecorder.js:744`, called from `DirectivesChatbotPlug.js:217`) emits `execution.failed` with
  `step_seq` but no step end, and the projector does not close that step. The step has no outcome or duration forever;
  after a resume the dashboard shows it as "running…" with a ticking clock until the run ends, then "–". Pre-existing
  since Phase 1 for failures, made visible by resume. Fix in tybot (end the step as failed) or in
  tiledesk-executions `src/ingest/projector.ts` (close `step_seq` on `execution.failed`).
- Header keeps "hard stop · interrupted …" after a resumed run is running/waiting again (Scenario 1).
- Start-new prefill carries server-added keys (`webhook_http_method`; for automation also `request_id`,
  `preloaded_request_id`, `webhook_query_params`) that are sent back as payload (Scenarios 5, 6).
- The Redis checkpoint of a webhook run whose block was reached by a jump records `trigger {type: widget}` while the
  execution's trigger is `webhook` (`01a1ca3a…` cp); resume did not depend on it.
- Execution ids still print as 6-character prefixes that collide (`01a1ca41` → `01a1ca41`).
- A sync automation call (`async:false`) to an agent with no reply times out after 20 s, flag on and off (pre-existing).

## Fix-wave re-check (2026-11-11)

Code under test, rebuilt with `bin/exec-rebuild` (chatbot, executions, server, dashboard) and recreated with
`bin/dev up -d --no-build` (stack `tiledesk-exec`, profiles `infra,core,exec`; no prune): chatbot `c44956e1`
(image 6a003f321c70), executions `8f06419` (e3d96d3f7aa5), server `81b81b04` (4d6b29b69f89), dashboard `1c292885b`
(7b6383e07431). The build did not create `tiledesk-dashboard/.angular/cache` (an empty `.angular/` was already there).
All containers healthy (dashboard and blackhole have no health check). The images were checked for the fix-wave code
(`no_trigger_source` in the API's `dist` and the dashboard's main bundle, `multi().incr().expire()` in tybot's
`ExecutionStore`, `slice(-6)` in the server's `activityMessageUtil.js`). Proxy: the live nginx config was dev-env
`c6e8294` at the start and `d7b7b32` ("encoded-character check covers the path only", committed and reloaded at
12:41 UTC by another session during this run); R9 ran after that reload.

Same method as above: Resume, Start new and Destroy clicked in the dashboard as `exec-demo-owner@` (signed in through
the login form, the pane reloaded so it ran the new bundle); scenario-only stops sent to the API with the owner's JWT
(private scratch file, deleted at the end); results read from the API, Mongo, Redis and the container logs.

| R | Check | Result |
|---|---|---|
| R1 | Scenarios 1, 2, 5 regression | PASS |
| R2 | F1: Start new greyed on a direct `/block` automation run | PASS |
| R3 | F2: `max_steps` failure leaves no step running | PASS |
| R4 | C1: resume after `:seq`, hash and `:cp` deleted | PASS |
| R5 | M3: stop banner gone after resume | PASS |
| R6 | I3: rejected start new = one "tried to … (rejected: …)" row; success = one row | PASS |
| R7 | I6/U3: structure only without `executions_data_access`; owner prefilled + `data_viewed` | PASS |
| R8 | M5: tail short ids; destroy confirm takes the last 6 hex | PASS |
| R9 | Dashboard through the proxy: list, filters, pagination, detail, graph; no 400 | PASS |
| R10 | I2: start new on a sync automation webhook returns fast, one run | PASS |

**R1.** S1: "Exec demo · hang" fired → `01a1ca9b-df40-75cf-b2d4-b0d008d13126`, hard stop 10 s into `hang`
(`fw-r1-s1-hard-stopped.jpg`; the header id now reads `08d13126`). Resume → 409 `confirm_required` → dialog "This
action calls an external system…" (`fw-r1-s1-resume-confirm-required.jpg`) → Resume:
```
audit resume requested 12:37:50.644 {confirm: true, rerun_action {index 0, type webrequestv2}}, then accepted 12:37:50.652 (of_audit_id = the first)
resumed_from_seq 9, resumed_seq 11; step 12 hang failure_condition 120015 ms (request ran again) -> step 15 after success -> waiting
```
S2: slow via `/block`, soft stop 4 s in → `01a1ca9d-9529-740d-9691-06939e340f53` stopped after `act_wait_1` (cp `{seq 6,
start, action_index 2, next run intent}`); Resume (automation note shown): step 9 `act_goto_second` 1 ms (the 20 s wait
did not run again), step 12 `second` → completed 12:39:08.657 (`fw-r1-s2-slow-soft-stopped.jpg`,
`fw-r1-s2-resumed-continues-at-jump.jpg`). S5: webhook fired with a secret `customer.api_key` → `01a1ca9e-697f-…`,
soft-stopped; Start new dialog prefilled with `api_key: null`, "required", Start new disabled
(`fw-r1-s5-r7-owner-start-new-prefilled-masked-required.jpg`); value typed → "filled" → Start new:
```
audit start_new requested 12:39:49.406 / accepted 12:39:49.453 {input_provided, masked_filled: 1} (no values)
new 01a1ca9f-23d5-778f-9475-2c044809d439 (waiting), retry_of = old (accepted by the projector, contract 8); old retried_as [new]
second POST start-new within 30 s -> 409 already_started
```
(`fw-r1-s5-old-execution-retried-as.jpg`).

**R2.** "Exec demo · automation" fired with the seed's `/modules/tilebot/block/<pid>/<pub>/start` line →
`01a1ca9e-6937-…` (trigger `{automation, source_id: null}`), completed. Start new greyed; tooltip "Started by a
direct call, not through a webhook: there is nothing to run again" (`fw-r2-automation-start-new-greyed-tooltip.jpg`;
the tooltip is clipped by the sidebar, as the Phase 2 supervisor tooltip). API: `allowed_controls [{start_new, allowed
false, reason no_trigger_source}]`; a forced POST start-new → 409 `not_allowed`. The direct-`/block` slow runs show
the same greyed button.

**R3.** As in S3: slow run `01a1ca9f-a9ec-747a-9b01-6c17de38b91f`, 7 s into the wait `SET tilebot:requests:<rid>:step
1000 KEEPTTL` (it read 0):
```
failed {code max_steps_exceeded, step_seq 2}; step 2 start outcome error, 20016 ms, ended    (fw-r3-failed-max-steps-step-error.jpg)
Resume: step 2 still "error 20.0 s", only the new `second` step shows running…              (fw-r3-resumed-failed-step-stays-error.jpg)
completed 12:41:31.374: step 2 error / step 9 start success / step 12 second success      (fw-r3-completed-failed-step-closed.jpg)
```
No step is left open or "running…" at any point.

**R4.** Slow run `01a1caa1-0e64-74c8-b85b-d01e3d95efda`, soft-stopped (last_seq 7; `exec:{id}:seq` = 7; cp `{seq 6,
start, action_index 2}`). Then `DEL exec:{id}:seq exec:{id} exec:{id}:cp` (3 deleted, `EXISTS` 0) and Resume in the
dashboard:
```
executions-api "internal checkpoint: served" 12:42:42 (durable copy)
resumed_from_seq 6, resumed_seq 8; steps 9 (start, jump 3 ms) and 12 (second 20016 ms); last_seq 16; completed 12:43:02.124
exec:{id}:seq after the run: 16, TTL 604795 s (restored to the floor 7, then INCRed; TTL refreshed)
```
Every resumed event was projected (no drop, the status reached completed) and the new seqs (8–16) are above the old
last_seq 7 (`fw-r4-resumed-after-seq-hash-cp-deleted.jpg`).

**R5.** After resume the header loses "hard stop · interrupted …" / "soft stop" / the failure code: S1 running
(`fw-r5-s1-resumed-running-no-stop-banner.jpg`) and waiting (`fw-r1-r5-s1-waiting-after-false-exit-no-stop-banner.jpg`);
S2 and R3 running likewise. Mongo: `stop_mode`, `stopped_at`, `interrupted_action` unset; `resumed_at` set.

**R6.** On the R10 run `01a1caa4-309a-…` after deleting its temporary webhook, Start new → the page says "This run
cannot be started again (webhook_not_found)." (`fw-r6-start-new-not-startable.jpg`):
```
audit start_new requested 12:47:20.236, then rejected:not_startable:webhook_not_found 12:47:20.250 (of_audit_id)
API 409 not_startable
```
Activities (API and page, plan temporarily `Custom`): one row "Exec Owner tried to start a new run of execution c3aee8 of
Exec demo · slow (rejected: not_startable:webhook_not_found)" and, for the successful start new on the same run at
12:46:36, exactly one row "started a new run of execution c3aee8". No row for any `requested` or `data_viewed` audit
(`fw-r6-r8-owner-activities-tail-ids-rejected-row.jpg`).

**R7.** Temporary custom role `fw_exec_control_nodata` (`flows_read, executions_read, executions_control`) created with
`POST /api/<pid>/roles` and given to `exec-agent@` (`PUT /project_users/:id`, cachegoose key dropped). As exec-agent:
`GET …/start-new/input` → `{"input":{"order_id":null,"customer":{"name":null,"api_key":null},"items":[null,null],
"webhook_http_method":null},"masked":["customer.api_key"],"stored":"structure_only"}`; the dialog shows "Values are hidden
for your role: fill in the input." with empty values and the masked field still required
(`fw-r7-custom-role-values-hidden.jpg`); no `data_viewed` audit by a non-owner. As the owner the values are prefilled
(R1/S5) and each prefill wrote `data_viewed {purpose: start_new_prefill}` (12:39:28, 12:39:36). Restored: `exec-agent@`
back to `agent` (`/project_users/me` answers `agent`), role deleted (0 left), cache keys dropped.

**R8.** Detail page: breadcrumb and header use the last 8 hex (`08d13126`, `9e340f53`, `de38b91f`); lineage links
likewise (`4809d439`). Activities: last 6 (`c3aee8`, `95efda`, `38b91f`, `99df9a`, `340f53`). Destroy on a throwaway
webhook run `01a1caa8-6398-7394-8214-abea57d2ddad`: API with the old prefix `01a1ca` → 400 `confirm_mismatch`; dialog
"Type d2ddad to confirm", button disabled for any other text, `d2ddad` → destroyed (`fw-r8-destroy-confirm-tail.jpg`,
`fw-r8-destroyed.jpg`); audit `destroy accepted waiting -> destroyed`, its durable checkpoints gone (0).

**R9.** Through `localhost:8081`: list with status, trigger, period, agent filter, id search and "With failure
conditions"; "Load more" (25 → 50, cursor request 200); detail pages; Monitor → Graph (`fw-r9-list-filtered.jpg`,
`fw-r9-list-load-more.jpg`, `fw-r9-graph.jpg`). Browser network panel for `/executions/api`: all 200/202/304 except the
two expected 409s (`confirm_required`, `not_startable`); no 400. The proxy log's only 400s on `/executions/api` are
curl probes (encoded `..%2F`, `%0D%0A`, and before the 12:41 reload `?q=a%5Cb`) and the deliberate destroy mismatch. On
`d7b7b32`: `/executions/%2e%2e`, `..%2F..%2Finternal`, `x%0D%0AX:1` in the path → 400; `?q=a%5Cb` → reaches the app.

**R10.** Temporary webhook on "Exec demo · slow" (`POST /api/<pid>/webhooks {chatbot_id, block_id: start, async:
false}` → `4xv9…60lw`, mode automation). Fired once (the sync caller got nothing in 60 s: the agent sends no reply, as
noted in Scenario 8) → `01a1caa4-309a-779d-ae76-28f1efc3aee8` completed in 40 s. Start new (prefill without
`request_id`/`preloaded_request_id`, M2) → 202:
```
audit requested 12:46:36.012 -> accepted 12:46:36.034 (22 ms; the dashboard showed "New execution started" within 3 s)
new 01a1caa5-5802-7503-a616-373d4a8e66e1 started 12:46:36.035, trigger {automation, 4xv9…}; slow runs started after 12:46:30: 1
```
(`fw-r10-sync-webhook-start-new-retried-as.jpg`). The webhook was then deleted (`DELETE /api/<pid>/webhooks/<chatbot_id>`;
the project has its 5 webhooks again) and used for R6.

Restored: temporary webhook deleted; custom role deleted and `exec-agent@` back to `agent`; project plan back to
`Sandbox` (cache key dropped, API answers `Sandbox`); JWT scratch files deleted; browser pane viewport reset, signed in
as the owner. Left behind (data only): the executions above and their audit entries and activities.

Observations (no failure):
- A deep link to an execution opened right after sign-in (no project chosen yet) renders an empty page for the custom
  role user; choosing the project first works. Not re-checked for the owner; likely pre-existing.
- The no_trigger_source tooltip is clipped by the sidebar (same layout issue as the Phase 2 supervisor tooltip).
- The dev-env proxy rule changed mid-run (`c6e8294` → `d7b7b32`, another session); R9 results are for `d7b7b32`.

## Follow-up check (2026-11-11, after m2/m3/m6 and the DirMessage fix)

Run by the controller on the live `tiledesk-exec` stack (chatbot daa5fd51, executions cada9c4, server 6d328a8c,
dashboard aeee6bba2). API calls used the seeded owner's JWT from `/api/auth/signin`, kept in a private scratch file
and deleted afterwards. The browser pane was already signed in as the owner.

| # | Check | Result |
|---|---|---|
| D1 | DirMessage: a failed send no longer stops the flow | PASS |
| D2 | Direct `/block` run + max_steps: the failing step closes | PASS, plus a separate pre-existing bug (below) |
| m2 | An unconfirmed Start new reads as "started … (unconfirmed)" | PASS |
| m3 | A resume that throws after the "requested" entry records `rejected:error` | PASS |
| m6 | Graph execution labels use the id tail, with no duplicates | PASS (after a page reload) |

**D1.** "Exec demo · hang" fired through its webhook (so the run has a token) → `01a1cae6-a277-…-23c18d215cec`.
The request's step counter was set to 1000 during the 120 s web request, and the server container was stopped. When
the request returned, the limit check failed the run, and the error message went through DirMessage while the server was
unreachable:
```
error: (DirMessage) Error sending reply:  getaddrinfo ENOTFOUND server
debug: (DirMessage) Reply message sent: …
debug: (DirectivesChatbotPlug) Stopping Actions on: …
```
There was no `winston.err is not a function`, and the callback ran and the chain went on. Status failed
(`max_steps_exceeded`, step_seq 9); step 9 `after` closed with outcome error. The server was started again
afterwards. (The hang demo's own "after the request" message is a `reply` action, which DirMessage does not handle.)

**D2.** "Exec demo · slow" fired by a direct `/block` call → `01a1cae1-eedc-…`, step counter set to 1000 during the
first wait. The run failed with `max_steps_exceeded`, and step 2 `start` closed with outcome error (20017 ms).
**Pre-existing bug, separate from the winston.err fix:** these runs have no token, so the error-message directive
throws while DirMessage is being created (`TiledeskClient`: "options.token can NOT be null",
DirMessage.js:21 via DirectivesChatbotPlug.js:354). It is logged as an `uncaughtException`. The process survives and
the run is recorded correctly, but the error message is never attempted. This code is unchanged on `main`.

**m2.** The owner role was cached by one GET. Then the server was stopped and `POST …/01a1cae6…/start-new` was sent:
`504 {"error":"refire_unconfirmed"}`. The audit has `requested`, then `rejected:refire_unconfirmed` with `of_audit_id`.
The server consumed the queued audit after it restarted. Its activities API and the dashboard both read "Exec Owner
started a new run of execution 215cec of Exec demo · hang (unconfirmed) · "e2e m2 unconfirmed""
(`fu-activities-unconfirmed-and-error-rows.jpg`; the plan was temporarily `Custom` for the page, then restored to
`Sandbox` and its cache key dropped).

**m3.** For the failed slow run `01a1cae1…`, `exec:{id}:seq` (value 7) was replaced with a list key, so
RESTORE_SCRIPT fails with WRONGTYPE after the audit entry. Resume (with and without confirm) answered
`503 control_unavailable`. Each attempt left `requested`, then `rejected:error` with `of_audit_id`. The status stayed
`failed`. Activities read "tried to resume execution 1a274f of Exec demo · slow (rejected: error)". The key was put
back (7). A normal resume then answered 202, and the run completed.

**m6.** On the Graph tab, the cytoscape node data first showed head labels (`01a1cae6`, and `01a1c60d` twice). The
pane was still running the bundle loaded before the rebuild. After a reload, the hang run's label is `8d215cec`, and
the 24 execution nodes have 24 distinct labels (`fu-graph.jpg`).

Left behind: the test executions, their audit entries and Activities rows. No other state was changed.

**D2 fixed (chatbot b9d31992, cherry-picked from fix/dirmessage-error-log 234546ef).** DirMessage creates its
TiledeskClient only when the run has a token. Without one, the message is skipped with a warning and the flow
continues. Re-run live on the rebuilt chatbot: "Exec demo · slow" by direct `/block` → `01a1cb22-5e74-…`, step
counter set to 1000:
```
warn: (DirMessage) No token for request automation-request-…: message not sent
debug: (DirectivesChatbotPlug) Stopping Actions on: …
```
No `uncaughtException`. The run failed with `max_steps_exceeded`, and step 2 `start` closed with outcome error
(20025 ms). DirectivesChatbotPlug's own "An error occurred while creating TiledeskClient … options.token can NOT be
null" is a separate log that was already handled and is unchanged. Tests: executions + DirMessage 203 passing,
0 failing.
