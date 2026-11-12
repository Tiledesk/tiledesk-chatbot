# Phase 1 execution ledger (rulings, deferred minors, task history)

Copied from the subagent-driven-development workspace at the end of Phase 1 (2026-11-10). Lines starting with 'Ruling:' are decisions taken during execution on the user's behalf; 'minor (deferred)' lines are review findings left for later phases.


Spec: /Users/nicocardone/Desktop/DEV/TILEDESK/tiledesk-chatbot/docs/superpowers/specs/2026-11-09-agent-execution-traceability-design.md

Multi-repo plan. Workspace lives in tiledesk-chatbot. Repos (all on feature/execution-traceability, main folders, no worktrees by user rule):
- A (T1-9): /Users/nicocardone/Desktop/DEV/TILEDESK/tiledesk-chatbot (base before T1: 05ef51c1)
- B (T10): /Users/nicocardone/Desktop/DEV/TILEDESK/tiledesk-server (base 68700f80)
- C (T11-16): /Users/nicocardone/Desktop/DEV/TILEDESK/tiledesk-executions (base aca3974)
- D (T17-21): /Users/nicocardone/Desktop/DEV/TILEDESK/tiledesk-dashboard (base d07380426)
- E (T22): /Users/nicocardone/Desktop/DEV/TILEDESK/tiledesk-dev-env (base 8a76325)
Review packages for B-E: `review-package -C <repo> PLAN BASE HEAD <workspace>/review-<repo>-<base7>..<head7>.diff`.

## Pre-flight scan

| Pair / task | Produces vs consumes | Finding | Ruling |
|---|---|---|---|
| T1 → T4, T7 | `Sealer.seal`, `projectHashKey`, `valueHash`, `isSecretName`, `stripSecrets` | consistent | — |
| T2 → T7 | `getEmitter`, `setEmitterForTests`, `buildEnvelope({ctx,seq,type,data})` | consistent | — |
| T2 package.json | adds amqplib to tybotRoute and root package.json | root node_modules serve tybotRoute at runtime; consistent | — |
| T3 → T7, T8, T9 | ExecutionStore methods | consistent | — |
| T4 → T7 | diffStates/buildManifest/shouldKeyframe | consistent | — |
| T5 ↔ T7 | both modify engine/TiledeskChatbot.js | sequential, different functions | — |
| T5 → T7, T8 | `runAction(..., onJump)`, `current()` | consistent | — |
| T6 → T7 | mapOutcome | consistent | — |
| T7 ↔ T8 | T7 test "one execution.idle at the end" needs `ctx.jumpInFlight`, which only T8's `beforeJump` sets | conflict: T7 test cannot pass without T8 | Ruling: T7 asserts the last event is `execution.idle` and seqs strictly increase; the "exactly one idle per chain" assertion moves to T8 — the plan put the jump hook in T8 — cost if wrong: one extra assertion later |
| T7 tests env | tests set EXECUTIONS_ENABLED; mocha runs all files in one process | other suites could run with tracing on | Ruling: every executions test sets env in before() and restores in after(), and resets emitter/store singletons — keeps the baseline suite unaffected — cost: none |
| T9 → T11 | fixture `test/fixtures/executions-events.sample.json` | consistent | — |
| T12 ↔ T13 | T12 projector does "terminal write-back (Task 13)" before T13 exists | ordering gap | Ruling: projector takes an injectable `onTerminal(info)` hook (default no-op); T13 wires `writeBackTerminal` into it — cost: none |
| T12 ↔ T13 | gap check reads `events_seen` per execution; T13 inserts by `event_key` | missing fields | Ruling: `EventSeen` = `{event_key (unique), execution_id?, seq?, at}`; T13 inserts all four — cost: none |
| T12 → T15 | `vars_changed`, `changed_keys` | consistent | — |
| T14 step 2 | needs the local stack (T22) | ordering | Ruling: if the stack is not up, implement fail-closed (`[]`) and defer the /me check to T22/T23 (note in ledger) — cost: custom roles denied until checked |
| T18 ↔ T19 ↔ T21 | same permission rule in three components | duplication | Ruling: T18 adds `canViewExecutions(role, matchedPermissions)` in `src/app/bots/executions/executions.models.ts` (created in T17); T19/T21 reuse it — cost: none |
| T22 | consumes all repos | consistent | — |
| Each task self-consistency | files created vs touched, tests vs code | T1–T23 checked: no task tests a function another task defines, except the T7/T8 and T12/T13 rows above | — |
| Global: storage | disk check before npm ci/builds | applies to every implementer | Ruling: every dispatch carries the two disk commands and thresholds (20 GB Mac / 15 GB Docker) |

## Progress
Task 1: dispatched (base 05ef51c1, implementer a9dc24a1632ef2f04, sonnet; also runs Before-you-start baseline)
Task 1: review 1 → 1 Important (bufferMax default 1000 vs spec 10000); fix round 1 dispatched (resume implementer); also sealKid null when unset (spec gives no default)
Task 1: minor (deferred): Sealer.seal JSON.stringify can throw (circular/BigInt) — callers must wrap or seal should catch → check in Task 7
Task 1: minor (deferred): unparseable EXECUTIONS_SEAL_PUBLIC_KEY / bool typos silently disable — one-time warn log
Task 1: minor (deferred): stripSecrets has no cycle guard
Task 1: minor (deferred): no tamper-negative test; seal does not enforce dataMaxBytes (caller's job, Phase 4 action data)
Task 1: fix round 1/5 (2 addressed, 0 open; commits 6eba1b7..0714a63)
Task 1: minor (deferred): getConfig defaults test not hermetic (EXECUTIONS_BUFFER_MAX / DATA_MAX_BYTES not cleared in beforeEach)
Task 1: complete (commits 05ef51c..0714a63, review clean)
Task 2: dispatched (base 0714a633)
Task 2: implementer DONE b8426be9 (6 tests; suite 399/249 vs baseline 383/249); review dispatched. Note: amqp transport not run against a broker → verify in T22/T23
Task 2: review 1 → 3 Important (channel close wedge, conn leak on setup fail, publish no timeout); fix round 1 dispatched incl. real-broker tests (exec-test-rabbit, rabbitmq:3.13-management)
Task 2: minor (deferred): amqp.connect no connect timeout; stale handles if conn closes during assertExchange (generation guard)
Task 2: minor (deferred): emit() JSON.stringify sync on huge payloads — confirm caps in T7
Task 2: minor (deferred): no fake-timer test of the 1 s retry / per-minute warn
Task 2: fix round 1/5 (3 addressed, 0 open; commits b8426be..806c3dc) — full suite not re-run after fix (fix touched only amqpTransport + broker-gated test); T3 implementer runs the full suite
Task 2: complete (commits 0714a63..806c3dc, review clean)
Task 3: dispatched (base 806c3dc4)
Task 3: implementer DONE 107f2e95 (9 tests; suite 408/249); review dispatched
Task 3: review 1 → 3 Important (hinted terminal id reused; post-create failure orphans created:true; CAS race untested) + noisy test output
Ruling: a hinted execution_id whose status is terminal is ignored (resolve falls through to the request key) — spec §6.2 says terminal executions are not continued; §7.1.3's literal "exists" predates terminal write-back — cost if wrong: a late jump after close starts a new execution instead of appending to the old one
Task 3: fix round 1 dispatched
Task 3: minor (deferred): pushFrame/popFrame read-modify-write can lose frames under concurrency; hSet on expired exec:{id} recreates hash without TTL (also setStatusHint)
Task 3: minor (deferred): "undefined" strings written when meta missing; state/handoff TTLs not asserted; loser re-GET null → no retry
Task 3: fix round 1/5 (4 addressed, 0 open; commits 107f2e9..b4f3c15)
Task 3: minor (deferred): rollback test relies on Object.create(client) (brittle)
Task 3: complete (commits 806c3dc..b4f3c15, review clean)
Task 4: dispatched (base b4f3c155)
Task 4: implementer DONE 222be8f9 (10 tests; suite 422/4 pending/249); review dispatched
Ruling: a value over valueMaxBytes is not sealed on either side (before or after) — spec §7.1.10 "values over the cap are not stored" — cost if wrong: the before side of a value that shrank is not viewable
Task 4: minor (deferred): StateDiff tests missing: oversized-before set, exact cap boundary, '5' vs '"5"' raw equality, oversized del, secret add/del
Task 4: minor (deferred): isReserved allocates per call (memoize if buildManifest is hot)
Task 4: complete (commits b4f3c15..222be8f, review clean)
Task 5: dispatched (base 222be8f9)
Task 5: implementer DONE f2939791 (13 tests; suite 435/4/249); used git stash for RED (stash list empty after, tree clean) → rule added to implementer-instructions; review dispatched
Task 5: minor (deferred): ALS limit — callbacks/listeners registered before runAction miss the tap; add a documenting test; verify in T7 that callback-style TiledeskRequestVariables.set stays in the action chain
Task 5: minor (deferred): nested runAction does not propagate inner writes to outer (by design) — T7/T8 aware if a jump runs inline
Task 5: complete (commits 222be8f..f293979, review clean)
Task 6: dispatched (base f2939791)
Task 6: implementer DONE 9eb53654 (11 tests; suite 446/4/249); review dispatched
Task 6: minor (deferred): mapOutcome(null) throws (default only covers undefined); exit fields errorIntent/noInputIntent/elseIntent/goToIntent not individually asserted; spec "per action type" table is one generic table
Task 6: complete (commits f293979..9eb5365, review clean)
Task 7: dispatched (base 9eb53654, opus)
Task 7: implementer DONE_WITH_CONCERNS 4d9ce313 (17 tests; suite 463/4/249, failing titles = baseline)
Ruling: intent-parameter writes stay un-awaited when tracing is off (ctx null); awaited + jump_params scope only with a ctx — the off switch ("exactly as 3.0.5") binds over the brief's unconditional await — cost if wrong: the pre-existing param race remains when off, as today
Task 7: pre-review fixes sent (flag-off param path; EXECUTIONS_STATE_ENABLED honoured; no-reply /ext closes the open step)
Task 7: noted implementer calls: error_code 'action_error' on throw; by fallback action_<index>; channel source_id = channel name; last_seq = idle's own seq; /block payload from message.attributes.payload; test ports 10011/10012
Task 7: pre-review fixes done bdcc6888 (20 tests; suite 466/4/249); review dispatched (opus)
Task 7: review 1 → 1 Important (diff/hash/seal awaited by the flow, violates global constraint + spec §12); fix round 1 dispatched incl. minors 1,3,4 (open step on errors, failed HGETALL drops step, flag-off zero store calls)
Task 7: minor (deferred): runAction onError after callback can close step mid-chain (moot: unhandled rejection is fatal); by vs action_id disagree when no id; wrapTheEnd turns sync theend throw into rejection
Task 8 carry: onJump must be called synchronously before any await in sendMessageToBot (else exit_taken lost + mid-chain idle)
Task 7: fix round 1/5 (4 addressed, 0 open; commits bdcc688..a3127bb)
Task 7: minor (deferred): scopes reset before HGETALL await in blockEntry (tiny attribution window); a throwing deferred builder drops its event (seq gap, visible downstream)
Task 7: complete (commits 9eb5365..a3127bb, review clean)
Task 8: dispatched (base a3127bb4, opus)
Task 8: implementer DONE_WITH_CONCERNS 8fadffa7 (31 tests; suite 477/4/249 = baseline); concerns observational: last_message_id shows as message_in on jumps (correct); DirMessageToBot recorded as a jump (correct: it starts another block); DirReturnStack carries subagent execution_id → T9 confirms; transit/lease = Phase 2 (not in Phase 1 scope). Review dispatched
Task 8: review 1 → 1 Important (jump post waits unbounded on exit recording); fix round 1 dispatched: EXECUTIONS_JUMP_BUDGET_MS (default 1000, my call) race in beforeJump; + minors: callback(err) on sync post throw; document DirReplyV2 fallback-as-jump and execution_id overwrite
Ruling: the jump budget is new config (EXECUTIONS_JUMP_BUDGET_MS=1000) — spec §7.1.9 "Redis down → flow runs as today" — cost if wrong: under a slow Redis a jump's step.completed may be recorded after the next block starts (attribution, not flow)
Task 8: minor (deferred): runChain fixed 300 ms sleep in tests (flake risk); /block path no-store not directly tested; per-call Redis budget in ExecutionStore would bound all exec calls (final review)
Task 8: fix round 1/5 (3 addressed, 0 open; commits 8fadffa..8c50959)
Task 8: complete (commits a3127bb..8c50959, review clean)
Task 9: dispatched (base 8c509591)
Ruling: replace calls always carry reason subagent_call/subagent_return (even with tracing off) — the server ignores unknown body fields today and Task 10 makes it read reason; keeps server behavior consistent whichever side is on — cost if wrong: one extra body field on replace calls when off
Task 9: implementer DONE_WITH_CONCERNS 58010ec4 (9 tests; suite 489/249 = baseline); fixture rewritten every run → Ruling: write only with EXECUTIONS_WRITE_FIXTURE=1, otherwise validate committed fixture types/keys — cost: none
Task 9: noted: DirReturnStack pops frame/deletes alias after a successful replace (subagent keeps ownership if replace fails); V1/V2 by name/slug without root id → no parent link (degradation)
Task 9: fix round 0 be2911cc (fixture gated); review dispatched
Task 9: minor (deferred): V2 replace error without callback falls through to onHandedToBot; self/recursive subagent (A→B→A) alias overwrite/delete; no flag-off test through real CallSubagent/ReturnStack; fixture test checks envelope keys only, not data keys
Task 9: complete (commits 8c50959..be2911c, review clean)
Part A (tybot) done: 05ef51c..be2911c
Task 10: dispatched (server, base 68700f80)
Task 10: implementer DONE_WITH_CONCERNS f8de92ae (publisher 12, requestRoute 24 w/ -r ./app.js, analytics 15); concerns observational (requestRoute needs -r ./app.js at baseline too; manual broker run OK); review dispatched
Task 10: minor (deferred): a repeat close re-emits request.close → duplicate conversation.closed with a fresh `at` (event_key differs) → T12 projector must treat closed on a terminal execution as a no-op (forward-only status does this)
Task 10: minor (deferred): close gate cannot see a bot that left earlier unless execution_id is set (documented limit); leave listener no beforeRequest fallback; real amqplib transport untested in server (manual run OK)
Task 10: complete (server commits 68700f8..f8de92a, review clean)
Task 11: dispatched (executions service, base aca3974)
Task 11: implementer DONE edc1fb9 (11 tests, typecheck+build ok); state_delta item shape weak (fixture had empty delta); review dispatched
Task 11: review 1 → 7 Important (schemas reject real tybot variants: null manifest, stateless steps, null type/title; state change/manifest/sealed shapes too loose); fix round 1 dispatched
Task 11: minor (deferred): eventKey branches on type prefix; main.ts stubs exit 1 (crash-loop if deployed before T13/T15); config optional keys not asserted
Task 9 follow-up (final review): tybot fixture holds one envelope per type only (keyframe step) — variants covered by hand-built service tests instead
Task 11: fix round 1/5 (7 addressed, 0 open; commits edc1fb9..f5d52f7)
Task 11: complete (exec commits aca3974..f5d52f7, review clean)
Task 12: dispatched (exec, base f5d52f7, opus)
Task 12: implementer DONE_WITH_CONCERNS 7df33d7 (29 tests); choices: repeat close on terminal → matched:false no writes; activity_seq/idle_seq derive waiting/running order-independently; placeholder retention on insert; extra unique indexes; action sealed blocks to sealed_data; review dispatched (opus)
Task 12: review 1 → 2 Important (gap check over whole range after events_seen TTL; retention placeholder race keeps test-run sealed data 30d) + spec gap (closed before any tybot event → stays waiting)
Ruling: park unmatched conversation.* events in pending_conversation_events (TTL 10 min) and replay them when the execution is first inserted — spec §7.2.1 drops unmatched events, but a bot closing on its first turn makes the close race tybot's events; dropping leaves the execution waiting until TTL — cost if wrong: one small collection, a lookup per new execution
Task 12: fix round 1 dispatched (+ minors: bulk E11000 tolerance, clamp duration, precondition comment)
Task 12: minor (deferred): onTerminal is at-most-once (crash between status write and hook loses the Redis write-back) → repair path in jobs later; internal fields (counted, activity_seq, idle_seq) must be projected out by the API (T15); spec §7.2.4 events_seen index text stale vs event_key ruling
Task 12: fix round 1/5 (6 addressed, 0 open; commits 7df33d7..bb1d511)
Ruling: bot_left/bot_replaced without execution_id match only non-terminal executions with started_at <= event.at (also on parked replay); closed still matches all; applyParked consumes rows atomically — a replace's child execution starts after the server event, so request-wide matching would wrongly complete it — cost if wrong: a parent whose started_at is skewed later than the server clock by more than the gap would not be completed by an id-less handoff event
Task 12: fix round 2 dispatched (controller finding)
Task 12: minor (deferred): concurrent gap checks last-writer-wins on missing_seq (only if ingest is not serial per execution — T13)
Task 12: fix round 2/5 (1 addressed, 0 open; commits bb1d511..1c94ccd)
Task 12: minor (deferred, final review): server/tybot clock skew > replace round trip still lets an id-less handoff end the child — sturdier: exclude executions whose parent_execution_id is a live execution being ended, or have the server always send execution_id; lost execution.started → parked handoff never matches (expires)
Task 12: minor (deferred): pendingConversationEvent.ts doc comment stale
Task 12: complete (exec commits f5d52f7..1c94ccd, review clean)
Task 13: dispatched (exec, base 1c94ccd)
Task 13: implementer DONE_WITH_CONCERNS 200ee79 (47 tests w/ redis+rabbit); TDD skipped (tests after code); destroyed write-back = Phase 2 (not in scope); review dispatched
Task 13: review 1 → 5 Important (events_seen gate loses events on crash/SIGTERM/Mongo outage; AMQP loss zombie; poison retry forever [plan-mandated]; ack/nack after close throws; gap re-check scans forever); fix round 1 dispatched
Ruling: ingest exits (code 1) on AMQP connection/channel loss and /healthz turns 503, letting k8s restart it — simplest correct recovery — cost: a restart per broker blip
Ruling: poison events go to the DLQ after 10 attempts for non-connectivity errors; Mongo connectivity errors retry indefinitely — the brief said requeue after 1 s; an endless loop on a deterministic error stalls ingest — cost: a bad event lands in the DLQ instead of being retried forever
Task 13: minor (deferred): write-back failure is permanent (relies on tybot exec:req TTL 7 d); ingestLag only for applied/unmatched; closers.reverse mutates; exit(0) ignores shutdown errors
Task 13: fix round 1/5 (4 addressed, 1 open — connectivity classifier misses buffering timeout/pool/failover errors; commits 200ee79..41b97a5)
Task 13: fix round 2 dispatched (widen classifier via readyState/labels/codes; bounded shutdown wait)
Task 13: minor (deferred): crash between terminal status update and onTerminal loses tybot write-back (no repair path; tybot keys expire 7 d); a marked execution keeps stale missing_seq if events arrive later; attempts map per pod
Task 13: fix round 2/5 (2 addressed in code; 1 open — new DLQ tests racy ~45% + pre-existing poison test; commits 41b97a5..3505c26); fix round 3 dispatched (fake timers, 15× stability run)
Task 13: fix round 3/5 (1 addressed, 0 open; commits 3505c26..5a3244d)
Task 13: minor (deferred): consumer test helper relies on timer ordering (5 ms sleep); module-level attempts Map not reset between tests
Task 13: complete (exec commits 1c94ccd..5a3244d, review clean)
Task 14: dispatched (exec, base 5a3244d)
Ruling: T14 Step 2 answered from tiledesk-server source (/project_users/me serialization) instead of a live call; live check in T22/T23 — stack not up yet — cost if wrong: custom-role permissions misread until T23
Task 14: implementer DONE b4f38bf (13 auth tests; suite 94/1 skip); /me returns [pu]; rolePermissions inferred present for custom roles; review dispatched (opus, security)
Task 14: review 1 → 1 Important (pid dot-segment traversal to another server path); fix round 1 dispatched + parity ruling + minors (Map roles, empty /me → 403, config once)
Ruling: JWT algorithm comes from GLOBAL_SECRET_ALGORITHM (default HS256), never from the token header; key = GLOBAL_SECRET_OR_PUB_KEY || GLOBAL_SECRET, as tiledesk-server's passport does — the brief's mapping (HS256↔GLOBAL_SECRET only) would 401 every request on HS256 deployments that set only GLOBAL_SECRET_OR_PUB_KEY — cost if wrong: none (still single pinned algorithm)
Task 14: fix round 1/5 (5 addressed, 0 open; commits b4f38bf..4cb7af8)
Task 14: minor (deferred): GLOBAL_SECRET_ALGORITHM not an enum (lowercase/none fail closed at verify); 10 000-entry eviction untested
Task 14: complete (exec commits 5a3244d..4cb7af8, review clean)
Task 15: dispatched (exec, base 4cb7af8)
Task 15: implementer DONE_WITH_CONCERNS e6a22bf (13 tests; suite 114/1); _id:-1 appended to list indexes; http.ts not reused (app serves own /healthz,/metrics); TDD skipped; review dispatched
Task 15: minor (deferred, final review): executions with null started_at skipped by cursor paging; empty agent_ids= returns all agents (unbounded group); agents {} with __proto__ key; more explain coverage + stale 3-key indexes; injection negative tests; api /healthz ignores mongo state; detail steps unbounded; from/to Date.parse lax
Task 15: complete (exec commits 4cb7af8..e6a22bf, review clean)
Task 16: dispatched (exec, base e6a22bf)
Ruling: state view with no manifest ≤ S starts from empty and returns partial:true (UI warns state may be incomplete) — spec assumes a keyframe at the first block, but state tracking can be off or the event lost — cost if wrong: one boolean in the response
Task 16: implementer DONE a79b9a7 (22 tests; suite 136/1); added {execution_id, step_seq} index on state_manifests; history = bare array with block_name; review dispatched
Task 16: minor (deferred): missing tests for hash set back to original and del+re-add within a step; key added+deleted within S omitted from view; by non-null on unchanged keys (dashboard must not read by as "changed")
Task 16: complete (exec commits e6a22bf..a79b9a7, review clean)
Part C (service) done: aca3974..a79b9a7
Task 17: dispatched (dashboard, base d07380426)
Task 17: implementer DONE_WITH_CONCERNS 11ea7b677 (7 specs); project ng test broken at baseline (missing karma reporter, broken analytics specs) → untracked local Karma harness (karma.local.conf.js, src/test.local.ts, src/tsconfig.spec.local.json) added to dashboard .git/info/exclude (local only, not committed); no development build config → plain ng build
Ruling: ExecutionsService becomes providedIn: 'root' (used by bots-list, executions module and conversation detail) — do it in Task 18 — cost: none
Task 17: minor (deferred): projectId not encoded while id is; user_bs subscription never unsubscribed (root singleton, harmless); isConfigured test loop style; ExecutionStatus = string
Task 17: complete (dash commits d073804..11ea7b6, review clean)
Task 18: dispatched (dash, base 11ea7b677)
Task 18: implementer DONE_WITH_CONCERNS 4db3c6e5b (8 specs in new focused spec; existing bots-list spec broken at baseline); badge colours hard-coded; not checked visually (T23); review dispatched
Task 18: minor (deferred): badge colours hard-coded; badge click doesn't navigate; no aria-label; no spec for header link / menu item / webhook-subtype card; no summary call from project subscription; other languages missing Executions keys
Task 18: complete (dash commits 11ea7b6..4db3c6e, review clean)
Task 19: dispatched (dash, base 4db3c6e5b)
Task 19: implementer DONE_WITH_CONCERNS f37262c2e (33 specs); app.routing exports appRoutes; placeholder detail component; all-agents view has no counters; refresh re-reads first page only
Ruling: the API list filter accepts all seven §6.1 statuses (Phase 2 statuses match nothing yet) — the dashboard filter/counters use them and got 400 — fix in the service (Task 15 implementer resumed) — cost: none
Task 15 follow-up: 16ad33d list filter accepts all 7 statuses — re-review clean (exec head now 16ad33d)
Task 19: review 1 → 3 Important (list error kills stream: Retry/filters dead; counters flicker each poll; stale refresh/loadMore merge into new filter) + minors (URL value validation incl. prototype keys; trigger label translation); fix round 1 dispatched
Task 19: minor (deferred): refresh re-reads page 1 only; refresh errors only logged; polling in hidden tabs
Task 19: fix round 1/5 (5 addressed, 0 open; commits f37262c..ca95d5e)
Task 19: minor (deferred): overlapping summary responses not cancelled; loadMore error sets page error while rows remain; agentId from snapshot
Task 19: complete (dash commits 4db3c6e..ca95d5e, review clean)
Task 20: dispatched (dash, base ca95d5e22, opus)
Task 20: implementer DONE_WITH_CONCERNS 28b57a75f (72 executions specs, 33 new); concerns: Controls.* keys absent (Phase 2), conversation_link → wsrequest/:id/messages, running-block heuristic ended_at null or last; review dispatched (opus)
Task 20: minor (deferred, final review candidate): polling timer + switchMap freezes updates when a response takes > 2 s (schedule next poll after response / exhaust); no test for running step finishing → one final refetch; Flow state tab doesn't follow latest step; timeline row lacks failing action error; drawer focus mgmt + tr role=button; waiting last block shows blank; Controls.* keys TODO
Task 20: complete (dash commits ca95d5e..28b57a7, review clean)
Task 21: dispatched (dash, base 28b57a75f)
Task 21: implementer DONE_WITH_CONCERNS 184f4865b (8 specs; templates not rendered in tests); review dispatched
Task 21: review 1 → 1 Important (conversation link agent lookup depends on localStorage bot cache → mostly falls back to list); fix round 1 dispatched (use the bots list ws-requests-msgs already loads) + minors (validate first + memoize, native markup/classes, webhook spec edge cases)
Task 21: minor (deferred): getBotFromStorage JSON.parse unguarded; specs via Object.create (templates unrendered)
Task 21: fix round 1/5 (4 addressed, 0 open; commits 184f486..0f29e03)
Task 21: minor (deferred): memo ignores later localStorage fills (list is primary source)
Task 21: complete (dash commits 28b57a7..0f29e03, review clean)
Part D (dashboard) done: d073804..0f29e03
Task 22: dispatched (dev-env, base 8a76325, opus)
Task 22: implementer DONE_WITH_CONCERNS dev-env fbcfbb5 + chatbot notes 05013519; stack tiledesk-exec up; webhook run → execution visible (supervisor 200, agent 403)
Task 22 finding (tybot, T7 follow-up): on a bot cache miss the bot is a Mongoose doc whose tybot schema lacks root_id → first run after cold cache records test:true and agent_id = published id. Ruling: fix in the recorder only (read root_id from the raw doc), not in tybot's faq_kb schema — adding it to the schema would change analytics behaviour with the flag off — cost: none
Task 22 notes: admin@tiledesk.com /me 500 (superadmin trap) → use an ordinary owner in T23; scheduled-start needs SCHEDULER_* + scheduled_live (T23 decides); --scale chatbot=2 conflicts on host port 3001 (T23 handles); BuildKit cache 9.4 GB → add to the cleanup list (user go-ahead)
Task 22: review 1 → 3 Important (exec-rebuild may build a default clone without *_PATH; seed may match a published copy; bin/dev shell-beats-.env changed); fix round 1 dispatched for 1, 2 (+ compose version note, printf -v)
Ruling: keep bin/dev's shell-beats-.env precedence — it is docker compose's own standard and the exec profile needs it — document it — cost: users with stray shell vars now get their shell value
Task 22: minor (deferred): GLOBAL_SECRET hard-coded must match server default; stray mktemp file on exec-keys failure; smoke assumes -1 replica names
Task 7b (root_id fix): complete (chatbot 0501351..d34d120, review clean)
Pre-existing (prod 3.0.5, outside scope): the same cache-miss root_id gap drops analytics events (DirectivesChatbotPlug:196,354; DirCallSubagent:84; DirReplaceBotV2:97; V3:110; DirMoveToAgent:41; TiledeskChatbot:448; index.js:212,248; AI directives root_id||null) → report to user as a separate issue
Task 7b: minor (deferred): toObject() fallback redundant/serializes doc for drafts; edge cases '' / undefined untested
Task 22: fix round 1/5 (4 addressed, 0 open; commits fbcfbb5..ec31c1e)
Task 22: minor (deferred): !override may need Compose 2.24.4 (README says 2.24); exec-rebuild .env sed parse vs bin/dev sourcing
Task 22: complete (dev-env 8a76325..ec31c1e + chatbot notes 05013519, review clean)
Task 23: dispatched (acceptance, opus); needs chatbot rebuild for d34d1209
Task 23: implementer DONE_WITH_CONCERNS chatbot befbe274 (notes+screenshots) + dev-env a88370b (scheduler env passthrough); 7/8 PASS, Step 8 over budget at p95 (+25 ms/run, ~5 ms/action p95, 2.9 mean, Docker Desktop Mac); cross-pod needed temp nginx round robin; scheduled trigger.source_id null; added exec-admin + subagent demo pair (not in seed)
Ruling: final whole-branch review split into two most-capable reviewers (A: tybot + server + service ingest/contracts — the event pipeline end to end; B: service API + dashboard + dev-env — the read path) — the five-repo diff (~665 KB filtered) does not fit one reviewer's single pass — cost: cross-cutting issues between the two halves rely on the contract files both read
Final review B: With fixes — Important: agent switcher reuses component (snapshot agentId); detail poll freezes > 2 s; CORS missing (release blocker, not merge); stale service README. Minor: summary agents {} proto; history keeps oldest 1000; old _doc._id tokens 401; history drawer op 'delete' vs 'del'; Unauthorized flash on role ''; vars_changed counts message_in system vars (25 vs 4); detail payload unbounded; /metrics on API port; cosmetic header
Final review A: With fixes — Important: null closed_by / agent_name dead-letter events; write-back HSET recreates expired hash without TTL; serial publish (1 in flight); buffer no byte cap + dataMaxBytes unused; hot-path round trips (pipeline seq with reads, drop EXISTS, cache public key). Minor: closed with execution_id should end all on request; scheduled source_id; flag-off microtask ticks; test helper env/keep-alive; jobs interval overlap; server amqp connect timeout
Ruling: fix wave includes CORS in the service (EXECUTIONS_CORS_ORIGINS, default none = same-origin only) — release blocker per review B, cheap now — cost: one config var
Ruling: deployment manifests (argo/helm) stay out of this branch — user rule: nothing on stage/prod until asked — cost: release step must add them
Ruling: vars_changed counts only non-reserved keys — the list showed 25 for 4 user changes; spec §11.3 example is user-level — cost: system-variable churn no longer counted in the list column (still in detail/state)
Ruling: scheduled trigger.source_id = agent root id in tybot (flag-gated), not a new server attribute — avoids changing server request attributes with the flag off — cost: none
Ruling: conversation.closed ends every non-terminal execution of the request even when it carries an execution_id — a close ends the conversation; the id can be a replaced parent's — cost: none
Final fix wave: dispatched (one opus fixer, 4 repos)
Final fix wave: DONE_WITH_CONCERNS exec 22617f1, chatbot fed8e6fe, server eebc7aa8, dash 26997f121; scoped re-review dispatched
Final fix wave: re-review clean (all 23 addressed; minors: flush on stopped emitter drains one window; partial-failure retry out of order (allowed); createApp loadConfig; server late-connection error listener)
