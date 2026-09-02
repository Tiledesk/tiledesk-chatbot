'use strict';

// A stand-in for the Tiledesk platform API, for docker-compose.integration.yml.
//
// The connector talks to the platform for everything the visitor actually
// sees: a reply is a POST to `/:projectId/requests/:requestId/messages`. So
// this process is where the integration tests observe the bot from -- it
// records every call it receives and serves those recordings back over
// `GET /__recorded`, and the test container asserts on them.
//
// Deliberately dependency-free (node:http only): it must not add anything to
// the repository's package.json, and it runs on a stock `node:22` image with
// no install step at all.

const http = require('http');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 3001);

/** Everything this process has been asked for, oldest first. */
let recorded = [];

function record(entry) {
  entry.at = new Date().toISOString();
  entry.seq = recorded.length;
  recorded.push(entry);
  console.log(`[mock-tiledesk] ${entry.kind} ${entry.method} ${entry.path}`
    + (entry.requestId ? ` requestId=${entry.requestId}` : '')
    + (entry.kind === 'message' ? ` text=${JSON.stringify(entry.body && entry.body.text)}` : ''));
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve(null);
      try { resolve(JSON.parse(raw)); }
      catch (e) { resolve({ _unparsed: raw }); }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://mock-tiledesk');
  const path = url.pathname;
  const segments = path.split('/').filter((s) => s.length > 0);
  const method = req.method;

  // ------------------------------------------------------- control plane

  if (method === 'GET' && path === '/__health') {
    return json(res, 200, { ok: true, recorded: recorded.length });
  }

  if (method === 'GET' && path === '/__recorded') {
    const requestId = url.searchParams.get('requestId');
    const kind = url.searchParams.get('kind');
    let calls = recorded;
    if (requestId) calls = calls.filter((c) => c.requestId === requestId);
    if (kind) calls = calls.filter((c) => c.kind === kind);
    return json(res, 200, {
      total: recorded.length,
      count: calls.length,
      messages: calls.filter((c) => c.kind === 'message'),
      events: calls.filter((c) => c.kind === 'event'),
      calls: calls
    });
  }

  if ((method === 'POST' || method === 'DELETE') && path === '/__reset') {
    const previous = recorded.length;
    recorded = [];
    console.log(`[mock-tiledesk] reset, dropped ${previous} recordings`);
    return json(res, 200, { ok: true, dropped: previous });
  }

  const body = await readBody(req);

  // ------------------------------------------------------- Tiledesk API

  // The reply the visitor would see.
  // POST /:projectId/requests/:requestId/messages
  if (method === 'POST' && segments.length === 4
      && segments[1] === 'requests' && segments[3] === 'messages') {
    record({
      kind: 'message',
      method, path,
      projectId: segments[0],
      requestId: segments[2],
      authorization: req.headers['authorization'] || null,
      body: body
    });
    return json(res, 200, { success: true });
  }

  // GET /:projectId/requests/:requestId -- the connector looks the support
  // request up before running the directive pipeline. 404 is the honest
  // answer here (no real request exists) and is the branch production takes
  // for a conversation the platform has not created yet.
  if (method === 'GET' && segments.length === 3 && segments[1] === 'requests') {
    record({
      kind: 'request-lookup',
      method, path,
      projectId: segments[0],
      requestId: segments[2],
      body: null
    });
    return json(res, 404, { success: false });
  }

  // The analytics stream.
  if (method === 'POST' && path === '/events') {
    record({
      kind: 'event',
      method, path,
      requestId: (body && body.payload && body.payload.request_id) || null,
      body: body
    });
    return json(res, 200, { success: true });
  }

  // Anything else the connector reaches for: recorded, and answered
  // successfully so a test never fails on an unmodelled side call.
  record({
    kind: 'other',
    method, path,
    requestId: segments[1] === 'requests' ? segments[2] : null,
    body: body
  });
  return json(res, 200, { success: true });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[mock-tiledesk] listening on ${PORT}`);
});
