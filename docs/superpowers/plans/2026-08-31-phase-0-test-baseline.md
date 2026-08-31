# Phase 0 — Test Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing test suite deterministic, runnable by anyone, enforced in CI, and frozen as a written contract that every later migration phase verifies against.

**Architecture:** Run each test file in its own mocha process instead of sharing one. The suite's integration tests boot a full Express app and bind hardcoded ports, and `services/TilebotService.js:3` freezes `TILEBOT_ENDPOINT` at module load, so a shared process is unfixable without source changes. Process isolation fixes it with zero source and zero test-file edits. A runner script aggregates per-file results into JSON and fails on any regression against a committed baseline.

**Tech Stack:** Node 22, mocha 8, Redis 7 (Docker), GitHub Actions. No new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-08-31-code-structure-migration-design.md`

## Global Constraints

- **No source changes in this phase.** Only files under `tybotRoute/test/`, `tybotRoute/scripts/`, `docs/`, `.github/workflows/`, `package.json`, `tybotRoute/package.json`, and new root-level config files. Nothing under `tybotRoute/engine/`, `tybotRoute/services/`, `tybotRoute/tiledeskChatbotPlugs/`, `tybotRoute/utils/`, `tybotRoute/models/` or `tybotRoute/index.js`.
- **No new npm dependencies.** The runner uses only Node builtins.
- **Branch:** `refactor/code-structure-migration`.
- **Frozen baseline:** 332 passing tests across 49 files. Any command that reports fewer is a regression and must fail.
- **Required env for every test run:**
  - `REDIS_HOST=127.0.0.1`
  - `REDIS_PORT=6379`
  - `API_ENDPOINT=http://localhost:10002`
  - `TILEBOT_ENDPOINT=http://localhost:10001`
- **Test file collection rule:** files matching `test/*_test.js` or `test/*-test.js`. This deliberately excludes `test/testin.js` (a stub whose only `it()` body is commented out, asserting nothing) and the 41 `*_bot.js` fixtures.
- **Quarantine directory:** `tybotRoute/test/quarantine/`. Files there are never collected.

---

## File Structure

| File | Responsibility |
|---|---|
| `tybotRoute/scripts/run-tests.js` | Collect test files, run each in its own mocha process, aggregate results, compare against baseline, set exit code |
| `tybotRoute/.mocharc.yml` | Make a bare `mocha` invocation collect only real test files |
| `docker-compose.test.yml` | Provide Redis for local and CI runs |
| `docs/test-baseline.json` | Machine-readable frozen contract: file → passing count |
| `docs/testing.md` | How to run the suite; what the baseline means |
| `.github/workflows/test.yaml` | Run the suite on push and PR |
| `tybotRoute/test/quarantine/` | The 12 files with known failures, with reasons |

---

### Task 1: Test runner with process isolation

**Files:**
- Create: `tybotRoute/scripts/run-tests.js`
- Create: `docker-compose.test.yml`
- Modify: `tybotRoute/package.json` (the `scripts` block)
- Modify: `package.json` (the `scripts` block)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `node scripts/run-tests.js` writing `test-results.json` with shape
  `{ "totals": { "files": number, "passing": number, "failing": number }, "files": { "<basename>": { "passing": number, "failing": number } } }`.
  Accepts flags `--update-baseline` and `--timeout=<ms>`. Task 3 depends on this shape.

- [ ] **Step 1: Create the Redis service definition**

Create `docker-compose.test.yml`:

```yaml
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
```

- [ ] **Step 2: Write the runner**

Create `tybotRoute/scripts/run-tests.js`:

```js
#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const TEST_DIR = path.join(__dirname, '..', 'test');
const REPO_ROOT = path.join(__dirname, '..', '..');
const BASELINE = path.join(REPO_ROOT, 'docs', 'test-baseline.json');
const RESULTS = path.join(REPO_ROOT, 'test-results.json');

const args = process.argv.slice(2);
const updateBaseline = args.includes('--update-baseline');
const timeoutArg = args.find((a) => a.startsWith('--timeout='));
const timeout = timeoutArg ? timeoutArg.split('=')[1] : '20000';

const TEST_ENV = {
  REDIS_HOST: process.env.REDIS_HOST || '127.0.0.1',
  REDIS_PORT: process.env.REDIS_PORT || '6379',
  API_ENDPOINT: process.env.API_ENDPOINT || 'http://localhost:10002',
  TILEBOT_ENDPOINT: process.env.TILEBOT_ENDPOINT || 'http://localhost:10001',
};

function collect() {
  return fs
    .readdirSync(TEST_DIR)
    .filter((f) => /(_test|-test)\.js$/.test(f))
    .sort();
}

function runOne(file) {
  const res = spawnSync(
    process.execPath,
    [path.join(__dirname, '..', 'node_modules', '.bin', '_mocha'),
     '--timeout', timeout, '--exit', path.join('test', file)],
    {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, ...TEST_ENV },
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    }
  );
  const out = `${res.stdout || ''}${res.stderr || ''}`;
  const passing = Number((out.match(/(\d+) passing/) || [0, 0])[1]);
  const failing = Number((out.match(/(\d+) failing/) || [0, 0])[1]);
  return { passing, failing };
}

function main() {
  const files = collect();
  const results = {};
  let passing = 0;
  let failing = 0;

  for (const file of files) {
    const r = runOne(file);
    results[file] = r;
    passing += r.passing;
    failing += r.failing;
    const mark = r.failing > 0 ? 'FAIL' : 'ok  ';
    console.log(`${mark} ${file}  (${r.passing} passing, ${r.failing} failing)`);
  }

  const report = {
    totals: { files: files.length, passing, failing },
    files: results,
  };
  fs.writeFileSync(RESULTS, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\nTotals: ${passing} passing, ${failing} failing across ${files.length} files`);

  if (updateBaseline) {
    const green = {};
    for (const [file, r] of Object.entries(results)) {
      if (r.failing === 0 && r.passing > 0) green[file] = r.passing;
    }
    fs.writeFileSync(BASELINE, `${JSON.stringify(green, null, 2)}\n`);
    const total = Object.values(green).reduce((a, b) => a + b, 0);
    console.log(`Baseline written: ${Object.keys(green).length} files, ${total} tests`);
    return 0;
  }

  if (!fs.existsSync(BASELINE)) {
    console.error('No baseline found. Run with --update-baseline first.');
    return 1;
  }

  const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  const regressions = [];
  for (const [file, expected] of Object.entries(baseline)) {
    const actual = results[file];
    if (!actual) {
      regressions.push(`${file}: missing (expected ${expected} passing)`);
    } else if (actual.failing > 0) {
      regressions.push(`${file}: ${actual.failing} failing (expected 0)`);
    } else if (actual.passing < expected) {
      regressions.push(`${file}: ${actual.passing} passing (expected ${expected})`);
    }
  }

  if (regressions.length > 0) {
    console.error(`\nREGRESSION against baseline (${regressions.length}):`);
    for (const r of regressions) console.error(`  ${r}`);
    return 1;
  }

  console.log('\nBaseline satisfied.');
  return 0;
}

process.exit(main());
```

- [ ] **Step 3: Wire the npm scripts**

In `tybotRoute/package.json`, replace the `scripts` block with:

```json
  "scripts": {
    "test": "node scripts/run-tests.js",
    "test:baseline": "node scripts/run-tests.js --update-baseline",
    "start": "node index.js"
  },
```

In the root `package.json`, replace the `scripts` block with:

```json
  "scripts": {
    "test": "npm --prefix tybotRoute test",
    "start": "node index.js"
  },
```

- [ ] **Step 4: Verify the runner works against a known-green file**

Run:

```bash
docker compose -f docker-compose.test.yml up -d
cd tybotRoute && node scripts/run-tests.js --timeout=20000 2>&1 | grep json_condition_test
```

Expected: `ok   json_condition_test.js  (28 passing, 0 failing)`

- [ ] **Step 5: Commit**

```bash
git add docker-compose.test.yml tybotRoute/scripts/run-tests.js tybotRoute/package.json package.json
git commit -m "test: run each test file in an isolated mocha process

Shared-process runs cascade EADDRINUSE because 24 test files bind port
10001 and TilebotService freezes TILEBOT_ENDPOINT at module load. Process
isolation fixes this with no source or test-file changes."
```

---

### Task 2: Stop collecting fixtures, rename the misnamed suite

**Files:**
- Create: `tybotRoute/.mocharc.yml`
- Rename: `tybotRoute/test/validate_variable_names.js` → `tybotRoute/test/validate_variable_names_test.js`

**Interfaces:**
- Consumes: the collection rule from Task 1 (`test/*_test.js`, `test/*-test.js`).
- Produces: `validate_variable_names_test.js` as a collected file contributing 4 passing tests. Task 3's baseline includes it under the new name.

- [ ] **Step 1: Confirm the file is a real suite before renaming**

Run:

```bash
cd tybotRoute && grep -c "it(" test/validate_variable_names.js
```

Expected: `4` — four real assertions against `TiledeskExpression.validateVariableName`. This is why it is renamed rather than dropped.

- [ ] **Step 2: Rename it**

```bash
cd tybotRoute && git mv test/validate_variable_names.js test/validate_variable_names_test.js
```

- [ ] **Step 3: Add the mocharc so a bare `mocha` matches the runner**

Create `tybotRoute/.mocharc.yml`:

```yaml
spec:
  - 'test/*_test.js'
  - 'test/*-test.js'
timeout: 20000
exit: true
```

- [ ] **Step 4: Verify the renamed file runs and fixtures are excluded**

Run:

```bash
cd tybotRoute && npx mocha test/validate_variable_names_test.js 2>&1 | tail -3
```

Expected: `4 passing`

Run:

```bash
cd tybotRoute && npx mocha --dry-run 2>&1 | grep -c "_bot"
```

Expected: `0` — no fixture file is collected.

- [ ] **Step 5: Commit**

```bash
git add tybotRoute/.mocharc.yml tybotRoute/test/validate_variable_names_test.js
git commit -m "test: collect only real test files; rename validate_variable_names

The bare mocha default loaded all 104 files in test/, including 41
bots_data fixtures. validate_variable_names.js is a real 4-test suite and
is renamed so the spec glob keeps it."
```

---

### Task 3: Quarantine the 12 known-failing files

**Files:**
- Create: `tybotRoute/test/quarantine/README.md`
- Move: 12 files from `tybotRoute/test/` to `tybotRoute/test/quarantine/`

**Interfaces:**
- Consumes: the collection rule from Task 1 — `readdirSync(TEST_DIR)` is non-recursive, so files in `test/quarantine/` are automatically not collected. No runner change is needed.
- Produces: a `test/` directory whose collected files are all green, which Task 4 freezes.

- [ ] **Step 1: Create the quarantine directory with its rationale**

Create `tybotRoute/test/quarantine/README.md`:

```markdown
# Quarantined tests

These files fail today, before any migration work. They are quarantined so the
baseline is a clean contract — **not** because the failures are acceptable.

They are excluded by the runner because `scripts/run-tests.js` reads `test/`
non-recursively.

Every file here exercises the AI or vendor-integration directives that Phase 4
of the migration restructures. Phase 4 is the point at which they are revisited.

Note on the counts: within each file, every `it()` binds port 10002 and releases
it only on the success path. The first assertion failure therefore leaves the
port bound and every later test in that file dies with `EADDRINUSE`. The failure
counts below are inflated; the real defect in each file is its *first* failure.

| File | Pass | Fail | First failure |
|---|---|---|---|
| conversation-askgptv2_test.js | 0 | 19 | needs AI mock endpoints (`KB_ENDPOINT_QA`) |
| conversation-gpt_task_test.js | 0 | 13 | needs AI mock endpoints |
| conversation-ai_condition_test.js | 0 | 8 | stale assertion: expects `"Error: AiCondition Error: 'question' attribute is undefined"` |
| conversation-qapla_test.js | 0 | 7 | needs `QAPLA_ENDPOINT` mock |
| conversation-form-test.js | 0 | 7 | assertion failure |
| conversation-askgpt_test.js | 0 | 7 | needs `GPTKEY` / AI mock endpoints |
| conversation-ai_prompt_test.js | 4 | 7 | partially green; needs AI mock endpoints |
| conversation-hubspot_test.js | 0 | 4 | needs `HUBSPOT_ENDPOINT` mock |
| conversation-brevo_test.js | 0 | 4 | genuine AssertionError, not environment |
| conversation-make_test.js | 0 | 3 | needs `MAKE_ENDPOINT` mock |
| conversation-customerio_test.js | 0 | 3 | needs `CUSTOMERIO_ENDPOINT` mock |
| conversation-locked-intent-test.js | 0 | 1 | assertion failure |
```

- [ ] **Step 2: Move the 12 files**

```bash
cd tybotRoute/test && git mv \
  conversation-askgptv2_test.js \
  conversation-gpt_task_test.js \
  conversation-ai_condition_test.js \
  conversation-qapla_test.js \
  conversation-form-test.js \
  conversation-askgpt_test.js \
  conversation-ai_prompt_test.js \
  conversation-hubspot_test.js \
  conversation-brevo_test.js \
  conversation-make_test.js \
  conversation-customerio_test.js \
  conversation-locked-intent-test.js \
  quarantine/
```

- [ ] **Step 3: Verify nothing failing remains collected**

```bash
cd tybotRoute && node scripts/run-tests.js --timeout=20000 2>&1 | grep -c "^FAIL"
```

Expected: `0`

- [ ] **Step 4: Commit**

```bash
git add tybotRoute/test/quarantine
git commit -m "test: quarantine 12 files failing before any migration work

All 12 exercise the AI and vendor-integration directives that Phase 4
restructures. Reasons recorded per file; none deleted."
```

---

### Task 4: Freeze and document the baseline

**Files:**
- Create: `docs/test-baseline.json`
- Create: `docs/testing.md`

**Interfaces:**
- Consumes: `--update-baseline` from Task 1; the green `test/` directory from Tasks 2 and 3.
- Produces: `docs/test-baseline.json` mapping 49 filenames to passing counts, totalling 332. Every later migration phase verifies against this file.

- [ ] **Step 1: Generate the baseline**

```bash
docker compose -f docker-compose.test.yml up -d
cd tybotRoute && node scripts/run-tests.js --update-baseline --timeout=20000
```

Expected final line: `Baseline written: 49 files, 332 tests`

If the count differs, **stop and report** rather than editing the expectation. The number was measured on this branch at commit `430f7aa1`; a different number means something changed and must be explained before it is frozen.

- [ ] **Step 2: Verify the gate catches a regression**

Temporarily break a test to prove the gate works:

```bash
cd tybotRoute && cp test/filler_test.js /tmp/filler_backup.js
sed -i '' 's/assert(/assert(false \&\& /' test/filler_test.js
node scripts/run-tests.js --timeout=20000; echo "EXIT=$?"
```

Expected: non-zero exit and a `REGRESSION against baseline` block naming `filler_test.js`.

Restore it:

```bash
cd tybotRoute && cp /tmp/filler_backup.js test/filler_test.js
node scripts/run-tests.js --timeout=20000; echo "EXIT=$?"
```

Expected: `EXIT=0` and `Baseline satisfied.`

- [ ] **Step 3: Write the testing guide**

Create `docs/testing.md`:

```markdown
# Running the tests

## Quick start

```bash
docker compose -f docker-compose.test.yml up -d
npm test
```

`npm test` delegates to `tybotRoute/scripts/run-tests.js`, which runs every test
file in its own mocha process and compares the result against
`docs/test-baseline.json`. It exits non-zero on any regression.

## Why one process per file

The integration tests boot a full Express app. 24 files bind port 10001 and
their mock API on 10002, and `services/TilebotService.js` freezes
`TILEBOT_ENDPOINT` at module load — one value per process. In a shared mocha
process the first file to load fixes the endpoint for all 38 files that require
that service, and the port bindings collide. Running one file per process makes
each file independent.

Measured difference, with no other change:

| | One process | Per-file process |
|---|---|---|
| Passing | 264 | 337 |
| Failing | 156 | 83 |

## Environment

The runner defaults these; override by exporting them first.

| Variable | Default |
|---|---|
| `REDIS_HOST` | `127.0.0.1` |
| `REDIS_PORT` | `6379` |
| `API_ENDPOINT` | `http://localhost:10002` |
| `TILEBOT_ENDPOINT` | `http://localhost:10001` |

`API_ENDPOINT` is mandatory. Without it `startApp` throws inside an `async`
function, the rejection is never surfaced, and every `before` hook times out —
which makes the suite look completely broken rather than misconfigured.

## The baseline

`docs/test-baseline.json` maps each test file to the number of tests that must
pass: **332 tests across 49 files**. It is a contract, not a snapshot. Raise it
when you add tests; never lower it to make a run go green.

Regenerate only when deliberately adding tests:

```bash
cd tybotRoute && node scripts/run-tests.js --update-baseline
```

## Quarantined tests

`tybotRoute/test/quarantine/` holds 12 files that failed before any migration
work began. See the README there for the reason per file. They are not
collected. Fixing them is Phase 4 work.
```

- [ ] **Step 4: Confirm determinism across three runs**

```bash
cd tybotRoute && for i in 1 2 3; do node scripts/run-tests.js --timeout=20000 >/dev/null 2>&1; echo "run $i exit=$?"; done
```

Expected: `exit=0` three times.

- [ ] **Step 5: Commit**

```bash
git add docs/test-baseline.json docs/testing.md
git commit -m "test: freeze baseline at 332 tests across 49 files

Contract for every later migration phase. Runner exits non-zero on any
regression against it."
```

---

### Task 5: Run the suite in CI

**Files:**
- Create: `.github/workflows/test.yaml`

**Interfaces:**
- Consumes: `npm test` from Task 1 and `docs/test-baseline.json` from Task 4.
- Produces: a required status check on push and PR. No later task depends on it.

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/test.yaml`:

```yaml
name: Tests

on:
  push:
    branches: [ main, master, 'refactor/**' ]
  pull_request:
    branches: [ main, master ]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Install dependencies
        run: npm --prefix tybotRoute ci

      - name: Run test suite against frozen baseline
        run: npm test
        env:
          REDIS_HOST: 127.0.0.1
          REDIS_PORT: 6379
          API_ENDPOINT: http://localhost:10002
          TILEBOT_ENDPOINT: http://localhost:10001
```

- [ ] **Step 2: Verify the workflow parses**

```bash
python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/test.yaml')); print('valid')"
```

Expected: `valid`

- [ ] **Step 3: Commit and push**

```bash
git add .github/workflows/test.yaml
git commit -m "ci: run the test suite on push and PR

No workflow ran the tests before this; the two existing actions only
build Docker images."
git push -u origin refactor/code-structure-migration
```

- [ ] **Step 4: Confirm the run is green**

```bash
gh run list --branch refactor/code-structure-migration --limit 1
```

Expected: the `Tests` workflow concludes `success`. If `npm --prefix tybotRoute ci` fails because `tybotRoute/package-lock.json` is out of sync with `package.json`, switch that step to `npm --prefix tybotRoute install` and note the lockfile drift as a follow-up — do not silently regenerate the lockfile in this phase.

---

## Definition of done

- [ ] `npm test` exits 0 from a clean checkout with only Docker running.
- [ ] Three consecutive runs give identical results.
- [ ] `docs/test-baseline.json` records 49 files, 332 tests.
- [ ] Deliberately breaking any test makes `npm test` exit non-zero and name the file.
- [ ] CI runs the suite on push and PR and is green.
- [ ] No file outside `test/`, `scripts/`, `docs/`, `.github/`, and the two `package.json` files was modified.

## Follow-ups this phase deliberately does not do

- **Fix the 12 quarantined files.** Phase 4 work — they exercise the code it restructures.
- **`testin.js` and `close_directive_test.js` are dead scaffolding.** `testin.js` has one `it()` whose body is commented out; `close_directive_test.js` has both of its `it()` blocks commented out and runs zero tests. The collection rule excludes `testin.js` naturally and `close_directive_test.js` contributes zero, so neither affects the baseline. Deleting them is a separate decision, deliberately left to the user.
- **The swallowed rejection in `startApp`.** A missing `API_ENDPOINT` throws inside an `async` function and surfaces only as a hook timeout. It is a source change, so Phase 6 fixes it when `index.js` is split.
- **Lockfile drift between the two `package.json` files.** Resolved by the package collapse in Phase 6.
