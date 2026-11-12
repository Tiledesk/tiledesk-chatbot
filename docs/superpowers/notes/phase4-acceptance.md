# Phase 4 local acceptance: in-depth access (2026-11-11)

Code under test (images already on the stack, not rebuilt): executions `d54dd2b` (image 15e46a3bb8d0), server
`adb86f8a` (2fbfbd25aae4), dashboard `d6f265ec6` on `feature/execution-graph` (e6642288b3f9), chatbot unchanged
(d0d74b60e5cb), dev-env `de46bf5`. Stack `tiledesk-exec`, profiles `infra,core,exec`, project
`6af2301d8adf5f00136aa7b0`. Screenshots are in `phase4-acceptance/` (the dashboard shows local time, UTC+1; times
below are UTC).

Method, as in Phase 3: every View data, View values, Close, Audit and Retention action was clicked in the dashboard;
the pane was already signed in as `exec-demo-owner@`, and the supervisor and `exec-agent@` were signed in through the
login form with the seed's test accounts. API calls used JWTs from `POST /api/auth/signin`, kept in mode-600 scratch
files (never printed, deleted at the end). Results were read from the executions API, Mongo (`tiledesk-executions`,
`tiledesk`), Redis, the container logs and a temporary exclusive AMQP tap. Marker values (`MRKP4…`, and a fake
`api_key` `demo-secret-MRKP4…`) were put in the webhook payloads so leaks could be searched for.

| # | Scenario | Result |
|---|---|---|
| 1 | Owner opens values for one block: values, countdown, Close; audit; one Activities row | **FAIL** (UI: values invisible, bug B1); API, audit, countdown, Close, Activities PASS |
| 2 | Whole-execution grant: Flow state tab, history drawer, trigger input | **FAIL** (same B1); PASS with B1 neutralised by a diagnostic style |
| 3 | Grant expiry (TTL 60 s) masks values; old grant → 403 | PASS |
| 4 | Supervisor and custom read-only role: no button, 403 + denied audit + Activities; agent: 403, no audit | PASS |
| 5 | Custom role with `executions_data_access`: allowed (live `rolePermissions`) | PASS (within the API's 60 s role cache) |
| 6 | Labels: secret, too large, not stored, no longer kept, unreadable | PASS with findings F1 (nested secrets in attribute values), F2, F3 (label precision) |
| 7 | Retention: data 30 → 1, data 0, trace shorten, lengthen; audited and in Activities | PASS |
| 8 | Audit tab: every entry, newest first, Load more | PASS |
| 9 | No values in api logs, Activities, RabbitMQ, browser storage | PASS (pre-existing paths noted) |

Local-env changes made for the run, all restored (see Restored): executions-api recreated with
`EXECUTIONS_GRANT_TTL_S=60` and back; two temporary custom roles given to `exec-agent@`; project plan name `Custom`;
project retention 90/30 → 90/1 → 90/0 → 7/0 → 90/30; one throwaway run's `kid` and `started_at` changed in Mongo; an
AMQP tap in the ingest container.

## 1. One block, by the owner

"Exec demo · webhook" fired with `{"order_id":"A-P4-1","customer":{"name":"Ada MRKP4ZQ81","api_key":"demo-secret-MRKP4KEY"},"note":"MRKP4ZQ81","items":[1,2]}`
→ `01a1cbf8-ed01-770c-8f53-13a37d5d5680` (waiting, 3 blocks; sealed: trigger, keyframe step 2, 6 deltas). The header
shows **View data** for the owner (`s1-owner-detail-view-data-button.jpg`). Block `start` expanded → Flow state →
**View values** → dialog "View execution data": reason, scope radio "This block (start)" / "Whole execution", the line
"Your access is recorded in the audit log and shown to the owner"; View data stays disabled until the reason is
filled (`s1-dialog-block-scope.jpg`).
```
POST …/data-access {scope: step 2} -> 201; GET …/state?step_seq=2&grant=… -> 200 (values: order_total "42", status "new", …)
grant 8d25a9d4: scope {step, 2}, created 18:59:23.243, expires 19:14:23.243 (900 s)
audit: data_access_requested accepted (reason, scope, grant_id) 18:59:23.227; data_viewed {step_seq 2} 18:59:23.343
Activities (API): one EXECUTION_DATA_ACCESS row, no row for data_viewed
```
The strip reads "Sealed data · block start · access expires in 14:57 · recorded in the audit log" and counts down
(13:57 a minute later). **But the values are not visible** (`s1-grant-strip-values-invisible-bug.jpg`): the After
cells are empty. The DOM has `<pre class="vc-json">"42"</pre>` with height 0 — bug **B1** below. With a diagnostic
style injected in the page (`pre.vc-json{line-height:1.4}`, page-only, no code change) the values show
(`s1-values-shown-with-diag-css.png`). Outside the scope, block `check` keeps the mask `••• (4 B) number` and its own
"View values" link (`s1-out-of-scope-block-masked.jpg`). **Close** → `POST …/data-access/8d25a9d4…/revoke` (204,
`revoked_at` 19:01:13), strip gone, masks back, no `pre.vc-json` and no marker left in the DOM
(`s1-closed-masks-back.jpg`). The revoked grant then gets 403 `grant_invalid` (`Cache-Control: no-store`).

**FAIL** on "values show" (B1). Everything else in the scenario passes.

## 2. Whole execution

Header **View data** opens the dialog with only "Whole execution" (spec §5). Reason "P4 acceptance s2: whole
execution" → grant d20447a5 (scope execution). With the diagnostic style on:
- trigger input in the strip: `{"order_id":"A-P4-1","customer":{"name":"Ada MRKP4ZQ81","api_key":"[secret]"},…}` (`s2-whole-execution-trigger-input.jpg`);
- Flow state tab, block 3 "after": all 13 attributes with values (`s2-flow-state-tab-values.jpg`);
- history drawer of `order_total`: "start · added · "42"" (`s2-history-drawer-values.jpg`).
```
audit: data_access_requested 19:01:56.925; data_viewed {purpose trigger} .059, {step_seq 2} .065, {step_seq 7} 19:01:57.075,
       {step_seq 10} 19:02:06.968, {key order_total} 19:02:19.314   (one per value request, none for repeats)
GET …/data/trigger?grant=<s2 grant> with the supervisor's JWT -> 403 grant_invalid (a grant is bound to its user)
```
**FAIL** as shipped (B1 hides all three); PASS for the data path, scope and audit. Without the diagnostic style the
Flow state tab shows the attribute names with an empty Value column (`b1-flow-state-values-invisible.jpg`).

## 3. Grant expiry

`EXECUTIONS_GRANT_TTL_S=60 COMPOSE_PROJECT_NAME=tiledesk-exec COMPOSE_PROFILES=infra,core,exec bin/dev up -d --no-build executions-api`
(same image; `printenv` 60). View data → grant b4833f2c created 19:03:25.613, expires 19:04:25.613; strip "access
expires in 1:00" (`s3-grant-ttl-60s-countdown.jpg`). The strip reached 0 and the page went back to masks with
"View values" (`s3-expired-masks-back.jpg`). Then, with the old grant:
```
GET …/state?step_seq=2&grant=b4833f2c…          -> 403 {"error":"grant_invalid"}  Cache-Control: no-store
GET …/data/trigger?grant=b4833f2c…              -> 403 grant_invalid
GET …/state/history?key=order_total&grant=…     -> 403 grant_invalid
```
Restored at once: recreated without the variable, `printenv` 900, healthy. **PASS.** Observation: the page masked about
15 s after `expires_at` (the pane was in the background, so its timers may have been throttled); the API refused on
time.

## 4. Supervisor, custom role without data access, agent

API, on the s1 execution (19:04:59):
```
supervisor  POST data-access -> 403 forbidden; audit data_access_denied {role supervisor, result rejected:forbidden}
            Activities EXECUTION_DATA_ACCESS_DENIED "Super Visor was denied access to the data of execution 5d5680 … (role supervisor)"
            GET …/audit -> 403; GET …/data/trigger?grant=x -> 403 grant_invalid
agent       POST data-access -> 403 forbidden (read gate); no audit entry
admin       POST data-access -> 201 (owner/admin per spec and permissions.ts:19; grant revoked right after)
```
Custom role `p4_exec_read_nodata` (`flows_read, executions_read`) created with `POST /api/<pid>/roles` and given to
`exec-agent@` (`PUT /project_users/:id`, cachegoose key dropped). After the API's 60 s role cache: `GET` execution
200, `POST data-access` 403 with `data_access_denied {role p4_exec_read_nodata}` (19:06:05) and an Activities row
"Exec Agent was denied access … (role p4_exec_read_nodata)". In the dashboard (signed in as `exec-agent@`): no View
data, no Audit tab, no "View values" in the Flow state panel (`s4-custom-role-no-data-no-button.jpg`). Signed in as
the supervisor: the same (`s4-supervisor-no-view-data.jpg`). **PASS.**

## 5. Custom role with `executions_data_access`

Role `p4_exec_data` (`flows_read, executions_read, executions_data_access`) given to `exec-agent@`. After the role
cache: View data is shown; reason "P4 acceptance s5: custom role with data access" → 201, strip "whole execution"
(`s5-custom-role-data-access-granted.jpg`, values invisible again: B1). Audit `data_access_requested` and
`data_viewed`, actor `{Exec Agent, role p4_exec_data}`. Then `executions_data_access` was removed from the role (`PUT
/roles/:id`): within the 60 s cache a new request still got 201 (19:09:36, revoked at once); after it, 403 with
`data_access_denied {role p4_exec_data}` (19:10:55). **PASS**: the role's `rolePermissions` are read live, with up to
60 s of delay (`ROLE_CACHE_TTL_MS`, tiledesk-executions `src/api/projectRole.ts:7`). Not checked: whether a grant
created before the permission was removed stops working (the grant used for it had been closed).

## 6. Labels

- **secret**: `chatbotToken`, `chatbot_jwt_token` show `[secret]` (`s6-secret-label.jpg`).
- **too large**: webhook fired with a 300 000-character `big` field → `01a1cc01-c1c8-…`. `big`, `payload`,
  `lastUserMessage` = `too_large`, shown "too large to store" (`s6-too-large-and-trigger-not-stored.jpg`); the
  small attributes keep their values.
- **not stored**: the same run's trigger input reads "not stored" (finding F2: it was too large, not "not stored").
- **unreadable**: throwaway run `01a1cc01-c217-…`: its `trigger` and `state_keyframe` docs got `kid:
  "p4-retired-kid"` in Mongo. Every keyframe-based value is `unreadable`, shown "unreadable"
  (`s6-unreadable-label.jpg`); values coming from deltas still show; api log `warn "sealed data unreadable"
  {kind, error: UnknownKid}` with no value.
- **no longer kept**: see 7 (dialog "The data of this execution is no longer kept (retention 1 days)").

**PASS** with findings. **F1:** `customer.api_key` is masked in the trigger input but shown in clear in the
`customer`, `payload` and `lastUserMessage` attribute values (`s6-nested-secret-not-masked.jpg`, API response
`customer.value.api_key = "demo-secret-MRKP4KEY"`).

## 7. Retention

Project settings › Retention, card "Executions" (`s7-retention-card.jpg`): trace 90 (7–365), sealed data 30 (0–90;
0 = don't capture), "Audit log: 1 year (fixed) · Test runs: 7 days (fixed)".

- **Data 30 → 1.** Confirm "Shorten retention — Data older than 1 days will be deleted within a few minutes. This
  cannot be undone." (`s7-shorten-confirm-data-1.jpg`) → saved 19:14:31. Older run `01a1c69f-1ad1-…` (started 11-10
  18:01): `data_until` 2026-12-10 → 2026-11-11T18:01:18 on the execution, its steps and its 7 sealed docs; `trace_until`
  unchanged. Sealed docs past `data_until`: 2215 of 3230; at 19:14:59 (28 s later) all 2215 were gone (TTL monitor),
  1015 left. View data on that run → 410, the dialog reads "The data of this execution is no longer kept (retention 1
  days)"; the timeline is still there (`s7-data-expired-410-trace-kept.jpg`). Audit `data_access_requested
  rejected:data_expired`.
- **Data 1 → 0.** The confirm adds "Attribute values and inputs will no longer be captured; stopped runs can no longer
  be resumed from stored data." (`s7-confirm-data-0.jpg`). Saved 19:15:31: `exec:policy:<pid>` `capture_data` =
  `false`; every sealed doc and checkpoint got `data_until`/`expires_at` = now; at 19:16:25 sealed 0 (was 1015),
  checkpoints 0 (was 125). Two new webhook runs (`01a1cc09-6d36-…`, `01a1cc09-c2db-…`): 0 sealed docs, trace recorded
  (3 steps, 30 state changes); tybot logs "no sealed checkpoint … capture_data off". View data on such a run → "The
  data of this execution is no longer kept" (`s7-data0-run-no-longer-kept.jpg`, finding F3).
- **Trace 90 → 7.** The throwaway run `01a1cc01-c217-…` had its `started_at` set 10 days back in Mongo. Saved 19:17:34
  (`s7-confirm-trace-7.jpg`): its `trace_until` became 2026-11-08; at 19:18:35 the execution, its 3 steps, 28 state
  changes and 1 manifest were gone (API 404); its 5 audit entries stayed.
- **Lengthen to 90/30.** No confirm, "Saved" (`s7-lengthen-90-30-saved-no-confirm.jpg`). The dates of `01a1cbf8…`
  (trace 11-18, data 11-11 19:15) and `01a1c69f…` (trace 11-17, data 11-11 18:01) were the same before and after;
  `capture_data` back to `true`; `GET …/settings/retention` = 90/30 = defaults.
- **Audited and in Activities.** `retention_update` entries (no execution id) 19:14:31 {90/30 → 90/1}, 19:15:31 {90/1 →
  90/0}, 19:17:34 {90/0 → 7/0}, 19:18:49 {7/0 → 90/30}; Activities rows "Exec Owner changed executions retention: data
  30 → 1 days", "data 1 → 0 days", "trace 90 → 7 days", "trace 7 → 90 days, data 0 → 30 days"
  (`s4-s7-owner-activities-rows-1.jpg`; plan temporarily `Custom`).

**PASS.** Consequence to know: the trace shorten is irreversible by design, so every execution of this project that
existed at 19:17 now has `trace_until` = start + 7 days. The traces of 11-09/11-10 will be deleted from 2026-11-16, the
ones of today from 2026-11-18. All sealed data and checkpoints that existed at 19:15 are already gone, so the Phase 3
runs can no longer be resumed from a durable checkpoint.

## 8. Audit tab

New marker run `01a1cc0e-07de-720c-a619-14f91d32cea2`. View data (whole execution), then 52 history reads through the
API with the same grant, so the execution has 55 audit entries (Mongo count 55). API: page 1 = 50 entries, sorted newest
first, `next_cursor` set. Audit tab: "Who did what to this execution, newest first", "Open in Activities", 50 rows
with time, actor, action, result chip (`s8-audit-tab-newest-first.jpg`); **Load more** → 55 rows, the button goes away;
the oldest row is "Exec Owner requested access to the data of execution 32cea2 of Exec demo · webhook · whole
execution" with its reason on a second line (`s8-audit-tab-after-load-more.jpg`). **PASS.** Observation: a block-scope
read reads "viewed data (block 10)" (step seq, not the block name).

## 9. No values outside the view

- **executions-api logs** (since its last recreate at 19:04:50; every value read of scenarios 4–9 happened after it): 7
  lines, info level; 0 hits for `MRKP4`, `demo-secret` or `A-P4-`. The only data-related lines are the 4
  `UnknownKid` warnings (ids, kind, no value). Ingest and jobs: 0 hits.
- **Activities**: owner's 2 pages (80 rows): 0 hits in any `EXECUTION_*` row (9 DATA_ACCESS, 3 DENIED, 4
  RETENTION_UPDATE, …). Rows carry the reason, scope and grant id only. 6 `REQUEST_CREATE` rows carry the webhook
  payload with the markers, which is pre-existing (Phase 3 observation). `audit_log` (94 docs since 18:50) and
  `grants`: 0 hits.
- **RabbitMQ**: a temporary amqplib consumer in the ingest container with exclusive auto-delete queues bound with `#`
  to `tiledesk.executions` and `tiledeskserver`, running while the s9 run was fired and read: 69 messages on
  `tiledesk.executions` (execution/step/action events, 1 `audit…data_access_requested`, 54 `audit…data_viewed`), 0 hits
  for the markers, 0 `value` keys; 9 messages carry sealed blobs (`alg RSA-OAEP-256+A256GCM`, ciphertext only).
  `tiledeskserver` carried nothing in that window. The tap was then killed, its queues are gone, and the script was
  removed. `executions.ingest.dlq` still holds its 2 old Phase 1 messages.
- **Browser storage**: during an active grant (s2 and s9) and after Close: localStorage 43–48 keys with no marker and
  no grant id; sessionStorage empty; no IndexedDB, no CacheStorage, no service worker; no marker in cookies. After
  Close, the marker is no longer in the DOM. Every value response has `Cache-Control: no-store`, refusals included.

**PASS.** Context, not Phase 4: the chatbot (tybot at debug level) logs request bodies and attributes, with 48 marker
hits.

## Restored

- executions-api: recreated with `EXECUTIONS_GRANT_TTL_S=60`, then recreated without it; `printenv` 900, healthy, same image.
- `exec-agent@` back to role `agent` (`project_users/me` answers `agent`). Temporary roles `p4_exec_read_nodata` and
  `p4_exec_data` deleted (0 custom roles in the project, as before). Cachegoose keys `project_users:iduser:<agent>` and
  `roles:p4_*` dropped.
- Project plan name `Custom` → `Sandbox`, `cacheman:cachegoose-cache:projects:id:<pid>` dropped, API answers `Sandbox`.
- Project retention back to 90/30 through the card (a PUT; it equals the defaults); `capture_data` `true`. The data the
  shortening deleted stays deleted, and the existing traces keep their 7-day `trace_until` (see 7).
- Grants: the admin and agent grants made by API were revoked; no grant is active.
- AMQP tap process killed, its queues gone, `/tmp/p4tap*` removed from the ingest container.
- JWT scratch files deleted. Browser pane viewport reset; signed in as `exec-demo-owner@` as at the start.
- Left behind (data only): the test runs `01a1cbf8…`, `01a1cc01-c1c8…` (big), `01a1cc09-6d36…`, `01a1cc09-c2db…`
  (data 0), `01a1cc0e…` (s9), their audit entries and Activities rows. The throwaway run `01a1cc01-c217…` (changed
  `kid` and `started_at`) was deleted by the trace shorten; its 5 audit entries remain.

No image built, nothing pruned, no product code touched.

## Bugs and findings

- **B1 (blocker for 1, 2, 5): every revealed value renders invisible.** The value cell prints the JSON in
  `<pre class="vc-json">` (tiledesk-dashboard `src/app/bots/executions/shared/value-cell.component.ts:27`, style at
  :36 with no `line-height`). A global `pre { … line-height: 0; }` from
  `src/app/ui/notification-message/notification-message.component.scss:103-114` leaks into every page because that
  component uses `ViewEncapsulation.None` (`notification-message.component.ts:22`). The `pre` gets a computed
  line-height of 0px and a height of 0. The values are in the DOM, but the Flow state panel, Flow state tab, history
  drawer and trigger input all look empty. Labels such as "too large to store" are not in a `pre`, so they show. Fix:
  `line-height: 1.4` (or `normal`) on `.vc-json`; a Karma test cannot see it, since the leaked rule is not loaded there.
- **F1 (secrets nested in an object attribute are not masked):** tybot's keyframe/delta sealing skips only top-level
  secret-named keys (`sealableState`, tiledesk-chatbot `tybotRoute/executions/ExecutionRecorder.js:164-171`; deltas
  via `StateDiff.diffStates`, `:1026`), while the trigger payload is deep-stripped (`stripSecrets`, `:360`,
  `secrets.js:15`). So `customer.api_key` is `[secret]` in the trigger input but in clear in `customer`, `payload` and
  `lastUserMessage` once a grant is opened. Only grant holders see it. It is still inconsistent with spec §5's
  `[secret]` for secret-named fields, and it makes the trigger mask ineffective.
- **F2 (label):** an over-256 KB trigger payload is labelled "not stored", not "too large to store". tybot drops it
  (`sealInto` treats null and TOO_LARGE the same, `ExecutionRecorder.js:150-161`), and the API answers `not_stored` when
  there is no row (tiledesk-executions `src/api/stateValues.ts:188`).
- **F3 (label):** a run started with data 0 shows "The data of this execution is no longer kept" (410), not "not
  stored". The ingest sets its `data_until` to the start time, and `POST data-access` checks `data_until` before
  `no_data` (`src/api/routes/dataAccess.ts:82-89`).
- **Doc:** tiledesk-dev-env `README.md:199` says "Admins and supervisors see the trace but not the values". Per spec §1
  and `permissions.ts:19`, admins may open values (confirmed: 201).
- Observations: the dialog's Cancel/View data buttons render very small; "Data older than 1 days" (plural);
  `data_access_requested rejected:data_expired` has no Activities row (only accepted and denied are mirrored); the
  admin's Activities row shows the email next to the name, unlike the others; a deep link right after a page load
  still renders empty until a reload (pre-existing, Phase 3).

# Fix-wave re-check (2026-11-11)

Code under test, rebuilt with `bin/exec-rebuild` and recreated with `bin/dev up -d --no-build`: executions `3f7486c`
(image 6cbf6904848b; api, ingest and jobs recreated), dashboard `128f42d69` (image 68946c2416b3). The server was not
rebuilt. All services healthy; the browser pane was reloaded onto the new bundle. Disk was 59 GiB free before and
after; nothing pruned. As owner `exec-demo-owner@`, same method as above (JWT in a mode-600 scratch file, deleted).
Screenshots are `phase4-acceptance/fw-*`.

| # | Check | Result |
|---|---|---|
| R1 | Scenario 1: values visible in a covered block, countdown runs, Close masks | **PASS** |
| R2 | Scenario 2: whole-execution grant, Flow state tab, history drawer, trigger input show values | **PASS** |
| R3 | F1: nested `customer.api_key` shows `[secret]`, siblings visible | **PASS** |
| R4 | `data_viewed` dedupe on a live run (about 30 s with the grant open) | **PASS** |
| R5 | Dialog buttons normal size | **PASS** |
| R6 | Retention card: two confirm lines; data 0 text; data above trace inline; Save disabled when unchanged | **PASS** |
| R7 | Run captured at data 0: 404 `no_data`, "No data was stored" | **PASS** |
| R8 | Server-ended grant: next refused read ends the strip and masks values | **PASS** |

- **R1.** Run `01a1cc2b-be61-751a-bc29-bec62200230c` (fired with a payload carrying `customer.api_key` and marker
  `MRKFW1`). Block `start` → Flow state → View values → "This block (start)". The strip reads "Sealed data · block start
  · access expires in 14:59" and the After cells show `"42"` and `"new"`
  (`fw-r1-values-visible-block-grant.jpg`). The `pre.vc-json` elements have a computed line-height of 17.4px and
  offsetHeight 17 (B1 had 0). The countdown went 14:59 → 14:44 in about 8 s. Close removes the strip and the cells
  go back to `••• (4 B) string`, 0 `pre.vc-json` (`fw-r1-closed-masks-back.jpg`).
- **R2.** Header View data, "Whole execution" only. Trigger input in the strip shows the payload with `api_key`
  `[secret]` (`fw-r2-trigger-input.jpg`); Flow state tab, block "after": all 13 attributes with values
  (`fw-r2-r3-flow-state-tab-customer-secret.jpg`); history drawer of `order_total`: `start · added · "42"`
  (`fw-r2-history-drawer.jpg`).
- **R3.** Under the whole-execution grant the `customer` attribute reads `{"name": "Ada MRKFW1", "api_key": "[secret]"}`
  and `payload` the same way. Three `[secret]` in the DOM text; `MRKFWKEY` and `demo-secret` appear nowhere in the
  page text or HTML. Same screenshot as R2.
- **R4.** A fresh "Exec demo · hang" run `01a1cc2d-d83c-77f8-85cd-f5e6743709c5` (running for 120 s), grant on block
  `hang` (step 6), left open and polling about 60 s. audit_log: 1
  `data_access_requested` and 1 `data_viewed` {step_seq 6} with `view_key` `<grant>|step:6`. The proxy log shows 2 grant
  state reads in the window (the page no longer force-reads every 2 s). Then 5 more direct API reads of the same
  step with the same grant all answered 200 and the count stayed at 1.
- **R5.** `fw-r5-dialog-normal-buttons.jpg`: Cancel 71x36 px and View data 90x36 px, 14px font, both
  `mat-mdc-button` (small before).
- **R6.** Both lowered (90/30 → 60/10): the confirm reads "Traces of runs older than 60 days will be deleted within a
  few minutes." / "Attribute values, inputs and checkpoints of runs older than 10 days will be deleted within a few
  minutes." / "This cannot be undone." once (`fw-r6-two-confirm-lines.jpg`); cancelled, nothing saved. Data 80 with trace
  60: inline "Sealed data cannot be kept longer than the trace (60 days).", no dialog, no PUT (proxy log 0 PUTs, API
  still 90/30) (`fw-r6-data-above-trace-inline-no-dialog.jpg`). Data 0: "All stored attribute values, inputs and
  checkpoints will be deleted within a few minutes." plus "Attribute values and inputs will no longer be captured;
  stopped runs can no longer be resumed from stored data.", no "0 days" (`fw-r6-data-zero-confirm.jpg`). Save is
  disabled with nothing changed (button `disabled` true on load).
- **R7.** With data 0 saved (sealed 23 → 0, checkpoints 3 → 0, `exec:policy` `capture_data` false), a new webhook run
  `01a1cc32-2436-73fb-bc34-62dcf780917f` stored 0 sealed docs. `POST data-access` → 404 `{"error":"no_data"}`; the
  dialog shows "No data was stored for this execution" (`fw-r7-no-data-was-stored.jpg`), not "no longer kept".
- **R8.** On the R2 grant, `POST …/data-access/<grant>/revoke` through the API (204) while the page stayed open (the
  values stayed, there had been no read since). Clicking another attribute's history made a read that the server
  refused: the strip vanished, every value went back to a mask (`••• (5 B) string`, also in the drawer), 0 `pre.vc-json`,
  no marker in the DOM, View data back in the header (`fw-r8-server-ended-grant-masked.jpg`).

**Retention side effects (R7 needs data 0, so this was not avoidable).** Retention was changed 90/30 → 90/80 (an
accidental lengthen: a mis-aimed click on the layout that shifts when the inline message shows) → 90/0 → 90/30. The
data 0 step deleted every sealed doc and checkpoint of the project (23 and 3), so the runs of this session and of
earlier ones can no longer show values or be resumed from a checkpoint; traces stay. The last save (0 → 30) is a
lengthen: nothing more was deleted. `retention_update` audit entries at 19:58:14, 19:58:51 and 20:00:41.

**Restored.** Retention 90/30 (`GET settings/retention` 90/30, `capture_data` true); plan name `Sandbox` (not changed in
this pass); no custom role or role change was made; no active grant (R1 closed in the UI, R2 revoked through the API,
R4 closed in the UI); JWT scratch files deleted; no server or tool process left running. Left behind: the runs
`01a1cc2b…`, `01a1cc2d…` (hang) and `01a1cc32…` (data 0) with their audit entries.

No product bugs found in this pass.
