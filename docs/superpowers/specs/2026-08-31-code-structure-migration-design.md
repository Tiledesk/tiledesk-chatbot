# Code Structure Migration — Design

**Date:** 2026-08-31
**Branch:** `refactor/code-structure-migration`
**Status:** Approved design, pending implementation plan

## Goal

Restructure the chatbot connector to remove duplication and clarify module
boundaries, so that a later TypeScript migration is mostly mechanical. The
current test suite must keep passing at every step.

Non-goals: behaviour changes, new features, performance work, dependency
upgrades beyond deduplication, and the TypeScript conversion itself.

## Measured baseline

All figures below were measured on this repo at commit `91008e03`, not
estimated.

| Metric | Value |
|---|---|
| Source LOC (excl. tests, node_modules) | 23,765 |
| Test LOC | 32,470 |
| Provably dead LOC (zero inbound refs) | 4,877 (21% of source) — 4,732 in `tybotRoute/` plus 145 in `chooserChatbotRoute/` |
| Files in `tybotRoute/tiledeskChatbotPlugs/directives/` | 70 |
| Entries in `tybotRoute/test/` | 113 (104 `.js`) |

### Test suite

The suite runs only with an env recipe that is documented nowhere:

```bash
REDIS_HOST=127.0.0.1 REDIS_PORT=6379 \
API_ENDPOINT=http://localhost:10002 \
TILEBOT_ENDPOINT=http://localhost:10001 \
npx mocha --timeout 60000 --exit
```

Without `API_ENDPOINT`, `startApp` throws inside an `async` function; the
rejection is never surfaced and every `before` hook times out. That single
missing variable is why the suite looks completely broken on a fresh checkout.

Full-suite result: **264 passing, 156 failing.** The failures have three
distinct causes, which must not be conflated:

1. **Port collisions.** 24 test files hardcode `SERVER_PORT = 10001` and start
   their mock API on `10002`. In one mocha process they collide, producing
   cascading `EADDRINUSE`.
2. **Missing environment.** Some files fail in isolation because `KB_ENDPOINT_QA`
   and related AI endpoints are unset.
3. **Genuinely stale assertions.** `conversation-ai_condition_test` asserts an
   error string the code no longer produces. These are real red tests.

`json_condition_test` passes 28/28 in isolation, confirming the suite is sound
where the harness does not interfere.

Of the 104 `.js` files in `test/`, **61** are named `*_test.js`/`*-test.js` and
**43** are not. Of those 43, 41 are pure `bots_data` fixtures — but **`testin.js`
and `validate_variable_names.js` contain real `describe()` suites**. A naive
`*_test.js` spec glob would silently drop them; they must be renamed, not
excluded. A further 9 non-`.js` entries are already-disabled tests suffixed
`.js_`/`.txt`, plus `single_test.sh`.

No CI workflow runs the tests. The two GitHub Actions build Docker images only.

### Duplication

Concentrated and mechanical — the cheap kind to remove.

| Duplicated construct | Copies | Distinct variants |
|---|---|---|
| `constructor(context)` + "context object is mandatory" guard | 62 | 1 |
| `this.logger = new Logger({...})` init | 42 | 2 (one has drifted) |
| `#executeCondition(...)` | 17 | 9 |
| `#assignAttributes(...)` | 14 | few |
| `#myrequest(options, callback)` | 7 | 5 |

There is a de-facto base class that was never written: 65 files take
`constructor(context)` and 65 expose `execute(directive, callback)` — 60
declared sync, 5 declared `async`. Exactly four outliers break the contract:

| File | Signature | Fate |
|---|---|---|
| `DirDisableInputText` | `execute(directive, pipeline, callback)` | survives — must be normalised |
| `DEPRECATED_DirOfflineHours` | `execute(directive, pipeline, callback)` | deleted in Phase 1 |
| `DEPRECATED_DirIfAvailableAgents` | `execute(directive, directives, current_directive_index, callback)` | deleted in Phase 1 |
| `DEPRECATED_DirWhenOpen` | `execute(directive, directives, current_directive_index, callback)` | deleted in Phase 1 |

Three of the four disappear with Phase 1, leaving `DirDisableInputText` as the
sole signature to normalise. The sync/async split matters for typing: `execute`
returns nothing and signals completion through its callback, so the 5 `async`
declarations are incidental and should be unified when the shape is typed.

Separately, `DirectivesChatbotPlug.processInlineDirectives` calls
`helpDir.execute(directive, pipeline, 3, () => {...})` with four arguments,
while `DirDeflectToHelpCenter.execute` accepts `(directive, callback)`. The
callback is therefore never invoked on that path. This is a latent bug in an
already-`DEPRECATED`-marked method; it is recorded here as a finding and is
explicitly **not** fixed by this migration, which preserves behaviour.

### Coupling

Two findings determine the whole approach.

**The cycle is trivial to break.** `engine/TiledeskChatbot.js` requires
`DirLockIntent` and `DirUnlockIntent` solely to call
`DirLockIntent.lockIntent(...)` and `DirUnlockIntent.unlockIntent(...)`, which
are pure cache functions with no dependency on `TiledeskChatbot`. Node currently
tolerates the cycle with a runtime warning
(`Accessing non-existent property 'TiledeskChatbot' of module exports inside
circular dependency`). TypeScript will not.

**The real seam is the static parameter store.** Five `TiledeskChatbot` statics —
`addParameterStatic` (51 call sites), `allParametersStatic` (47),
`getParameterStatic` (6), `requestCacheKey` (5), `deleteParameterStatic` (1) —
touch only `_tdcache` and `requestId`. They hold zero instance state. Roughly
110 call sites across the directives reach through `TiledeskChatbot` to get at
them. Extracting them decouples directives from the engine almost entirely and
provides the single most valuable surface to type.

### God files

| File | LOC |
|---|---|
| `utils/TiledeskChatbotUtil.js` | 1,106 |
| `directives/DirAiPrompt.js` | 943 |
| `tybotRoute/index.js` (11 routes + helpers + `startApp`) | 813 |
| `engine/TiledeskChatbot.js` | 716 |

### Packaging

Root and `tybotRoute` each carry a `package.json` and `node_modules` with
overlapping, drifted dependencies: `uuid` `^9` vs `^3`, `mongoose` `^6.6.1` vs
`^6.3.5`, `@tiledesk/tiledesk-client` `^0.10.4` vs `^0.10.13`. Root is a ~35-line
Express wrapper.

## Decisions

Three decisions were taken before design and shape everything below.

1. **Baseline.** Fix the harness first, then freeze. Phase 0 repairs only
   mechanical harness problems; whatever passes afterwards becomes the frozen
   contract. Genuinely-stale tests are quarantined with a written reason each —
   never silently deleted.
2. **Repo shape.** Collapse to a single package. One `package.json`, one
   `node_modules`, one module graph for TypeScript to reason about.
3. **TypeScript runway.** Structure plus JSDoc types, no build step. The code
   stays plain runnable JavaScript; the shapes TypeScript needs are declared in
   JSDoc, with `checkJs` enabled for editor feedback only.

## Approach

**Layered bottom-up.** Safety net → dead code → kernel → pilot → fan-out →
structure. Each phase is independently verifiable and produces a reviewable
diff.

Two alternatives were rejected. *Directory-first* would rewrite every import
path in one mechanical diff before the safety net is trustworthy — with 156
failing tests, breakage would be undetectable. *Duplication-first with the layout
untouched* is cheapest but leaves `tybotRoute/` as the package root and the god
files intact, so the TypeScript move would re-open the same files.

## Phases

Every phase ends with the frozen test set green. Any phase that cannot achieve
that stops and reports rather than adjusting the contract.

### Phase 0 — Make the safety net real

No source changes. This phase only makes the existing suite trustworthy.

- Add `.mocharc.yml` with an explicit spec glob so the 41 `*_bot.js` fixtures
  stop being loaded as suites.
- Rename `testin.js` and `validate_variable_names.js` to `*_test.js` **before**
  applying the glob, so their suites are not lost.
- Give each of the 24 colliding test files a unique port pair from a shared
  `test/helpers/ports.js` registry. Pairs are **static, not ephemeral**:
  `services/TilebotService.js:3` reads `TILEBOT_ENDPOINT` at module load, so
  dynamic ports would force a lazy-env refactor into Phase 0. Static unique
  pairs fix the collision with no source change.
- Extract the 24 near-identical `before` hooks into `test/helpers/bootTilebot.js`.
- Add `docker-compose.test.yml` providing Redis, and wire `npm test` to the
  documented env recipe.
- Add the CI workflow that runs the suite — none exists today.
- Classify all 156 failures per-file into port-collision / missing-env / stale.
- Record the resulting green set in a committed `docs/test-baseline.md`.
- Move genuinely-stale tests to `test/quarantine/`, excluded from the spec glob,
  each with a written reason.

**Verification:** full-suite run is deterministic across three consecutive runs,
and the green set matches `docs/test-baseline.md` exactly.

**Sizing caveat:** this is the one phase whose size cannot be called precisely in
advance, because the per-file classification has not yet been run. The
implementation plan must treat Phase 0 sizing as provisional and re-estimate
after classification.

### Phase 1 — Delete dead code

Delete, having confirmed zero inbound references for each:

- `tybotRoute/TdCache copy.js`, `tybotRoute/TdCache_v3.js`
- `tybotRoute/TiledeskClientTest.js` (2,488 LOC)
- `tybotRoute/models/DEPRECATED_IntentForm_no_prefill.js`
- 6 × `directives/DEPRECATED_Dir*.js`
- `DirGptTask_OLD.js`, `DirWebRequestV2_old.js`, `DirIfOpenHours_OLD.js`
- `DirSetConversationTags.js`
- `chooserChatbotRoute/` (commented out in root `index.js`)

**Verification:** green set unchanged. Re-run the zero-reference check
immediately before deleting, in case Phase 0 introduced a reference.

### Phase 2 — Extract the kernel

- `engine/RequestParameters.js` — the five statics moved out verbatim.
  `TiledeskChatbot` keeps thin delegating statics so all ~110 call sites remain
  untouched during migration. Delegates are removed in Phase 5, not here.
- `engine/IntentLock.js` — `lockIntent` / `unlockIntent`. Both the engine and the
  two directives then depend on this leaf, breaking the cycle. The runtime
  circular-dependency warning disappearing is the proof.
- `directives/BaseDirective.js` — the 62-copy constructor guard, context field
  hoisting, the 42-copy logger init, plus shared `executeCondition` and
  `assignAttributes`.
- `utils/http.js` — one request helper.

Two constraints that shape this phase:

**Private fields cannot be overridden.** The shared helpers are `#private`
fields. Moving them to a base class requires converting them to `_`-prefixed
convention-protected methods across every affected file. Mechanical, but it
touches many files and must be done as its own commit.

**The variants are not all identical.** The 17 `executeCondition` copies collapse
to 9 distinct variants. Most differ only in a `winston` log tag and merge safely,
but `DirAiCondition`, `DirDataTables`, `DirForm`, `DirWebRequestV2` and
`DirAiPrompt` differ behaviourally and must **override** rather than inherit.
Likewise the 5 `myrequest` variants accept different HTTP status codes; accepted
statuses become an explicit parameter rather than a silent unification. Each
variant must be diffed against the base before collapsing — no bulk replace.

**Verification:** green set unchanged; circular-dependency warning gone from
process output.

### Phase 3 — Pilot, then fan out

- Pilot `BaseDirective` on the five HTTP-integration directives with the highest
  shared surface: `DirBrevo`, `DirHubspot`, `DirCustomerio`, `DirMake`,
  `DirQapla`.
- Fan out in batches of ~8 directives, one commit per batch, green set verified
  after each.
- Normalise `DirDisableInputText`'s `execute(directive, pipeline, callback)`
  signature **last** and on its own, since it carries the most behavioural risk.
  The other three outliers were deleted in Phase 1.

**Verification:** green set unchanged after every batch. A batch that goes red is
reverted, not patched forward.

### Phase 4 — Registry

Each directive declares `static directiveNames = [...]`; `directives/registry.js`
builds the dispatch map by iterating them. This deletes the ~100-entry map
literal and the ~60-line require block from `DirectivesChatbotPlug.js`, so adding
a directive becomes a one-file change rather than a three-file change.

**Verification:** the generated map is asserted equal to the current hardcoded
map before the literal is deleted. Green set unchanged.

### Phase 5 — Split god files, collapse packages, move to `src/`

- Split `TiledeskChatbotUtil.js` (1,106 LOC) by concern.
- Split `tybotRoute/index.js` (813 LOC) into `routes/` modules plus `startApp`.
  Fix the swallowed-rejection bug found in Phase 0 while here.
- Extract the LLM client concerns from `DirAiPrompt.js` (943 LOC).
- Remove the Phase 2 delegating statics and repoint the ~110 call sites at
  `RequestParameters` directly.
- Merge the two `package.json` files, resolving each drifted dependency to the
  higher version, and collapse to one `node_modules`.
- Move sources under `src/`.

Target layout:

```
src/
  server.js            # was root index.js
  app.js               # express wiring
  routes/              # from tybotRoute/index.js
  engine/              # TiledeskChatbot, RequestParameters, IntentLock, IntentForm
  directives/          # BaseDirective, registry, Dir*.js
  plugs/
  services/
  models/
  cache/               # TdCache
  utils/
  types/               # JSDoc typedefs
```

**Verification:** green set unchanged; `npm start` boots; Docker image builds.
Package collapse and the `src/` move are separate commits — bisectability matters
most here, where the diff is largest.

### Phase 6 — JSDoc typedefs

`src/types/index.js` defining `DirectiveContext`, `Directive`, `Action`,
`TdCacheLike` and `DirectiveCallback`. Annotate `BaseDirective`, the registry and
`RequestParameters` first, since those are the shapes every directive touches.
Add `jsconfig.json` with `checkJs` for editor feedback only — no build step, no
CI type gate, per the TypeScript-runway decision.

**Verification:** green set unchanged; `npm start` boots. Type errors surfaced by
`checkJs` are recorded as follow-up work, not fixed in this migration.

## Risks

| Risk | Mitigation |
|---|---|
| Phase 0 reclassifies a test as stale that is actually a real regression | Quarantine requires a written reason per test and review; quarantine is never a silent delete |
| Collapsing `executeCondition`/`myrequest` variants changes behaviour | Diff each variant before merging; 5 known-divergent directives override; status codes become explicit parameters |
| `#private` → `_protected` conversion is wide-reaching | Its own commit, no other change mixed in |
| Package collapse breaks the published `@tiledesk/tiledesk-tybot-connector` | Separate commit; verify Docker build and `npm start` before proceeding |
| Phase 5 `src/` move produces an unreviewable diff | Pure file moves committed separately from content edits |
| Frozen baseline hides pre-existing bugs | Explicitly accepted — this migration preserves behaviour, including buggy behaviour. Quarantined tests are a written backlog |

## Success criteria

1. The frozen green set passes at every phase boundary.
2. The full suite is deterministic across repeated runs.
3. CI runs the suite on every push.
4. No `#executeCondition`, `#assignAttributes`, `#myrequest` or constructor-guard
   duplication remains outside `BaseDirective` and the documented overrides.
5. No circular dependencies in the module graph.
6. One `package.json`, one `node_modules`.
7. Adding a directive touches one file.
8. Core shapes carry JSDoc typedefs; `checkJs` runs clean enough to enumerate
   remaining errors as a follow-up list.
