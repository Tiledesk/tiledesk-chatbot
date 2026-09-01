#!/usr/bin/env node
'use strict';

// Runs the whole suite under V8 coverage and renders a merged c8 report.
//
// Why this wrapper exists instead of plain `c8 npm test`:
//
// 1. scripts/run-tests.js spawns ONE mocha process per test file. Those children
//    inherit NODE_V8_COVERAGE, so each writes its own profile into the same temp
//    directory and c8 merges them. That part works with plain c8 too.
//
// 2. The merge is where plain c8 lies. @bcoe/v8-coverage's mergeFunctionCovs
//    groups FunctionCov entries by their ROOT RANGE (startOffset;endOffset) and
//    sums the counts of everything in a group. A class that declares an instance
//    field emits two synthetic functions with an IDENTICAL root range spanning
//    the whole class body:
//
//        <static_initializer>            count 1   (the static field ran at load)
//        <instance_members_initializer>  count 0   (never constructed)
//
//    Merged, those collapse into a single count-1 range covering the entire class
//    body, and every method inside it is painted covered. V8 does not emit
//    per-method records for such a class until it is actually instantiated, so
//    there is nothing left to carve the truth back out.
//
//    Measured on this repo: DirAiPrompt.js reads 3.93% from one process and 100%
//    after merging 37 of them. Two files are affected today (DirAiPrompt.js,
//    DirAiCondition.js) and together they were worth ~5 points of fake coverage.
//
//    normaliseClassInitialisers() below drops the <static_initializer> record
//    whenever it collides with an <instance_members_initializer> over the same
//    range, so the count-0 sibling survives the merge and the class body reports
//    honestly. Cost: the one static-field line is reported uncovered even though
//    it ran. That errs downwards, which is the safe direction for a ratchet.
//    A class that IS instantiated keeps a count>0 initialiser and is unaffected;
//    methods that ran keep their own count>0 records and carve back in.
//
// `npm test` does not go through here and is unchanged.

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..', '..');
const TMP_DIR = path.join(REPO_ROOT, 'coverage', 'tmp');
const RUNNER = path.join(__dirname, 'run-tests.js');
const C8_BIN = path.join(REPO_ROOT, 'node_modules', '.bin', 'c8');

// ------------------------------------------------------------- normalisation

const STATIC_INIT = '<static_initializer>';
const INSTANCE_INIT = '<instance_members_initializer>';

function rootRange(fn) {
  const r = fn.ranges && fn.ranges[0];
  return r ? `${r.startOffset};${r.endOffset}` : null;
}

/**
 * Drop <static_initializer> records that share a root range with an
 * <instance_members_initializer>. See the header comment for why.
 * Returns the number of records changed.
 */
function normaliseClassInitialisers(scriptCov) {
  const instanceRanges = new Set();
  for (const fn of scriptCov.functions) {
    if (fn.functionName === INSTANCE_INIT) {
      const key = rootRange(fn);
      if (key) instanceRanges.add(key);
    }
  }
  if (instanceRanges.size === 0) return 0;

  const before = scriptCov.functions.length;
  scriptCov.functions = scriptCov.functions.filter(
    (fn) => !(fn.functionName === STATIC_INIT && instanceRanges.has(rootRange(fn)))
  );
  return before - scriptCov.functions.length;
}

function normaliseTempDir(dir) {
  let files = 0;
  let records = 0;
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    const full = path.join(dir, name);
    let json;
    try {
      json = JSON.parse(fs.readFileSync(full, 'utf8'));
    } catch (e) {
      // A profile truncated by a SIGKILLed child is unparseable. c8 skips such
      // files itself; say so rather than aborting the whole report.
      console.error(`coverage: skipping unreadable profile ${name}: ${e.message}`);
      continue;
    }
    if (!json || !Array.isArray(json.result)) continue;

    let changed = 0;
    for (const scriptCov of json.result) {
      if (!scriptCov.functions) continue;
      changed += normaliseClassInitialisers(scriptCov);
    }
    if (changed > 0) {
      fs.writeFileSync(full, JSON.stringify(json));
      files += 1;
      records += changed;
    }
  }
  return { files, records };
}

// --------------------------------------------------------------------- main

function main() {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  fs.mkdirSync(TMP_DIR, { recursive: true });

  const run = spawnSync(process.execPath, [RUNNER, ...process.argv.slice(2)], {
    cwd: REPO_ROOT,
    env: { ...process.env, NODE_V8_COVERAGE: TMP_DIR },
    stdio: 'inherit',
  });

  if (run.error) {
    console.error(`coverage: could not run the suite: ${run.error.message}`);
    return 1;
  }

  if (!fs.existsSync(TMP_DIR) || fs.readdirSync(TMP_DIR).length === 0) {
    console.error('coverage: no V8 profiles were written — refusing to report 0%.');
    return 1;
  }

  const { files, records } = normaliseTempDir(TMP_DIR);
  console.log(`\ncoverage: normalised ${records} colliding class-initialiser record(s) in ${files} profile(s).`);

  const report = spawnSync(C8_BIN, ['report'], { cwd: REPO_ROOT, stdio: 'inherit' });
  if (report.error) {
    console.error(`coverage: c8 report failed: ${report.error.message}`);
    return 1;
  }
  if (report.status !== 0) return report.status;

  // A red suite still produces a report, but must not exit 0.
  return run.status === 0 ? 0 : run.status;
}

process.exit(main());
