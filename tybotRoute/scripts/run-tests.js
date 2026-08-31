#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const TEST_DIR = path.join(__dirname, '..', 'test');
const REPO_ROOT = path.join(__dirname, '..', '..');
const BASELINE = path.join(REPO_ROOT, 'docs', 'test-baseline.json');
const RESULTS = path.join(REPO_ROOT, 'test-results.json');

// Hard ceiling for a single test file's process. Mocha's own --timeout only
// covers individual hooks/tests; a hang outside mocha's timer (a socket that
// never settles, a native module deadlock) would otherwise stall the whole run.
const DEFAULT_SPAWN_TIMEOUT_MS = 300000;

const USAGE = `Usage: node scripts/run-tests.js [options]

  --update-baseline   regenerate docs/test-baseline.json from this run
  --force             with --update-baseline, allow writing a smaller baseline
  --timeout=<ms>      per-test mocha timeout (default 20000)
  --spawn-timeout=<ms>  per-file process timeout (default ${DEFAULT_SPAWN_TIMEOUT_MS})
  --only=<file>       run exactly one collected file (basename or test/<basename>)
  --help              show this message
`;

// ---------------------------------------------------------------- argv

function parseArgs(argv) {
  const opts = {
    updateBaseline: false,
    force: false,
    timeout: '20000',
    spawnTimeout: DEFAULT_SPAWN_TIMEOUT_MS,
    only: null,
    help: false,
  };
  const errors = [];

  for (const arg of argv) {
    if (arg === '--update-baseline') opts.updateBaseline = true;
    else if (arg === '--force') opts.force = true;
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg.startsWith('--timeout=')) opts.timeout = arg.slice('--timeout='.length);
    else if (arg.startsWith('--spawn-timeout=')) opts.spawnTimeout = arg.slice('--spawn-timeout='.length);
    else if (arg.startsWith('--only=')) opts.only = arg.slice('--only='.length);
    else errors.push(`unrecognised argument: ${arg}`);
  }

  if (!/^\d+$/.test(String(opts.timeout))) errors.push(`--timeout= expects a number of milliseconds, got "${opts.timeout}"`);
  if (!/^\d+$/.test(String(opts.spawnTimeout))) errors.push(`--spawn-timeout= expects a number of milliseconds, got "${opts.spawnTimeout}"`);
  opts.spawnTimeout = Number(opts.spawnTimeout);
  if (opts.only !== null && opts.only.trim() === '') errors.push('--only= expects a test file name');
  if (opts.force && !opts.updateBaseline) errors.push('--force is only meaningful together with --update-baseline');
  if (opts.only && opts.updateBaseline) errors.push('--only cannot be combined with --update-baseline');

  return { opts, errors };
}

const { opts, errors: argErrors } = parseArgs(process.argv.slice(2));

// Every test file starts its own mock server on MOCK (10002) and registers the
// routes it needs there — including the vendor and AI routes (/api/v3/contacts,
// /crm/v3/objects/..., /1.2/getShipment/, /v1/chat/completions, /api/ask,
// /api/qa). Those tests were previously quarantined purely because nothing
// pointed the directives at the mock, so they called the real vendor hosts and
// timed out. The bases below are derived from how each service builds its url:
//
//   BrevoService       brevoEndpoint()      + '/contacts'
//   CustomerioService  customerioEndpoint() + '/forms/{id}/submit'
//   HubspotService     hubspotEndpoint()    + 'objects/contacts/batch/create'  (note: trailing slash)
//   QaplaService       qaplaEndpoint()      + '/getShipment/'
//   MakeService        makeEndpoint()       + '/make/'
//   OpenAIService      openaiEndpoint()     + '/chat/completions'
//   LlmAskService      kbEndpoint()         + '/qa'   and  qaEndpoint() + '/ask'
//
// Change a service's url shape and the matching base here must change with it.
const MOCK = process.env.API_ENDPOINT || 'http://localhost:10002';

const TEST_ENV = {
  REDIS_HOST: process.env.REDIS_HOST || '127.0.0.1',
  REDIS_PORT: process.env.REDIS_PORT || '6379',
  API_ENDPOINT: MOCK,
  TILEBOT_ENDPOINT: process.env.TILEBOT_ENDPOINT || 'http://localhost:10001',

  BREVO_ENDPOINT: process.env.BREVO_ENDPOINT || `${MOCK}/api/v3`,
  CUSTOMERIO_ENDPOINT: process.env.CUSTOMERIO_ENDPOINT || `${MOCK}/api/v1`,
  HUBSPOT_ENDPOINT: process.env.HUBSPOT_ENDPOINT || `${MOCK}/crm/v3/`,
  QAPLA_ENDPOINT: process.env.QAPLA_ENDPOINT || `${MOCK}/1.2`,
  MAKE_ENDPOINT: process.env.MAKE_ENDPOINT || `${MOCK}/1.3`,
  OPENAI_ENDPOINT: process.env.OPENAI_ENDPOINT || `${MOCK}/v1`,
  KB_ENDPOINT: process.env.KB_ENDPOINT || `${MOCK}/api`,
  KB_ENDPOINT_QA: process.env.KB_ENDPOINT_QA || `${MOCK}/api`,
  KB_ENDPOINT_QA_GPU: process.env.KB_ENDPOINT_QA_GPU || `${MOCK}/api`,
};

// ---------------------------------------------------------------- running

function collect() {
  return fs
    .readdirSync(TEST_DIR)
    .filter((f) => /(_test|-test)\.js$/.test(f))
    .sort();
}

// Take the LAST anchored match: mocha's epilogue is the last thing printed, and
// application log output in stdout/stderr is dynamic enough to contain a stray
// "N passing" of its own.
function lastCount(out, word) {
  const re = new RegExp(`^\\s*(\\d+) ${word}`, 'gm');
  let value = null;
  let m;
  while ((m = re.exec(out)) !== null) value = Number(m[1]);
  return value;
}

function runOne(file) {
  const res = spawnSync(
    process.execPath,
    // --no-config --no-package are MANDATORY: mocha MERGES the `spec:` globs in
    // .mocharc.yml with any positional argument, so without them this "one file"
    // spawn silently runs the entire suite in a single process (which is exactly
    // what per-file isolation exists to prevent). See docs/testing.md.
    // Dependencies live in the single repo-root node_modules (the two packages
    // were collapsed into one), but cwd stays tybotRoute so that the positional
    // `test/<file>` and the tests' own relative requires keep resolving.
    [path.join(REPO_ROOT, 'node_modules', '.bin', '_mocha'),
     '--no-config', '--no-package', '--timeout', opts.timeout, '--exit', path.join('test', file)],
    {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, ...TEST_ENV },
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      timeout: opts.spawnTimeout,
      killSignal: 'SIGKILL',
    }
  );

  const out = `${res.stdout || ''}${res.stderr || ''}`;
  const parsedPassing = lastCount(out, 'passing');
  const parsedFailing = lastCount(out, 'failing');
  const passing = parsedPassing === null ? 0 : parsedPassing;
  const failing = parsedFailing === null ? 0 : parsedFailing;

  const r = {
    passing,
    failing,
    status: res.status === null ? null : res.status,
    signal: res.signal || null,
  };

  // --- classification ---------------------------------------------------
  // A spawn that never produced a mocha epilogue is broken, not green.
  if (res.error) {
    r.kind = 'ERROR';
    r.reason = res.error.code === 'ETIMEDOUT'
      ? `killed after ${opts.spawnTimeout}ms (spawn timeout)`
      : `spawn failed: ${res.error.message}`;
  } else if (res.signal) {
    r.kind = 'ERROR';
    r.reason = `killed by signal ${res.signal}`;
  } else if (parsedPassing === null) {
    r.kind = 'ERROR';
    r.reason = `no mocha summary in output (exit code ${r.status})`;
    r.tail = out.trim().split('\n').slice(-8).join('\n');
  } else if (failing > 0) {
    r.kind = 'FAIL';
  } else if (r.status !== 0) {
    // Mocha parsed and reported zero failures yet exited non-zero: something
    // blew up outside the reporter. Never report that as ok.
    r.kind = 'ERROR';
    r.reason = `mocha reported 0 failing but exited with code ${r.status}`;
    r.tail = out.trim().split('\n').slice(-8).join('\n');
  } else if (passing === 0) {
    // Ran cleanly and defined no tests (e.g. every it() commented out).
    // Legitimate; not an error, and not a pass either.
    r.kind = 'NONE';
  } else {
    r.kind = 'OK';
  }

  return r;
}

const MARKS = { OK: 'ok  ', FAIL: 'FAIL', ERROR: 'ERR ', NONE: 'none' };

function report(file, r) {
  console.log(`${MARKS[r.kind]} ${file}  (${r.passing} passing, ${r.failing} failing)${r.reason ? `  -- ${r.reason}` : ''}`);
  if (r.tail) {
    for (const line of r.tail.split('\n')) console.log(`       | ${line}`);
  }
}

// ---------------------------------------------------------------- modes

function runOnly(files, only) {
  const wanted = path.basename(only);
  if (!files.includes(wanted)) {
    console.error(`--only: "${only}" is not a collected test file.`);
    console.error(`Collected files live in ${TEST_DIR} and match /(_test|-test)\\.js$/.`);
    return 2;
  }
  console.log(`Running a single file (baseline gate skipped): ${wanted}\n`);
  const r = runOne(wanted);
  report(wanted, r);
  console.log(`\nTotals: ${r.passing} passing, ${r.failing} failing across 1 file`);
  if (r.kind === 'FAIL' || r.kind === 'ERROR') {
    console.error(`\n${wanted} did not pass.`);
    return 1;
  }
  return 0;
}

function writeBaseline(results) {
  const green = {};
  for (const [file, r] of Object.entries(results)) {
    if (r.kind === 'OK') green[file] = r.passing;
  }
  const newFiles = Object.keys(green).length;
  const newTests = Object.values(green).reduce((a, b) => a + b, 0);

  const broken = Object.entries(results).filter(([, r]) => r.kind === 'FAIL' || r.kind === 'ERROR');

  // An empty baseline makes every later run pass vacuously. Never write one.
  if (newFiles === 0 || newTests === 0) {
    console.error('\nREFUSING to write an empty baseline (0 files / 0 tests).');
    console.error('Nothing green was collected — the run itself is broken (missing node_modules? Redis down?).');
    console.error('docs/test-baseline.json left untouched. --force does not override this.');
    return 1;
  }

  let old = null;
  if (fs.existsSync(BASELINE)) {
    try {
      old = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
    } catch (e) {
      console.error(`\nExisting baseline is not valid JSON: ${e.message}`);
      return 1;
    }
  }

  if (old) {
    const oldFiles = Object.keys(old).length;
    const oldTests = Object.values(old).reduce((a, b) => a + b, 0);
    const dropped = Object.keys(old).filter((f) => !(f in green));
    const shrunk = Object.keys(old).filter((f) => f in green && green[f] < old[f]);

    if (newFiles < oldFiles || newTests < oldTests) {
      console.error(`\n${opts.force ? 'FORCED SHRINK of' : 'REFUSING to shrink'} the baseline:`);
      console.error(`  files: ${oldFiles} -> ${newFiles}`);
      console.error(`  tests: ${oldTests} -> ${newTests}`);
      for (const f of dropped) console.error(`  dropped: ${f} (was ${old[f]} passing)`);
      for (const f of shrunk) console.error(`  fewer tests: ${f} ${old[f]} -> ${green[f]}`);
      if (!opts.force) {
        console.error('\ndocs/test-baseline.json left untouched.');
        console.error('The baseline is a contract: fix the run, or pass --force if the shrink is deliberate.');
        return 1;
      }
    }
  }

  fs.writeFileSync(BASELINE, `${JSON.stringify(green, null, 2)}\n`);
  console.log(`Baseline written: ${newFiles} files, ${newTests} tests`);

  if (broken.length > 0) {
    console.error(`\n${broken.length} file(s) were not green during regeneration and are NOT in the new baseline:`);
    for (const [file, r] of broken) console.error(`  ${file}: ${r.kind}${r.reason ? ` (${r.reason})` : ` (${r.failing} failing)`}`);
    return 1;
  }
  return 0;
}

function gate(files, results) {
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
    } else if (actual.kind === 'ERROR') {
      regressions.push(`${file}: ERROR - ${actual.reason}`);
    } else if (actual.failing > 0) {
      regressions.push(`${file}: ${actual.failing} failing (expected 0)`);
    } else if (actual.passing < expected) {
      regressions.push(`${file}: ${actual.passing} passing (expected ${expected})`);
    }
  }

  // Files outside the baseline still have to pass. Without this the gate exits 0
  // while a newly added (or newly un-quarantined) file is red.
  const unlisted = [];
  for (const file of files) {
    if (file in baseline) continue;
    const r = results[file];
    if (r.kind === 'FAIL') unlisted.push(`${file}: ${r.failing} failing (not in baseline)`);
    else if (r.kind === 'ERROR') unlisted.push(`${file}: ERROR - ${r.reason} (not in baseline)`);
  }

  let failed = false;
  if (regressions.length > 0) {
    failed = true;
    console.error(`\nREGRESSION against baseline (${regressions.length}):`);
    for (const r of regressions) console.error(`  ${r}`);
  }
  if (unlisted.length > 0) {
    failed = true;
    console.error(`\nFAILING FILES NOT IN THE BASELINE (${unlisted.length}):`);
    for (const r of unlisted) console.error(`  ${r}`);
    console.error('  (these are not baseline regressions, but they are broken and fail the run)');
  }
  if (failed) return 1;

  const baseFiles = Object.keys(baseline).length;
  const baseTests = Object.values(baseline).reduce((a, b) => a + b, 0);
  console.log(`\nBaseline satisfied: ${baseFiles} files, ${baseTests} tests.`);
  return 0;
}

// ---------------------------------------------------------------- main

function main() {
  if (opts.help) {
    console.log(USAGE);
    return 0;
  }
  if (argErrors.length > 0) {
    for (const e of argErrors) console.error(`run-tests: ${e}`);
    console.error(`\n${USAGE}`);
    return 2;
  }

  const files = collect();

  if (opts.only) return runOnly(files, opts.only);

  const results = {};
  let passing = 0;
  let failing = 0;

  for (const file of files) {
    const r = runOne(file);
    results[file] = r;
    passing += r.passing;
    failing += r.failing;
    report(file, r);
  }

  const errored = files.filter((f) => results[f].kind === 'ERROR');
  const report_ = {
    totals: { files: files.length, passing, failing, errored: errored.length },
    files: results,
  };
  fs.writeFileSync(RESULTS, `${JSON.stringify(report_, null, 2)}\n`);
  console.log(`\nTotals: ${passing} passing, ${failing} failing across ${files.length} files`
    + (errored.length ? `, ${errored.length} errored` : ''));

  if (opts.updateBaseline) return writeBaseline(results);
  return gate(files, results);
}

process.exit(main());
