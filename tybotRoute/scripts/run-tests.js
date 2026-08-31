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
