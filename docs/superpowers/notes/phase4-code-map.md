# Phase 4 code map (in-depth access: grants, decrypt path, data view, Audit tab, retention) - facts only, read 2026-11-11

Read from: tiledesk-chatbot, tiledesk-executions, tiledesk-server on `feature/execution-traceability`; tiledesk-dashboard on `feature/execution-graph`.
Spec = docs/superpowers/specs/2026-11-09-agent-execution-traceability-design.md (§7.1.10, §7.2, §8.3, §8.4, §9.7, §10, §11.4, §11.6-11.8, §13, §15).

Short names: CB = /Users/nicocardone/Desktop/DEV/TILEDESK/tiledesk-chatbot/tybotRoute/executions,
EX = /Users/nicocardone/Desktop/DEV/TILEDESK/tiledesk-executions/src,
SV = /Users/nicocardone/Desktop/DEV/TILEDESK/tiledesk-server,
DB = /Users/nicocardone/Desktop/DEV/TILEDESK/tiledesk-dashboard/src/app. `ER` = CB/ExecutionRecorder.js, `PJ` = EX/ingest/projector.ts.

## 0. Summary (10 lines)
1. Exists: tybot seals 3 things only (trigger payload, flow-state values per delta/keyframe, parked checkpoint) with RSA-OAEP-256+AES-256-GCM; ingest stores them as-is in `sealed_data` / `checkpoints`.
2. Exists: api keyring (`VAULT_KEYS`) + pure `unseal()`, already used for the checkpoint (resume, internal) and the stored trigger payload (start-new prefill, audited `data_viewed`).
3. Exists: the 5 permission strings, `can()` per standard role, dashboard role editor + dependencies, `needs()` route guard, audit_log (6 actions), `audit.recorded` mirror to Activities (5 verbs).
4. Missing: grant model (`grants` collection, `POST data-access`, `GET data?grant=`); `state?grant=` is refused (400). No value ever leaves the api except the start-new prefill.
5. Missing in tybot: sealing of per-action input/output, request/response bodies, LLM prompt/answer, messages. `action.completed.sealed` exists in the contract and projector but nothing produces it.
6. Missing: audit actions `data_access_requested`, `data_access_denied`, `retention_update`; audit read routes; mirror verbs for them (server drops unknown actions with an error log).
7. Missing: retention policy: only env defaults (90/30/7 days) at ingest; no per-project policy, no `exec:policy:{project}` writer (tybot already reads `capture_data`), no settings route, no jobs sweep.
8. Missing in dashboard: data view, "View values", Audit tab, retention page; the masked value component and the "attribute" i18n wording are in place.
9. Decisions: grant shape/TTL/scope, value-to-step mapping (keyframe + delta chain, only changed keys sealed), size limits (whole-state keyframe vs 256 KB), what "per-action data" is, retention changes applied to existing data or only new.
10. Risks: custom-role `rolePermissions` availability, CORS allows only GET/POST, no append-only enforcement in code, `data_missing` flag is dropped by ingest.

---------------------------------------------------------------------------------------------
## 1. Sealing: what tybot seals today

Seal primitive: `Sealer.seal(plain, cfg)` CB/Sealer.js:26-47. JSON-serialises, fresh AES-256-GCM key + 12-byte iv, key wrapped with RSA-OAEP (SHA-256).
Output `{alg: 'RSA-OAEP-256+A256GCM' (Sealer.js:5), kid: cfg.sealKid, wrapped_key, iv, tag, ct, size}` (all base64 except alg/kid/size). Returns null without a public key,
`Sealer.TOO_LARGE` over `cfg.dataMaxBytes` (default 262144, CB/config.js `EXECUTIONS_DATA_MAX_BYTES`). Config: `EXECUTIONS_SEAL_PUBLIC_KEY`, `EXECUTIONS_SEAL_KID` (config.js:36-37).
Wrapper `sealInto(ctx, data, field, plain)` ER:150-161: skipped when `ctx._captureData` is false, plain null/empty; on null/TOO_LARGE it sets `data.data_missing = true`
(no key and over-size look the same). Nothing is sealed without `EXECUTIONS_SEAL_PUBLIC_KEY`.
Secrets: `isSecretName` CB/secrets.js:6-12 (authorization, password, *token*, *key*, *secret*); `stripSecrets` secrets.js:15-25 replaces values by `[secret]` (used on the trigger payload only).
Per-project value hash: `Sealer.projectHashKey/valueHash` Sealer.js:50-60 (HMAC; `EXECUTIONS_STATE_HASH_KEY`); null without a key.

| Sealed record | Produced at | Event field | Stored as (EX) | Content of the plaintext |
|---|---|---|---|---|
| Trigger payload | ER:359-363 (`request.attributes.payload`, else message attributes payload; `stripSecrets`) | `execution.started.data.sealed_trigger_payload` | `sealed_data` kind `trigger`, PJ:222 | the payload object |
| State keyframe (whole state before a block) | ER:958-959 (`sealableState` ER:164-173: drops secret-named keys and values > `stateValueMaxBytes` 256 KB) | `step.started.data.sealed_state` + `state_keyframe: true` | kind `state_keyframe`, PJ:576 (extra `step_seq`) | `{key: rawRedisString}` |
| Outside-change delta at block entry | ER:962 (`StateDiff.diffStates` CB/StateDiff.js:34-79) | `step.started.data.sealed_state` | kind `state_delta`, PJ:576 | `{key: {before?, after?}}` raw strings; omitted when value too large (`omitted:'too_large'` in clear change) |
| Action delta | ER:1033 | `action.completed.data.sealed_state` | kind `state_delta`, PJ:595 (`step_seq`, `action_index`) | same shape |
| Parked checkpoint | CB/Checkpointer.js:176-199 `sealedPark` (not emitted when not sealed: capture off, no key, over `dataMaxBytes`) | `execution.checkpoint.data.sealed` + `cp_seq` | `checkpoints` (one per execution, forward-only on cp_seq, PJ:288-306) | pointer + `request_state.parameters` (token keys removed) |

Common storage fields `sealed_data` (EX/model/sealedData.ts:6-27): `execution_id, seq (event seq), kind, id_project, step_seq, action_index, alg, kid, wrapped_key, iv, tag, ct, size, at, data_until`.
`SEALED_KINDS = action | trigger | state_delta | state_keyframe` (sealedData.ts:3). Indexes: `{execution_id, seq}`, unique `{execution_id, kind, seq}`, TTL `{data_until}` (sealedData.ts:28-30).
`checkpoints` fields: `execution_id, cp_seq, sealed{alg,kid,wrapped_key,iv,tag,ct,size}, created_at, expires_at` (EX/model/checkpoint.ts; TTL on `expires_at`).
`storeSealed` PJ:651-663 upserts `$setOnInsert`, sets `executions.has_data = true`. Ingest never decrypts. `data_missing` is not read anywhere in EX (grep: 0 hits).

**NOT sealed even though spec §10.2 says so**
- Action input/output: `action.completed.data.sealed` is in the contract (EX/contracts.ts:126), `has_data: !!d.sealed` and kind `action` exist in PJ:585/594, but tybot never sets `sealed` on `action.completed` (ER:1000-1040 builds `data` without it; only Checkpointer uses `sealInto(..., 'sealed')`). So `steps.actions[].has_data` is always false and kind `action` never exists.
- Request/response bodies (Web request, Make/N8N, etc.), LLM prompt and answer (AI Prompt, Ask KB), messages sent/received: no code in CB.
- The secrets rule for headers/params/integration `SECRET_KEYS`/bot secret: only name-based (`secrets.js`); no IntegrationService hook.
- Keyframe sealing is all-or-nothing: whole state JSON > 256 KB (`dataMaxBytes`) -> no keyframe values at all (`data_missing`), even if each value is small.
- Values > `stateValueMaxBytes` are never sealed (omitted in delta, dropped from keyframe); hash/size stay in clear.
- Spec §7.1.10 says "value and values sealed"; at `capture_data = false` clear parts still flow (ER:332 sets `ctx._captureData`).

---------------------------------------------------------------------------------------------
## 2. Decrypt path (EX) and how a data view could use it

- Keyring: `loadKeyring(VAULT_KEYS)` EX/crypto/unseal.ts:30-52 (`{kid: PEM}` JSON, RSA only, error names the kid); loaded once in api mode, EX/main.ts:30-32; config EX/config.ts (`VAULT_KEYS`).
- `unseal(blob, keyring)` unseal.ts:55-77: checks `alg === SEAL_ALG`, kid known (else `UnknownKid`), unwraps key, AES-GCM with tag; any failure -> `BadSeal`. Pure, no logging of material.
- Current callers: internal checkpoint `GET /internal/executions/:id/checkpoint` EX/api/internal.ts:64-86 (service token, separate listener, port 3100); resume `resumePoint` EX/api/routes/control.ts:222-232; start-new `storedPayload` EX/api/routes/startNew.ts:152-169 (kind `trigger`, latest seq, honours `data_until`; states ok/none/unreadable).
- `AppOptions.keyring` EX/api/app.ts:24-25 is passed to control, start-new and executions routers (app.ts:53-55). `executionsRouter({keyring})` receives it already (executions.ts:~207) but does not use it.
- Data view could reuse: `unseal` + `SealedData.find({execution_id, kind in (state_delta,state_keyframe,action), step_seq})` + the same keyframe+delta walk `buildStateView` does on clear data (EX/api/stateView.ts:50-93). Clear rows (`state_manifests`, `state_changes`) give names/hashes; sealed rows give values keyed by `key`. A key's value at a step needs: latest `state_keyframe` with step_seq <= S, then every later `state_delta` (value `after`) up to S; keyframe values are raw strings, deltas `{before,after}`.
- Existing grant hook: `refuseGrant` EX/api/routes/executions.ts:89-94 returns 400 for any `?grant=` on `/state` and `/state/history` (Phase 1 text: "Values need a data access grant (Phase 2)"); `StateView`/`VarSide` carry no `value` (stateView.ts:25-27). README says "any grant= is 400".
- Unseal errors today map to 500 `unseal_failed` (resume) or `stored: "unreadable"` (start-new); a data view needs its own mapping (kid rotated out -> readable trace, unreadable data).
- No plaintext cache anywhere; keys are in api only (ingest/jobs `keyring` undefined, main.ts:31).

---------------------------------------------------------------------------------------------
## 3. Permissions: where `executions_data_access` / `executions_audit_read` are checked

EX (service):
- `PERMISSIONS` list + `can(role, perm)` EX/api/permissions.ts:1-28. Standard roles (permissions.ts:16-21): owner all 5; admin = read, control, data_access; supervisor = read; agent none. Custom roles by `role.permissions` (from `rolePermissions`, fail closed to `[]`).
- Mount: `requireUser` + `requirePermission("executions_read")` on `/projects/:projectid` EX/api/app.ts:52; sets `res.locals.role`. Role lookup `GET {TILEDESK_API_URL}/:pid/project_users/me` with the caller's JWT, cached 60 s, EX/api/projectRole.ts:22-70 (`rolePermissions` read at :60-62; `[]` when absent).
- Per-route guard `needs(perm)` EX/api/routes/control.ts:95-99 (403 `forbidden`, refusals not audited). Used: stop `executions_control` (control.ts:274), destroy `executions_destroy` (:323), resume `executions_control` (:376), start-new/input and start-new `executions_control` (startNew.ts:196,215).
- `executions_data_access` is checked today only inline in start-new/input: `can(role, "executions_data_access")` startNew.ts:205 (without it: structure-only prefill; with it: values + audit `data_viewed`). No route uses `needs("executions_data_access")` or `needs("executions_audit_read")`.
- `allowedControls(exec, role, ctx)` EX/api/controls.ts:82 reuses `can()` with PERM map per control (no data-access / audit entry in `allowed_controls`).
Dashboard:
- `PERMISSIONS.EXECUTIONS_*` DB/utils/permissions.constants.ts:163-167; dependencies :171-178 (data_access needs executions_read + flows_read; audit_read needs flows_read + activities_read).
- Role editor group `executionsManagement` DB/users-new-role/users-new-role.component.ts:243-253 (labels in English literals, not i18n: "Able to view execution data", "Able to view execution audit entries in Activities"). Spec test DB/users-new-role/users-new-role.executions.spec.ts.
- `canViewExecutions(role, matchedPermissions)` DB/bots/executions/executions.models.ts:233-237 (only read). `canViewExecutionsAudit` DB/activities-new/utils/activity-verbs.constants.ts:71-74 (owner or `executions_audit_read`). No `canViewExecutionData` / retention helper exists.
Server:
- Activities route hides `EXECUTION_*` verbs unless owner or custom role with `executions_audit_read` (`projectuser._doc.rolePermissions`), SV/pubmodules/activities/routes/activity.js:53-66.
- `executions-refire` checks `executions_control` (SV/routes/executions-refire.js:26). Server does not enforce custom-role permissions on other routes (spec §10.1, not changed).

---------------------------------------------------------------------------------------------
## 4. Audit

Model `AuditLog` EX/model/auditLog.ts:1-59, collection `audit_log`, no `versionKey`. Fields: `audit_id` (unique), `at`, `actor{user_id,email,name,role}`, `id_project`, `execution_id` (required), `agent_id`, `action`, `reason`, `details{mode, confirm, rerun_action{index,type}, input_provided, masked_filled, result (required), of_audit_id, purpose, status_before, status_after}`, `ip`, `user_agent`.
`action` enum (auditLog.ts:27): `stop_soft, stop_hard, destroy, resume, start_new, data_viewed`. Missing vs spec §8.3: `data_access_requested`, `data_access_denied`, `retention_update`. Missing field: `mirrored_at?`, `details.scope/step_seq/grant_id/steps_opened`. `execution_id` is required, so a project-level `retention_update` entry needs a model change.
Indexes (auditLog.ts:53-57): unique `{audit_id}`, `{id_project, at:-1}`, `{execution_id, at:-1}`, TTL `{at}` 365 days (`AUDIT_TTL_SECONDS`).
Writing: `recordAudit(entry, display)` EX/api/audit.ts:15-29 awaits `AuditLog.create` then publishes `audit.{project}.{action}` (fire-and-forget, 10 s cap, EX/api/auditPublisher.ts:34-69). Route helper `audit(req,res,exec,action,details)` control.ts:105-135; `auditOutcome` (second entry, `of_audit_id`) control.ts:~140. `data_viewed` is written at startNew.ts:206 with `purpose: "start_new_prefill"` (value shown to the caller).
Append-only: only by convention (create only, never update in code). No DB users/roles or `insert`-only grant in the repo (spec §7.2.4 asks for it): not enforced in code.
Read: no route reads `audit_log` (no `GET .../:id/audit`, no `GET /projects/:pid/audit`, no CSV). Indexes for per-execution and per-project reads already exist.
Mirror (SV/pubmodules/executions-publisher/index.js): consumer queue `server.executions.audit`, binding `audit.#` (:31-32). `AUDIT_VERBS` maps only stop_soft/stop_hard/destroy/resume/start_new (:143-149) -> `EXECUTION_*`. `data_viewed` and every `details.result === "requested"` entry are skipped, "kept in the executions audit log only" (:153-155, :222). Unknown action -> logged error and dropped (:226-232). `auditToActivity` :158-190 builds `actionObj {mode?, reason?, result, audit_id}` (no scope/step_seq/grant_id yet); `audit_id` makes it idempotent.
Server text: `EXECUTION_VERBS` en/it SV/pubmodules/activities/activityMessageUtil.js:192-215 and case list :376-380; doc SV/docs/activities-client.md. Activity TTL: `ACTIVITY_EXPIRATION_TIME` SV/pubmodules/activities/models/activity.js:13; storage only with `ACTIVITY_HISTORY_ENABLED` (activityArchiver.js:153).
Dashboard Activities: verbs `EXECUTION_STOP_SOFT/STOP_HARD/DESTROY/RESUME/START_NEW` in group `Executions` DB/activities-new/utils/activity-verbs.constants.ts:35-39, icons :63-67, type union DB/models/activity-model.ts:17-21, filter label i18n `Executions` (en.json:436 / :4174), verb labels en.json:459-463. Missing: `EXECUTION_DATA_ACCESS`, `EXECUTION_DATA_ACCESS_DENIED`, `EXECUTION_RETENTION_UPDATE` (verbs, icons, labels, server sentences).

---------------------------------------------------------------------------------------------
## 5. Retention

- Sub-document `retention {trace_until, data_until}` EX/model/retention.ts:1-7, used by `executions`, `steps`, `state_manifests`, `state_changes` (TTL index on `retention.trace_until`, expireAfterSeconds 0: execution.ts:89, step.ts:47, stateManifest.ts:25, stateChange.ts:34). `sealed_data.data_until` TTL (sealedData.ts:30); `checkpoints.expires_at` TTL (checkpoint.ts); `audit_log.at` TTL 365 d; `events_seen` 2 d.
- Computed in `retentionFor(start, test)` PJ:75-87 from config `DEFAULT_RETENTION_TRACE_DAYS` (90), `DEFAULT_RETENTION_DATA_DAYS` (30), `TEST_RETENTION_DAYS` (7) (EX/config.ts:16-18), read once and cached in a module variable (`retentionDays`, PJ:75-81): a config change needs a restart; no per-project lookup.
- Lifecycle: placeholder retention on first event (PJ:160-163), final one in `execution.started` (`retention_final`, PJ:196-214); `propagateRetention` PJ:178-185 updates steps/manifests/changes/sealed_data; `reconcileRetention` PJ:188-191. `syncCheckpointExpiry` PJ:~319-330 caps checkpoint expiry by `data_until ?? trace_until`.
- API exposure: `toExecution` returns `retention{trace_until,data_until}` (executions.ts:176); start-new honours `data_until` (startNew.ts:158).
- Jobs: no retention sweep (README: "retention is Mongo TTL indexes, no sweep job"); `jobs` = reaper + gaps (EX/jobs/main.ts, reaper.ts, gaps.ts).
- Per-project policy: none. `grep exec:policy|capture_data` in EX = 0 hits. No `settings/retention` route. Config has no min/max range checks (spec §13: trace 7-365, data 0-90).
- Tybot side: `captureData(store, idProject)` ER:91-103 reads `HGET exec:policy:{id_project} capture_data` (`!== 'false'`), 60 s cache (`POLICY_TTL_MS` ER:17, cache ER:24), at execution start (ER:325-332, `_captureData` ER:312). Absent key = capture on. Nothing writes that hash; the EX Redis ACL user (`TYBOT_REDIS_URL`, EX/ingest/tybotRedis.ts, EX/api/tybotControl.ts) writes `exec:*` only for control. Effect at 0: no sealed fields, `data_missing` not set (the skip returns before the flag, ER:151), checkpoints not emitted (Checkpointer.js:186-190).
- Per-execution `capture_data` is fixed at the start of a chain (resume reuses ctx? to verify); a policy change affects only new chains within 60 s cache.
- Server: Activities mirror TTL = `ACTIVITY_EXPIRATION_TIME` (30 d default); not project-configurable.

---------------------------------------------------------------------------------------------
## 6. Dashboard (DB = tiledesk-dashboard/src/app, branch feature/execution-graph)

Files: execution detail DB/bots/executions/execution-detail/execution-detail.component.{ts (757 lines),html (213)}; shared panels DB/bots/executions/shared/ (flow-state-panel 54+91, var-history-drawer, start-new/resume/stop/destroy dialogs, execution-status-chip, execution-format); models DB/bots/executions/executions.models.ts (237); service DB/services/executions.service.ts (134); routes app.routing.ts:1323-1353 (`project/:projectid/monitor[/:botid]/executions[/:executionid]`, plus graph page).
- Tabs: `tab: 'timeline' | 'state'` execution-detail.component.ts:120, `setTab` :423-425, markup html:87-95 (two buttons `.ex-tab-timeline`, `.ex-tab-state`; panels html:97 and :152). An Audit tab = third literal + button + panel + visibility flag.
- Timeline block expansion embeds `<flow-state-panel [vars] [partial] [actionTitles]>` (html:146), state loaded per step by `loadState(seq, force)` ts:363-385 -> `ExecutionsService.state()` (service:76-79, only `step_seq`; no `grant`/`at` params). State tab: dropdown/list of attributes with `fsShown`, `stateTabLimit`, history drawer (`openHistory` ts:466, `<var-history-drawer>` html:211).
- Masked values: `MaskedValueComponent` (`exec-masked-value`) flow-state-panel.component.ts:20-45 renders `••• (size)` + type, secret chip, or `—`; doc comment "Values are never shown in Phase 1". Panel columns Attribute/Before/After/Changed by (html:14-19); "= unchanged" from `changed` (hash based). `VarSide {type,size,hash}` has no `value` (models.ts:197-201); `VarHistoryEntry` hashes only (models.ts:218-230).
- Permissions in detail: `permitted = canViewExecutions(...)` ts:188. Control buttons come from `allowed_controls` of the detail response; there is no "View data" button, no data access dialog, no `canDataAccess` field, no countdown component.
- Service: no calls for data-access, data, audit, retention (list/summary/get/state/history/stop/destroy/resume/startNewInput/startNew only).
- Activities page: DB/activities-new (component, `activity-message.util.ts`, `utils/activity-verbs.constants.ts`); filter group Executions, `canViewExecutionsAudit`; spec DB/activities-new/activities-new.executions.spec.ts. "Open in Activities" link would target `project/:projectid/activities`.
- Retention could live in: `project/:projectid/project-settings/retention` (app.routing.ts:1117-1121, lazy `ProjectEditAddModule`; component DB/project-edit-add/project-edit-add.component.{ts,html,scss} already has retention (conversation retention) code). Other settings routes: general, payments, auth, smartassignment, advanced, notification, security (app.routing.ts:1063-1164). No executions section there yet; owner gate has to be added (`executions_audit_read` per spec §10.1).
- i18n (src/assets/i18n/en.json, `Executions` block at :4181, 36 languages files exist): `Executions.FlowState.*` (Title, BeforeAfter, ShowSystem="Show system attributes", Partial, Variable="Attribute", Before, After, ChangedBy, **Value**, Unchanged, Secret, System, ShowUnchanged, HideUnchanged, Empty, LoadError, Block, When, WholeBefore/WholeAfter "n attributes", ShowAll, By.*), `Executions.History.*`, `Executions.Detail.*` (VarsChanged etc.), `Executions.Controls.*` (NoPermission*, Reasons, UnsealFailed ...), `Executions.Dialogs.*`. Wording: UI already says "attribute" (FlowState.Variable = "Attribute"); the role editor labels are plain English. No keys for data access, grant countdown, `Expired/410`, Audit tab, retention, "View values".
- Existing 410 handling: none (spec §11.8 "data expired").

---------------------------------------------------------------------------------------------
## 7. API surface today (`/executions/api/v1`, EX/api/app.ts:50-58)
Common gate for all `/projects/:projectid/*`: JWT + `executions_read` (app.ts:52). CORS methods only GET, POST (app.ts:46: PUT not allowed), exposed header X-Truncated. JSON body limit 16 kb except start-new (app.ts:49-50, START_NEW_PATH startNew.ts:59).

| Method + path | Permission | Where |
|---|---|---|
| GET `/projects/:pid/executions` | executions_read | routes/executions.ts:215 |
| GET `/projects/:pid/executions/summary` | executions_read | executions.ts:247 |
| GET `/projects/:pid/executions/:id` (+ `allowed_controls`) | executions_read | executions.ts:272 |
| GET `/projects/:pid/executions/:id/state?step_seq` (`grant=` -> 400) | executions_read | executions.ts:306 |
| GET `/projects/:pid/executions/:id/state/history?key` (max 1000, `X-Truncated`; `grant=` -> 400) | executions_read | executions.ts:333 |
| POST `/:id/stop` `{mode}` | executions_control | routes/control.ts:272-274 |
| POST `/:id/destroy` `{confirm}` | executions_destroy | control.ts:321-323 |
| POST `/:id/resume` | executions_control | control.ts:374-376 |
| GET `/:id/start-new/input` (values only with executions_data_access) | executions_control (+ data_access inline) | routes/startNew.ts:194-206 |
| POST `/:id/start-new` | executions_control | startNew.ts:213-215 |
| GET `/healthz`, `/metrics` | none | app.ts:33-39 |
| GET `/internal/executions/:id/checkpoint` (port 3100) | service token | api/internal.ts:64 |
Not present (spec §8.4): POST `.../:id/data-access`, GET `.../:id/data?grant=`, GET `.../:id/audit`, GET `/projects/:pid/audit` (+CSV), GET/PUT `/projects/:pid/settings/retention`. Server: `POST /:pid/executions/refire` (SV/routes/executions-refire.js) is the only server route; `rolePermissions` comes via `project_users/me` (SV/middleware/has-role.js:137).

---------------------------------------------------------------------------------------------
## 8. Gaps and risks Phase 4 must decide

1. **Grant model**: `grants` collection does not exist (spec §7.2.4: `grant_id, execution_id, user_id, scope, expires_at, status`, TTL on `expires_at`). Decide: signed token vs DB lookup, one grant per user/execution/scope, 15 min TTL (spec §9.7), revoke on close, `status` pending/active (approval step "not built in v1"), whether `?grant=` on `/state` and `/state/history` (already parsed and refused) becomes the value channel, and what `Cache-Control: no-store` responses carry. The `api` Mongo user needs write on `grants`; ingest must not read it.
2. **What data exists to show**: only trigger payload and state values are sealed today (section 1). The spec's per-action input/output view (§11.6) has nothing to read until tybot seals request/response, LLM prompt/answer and messages. Decide whether Phase 4 adds the tybot side (new `sealed` content on `action.completed`, per-action-type capture, size limits, secret masking by name only) or ships values + trigger payload first. Action data would also need `has_data` (today always false), and a unique key `{execution_id, kind, seq}` allows one `action` blob per event only.
3. **Value to step mapping**: sealed rows carry `seq`, `step_seq`, `action_index`, `kind`; values for unchanged attributes live only in the last keyframe (taken at first block, every 20 blocks or 1 MB deltas). Rebuild = keyframe <= S + deltas (clear `state_changes` give which keys changed). Keys omitted (`too_large`), secrets (`secret` type, never sealed) and whole-keyframe `data_missing` must show as "not stored". Pick: decrypt per step lazily vs whole execution; limit rows per call.
4. **Sizes**: one `sealed_data` doc per delta/keyframe up to 256 KB plaintext (+ base64); a long execution = many docs; a whole-execution grant could decrypt hundreds of MB. Need caps (blocks per request, response size, `X-Truncated`) and per-request unseal cost (RSA unwrap per doc, `unseal` is synchronous CPU in the api process).
5. **Wording**: UI strings must say "attribute" (not "variable"): existing i18n does; spec text, API names (`vars`, `/state/history?key`, `vars_changed`, `Executions.Detail.VarsChanged` wording) and audit/Activities sentences should be checked for "variable". Role editor labels are not translated.
6. **Audit**: new actions (`data_access_requested`, `data_access_denied`, `retention_update`) need enum + details fields (scope, step_seq, grant_id, steps opened, result) and a project-level entry without `execution_id` (currently required). `data_viewed` is mirrored nowhere (server drops it); spec folds it into `EXECUTION_DATA_ACCESS` with `result: "viewed"` and wants a denied verb: the server's `AUDIT_VERBS`, `auditToActivity` (drops `scope/step_seq/grant_id`), `activityMessageUtil` (en/it), dashboard verbs/icons/i18n and `docs/activities-client.md` all change. "Audit before acting": a denied request must also be audited (today refusals by `needs()` are not).
7. **Audit read**: new routes with `needs("executions_audit_read")`, cursor pagination on `{id_project, at:-1}` / `{execution_id, at:-1}`, CSV export; the dashboard Audit tab needs a service method and mapping of actions to sentences. Spec asks the project route to be owner-only (`executions_audit_read`); standard `admin` does not have it in `can()`.
8. **Append-only**: not enforceable from code; needs DB users in argo/helm (spec §7.2.4) or an explicit decision.
9. **Retention**: decide where the policy lives (Mongo `projects_settings` in EX vs Redis `exec:policy:{project}` hash that tybot already reads) and who writes Redis (api ACL user must be allowed `exec:policy:*`, currently `exec:*` + channel). Decide: apply a changed policy to existing docs (needs `updateMany` on `retention.*` / `data_until`, checkpoint `expires_at`) or only to new executions (`retentionFor` is cached per process, no per-project lookup, test fixed 7 d). Range validation (trace 7-365, data 0-90; 0 -> `capture_data=false`), audit `retention_update` entry, add PUT to CORS allowed methods (app.ts:46), 16 kb body is fine. `ACTIVITY_EXPIRATION_TIME` is a server setting (display only).
10. **Keys**: rotation keeps old private keys until data expires (spec §10.3); `UnknownKid` should be a distinct, non-500 outcome for the data view ("data unreadable, trace stays"); no `kid` listing endpoint; no metric yet for grants (spec §12 "grants issued").
11. **Custom roles**: `rolePermissions` may be missing from `/project_users/me`; then custom roles get `[]` and are denied (README:85, projectRole.ts:60-62). Phase 4 data access for custom roles depends on that live check. Admin gets `executions_data_access` by `can()`; supervisor sees no values.
12. **Capture policy side effects**: `capture_data=false` clears nothing already stored; `data_missing` is not set when capture is off (ER:151 returns first), so the UI cannot tell "off", "no key", "too large" apart; the detail's 410/expired state needs `retention.data_until` and `has_data` (both already in `toExecution`, executions.ts:174-177).
13. **Tests/fixtures**: tybot has seal/unseal round-trip tests with a local key pair (tiledesk-dev-env/bin/exec-keys per phase 3 map); EX tests under /Users/nicocardone/Desktop/DEV/TILEDESK/tiledesk-executions/test; dashboard specs listed in section 6.
