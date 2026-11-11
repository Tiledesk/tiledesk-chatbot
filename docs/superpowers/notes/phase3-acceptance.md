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
