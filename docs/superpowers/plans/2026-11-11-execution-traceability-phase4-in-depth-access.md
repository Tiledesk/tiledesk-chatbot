# Execution traceability Phase 4 (in-depth access) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Owners and admins can open sealed attribute values and the trigger input behind a reasoned, audited
15-minute grant; owners get a per-execution Audit tab and per-project retention settings that delete data when shortened.

**Architecture:** Grants are stored in the executions service, which decrypts on the server with the existing keyring
and returns values only for the grant's scope, `no-store`. Retention is a per-project document in the executions Mongo;
shortening pulls the existing `*_until` dates forward so the existing TTL indexes delete; a Redis copy of the capture
switch is what tybot already reads. The server only gains Activities sentences; tybot does not change.

**Tech Stack:** tiledesk-executions (TypeScript, Express, Mongoose, ioredis, zod, vitest), tiledesk-dashboard
(Angular 15, Karma local harness), tiledesk-server (Node, mocha), tiledesk-dev-env.

**Spec:** `docs/superpowers/specs/2026-11-11-execution-traceability-phase4-in-depth-access-design.md` (approved),
parent `docs/superpowers/specs/2026-11-09-agent-execution-traceability-design.md`; facts in
`docs/superpowers/notes/phase4-code-map.md` (abbreviations EX, DB, SV, PJ are defined there).

## Global Constraints

- Branches: tiledesk-executions, tiledesk-server, tiledesk-dev-env `feature/execution-traceability`; tiledesk-dashboard
  `feature/execution-graph`. Heads at start: executions cada9c4, server 6d328a8c, dashboard aeee6bba2, dev-env d7b7b32.
- **No tybot change.** Main folders only, no worktrees (not even temporary), never `git stash`, no push, nothing on stage.
- Every commit ends with exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Tests: executions on exec-test-redis `localhost:6380` and exec-test-mongo `localhost:27018` only; unique ids, never
  FLUSHALL. Dashboard: local Karma harness (command in
  `tiledesk-chatbot/.superpowers/sdd/2026-11-10-execution-traceability-phase2-stop-destroy/task-11-report.md`), never
  committed; kill any Karma/Chrome you start. `df -h /` ≥ 15 GiB before builds; `rm -rf .angular/cache` after.
- UI copy says "attribute", never "variable". Every new string has en and it.
- Grant TTL 15 min. Reason 3–500 chars. Retention ranges: trace 7–365, data 0–90, data ≤ trace; defaults from env
  (90/30). Test runs: `min(7 d, setting)`. Audit 1 year, fixed.
- `value_state` values exactly: `secret`, `too_large`, `not_stored`, `expired`, `unreadable`.
- A value never goes to logs, Activities, RabbitMQ, browser storage or any cache; every value response carries
  `Cache-Control: no-store`.

## Review Focus

1. A grant presented by another user, for another execution, after revoke/expiry, or after the caller lost
   `executions_data_access` must give 403 and no value (Task 2 test `grant is bound to user, execution, time and role`).
2. A value read whose unseal throws must not log plaintext or key material and must answer `unreadable`, not 500
   (Task 3 test `unseal error is unreadable and logs no value`).
3. Shortening retention must never extend a date and must not delete runs still inside the new window
   (Task 4 test `shorten pulls dates forward only and keeps recent runs`).
4. A value response that arrives after the grant expired or was closed in the UI must be dropped, not shown
   (Task 6 test `late value response after expiry is discarded`).
5. History with a step-scoped grant must show values only for that step and masks elsewhere
   (Task 3 test `step grant reveals history only at its step`).

---

### Task 1: Audit model, grants and settings models, Audit read route (executions)

**Files:**
- Modify: `src/model/auditLog.ts` (actions, optional `execution_id`, details fields)
- Create: `src/model/grant.ts`, `src/model/projectSettings.ts`, `src/api/routes/audit.ts`
- Modify: `src/api/app.ts` (mount audit router; CORS methods add `PUT`)
- Test: `test/audit.test.ts` (extend), create `test/api.audit.test.ts`

**Interfaces — produces:**
- `AuditLog.action` enum adds `data_access_requested`, `data_access_denied`, `retention_update`. `execution_id`
  required unless `action === "retention_update"`. `details` adds `scope {type: "execution"|"step", step_seq?}`,
  `step_seq`, `grant_id`, `role`, `key`, `retention {before {trace_days, data_days}, after {…}}`.
- `Grant` model (collection `grants`): `grant_id` (unique), `id_project`, `execution_id`, `user_id`, `scope`,
  `reason`, `created_at`, `expires_at`, `revoked_at` (default null), `status` (`active` | `pending`, default active),
  `audit_id`. Indexes: `{grant_id}` unique; `{execution_id, user_id}`; TTL `{expires_at}` expireAfterSeconds 3600.
- `ProjectSettings` model (collection `project_settings`): `id_project` (unique), `retention {trace_days, data_days}`,
  `updated_at`, `updated_by`.
- `GET /projects/:pid/executions/:id/audit?cursor=<at_ms>_<audit_id>` → `{entries: AuditView[], next_cursor: string|null}`,
  50 per page newest first; `AuditView = {audit_id, at, actor: {name, role}, action, reason, details}`; needs
  `executions_audit_read` (403 otherwise); 404 for an execution outside the project.

- [ ] Step 1: failing tests: `retention_update entry saves without execution_id`; `other actions still require
  execution_id`; `audit route lists newest first with a cursor` (60 entries → 50 + cursor → 10, null);
  `audit route needs executions_audit_read` (admin 403, owner 200); `CORS allows PUT`.
- [ ] Step 2: run `npx vitest run test/audit.test.ts test/api.audit.test.ts test/cors.test.ts` → FAIL.
- [ ] Step 3: implement the models, route and mount.
- [ ] Step 4: run again → PASS; full suite `npx vitest run` (baseline 317 pass / 1 skip; "S7 __proto__ agent ids"
  is a known flake) and `npx tsc --noEmit`.
- [ ] Step 5: commit `feat(api): audit read route; grant and project settings models`.

### Task 2: Data access grants (executions)

**Files:**
- Create: `src/api/grants.ts`, `src/api/routes/dataAccess.ts`
- Modify: `src/api/app.ts` (mount)
- Test: create `test/api.dataaccess.test.ts`

**Interfaces — consumes:** Task 1 models; `recordAudit` (EX/api/audit.ts), `can()` (EX/api/permissions.ts).
**Produces:**
- Grant lifetime from config `EXECUTIONS_GRANT_TTL_S` (default 900, min 30), exposed as `grantTtlMs()`; only the
  local acceptance shortens it.
- `POST /projects/:pid/executions/:id/data-access` body `{reason: string(3..500), scope: {type:"execution"} |
  {type:"step", step_seq: int ≥ 0}}`:
  - without `executions_data_access`: audit `data_access_denied {result: "rejected:forbidden", role, scope}` then
    403 `{error: "forbidden"}`;
  - `retention.data_until` past: audit `data_access_requested {result: "rejected:data_expired"}`, 410
    `{error: "data_expired"}`; no `sealed_data` rows: same with `no_data`, 404 `{error: "no_data"}`;
  - an active unrevoked grant for the same user, execution and scope: 200 with it, no new audit;
  - else audit `data_access_requested {result: "accepted", scope, grant_id}`, create the grant, 201
    `{grant_id, expires_at, scope}`.
- `POST …/:id/data-access/:grant_id/revoke` (owner of the grant only) → 204; sets `revoked_at`.
- `findValidGrant(pid: string, executionId: string, userId: string, grantId: string, role: ProjectRole):
  Promise<GrantDoc | null>` — null unless project, execution and user match, not revoked, `expires_at > now`, and
  `can(role, "executions_data_access")`.
- `grantCovers(grant: GrantDoc, stepSeq: number | null): boolean` — execution scope covers all; step scope covers only
  its `step_seq`; `null` (trigger) only with execution scope.

- [ ] Step 1: failing tests: `owner gets a grant and an accepted audit`; `supervisor is denied and audited`;
  `agent is refused by the read gate without audit`; `expired data gives 410 audited`; `no sealed data gives 404`;
  `same scope returns the active grant without a second audit`; `revoke ends the grant`;
  `grant is bound to user, execution, time and role` (Review Focus 1); `reason under 3 chars is 400`.
- [ ] Step 2: run → FAIL. Step 3: implement. Step 4: run → PASS, full suite + tsc.
- [ ] Step 5: commit `feat(api): data access grants`.

### Task 3: Value reads (executions)

**Files:**
- Create: `src/api/stateValues.ts`
- Modify: `src/api/stateView.ts` (`VarSide` gains `value?: unknown; value_state?: ValueState`; `HistoryEntry` gains
  `before_value?, after_value?, before_state?, after_state?`), `src/api/routes/executions.ts` (replace `refuseGrant`),
  `src/api/routes/dataAccess.ts` (trigger route)
- Test: create `test/stateValues.test.ts`, extend `test/api.state.test.ts`

**Interfaces — consumes:** Task 2 `findValidGrant`, `grantCovers`; `unseal`, `UnknownKid`, `BadSeal` (EX/crypto/unseal.ts).
**Produces:**
- `type ValueState = "secret" | "too_large" | "not_stored" | "expired" | "unreadable"`.
- `valuesAtStep(executionId: string, stepSeq: number, keyring: Map<string, KeyObject>): Promise<{before: Map<string,
  ValueOrState>, after: Map<string, ValueOrState>}>` where `ValueOrState = {value: unknown} | {value_state: ValueState}`.
  Rebuild: latest `state_keyframe` with `step_seq ≤ S` (before-state of its block), then `state_delta`s in seq order up
  to the end of block S; "before" = state at S's entry, "after" = at S's end. Labels per spec §6.2: clear type
  `secret` → `secret`; clear change `omitted: "too_large"` → `too_large`; past `data_until` → `expired`; unseal error →
  `unreadable`; otherwise missing → `not_stored`. Values are `JSON.parse` of the stored raw string when it parses,
  else the string.
- `GET …/:id/state?step_seq=S&grant=G`: invalid grant → 403 `{error: "grant_invalid"}`; S not covered → 403
  `{error: "grant_out_of_scope"}`; data expired → 410 `{error: "data_expired"}`; else the Phase 1 view with values on
  each side plus `{grant: {expires_at}, actions: []}`, header `Cache-Control: no-store`, audit `data_viewed
  {grant_id, step_seq, result: "accepted"}`.
- `GET …/:id/state/history?key=K&grant=G`: same checks except scope; entries in covered steps get values/states,
  others none; audit `data_viewed {grant_id, key}`.
- `GET …/:id/data/trigger?grant=G` (execution scope only, else 403 `grant_out_of_scope`) → `{value}` or
  `{value_state}`; audit `data_viewed {grant_id, purpose: "trigger"}`.

- [ ] Step 1: failing tests (seal fixtures with `test/sealHelper.ts`): `values at a step come from keyframe plus
  deltas`; `secret, too_large, not_stored and expired labels`; `unseal error is unreadable and logs no value`
  (Review Focus 2; spy on the logger, assert no plaintext marker string); `state with grant returns values no-store and
  audits data_viewed`; `state without grant is unchanged`; `out-of-scope step is 403`; `step grant reveals history
  only at its step` (Review Focus 5); `trigger needs execution scope`.
- [ ] Step 2: run → FAIL. Step 3: implement. Step 4: run → PASS, full suite + tsc.
- [ ] Step 5: commit `feat(api): attribute values and trigger input behind a grant`.

### Task 4: Retention settings (executions)

**Files:**
- Create: `src/retention/policy.ts`, `src/api/routes/settings.ts`
- Modify: `src/ingest/projector.ts` (`retentionFor` per project), `src/jobs/main.ts` (policy resync),
  `src/api/app.ts` (mount), `src/api/tybotControl.ts` or a new helper for the Redis write, `README.md`
- Test: create `test/retention.test.ts`, extend `test/projector.test.ts`, `test/jobs.test.ts`

**Interfaces — consumes:** Task 1 `ProjectSettings`, `AuditLog`.
**Produces:**
- `type RetentionDays = {trace_days: number; data_days: number}`.
- `getProjectRetention(pid: string): Promise<RetentionDays>` (60 s cache, env defaults); `PUT` clears the cache entry.
- `applyShorten(pid: string, before: RetentionDays, after: RetentionDays, now?: Date): Promise<void>` — for each shortened setting,
  per collection, `updateMany` with an aggregation pipeline setting the date to `$min(current, start + days)`
  (data 0 → `now`): trace → `retention.trace_until` on executions, steps, state_manifests, state_changes; data →
  `retention.data_until` on executions, `data_until` on sealed_data, `expires_at` on checkpoints. "start" is the
  execution's `started_at` (look up per execution, or use each doc's own start field where it has one). Test runs use
  `min(7, days)`.
- `writeCapturePolicy(pid: string, capture: boolean): Promise<void>` — `HSET exec:policy:{pid} capture_data
  "true"|"false"` on the tybot Redis.
- `resyncCapturePolicies(): Promise<number>` — for every `ProjectSettings`, write its capture flag; jobs run it at start
  and every 10 min (`POLICY_RESYNC_MS = 600_000`).
- `GET /projects/:pid/settings/retention` (`executions_read`) → `{trace_days, data_days, defaults: {trace_days,
  data_days}, test_days: 7, audit_days: 365, can_edit: boolean}`.
- `PUT /projects/:pid/settings/retention` body `{trace_days, data_days}` (`executions_audit_read`): 400
  `{error: "out_of_range", field}` outside ranges or data > trace; audit `retention_update {before, after, result:
  "accepted"}` first; save; `writeCapturePolicy(pid, data_days > 0)`; `applyShorten`; 200 with the GET shape.
- `retentionFor(start: Date, test: boolean, pid: string): Promise<Retention>` in the projector.

- [ ] Step 1: failing tests: `defaults when no setting`; `PUT validates ranges and data ≤ trace`; `PUT needs
  executions_audit_read and audits before writing`; `shorten pulls dates forward only and keeps recent runs`
  (Review Focus 3: runs 10 d and 2 d old, data 30 → 5: first gets start+5 (already past → deleted by TTL), second
  start+5; a 1 d old run's later date never grows); `data 0 sets data_until now and capture false in Redis`;
  `lengthen leaves existing dates`; `test runs keep min(7, setting)`; `ingest uses the project policy`;
  `jobs resync writes capture flags`.
- [ ] Step 2: run → FAIL. Step 3: implement. Step 4: run → PASS, full suite + tsc.
- [ ] Step 5: commit `feat(api): per-project retention applied to existing data`.

### Task 5: Activities sentences for the new audit actions (server)

**Files:**
- Modify: `pubmodules/executions-publisher/index.js` (`AUDIT_VERBS`, `auditToActivity` carries `scope`, `step_seq`,
  `role`, `retention`; retention rows have no execution target), `pubmodules/activities/activityMessageUtil.js`
  (`EXECUTION_VERBS` and case list), `docs/activities-client.md`
- Test: `pubmodules/activities/test/execution-messages.test.js`, executions-publisher / audit-consumer tests

**Interfaces — produces:** verbs `EXECUTION_DATA_ACCESS` (from `data_access_requested` with result `accepted` only;
rejected ones are not mirrored), `EXECUTION_DATA_ACCESS_DENIED`, `EXECUTION_RETENTION_UPDATE`. Sentences (exact):
- en `<actor> viewed the data of execution <id6> of <agent> · "<reason>" · 1 block` | `· whole execution`;
  it `<actor> ha visualizzato i dati dell'esecuzione <id6> di <agent> · "<reason>" · 1 blocco` | `· intera esecuzione`.
- en `<actor> was denied access to the data of execution <id6> of <agent> (role <role>)`;
  it `<actor> non ha ottenuto l'accesso ai dati dell'esecuzione <id6> di <agent> (ruolo <role>)`.
- en `<actor> changed executions retention: trace <a> → <b> days, data <c> → <d> days` (only changed parts);
  it `<actor> ha modificato la conservazione delle esecuzioni: tracce <a> → <b> giorni, dati <c> → <d> giorni`.
- `data_viewed` stays unmirrored; owner-only filtering as the other `EXECUTION_*` rows.

- [ ] Step 1: failing tests for each sentence (en, it), the accepted-only mirroring, and a retention row without an
  execution. Step 2: run each mocha file separately → FAIL. Step 3: implement. Step 4: run → PASS (report before/after
  counts per file). Step 5: commit `feat(executions): activities for data access and retention`.

### Task 6: Dashboard data access: service, dialog, grant session

**Files:**
- Modify: `src/app/services/executions.service.ts`, `src/app/bots/executions/executions.models.ts`
- Create: `src/app/bots/executions/shared/data-access-dialog.component.ts` (+spec),
  `src/app/bots/executions/shared/grant-session.ts` (+spec)
- Modify: `execution-detail.component.{ts,html}` (View data button, strip with countdown and Close), en/it i18n

**Interfaces — consumes:** Tasks 2–3 API shapes. **Produces:**
- Service: `requestDataAccess(pid, id, body: {reason: string; scope: GrantScope}): Observable<GrantInfo>`,
  `revokeDataAccess(pid, id, grantId): Observable<void>`, `state(pid, id, stepSeq, grantId?)`,
  `history(pid, id, key, grantId?)`, `triggerData(pid, id, grantId): Observable<ValueOrState>`.
- Models: `GrantScope`, `GrantInfo {grant_id, expires_at, scope}`, `ValueState`, `ValueOrState`; `VarSide` and
  `VarHistoryEntry` gain the optional value fields of Task 3.
- `canViewExecutionData(role: string, perms: string[] | undefined): boolean` (owner, admin, or
  `executions_data_access`).
- `GrantSession`: `start(info: GrantInfo)`, `covers(stepSeq: number | null): boolean`, `remaining$:
  Observable<number>` (seconds), `active: boolean`, `grantId: string | null`, `end()` (clears, emits `ended$`);
  ends itself at `expires_at`.
- Dialog: reason (required 3–500), scope radio (this block / whole execution; block option only when opened from a
  block), copy "Your access is recorded in the audit log and shown to the owner"; result `GrantInfo | null`; shows 410
  as "The data of this execution is no longer kept (retention N days)" and 403 as a permission message.

- [ ] Step 1: failing specs: `View data shown only with data access`; `dialog requires a reason`; `grant session
  counts down and ends at expiry`; `Close revokes and clears values`; `late value response after expiry is discarded`
  (Review Focus 4); `nothing is written to localStorage or sessionStorage`.
- [ ] Step 2–4: RED → implement → GREEN (all executions + activities specs).
- [ ] Step 5: commit `feat(executions): data access dialog and grant session`.

### Task 7: Dashboard values in the Flow state panel, tab, history and trigger

**Files:**
- Create: `src/app/bots/executions/shared/value-cell.component.ts` (+spec) (`exec-value-cell`)
- Modify: `flow-state-panel.component.{ts,html}`, `var-history-drawer.component.ts`, `execution-detail.component.{ts,html}`
  (reload covered steps with the grant; "View values" link in uncovered blocks; trigger input in the strip), en/it i18n

**Interfaces — consumes:** Task 6. **Produces:** `<exec-value-cell [side]="VarSide">` renders `value` (JSON, collapsed
over 10 lines with "Show all") or a label: secret `[secret]`, too_large "too large to store", not_stored "not stored",
expired "no longer kept", unreadable "unreadable"; without value fields it renders the existing mask.

- [ ] Step 1: failing specs: `covered block shows values, uncovered keeps masks with View values`; `each value_state
  has its label`; `history drawer shows values only for covered steps`; `trigger input shown for execution scope`;
  `end of grant restores masks`.
- [ ] Step 2–4: RED → implement → GREEN. Step 5: commit `feat(executions): show attribute values under a grant`.

### Task 8: Dashboard Audit tab and Activities verbs

**Files:**
- Modify: `execution-detail.component.{ts,html}` (tab `'audit'`), `executions.service.ts` (`audit(pid, id, cursor?)`),
  `activities-new/utils/activity-verbs.constants.ts`, `activities-new/utils/activity-message.util.ts`,
  `models/activity-model.ts`, en/it i18n
- Test: `execution-detail` audit spec, `activities-new.executions.spec.ts`

**Interfaces — consumes:** Task 1 audit route, Task 5 sentences (dashboard renders English, same text).
**Produces:** Audit tab visible with `canViewExecutionsAudit`; rows newest first (time, actor, sentence, reason,
result), "Load more" via `next_cursor`, link "Open in Activities" (`/project/:pid/activities`). Activities group
Executions adds the three verbs with icons reusing existing svgs.

- [ ] Step 1: failing specs: `audit tab only for owner or audit permission`; `load more appends the next page`;
  `three new verbs render the server sentences`. Step 2–4: RED → GREEN.
- [ ] Step 5: commit `feat(executions): audit tab and data access activities`.

### Task 9: Dashboard retention card

**Files:**
- Create: `src/app/project-edit-add/executions-retention/executions-retention.component.{ts,html,scss}` (+spec)
- Modify: `project-edit-add.component.html` (card on the retention tab, only when `ExecutionsService.isConfigured()`),
  `project-edit-add.module.ts`, `executions.service.ts` (`getRetention(pid)`, `putRetention(pid, body)`), en/it i18n

**Interfaces — consumes:** Task 4 shapes. **Produces:** card per spec §5: two number inputs with ranges, fixed lines for
audit and test runs, Save (enabled only with `can_edit`); confirm dialog on shortening with "Data older than N days will
be deleted within a few minutes. This cannot be undone." and, at data 0, "Attribute values and inputs will no longer be
captured; stopped runs can no longer be resumed from stored data."; 400 `out_of_range` shown on the field.

- [ ] Step 1: failing specs: `read-only without can_edit`; `shortening asks to confirm`; `data 0 adds the capture
  warning`; `lengthening saves without confirm`; `out of range shows the field error`.
- [ ] Step 2–4: RED → GREEN; then `npx ng build`, `rm -rf .angular/cache`.
- [ ] Step 5: commit `feat(executions): retention settings card`.

### Task 10: Dev-env wiring and README

**Files:** `tiledesk-dev-env` README, `compose/exec.yml` only if needed.
- [ ] Check the executions api and jobs Redis user can write `exec:policy:*` (it is under `exec:*`); add what is missing.
- [ ] Rebuild executions, server and dashboard images (`bin/exec-rebuild`), recreate, seed twice; README section
  "Data access and retention" (how to open values, where the Audit tab and retention card are). No credentials.
- [ ] Commit `feat(exec): phase 4 wiring`.

### Task 11: Phase 4 local acceptance

- [ ] Run design §8 scenarios 1–9 on the live stack as the demo owner (sign-in as in Phase 3 notes; never write
  credentials). For 3, recreate executions-api with `EXECUTIONS_GRANT_TTL_S=60`, then restore the default.
- [ ] Notes and screenshots: tiledesk-chatbot `docs/superpowers/notes/phase4-acceptance.md` and `phase4-acceptance/`.
  Restore every temporary change (roles, plan name, retention settings).
- [ ] Commit `docs: phase 4 local acceptance results`.
