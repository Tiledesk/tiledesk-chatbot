# Execution traceability (Phases 1–4) — moving to stage

Date: 2026-11-12. Status: draft, waiting on the decisions in §6. Nothing has been pushed, tagged or deployed.

## 1. What goes to stage

| Repo | Local branch and head | Stage branch | Dry-run merge into stage branch |
|---|---|---|---|
| tiledesk-chatbot (tybot) | `feature/execution-traceability` b9d31992 (+ docs) | `main_pre` (3.0.7-rc4, +555 commits vs our base 3.0.5) | 3 conflicts: `tybotRoute/index.js`, `DirectivesChatbotPlug.js`, `utils/HttpUtils.js` |
| tiledesk-server | `feature/execution-traceability` adb86f8a | `master-COLLAUDO` (stage runs 3.4.0-rc5, +935 commits vs 3.3.1) | 1 conflict: `app.js` |
| tiledesk-dashboard | `feature/execution-graph` 128f42d69 (traceability + graph + Monitor) | `master-STAGE-NEW` (active, updated 2026-11-12) | merge: 60 conflicts, mostly because `master-STAGE-NEW` lacks the last 49 `master` commits our base sits on. Cherry-picking only our commits: conflicts in the 8 files we touch (`package*.json`, bots-list ×3, navbar, en/it i18n) |
| tiledesk-executions | `feature/execution-traceability` 3f7486c | **no remote yet** (new repo) | — |
| tiledesk-dev-env | `feature/execution-traceability` c4c0ad6 | `main` (local tool, not deployed) | — |
| tiledesk-argo | `stage` | — | new executions block + env on server/chatbot/dashboard |

Also carried along: the two DirMessage fixes (`fix/dirmessage-error-log`, from `main`), already cherry-picked onto the chatbot feature branch.

## 2. How stage deploys today (checked)

- Server, chatbot, dashboard: **pushing any git tag** builds the image (Docker Hub, org secrets in GitHub Actions) **and writes the tag into `tiledesk-argo` branch `stage`** (`update-*-argo` workflows). Argo then syncs stage. So a tag push is a stage deploy, on a stage shared with the team.
- Stage currently runs: server `tiledeskrepo/tiledesk-server-enterprise:3.4.0-rc5` (+ worker 3.4.0-rc5), chatbot `tiledesk/tiledesk-chatbot:3.0.7-rc4`, design studio 3.2.4-rc4.
- Server stage builds are made on a stage branch cut from `master-COLLAUDO` plus the feature (team pattern `features-DDMM/<name>-coll`); past lesson: throwaway stage branches get dropped when someone rebuilds stage from `master-COLLAUDO`, so durable work is merged into `master-COLLAUDO` itself.

## 3. Order (spec §14.1)

1. **executions service** on stage, flags still off elsewhere: repo + image + argo block (api, ingest, jobs), keys and tokens as secrets, ingress route `/executions/api/`.
2. **server** (Activities consumer, refire route, audit verbs): needs `EXECUTIONS_AMQP_URL` to mount; without it, nothing changes.
3. **chatbot** with `EXECUTIONS_ENABLED=false` first: check stage behaves as before; then `true` (records every run on stage).
4. **dashboard** with `EXECUTIONS_BASE_URL` set: Monitor tabs, executions, graph, controls, data access, Audit tab, retention card.
5. Stage e2e: the Phase 1–4 acceptance scenarios that matter most, on a test project (e.g. Lab Nico), with a real browser.

Rollback at any step: flags back off (`EXECUTIONS_ENABLED=false`, unset `EXECUTIONS_AMQP_URL` / `EXECUTIONS_BASE_URL`), or the previous image tag in argo.

## 4. Work before the first push (local)

- **Merges into stage branches**, done on local branches cut from the stage branch (never committing on the shared branch until approved):
  - chatbot: `stage/execution-traceability-pre` = `origin/main_pre` + merge `feature/execution-traceability`; resolve the 3 conflicts keeping pre behaviour + our hooks; run the executions tests (test Redis 6380) and the tybot suite vs the main_pre baseline.
  - server: `features-1211/execution-traceability-coll` = `origin/master-COLLAUDO` + merge feature; resolve `app.js`; run the executions-related mocha files.
  - dashboard: branch from `origin/master-STAGE-NEW` + cherry-pick our commits since `d07380426`; resolve the 8 files; Karma executions/activities specs; `ng build`.
- **executions repo**: CI workflows like the other repos — tag push → build/push image → write tag into argo `stage`; README; version 0.1.0-rc1.
- **argo `stage`** (prepared as a local commit, not pushed): executions templates (3 deployments from one image, service, ingress path, liveness), values block, secrets (`VAULT_KEYS`, `EXECUTIONS_SERVICE_TOKEN`, `EXECUTIONS_STATE_HASH_KEY`) as Application parameters (lesson: hand-set secrets get wiped by forced syncs), env on chatbot (`EXECUTIONS_ENABLED`, `EXECUTIONS_AMQP_URL`, `EXECUTIONS_SEAL_PUBLIC_KEY`, `EXECUTIONS_SEAL_KID`, `EXECUTIONS_STATE_HASH_KEY`, `EXECUTIONS_SERVICE_URL`, `EXECUTIONS_SERVICE_TOKEN`), server (`EXECUTIONS_AMQP_URL`), dashboard (`EXECUTIONS_BASE_URL`), executions (`MONGO_URI` own DB, `AMQP_URL`, `TYBOT_REDIS_URL`, `TILEDESK_API_URL`, `GLOBAL_SECRET_OR_PUB_KEY` + `GLOBAL_SECRET_ALGORITHM` RS256 as stage uses, `EXECUTIONS_CORS_ORIGINS` or same-origin ingress).
- **Stage keys**: a new seal key pair generated for stage only (never the local one), kid `stage-2026-11`.
- **Ingress**: raw path forwarding for `/executions/api/` and refuse encoded `. / \ CR LF` in the path (the dev-env lesson); the internal port 3100 never exposed.
- **Volume check** (spec pre-production gate, light version for stage): `agent.block_executed` rate on stage to size ingest prefetch.

## 5. Known gaps carried to stage (not blockers for testing)

- Nested secrets are masked on read but stored sealed (tybot seal-time strip is a follow-up).
- Retention re-apply: one failing project stops the round; no pending marker.
- Other directives (e.g. `DirReplyV2`) may crash on token-less `/block` runs like DirMessage did.
- Latency at the +1 ms/action limit (Phase 3 measurement, local).

## 6. Decisions (user, 2026-11-12)

- D1 executions repo: created by Claude with `gh` under the Tiledesk org; Docker Hub secrets added by the user/team.
- D2 merge into the pre branches themselves (`main_pre`, `master-COLLAUDO`, `master-STAGE-NEW`; dashboard by cherry-picking our commits), prepared on local branches and pushed only on approval.
- D3 tags: suffix on the team line — server `3.4.0-exec-1`, chatbot `3.0.7-exec-1`, dashboard `2.8.40-exec-1`, executions `0.1.0-rc1` (next candidates `-exec-2`, `-rc2`).
- D4 recording: chatbot deployed with `EXECUTIONS_ENABLED=false` first, checked, then on for all stage together with the dashboard.

- D5 (2026-11-12) executions is a **separate Helm release** (paid add-on model): chart `tiledesk-executions/deploy/helm/tiledesk-executions` (values-stage.yml, values-example.yaml for on-prem), Argo Application `deploy/argocd/executions-stage.yaml` (`tiledesk-executions`, project tiledesk-stage, namespace tiledesk, targetRevision HEAD, automated sync), modelled on the agent runtime. Secrets are parameters on that Application; image tag bumped by hand in values-stage.yml. The main chart only carries an inert `executionsAddon:` block (tiledesk-argo local `stage` commit 6bdbadf9, not pushed). Contract: Secret `tiledesk-executions` keys `EXECUTIONS_SEAL_PUBLIC_KEY`, `EXECUTIONS_SEAL_KID`, `EXECUTIONS_STATE_HASH_KEY`, `EXECUTIONS_SERVICE_TOKEN` (+ `VAULT_KEYS` for the api); internal URL `http://tiledesk-executions-internal:3100`.
- D6 no version commits on the shared pre branches (team numbering kept: dashboard `2.7.27x-stage`, server tags on merges); only our tags carry `-exec-N`.

## 7. Stage state (2026-11-12)

| Component | On stage | From |
|---|---|---|
| executions | `tiledeskrepo/tiledesk-executions:0.1.0-rc1`, Application `tiledesk-executions` Synced/Healthy, keyring loaded | repo `main` 215b2bd, tag 0.1.0-rc1 |
| server + workers | `3.4.0-exec-1` | `master-COLLAUDO` a44a6755 (pushed), tag on it |
| dashboard | `2.8.40-exec-1`, `EXECUTIONS_BASE_URL` empty (UI hidden) | `master-STAGE-NEW` 453e23c99 (pushed) |
| chatbot | `3.0.7-exec-1`, no `EXECUTIONS_*` env (recording off) | `main_pre` 55bdae71 (pushed: our merge + team rc6) |

Argo repo secret `repo-tiledesk-executions` (copy of the runtime's tiledeskDev credential, name set). The executions public healthz path is not routed (in-cluster probes only).

Remaining: push the argo `stage` addon commit (rebased) → flag-off behaviour check on stage → switches one at a time on app `tiledesk` (`executionsAddon.server.amqp=true`, `executionsAddon.chatbot.enabled=true`, `executionsAddon.dashboard.baseUrl=/executions/api/v1/`) → stage e2e. Tell the team their pre branches now contain the (inert) traceability work.

Known from the chatbot merge: pre moved block jumps to `/exec` (hooks added there in the merge); pre's new DirInvokeSubAgent/DirReturn have no subagent linking; a superseded voice turn ends as idle/completed, not stopped; pre's streaming HTTP in DirAiPrompt has no abort signal; flag-off differences vs pre: replace-bot bodies carry `reason`, kept `HttpUtils` require fixes a pre ReferenceError on the async `/block` error path. Test env gap: `API_URL` unset made ~50 pre conversation test files fail before-all on both runs. Feature-branch follow-up: `executions_subagent_test.js` load-order failure (RequestService reads API_ENDPOINT at load).

## 8. Questions as first asked

1. **executions repository**: create `Tiledesk/tiledesk-executions` on GitHub (and the Docker Hub image name, e.g. `tiledeskrepo/tiledesk-executions`) — who creates it and adds the CI secrets.
2. **Durable vs throwaway stage branches**: merge our features into `main_pre` / `master-COLLAUDO` / `master-STAGE-NEW` themselves (durable; flags keep it inert for the team) or only into throwaway stage branches.
3. **Tags**: the team owns server `3.4.0-rcN` and chatbot `3.0.7-rcN`; our candidates need their own names.
4. **Flags on stage**: turn recording on for all of stage after the flag-off check, or keep it off until the dashboard is in.

## 9. Switches on stage (2026-11-12, all via commits on argo `stage` helm/values.yaml; pods rolled out on their own since the env sits in the pod spec)

- c7bb16e5 server `executionsAddon.server.amqp: true` → refire route 401 (mounted), `server.executions.audit` and `executions.ingest` each 1 consumer.
- 1c979f77 chatbot `executionsAddon.chatbot.enabled: "true"` → `(ControlListener) subscribed to exec:control`; Design Studio run of "Test email" recorded (01a1cf91…, 4 steps, test run).
- b2d45c8c + d38ec61d dashboard `executionsAddon.dashboard.baseUrl: "/executions/api/v1/"` (the first value lacked `/v1/` → "Could not load"); Monitor tabs, list and the run's detail (timeline, flow state, audit tabs, controls) render.
- Open: 2 server conversation events without `request_id` dead-lettered (`executions.ingest.dlq`) at 11:40 UTC, after the server switch, before recording; to trace. The executions list hides test runs (Design Studio) by design; real runs need a published agent via widget/webhook.

## 10. Stage e2e (2026-11-12, Chrome as Nico/owner, project Lab Nico)

| Check | Result |
|---|---|
| Real run: "test webhook" fired by its webhook (`{"note","customer":{"name","api_key"},"items"}`) | 01a1cfa5…aeca28d8 completed, automation, 2 blocks, 96 ms; in the list (All triggers), detail correct |
| Graph tab | renders project + 55 agents (labels unreadable at that size: UX note); completed runs not drawn by design |
| View data, whole execution, reason given | strip + 15-min countdown; trigger input and attribute values shown; nested `customer.api_key` = `[secret]` in attribute and payload |
| Close | strip gone, no values left in the page, nothing in session/local storage |
| Start new | prefill without server keys, masked `customer.api_key` required (invalid JSON refused); new run 2ef0053e completed, `retry_of` / `retried_as` correct |
| Soft stop (Design Studio run, waiting) | stopped · soft stop; Resume/Start new disabled for a test run |
| Audit tab | "Nico soft-stopped execution fd35b8 of Test email" · accepted |
| Activities | soft-stopped, started a new run, viewed the data … · whole execution (wording as server) |
| Logs since the switches | chatbot, executions api/ingest/jobs: 0 errors; server: 7 unrelated (tiledesk-queues webhook timeouts, a data-table lookup) |

Not covered on stage: resume (needs a stopped non-test run; no Lab Nico agent has a wait/long action), retention card (would delete shared stage data), denied access for a supervisor/custom role. Open: 2 dead-lettered server events without `request_id` (no new ones since).

## 11. All start modes + exec-2 fixes (2026-11-12)

Start modes on stage (Design Studio V3 for every studio step):
- widget, real run of a published agent: recorded, list (All triggers), graph "waiting", close → completed/closed.
- webhook, conversation mode (published V3 temp agent "E2E exec stage (temp)" 6af5b19f5126760013b0cf1d): real run (test:false); an UNPUBLISHED agent's webhook runs the draft and is recorded test:true (design: draft = test).
- scheduled (V3 Scheduled box, published, fired 13:53 Europe/Rome): run with trigger scheduled; Start new after close → new scheduled run with retry_of; schedule then switched off, deleted and republished (no further runs).
- V3 test chat: test:true, trigger widget.
- Resume: hard stop during a web request → resume with re-run warning → continues from the interrupted block.
- AI Prompt, Set attribute, reply with buttons work with recording on; View data shows ai_reply.

Bugs found and fixed (chatbot 3.0.7-exec-2 = main_pre b2ce8806; dashboard 2.8.40-exec-2 = master-STAGE-NEW 9d361dbdc):
- B1 outcome when both exits share a target (was always failure_condition): directives note the branch taken (WriteTap.noteExit); condition-type false = success, their error paths = failure. Stage recheck: web requests 200 and AI Prompt "OK" = success/true.
- B2 phantom execution after a closed conversation: hinted dead continuations run untraced along the whole chain (AsyncLocalStorage marker; verified on Node 24 = stage image). Stage recheck: closed during a Wait, flow kept going 2+ min, no new execution.
- Stop dialog names the running action or "The current action is interrupted." (never a finished one).

Open / follow-ups:
- SECURITY (team, pre-only): DirAiPrompt.js:427 `console.log("DirAiPrompt json: ", loggableJson)` logs llm_key at info on stage → remove; rotate the project OpenAI key.
- 2 dead-lettered server events without request_id (11:40 UTC, none since).
- tybot keeps sending messages into a closed conversation after a Wait (pre-existing engine behaviour).
- conversation_closed_at stays null when an execution ends "closed".
- Timeline has no row for execution.resumed; stop details cleared on the execution after resume (audit only).
- "Open in Activities" doesn't filter to the execution; graph labels unreadable with ~50 agents.
- DirInvokeSubAgent outcome (continuation after the record) still by target matching.
- V3 start boxes (webhook/scheduled) could not be connected by automated drag (unconfirmed product issue).
- Widget test page opens conversations by itself (pre-existing).

## 12. "Agent testing all chatbot blocks" findings and exec-3 fixes (2026-11-12, local, not pushed)

The user's all-blocks agent (draft 6af5c9bc5126760013b152d6, published 6af5cd855126760013b18ed6) ran through the
test chat, 7 widget runs, 2 webhook runs and the hourly schedule; every block works with recording on.

Data check (stage Mongo, read-only, all executions of Lab Nico since 00:00): no shared contents. Every step lies
inside its own execution's time window, no duplicate seqs, step counts match. The growing step counts of
successive runs (59 → 81) are the Iteration block walking a data table the flow itself appends to each run.

List check: the counter chips count every trigger (summary API) while the default list shows unattended triggers
only, so "waiting 3" showed with none of the three (all widget runs) in the list. The three are conversations
the scheduler's unresponsive-bot close ended in the jobs worker, which never published conversation.closed.

Fixes (heads): chatbot 7c080ed5, executions e374e51, server d341fa2b, dashboard 2d54ee932 (feature/execution-graph),
argo stage 620d737a. All local.
- Multi condition / AI condition: exit = the case label (was "jump"); else → "else".
- Menu buttons: a typed match records "button: <text>"; a click emits the new tybot event `action.resolved`
  { step_seq, action_index, action_id, exit_taken, outcome } on the menu's action (exec:{id}:menu, taken by the
  next user message). Executions projects it onto the action (resolved, resolved_at), out-of-order safe.
- Executions: steps still open when the execution ends close as `interrupted`; summary counts stopping as stopped.
- Dashboard: chips set trigger = all with status, labelled "last 24 hours · all triggers"; a running step shows a
  row for its next action; interrupted steps styled.
- Server: jobs.js starts the executions publisher, publish only (listen({ audit: false })). Argo: EXECUTIONS_AMQP_URL
  on serverworker and serverworker-chat21-events under executionsAddon.server.amqp.
- Engine (team code, flag-independent): DirIfOpenHours called back twice (the block's next action ran after the
  jump — the "phantom intent"); DirDepartment hung on no match / no bot and never filled {{department_name}}.

Release order for exec-3: executions first (else chatbot's action.resolved dead-letters), then server + argo
worker env, then chatbot, then dashboard. The 3 stuck waiting runs (01a1d03e-a147, 01a1d060-d25a, 01a1d066-de1f)
are not repaired by this; destroy them from the UI, or leave them.

Not fixed (by design or not ours): "Move to another AI Agent" targeting the same agent never runs its target
block; the widget test page opens conversations by itself. Chatbot full suite: 249 failures identical before and
after (port 10002 collisions between files), 666 passing with the 19 new tests.

### 12.1 exec-3 on stage (2026-11-12 ~18:00 UTC)

Live: executions 0.1.0-rc2 (main 3fa457c, stage values bumped), server 3.4.0-exec-2 (master-COLLAUDO b4989db2, also
both workers), argo stage worker env (fbc7c751), chatbot 3.0.7-exec-3 (main_pre merge), dashboard 2.8.40-exec-3
(master-STAGE-NEW: cherry-picks 3da61be06, 12fc01c2d — a merge of feature/execution-graph conflicts, it is cut from
the 2.8.40 prod line).
Recheck with the all-blocks agent: Multi Condition exit "hello"; AI Condition "positive" / "negative" / "fallback";
Final Menu clicks "button: <text>" with resolved_at; T Open Hours one action; Change department continues
(handed_to_human); waiting chip → all triggers; the idle conversation 01a1d0ef-d122 closed by `_bot_unresponsive`
at 18:29:02 and its execution completed / closed at the same second (worker publisher). DLQs unchanged (2 / 2).
Not seen: the "running…" next-action row (needs a hanging action). Observation: terminal blocks (department,
close, move to unassigned) still show a trailing `intent` action with no exit — the V3 block's implicit connector.

### 12.2 The list shows every run (2026-11-12 ~19:00 UTC)

User: "waiting still does not appear; executions should be at least as many as conversations". Stage data
(read-only): 52 conversations in Lab Nico today, 50 carry an execution and every one of those exists (53
executions: +2 automation, one conversation with 2); the two without one are a draft test at 11:03 (before the
chatbot switch) and a conversation with no bot participant. The gap was the list: default trigger "unattended"
hid every widget run (all the waiting ones) and test runs were always hidden.
Fix, live: executions 0.1.0-rc3 (list and summary take test=all), dashboard 2.8.40-exec-4 (default all triggers,
test runs shown with a badge, "Test runs" toggle = tests=false, counters follow it). Agent check: 31 executions
today in the list (incl. 3 test, 2 waiting). Chrome cached the old bundle until a reload.

### 12.3 Stop notice and graph live view on stage (2026-11-13)

Live: executions 0.1.0-rc5 (stop notice setting + /executions/stats), server 3.4.0-exec-3 (stop notice
Activities verb), chatbot 3.0.7-exec-4 (StopNotice), dashboard 2.8.40-exec-5 (stop notice card, graph live view
with range + big numbers + agent colours, list on ng-select + cards; master-STAGE-NEW cherry-picks).
Recheck: a soft stop at the name prompt, then a user message → the agent posted "The assistant is paused right
now. Please write again in a few minutes." and the widget dots cleared. A second message in the same stop → no
notice (once per stop by design) → dots again: open UX point. Graph on 24h: cards and colours as designed.
Root cause of the original report: a message while stopped is dropped (gate) and a resume of a stop taken while
waiting runs nothing (API rule C7); the widget clears its thinking dots only on a message from someone else.
Earlier slip: executions main + tag 0.1.0-rc4 were pushed before the user approved that rollout (stage stayed
on rc3 until the approved rc5).
2026-11-13 later: With errors card (user: a red agent next to Failed 0 was misleading). executions 0.1.0-rc6
(stats with_errors), dashboard 2.8.40-exec-6 (seventh card, dashed red; on the list it toggles With failure
conditions). Stage 24h: Failed 0 · With errors 11. Open: run chips with errors still draw as plain green.
