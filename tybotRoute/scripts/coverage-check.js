#!/usr/bin/env node
'use strict';

// Coverage ratchet. Fails if coverage fell below the floor recorded in
// docs/coverage-baseline.json, overall or in any area.
//
// The floor only ever goes UP. When coverage improves, re-record the baseline
// (`node tybotRoute/scripts/coverage-check.js --update`) so the new level is
// locked in. Lowering a floor to make a red run go green defeats the point:
// the check exists to catch a regression, and a regression is a bug in the
// change that caused it, not in the number.
//
// Floors sit `headroomPoints` below the measured figure. The suite runs one
// process per test file and the merged result is not bit-identical between
// invocations (observed drift: 62.93 vs 62.92), so a zero-headroom floor would
// flap. The headroom is slack against noise, not a coverage allowance.
//
// Reads coverage/coverage-summary.json, which `npm run test:coverage` writes.

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..', '..');
const DEFAULT_BASELINE = path.join(REPO_ROOT, 'docs', 'coverage-baseline.json');
const SUMMARY = path.join(REPO_ROOT, 'coverage', 'coverage-summary.json');

const USAGE = `Usage: node tybotRoute/scripts/coverage-check.js [options]

  --baseline=<path>  floor file to check against (default docs/coverage-baseline.json)
  --update           re-record the baseline from the current report (ratchet UP only)
  --force            with --update, allow recording a LOWER floor (needs a reason in review)
  --help             show this message

Run \`npm run test:coverage\` first; this reads coverage/coverage-summary.json.
`;

// ---------------------------------------------------------------- argv

function parseArgs(argv) {
  const opts = { baseline: DEFAULT_BASELINE, update: false, force: false, help: false };
  const errors = [];
  for (const arg of argv) {
    if (arg === '--update') opts.update = true;
    else if (arg === '--force') opts.force = true;
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg.startsWith('--baseline=')) opts.baseline = path.resolve(REPO_ROOT, arg.slice('--baseline='.length));
    else errors.push(`unrecognised argument: ${arg}`);
  }
  if (opts.force && !opts.update) errors.push('--force is only meaningful together with --update');
  return { opts, errors };
}

// ---------------------------------------------------------------- reading

const METRICS = ['lines', 'statements', 'functions', 'branches'];

function readJson(file, what) {
  if (!fs.existsSync(file)) {
    console.error(`coverage-check: no ${what} at ${path.relative(REPO_ROOT, file)}`);
    if (what === 'coverage report') console.error('Run `npm run test:coverage` first.');
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`coverage-check: ${what} is not valid JSON: ${e.message}`);
    return null;
  }
}

function pct(o) {
  return o.total === 0 ? 100 : Math.round((1e4 * o.covered) / o.total) / 100;
}

/** Roll per-file figures up to one entry per directory. */
function byArea(summary) {
  const root = `${REPO_ROOT}${path.sep}`;
  const areas = {};
  for (const [file, v] of Object.entries(summary)) {
    if (file === 'total') continue;
    const rel = file.startsWith(root) ? file.slice(root.length) : file;
    const dir = path.dirname(rel);
    const a = areas[dir] || (areas[dir] = {
      files: 0,
      lines: { covered: 0, total: 0 },
      branches: { covered: 0, total: 0 },
      functions: { covered: 0, total: 0 },
    });
    a.files += 1;
    for (const m of ['lines', 'branches', 'functions']) {
      a[m].covered += v[m].covered;
      a[m].total += v[m].total;
    }
  }
  const out = {};
  for (const k of Object.keys(areas).sort()) {
    const a = areas[k];
    out[k] = { files: a.files, lines: pct(a.lines), branches: pct(a.branches), functions: pct(a.functions) };
  }
  return out;
}

// ---------------------------------------------------------------- checking

function check(baseline, summary) {
  const failures = [];
  const slack = [];

  console.log('Overall');
  for (const m of METRICS) {
    const actual = summary.total[m].pct;
    const floor = baseline.floor[m];
    if (floor === undefined) continue;
    const ok = actual >= floor;
    console.log(`  ${ok ? 'ok  ' : 'BELOW'} ${m.padEnd(11)} ${actual.toFixed(2).padStart(6)}%  floor ${floor.toFixed(2)}%`);
    if (!ok) failures.push(`total ${m}: ${actual.toFixed(2)}% is below the floor of ${floor.toFixed(2)}%`);
    else if (actual - floor > baseline.headroomPoints + 1) {
      slack.push(`total ${m}: ${actual.toFixed(2)}% vs floor ${floor.toFixed(2)}%`);
    }
  }

  const areas = byArea(summary);
  const recorded = baseline.areas || {};
  console.log('\nPer area (lines)');
  for (const [name, rec] of Object.entries(recorded)) {
    const a = areas[name];
    if (!a) {
      // A recorded area that vanished is either a rename or deleted source.
      // Either way the floor no longer describes anything; say so loudly.
      failures.push(`area ${name}: recorded in the baseline but absent from the report (renamed or deleted? re-record deliberately)`);
      console.log(`  GONE  ${name}`);
      continue;
    }
    const floor = rec.floorLines;
    const ok = a.lines >= floor;
    console.log(`  ${ok ? 'ok  ' : 'BELOW'} ${name.padEnd(36)} ${a.lines.toFixed(2).padStart(6)}%  floor ${floor.toFixed(2)}%  (${a.files} files)`);
    if (!ok) failures.push(`area ${name}: ${a.lines.toFixed(2)}% lines is below the floor of ${floor.toFixed(2)}%`);
    else if (a.lines - floor > baseline.headroomPoints + 1) slack.push(`area ${name}: ${a.lines.toFixed(2)}% vs floor ${floor.toFixed(2)}%`);
  }
  for (const name of Object.keys(areas)) {
    if (!(name in recorded)) console.log(`  new   ${name} ${areas[name].lines.toFixed(2)}% (not yet in the baseline)`);
  }

  if (failures.length > 0) {
    console.error(`\nCOVERAGE REGRESSION (${failures.length}):`);
    for (const f of failures) console.error(`  ${f}`);
    console.error('\nThe floor ratchets UP. Do not lower it to make this pass -- find what');
    console.error('stopped being exercised. If the drop is deliberate (code deleted, area');
    console.error('renamed) re-record with --update and say why in the commit message.');
    return 1;
  }

  console.log('\nCoverage floor satisfied.');
  if (slack.length > 0) {
    console.log(`\n${slack.length} floor(s) now more than ${baseline.headroomPoints + 1} points below actual -- ratchet them up:`);
    for (const s of slack) console.log(`  ${s}`);
    console.log('  node tybotRoute/scripts/coverage-check.js --update');
  }
  return 0;
}

// ---------------------------------------------------------------- updating

function update(baseline, summary, opts) {
  const headroom = baseline.headroomPoints;
  const floorOf = (p) => Math.max(0, Math.floor((p - headroom) * 10) / 10);

  const lowered = [];
  const nextFloor = {};
  for (const m of METRICS) {
    nextFloor[m] = floorOf(summary.total[m].pct);
    if (baseline.floor[m] !== undefined && nextFloor[m] < baseline.floor[m]) {
      lowered.push(`total ${m}: ${baseline.floor[m].toFixed(2)}% -> ${nextFloor[m].toFixed(2)}%`);
    }
  }

  const areas = byArea(summary);
  const nextAreas = {};
  for (const [name, a] of Object.entries(areas)) {
    nextAreas[name] = { files: a.files, lines: a.lines, branches: a.branches, functions: a.functions, floorLines: floorOf(a.lines) };
    const prev = (baseline.areas || {})[name];
    if (prev && nextAreas[name].floorLines < prev.floorLines) {
      lowered.push(`area ${name}: ${prev.floorLines.toFixed(2)}% -> ${nextAreas[name].floorLines.toFixed(2)}%`);
    }
  }

  if (lowered.length > 0 && !opts.force) {
    console.error(`\nREFUSING to lower ${lowered.length} floor(s):`);
    for (const l of lowered) console.error(`  ${l}`);
    console.error('\nThe baseline is a ratchet. Pass --force only when the drop is deliberate');
    console.error('(code deleted, area renamed) and say why in the commit message.');
    return 1;
  }
  if (lowered.length > 0) {
    console.error(`\nFORCED LOWERING of ${lowered.length} floor(s):`);
    for (const l of lowered) console.error(`  ${l}`);
  }

  const t = summary.total;
  const next = {
    ...baseline,
    recordedAt: new Date().toISOString().slice(0, 10),
    measured: {
      files: Object.keys(summary).length - 1,
      lines: t.lines.pct,
      statements: t.statements.pct,
      functions: t.functions.pct,
      branches: t.branches.pct,
      linesCovered: t.lines.covered,
      linesTotal: t.lines.total,
      functionsCovered: t.functions.covered,
      functionsTotal: t.functions.total,
      branchesCovered: t.branches.covered,
      branchesTotal: t.branches.total,
    },
    floor: nextFloor,
    areas: nextAreas,
  };
  fs.writeFileSync(opts.baseline, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`Baseline re-recorded: lines ${t.lines.pct}% (floor ${nextFloor.lines}%), ${Object.keys(nextAreas).length} areas.`);
  return 0;
}

// ---------------------------------------------------------------- main

function main() {
  const { opts, errors } = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(USAGE);
    return 0;
  }
  if (errors.length > 0) {
    for (const e of errors) console.error(`coverage-check: ${e}`);
    console.error(`\n${USAGE}`);
    return 2;
  }

  const summary = readJson(SUMMARY, 'coverage report');
  if (!summary) return 1;
  if (!summary.total) {
    console.error('coverage-check: coverage report has no `total` — refusing to pass vacuously.');
    return 1;
  }

  const baseline = readJson(opts.baseline, 'coverage baseline');
  if (!baseline) return 1;
  if (!baseline.floor) {
    console.error('coverage-check: baseline has no `floor` — refusing to pass vacuously.');
    return 1;
  }
  if (typeof baseline.headroomPoints !== 'number') {
    console.error('coverage-check: baseline has no numeric `headroomPoints`.');
    return 1;
  }

  return opts.update ? update(baseline, summary, opts) : check(baseline, summary);
}

process.exit(main());
