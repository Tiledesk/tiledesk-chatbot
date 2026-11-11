# Execution traceability, Phase 4: in-depth access — design

Date: 2026-11-11. Builds on Phases 1–3 (all local, `feature/execution-traceability`; dashboard
`feature/execution-graph`). Parent spec: `2026-11-09-agent-execution-traceability-design.md`
(§9.7, §10, §11.4, §11.6–11.8, §13). Code facts: `docs/superpowers/notes/phase4-code-map.md`.

## 1. Intent

Someone investigating a run that went wrong needs to see the real attribute values, not just
"••• (412 B)". Phase 4 lets an owner or admin open those values for one block or a whole
execution, with a stated reason, for a short time, and records every request and view. The owner
also gets the execution's full audit on its page and can choose how long traces and data are
kept, which matters for privacy: a shorter setting must actually delete data.

## 2. Goals, non-goals, anti-goals

Goals
- Data access with a mandatory reason and a 15-minute grant, scoped to one block or the whole
  execution (§10.1 roles: owner, admin, custom `executions_data_access`).
- Values shown where the masks are today: the Flow state panel (per block), the Flow state tab,
  the attribute history drawer, and the trigger input.
- An Audit tab on the execution detail (owner, custom `executions_audit_read`).
- Per-project retention settings (owner, custom `executions_audit_read`), applied to data already
  recorded when shortened; 0 days of sealed data also stops capture.
- New audit actions mirrored to Activities with en/it sentences.

Non-goals (this phase)
- **Per-action data** (request/response bodies, LLM prompt/answer, messages). Not sealed by tybot
  today. Decided by the user: attributes now, actions later as a separate piece; Phase 4 must
  leave room for it (§6.6).
- Approval step for grants (spec §10.4: prepared, not built).
- Project-wide audit CSV export from the service (Activities CSV already carries the mirrored rows).
- Append-only DB users for `audit_log` (a release/argo step, spec §7.2.4).
- The existing server gap where custom roles pass every admin-level server route (spec §10.1).
- Extending retention of data already recorded (lengthening applies to new runs only).

Anti-goals (a failure even if it works)
- A value reaches logs, Activities, RabbitMQ, browser storage or any cache.
- A value is shown without an active grant that covers it, or a view is not audited.
- Shortening retention leaves data the owner asked to delete.
- Any change on tybot's per-action hot path (the +1 ms budget is used up).

## 3. Constraints

- Repos: tiledesk-executions, tiledesk-dashboard, tiledesk-server (Activities verbs only),
  tiledesk-dev-env (wiring if any). **No tybot change**: it already reads
  `exec:policy:{project}.capture_data` (60 s cache).
- Local only, nothing pushed, from the same feature branches; same working rules as Phase 3
  (TDD, test Redis 6380 / test Mongo 27018, main folders, no worktrees, commit trailer).
- UI copy says "attribute", never "variable".
- Private keys stay in the executions api (`VAULT_KEYS`); the dashboard never decrypts.
- Values only over the existing authenticated API, with `Cache-Control: no-store`.

## 4. Approaches considered

Grant and value delivery
1. **Stored grant, server-side decrypt (chosen).** `POST data-access` checks the role, stores a
   grant (15 min), audits; value reads present the grant id, the api checks it, decrypts only the
   covered scope, audits the view, answers `no-store`. Matches spec §9.7; grants can be revoked
   and listed; the audit needs a stored record anyway.
2. Self-contained signed grant token: no storage, but cannot be cut short; rejected.
3. Browser-side decrypt: would expose private keys; rejected.

Retention applied to existing data
1. **Pull expiry dates forward (chosen).** Every record already carries its "keep until" dates
   and TTL indexes delete on them. Shortening rewrites those dates on the project's existing
   records with `$min` (never later), one `updateMany` per collection; Mongo's TTL monitor
   deletes within about a minute. No new delete logic.
2. Nightly sweep deleting by age: separate deletion rules per collection, up to a day late; rejected.

## 5. What the user sees

Execution detail (owner/admin):
```
[Resume] [Start new] [Destroy]                                   [View data]
[ Timeline ] [ Flow state ] [ Audit ]
┌ sealed data · access expires in 14:32 · recorded in the audit log ··········· [Close] ┐
│ Trigger input   { "order_id": "A-1001", "customer": { "name": "Ada", "api_key": [secret] } } │
└──────────────────────────────────────────────────────────────────────────────────────┘
03:00:00.300  ✕ Call status API   error ...                                         ▾
   Attribute     Before        After                 Changed by
   last_status   "ok"          "500"                 Web request "GET status"
   status_body   —             { "error": ... }      Web request "GET status"
   api_token     [secret]      [secret]
```
- **View data** (header) opens the dialog with scope "whole execution"; **View values** inside a
  block's Flow state panel opens it with scope "this block". Dialog: reason (required, 3–500
  chars), scope radio, a line "Your access is recorded in the audit log and shown to the owner".
- While a grant is active: a bordered "sealed data" strip with a live countdown and Close; values
  replace masks in the covered blocks; the Flow state tab and history drawer show values for the
  covered blocks; outside the scope, masks stay with a "View values" link.
- Close or expiry: values cleared from memory, masks back, strip gone. Nothing is kept in
  localStorage/sessionStorage or service caches.
- Values that were never stored keep a clear label: `[secret]` (secret-named), "too large to
  store" (over 256 KB), "not stored" (capture off, or not recorded), "no longer kept" (past
  retention: the whole data view says "The data of this execution is no longer kept (retention N
  days)"), "unreadable" (key no longer available).
- Supervisor / roles without `executions_data_access`: no View data button; masks as today.

Audit tab (owner, `executions_audit_read`): newest first, one row per entry: time, actor, action
sentence (same wording as Activities), reason, result; "Load more"; link "Open in Activities".

Project settings › Retention (existing page `project-settings/retention`, new "Executions" card,
owner / `executions_audit_read`):
```
Executions
  Trace (executions and steps)      [ 90 ] days   (7–365)
  Sealed data (attribute values,    [ 30 ] days   (0–90; 0 = don't capture)
   trigger input, checkpoints)
  Audit log: 1 year (fixed) · Test runs: 7 days (fixed)
  [Save]
```
Shortening shows a confirm: "Data older than N days will be deleted within a few minutes. This
cannot be undone." Setting sealed data to 0 adds: "Attribute values and inputs will no longer be
captured; stopped runs can no longer be resumed from stored data."

Activities (owner-only group Executions), new rows:
```
Nico Cardone viewed the data of execution 2a74f1 of Nightly checks · "500 from status API" · 1 block
Marco Bianchi was denied access to the data of execution 2a74f1 (role supervisor)
Nico Cardone changed executions retention: trace 90 → 30 days, data 30 → 7 days
```

## 6. How (decided parts)

### 6.1 Grants (executions api)
- Collection `grants`: `grant_id` (uuid), `id_project`, `execution_id`, `user_id`, `scope`
  (`{type:"execution"}` or `{type:"step", step_seq}`), `reason`, `created_at`, `expires_at`
  (created + 15 min), `revoked_at?`, `status` (`active`; `pending` reserved for the approval step),
  `audit_id` (the request entry). TTL index on `expires_at` (+1 h slack). Ingest never reads it.
- `POST /projects/:pid/executions/:id/data-access {reason, scope}`:
  - role without `executions_data_access` → audit `data_access_denied` (with role) **then** 403.
  - data gone (`retention.data_until` past) → 410 `data_expired`; nothing sealed for this
    execution → 404 `no_data`. Both are audited as `data_access_requested` with
    `result: rejected:<code>` (not as denied, which means the role was refused).
  - otherwise audit `data_access_requested {scope, grant_id, result: accepted}`, create the grant,
    answer `{grant_id, expires_at, scope}`.
  - An active grant for the same user, execution and scope is returned again instead of a new one
    (no second audit entry) **[my call]**.
- Who gets an audited denial **[my call]**: only callers that reach this route, i.e. roles with
  `executions_read` but without `executions_data_access` (supervisor, custom roles). A role without
  `executions_read` (standard agent) is refused by the shared read gate with a plain 403, unaudited,
  like every other executions route: it cannot see the execution in the first place.
- `POST /projects/:pid/executions/:id/data-access/:grant_id/revoke` sets `revoked_at` (Close).
- A grant is valid when: same project, execution and user, not revoked, `expires_at` in the future,
  caller still has `executions_data_access` (role re-read via the 60 s role cache).

### 6.2 Value reads
- `GET …/:id/state?step_seq=S&grant=G` (already parses `grant`, today 400): with a valid grant
  covering S, each attribute side gains `value` (JSON value), or `value_state`
  (`secret | too_large | not_stored | expired | unreadable`). Without `grant`, unchanged.
- Labels from what the data can tell **[my call]**: `secret` from the clear type; `too_large`
  where the clear state change says `omitted: too_large`; `expired` past `data_until`;
  `unreadable` on an unseal error or unknown key; `not_stored` for every other missing value
  (capture off, no seal key, a whole keyframe over 256 KB). The runtime does not record why a
  value is missing, and no runtime change is allowed, so these are not told apart. UI copy:
  "not stored".
- `GET …/:id/state/history?key=K&grant=G`: entries in covered steps gain `before_value/after_value`.
- `GET …/:id/data/trigger?grant=G` (execution scope only): the trigger payload (secret-named keys
  already `[secret]` at capture).
- Rebuild of values at a step: latest `state_keyframe` at or before S plus the `state_delta`s up
  to S (code map §8.3); keys without a sealed value get a `value_state`.
- Every successful value response: `Cache-Control: no-store`, audit `data_viewed
  {grant_id, step_seq | "trigger" | key}` in the service only (not mirrored).
- Caps: one block per state call; history max 1000 entries (as today, `X-Truncated`); unseal
  errors per record become `unreadable`, never 500 **[my call]**.

### 6.3 Audit
- `audit_log.action` adds `data_access_requested`, `data_access_denied`, `retention_update`;
  `execution_id` becomes optional (required for every action except `retention_update`);
  `details` adds `scope`, `step_seq`, `grant_id`, `role`, `retention {before, after}`.
- `GET /projects/:pid/executions/:id/audit?cursor` (owner / `executions_audit_read`), newest
  first, 50 per page, cursor on `{at, audit_id}`.
- Refusals by `needs()` stay unaudited, except data access (spec: denied access is audited).

### 6.4 Retention
- Collection `project_settings` (executions Mongo): `{id_project, retention:{trace_days,
  data_days}, updated_at, updated_by}`. Defaults when absent: env (90/30). Ranges: trace 7–365,
  data 0–90, data ≤ trace.
- `GET /projects/:pid/settings/retention` (`executions_read`, so the UI can show it);
  `PUT` (owner / `executions_audit_read`): validates, audits `retention_update {before, after}`
  before writing, saves, writes Redis `exec:policy:{project}` field `capture_data` (`"false"` when
  data_days is 0, else `"true"`), then applies to existing data.
- Apply on shorten (per changed setting, project-scoped, `$min` so never later): trace →
  `retention.trace_until = start + trace_days` on executions, steps, state manifests, state
  changes; data → `data_until = start + data_days` on executions, `sealed_data`, and checkpoint
  `expires_at` capped likewise. data_days 0 → `data_until = now`. Lengthen → only new runs.
- Ingest's `retentionFor` reads the project policy (60 s cache) instead of env only.
- Test runs **[my call]**: they keep at most 7 days, and less when the project setting is
  shorter (`min(7 d, setting)`), in `retentionFor` and in the shorten updates. A shorter setting
  must delete, so "fixed" means "never longer than 7 days".
- Redis copy of the capture switch **[my call]**: `exec:policy:{project}.capture_data` is only a
  copy of the Mongo setting. The api writes it on every `PUT`, and the jobs process re-writes it
  for every project with a stored setting at start and every 10 minutes, so a flushed or new
  Redis falls back to capture-on for at most 10 minutes. The jobs process's Redis user must be
  allowed `exec:policy:*`.
- CORS adds `PUT`. Audit (1 y) stays fixed.

### 6.5 Server (Activities)
- `AUDIT_VERBS`: `data_access_requested` (accepted only) → `EXECUTION_DATA_ACCESS`,
  `data_access_denied` → `EXECUTION_DATA_ACCESS_DENIED`, `retention_update` →
  `EXECUTION_RETENTION_UPDATE` (no execution target). `data_viewed` stays unmirrored.
- en/it sentences in `activityMessageUtil` as in §5; dashboard verbs, icons, labels and filter
  group to match; owner-only as the other `EXECUTION_*` rows.

### 6.6 Room for per-action data later
- Grant scope and `data_viewed` are generic; the value response for a block is
  `{vars: [...], actions: []}` with `actions` empty in Phase 4, so per-action input/output can be
  added by tybot sealing `action.completed.sealed` plus an api reader, without changing grants,
  audit or the UI shell.

## 7. Left to the builder
- Component split in the dashboard (dialog, strip/countdown, value renderer with JSON viewer).
- Exact `updateMany` pipelines and which date each collection uses as "start".
- Metric names for grants issued/denied.
- Value rendering limits in the UI (collapse long JSON).

## 8. Acceptance (local)
1. Owner opens values for one block with a reason: values show, countdown runs, Close masks them;
   audit has requested + viewed; Activities shows one "viewed the data" row.
2. Whole-execution grant: Flow state tab, history drawer and trigger input show values.
3. Grant expiry (shortened in test config) masks values; a value call with the old grant → 403.
4. Supervisor (and a custom role with read but no data access): no button; a direct API call →
   403 with a denied audit entry and Activities row. Agent: 403 from the read gate, no audit.
5. Custom role with `executions_data_access`: allowed (checks `rolePermissions` live).
6. Secret, too-large, not-stored, expired and unreadable values show their labels.
7. Retention: shorten data 30 → 1 on a project with older runs: their values are gone within
   minutes (410 strip), trace kept; set data 0: new runs capture nothing; trace shorten deletes
   old executions; lengthen leaves old dates untouched; `retention_update` audited and in Activities.
8. Audit tab lists every entry of the execution, newest first, with Load more.
9. Values never appear in api logs, Activities, RabbitMQ messages or browser storage (checked).
