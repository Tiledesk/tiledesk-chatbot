'use strict';

// A stand-in for the Tiledesk platform API -- and, since stage 2, for the LLM
// server and the six vendor APIs as well -- for docker-compose.integration.yml.
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
//
// ---------------------------------------------------------------------------
// WHAT THIS IS, BEYOND A RECORDER
// ---------------------------------------------------------------------------
// Two things, on top of the recordings:
//
//  1. STATE. The mock keeps the state the platform would keep: requests and
//     their participants / department / status / tags, leads, the project tag
//     list, integrations, kb settings, quotas, data-table rows. A test can
//     therefore assert on the OUTCOME ("the request is closed", "the tag is on
//     the lead") and not only on the fact that a call was made. `GET /__state`
//     dumps it; `POST /__seed` preloads it.
//
//  2. FAILURE INJECTION. `POST /__fail` arms any route for an HTTP 500, an
//     HTTP 401, a malformed (unparseable) body, or a hard transport drop. Every
//     defect this project has fixed lived on an error path, so being able to
//     produce one on demand is the point of the whole exercise.
//
// ---------------------------------------------------------------------------
// HOW THE RESPONSE SHAPES WERE CHOSEN
// ---------------------------------------------------------------------------
// Every shape below is what a CALLER IN THIS REPOSITORY ACTUALLY READS, and the
// caller is named in the comment above each route. Where no caller reads
// anything out of the body, the route answers `{ success: true }` -- a body is
// still mandatory, because both HTTP layers the connector uses treat an empty
// body as a failure:
//
//   * utils/HttpUtils.request  -> `res.status 2xx && res.data`, else Error
//   * @tiledesk/tiledesk-client TiledeskClient.myrequest
//                              -> `res.status == 200 && res.data`, else err
//
// Nothing here is invented to "look like" the real platform. Where the real
// shape could not be determined from this repository, the route says so in its
// comment rather than guessing.

const http = require('http');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 3001);

// ---------------------------------------------------------------------------
// STATE
// ---------------------------------------------------------------------------

/** Everything this process has been asked for, oldest first. */
let recorded = [];

/** Armed failures (see POST /__fail). */
let failures = [];

/**
 * The platform's state. One object, deliberately flat and boring.
 *
 * Field names that are READ BY THE CONNECTOR are marked (read); the rest exist
 * so a test can assert on an outcome and are the mock's own bookkeeping.
 */
function freshState() {
  return {
    // requestId -> request document
    requests: {},
    // leadId -> lead document
    leads: {},
    // the project-wide tag list: [{ tag, color }]
    tags: [],
    // [{ _id, name, hasBot, id_bot, ... }] served by GET /:projectId/departments/allstatus
    departments: [],
    // the available agents served by GET /projects/:projectId/users/availables
    agents: [],
    // integration name -> { _id, name, value } served by /integration/name/:name
    integrations: {},
    // GET /:projectId/kbsettings -> { gptkey }
    kbsettings: { gptkey: null },
    // GET /:projectId/kb/namespace/all -> [{ id, name }]
    namespaces: [],
    // what the kb write endpoints received
    kb: { contents: [], answered: [], unanswered: [] },
    // GET /:projectId/quotes/tokens -> { isAvailable }; POST /quotes/incr/tokens accumulates
    quotas: { isAvailable: true, tokens: 0, increments: [] },
    // tableId -> [ row document ]
    tables: {},
    // what GET /:projectId/mcp/native was asked for (the body is ignored by the caller)
    mcp: { native: [], calls: 0 },
    // GET /projects/:projectId/isopen -> { isopen }; slots[slotId] overrides it
    openHours: { isopen: true, slots: {} },
    // the events fired through POST /:projectId/events
    events: [],
    // bot identifier (id | slug | name) -> { root_id }, for PUT /requests/:id/replace
    bots: {},
    // the project's chatbots, served by GET /:projectId/faq_kb. DirReplaceBot
    // (v1) resolves its target THROUGH THIS LIST -- TiledeskClient.findBotByName
    // reads `bots[i].name` and `._id` -- and then swaps the participant rather
    // than calling /replace, which is what makes v1 observably different from
    // v2 and v3. Seed with `{"chatbots":[{"_id":"...","name":"..."}]}`.
    chatbots: [],
    // the body POST /:projectId/llm/transcription answers with, when seeded
    transcription: null,

    // ------------------------------------------------------------------- AI
    //
    // What each LLM route answers with, and what it was asked. EVERY default
    // below is copied from the stub the unit suite already runs these
    // directives against -- the file is named on each field -- so a journey
    // that passes here passes for the same reason the unit test does.
    // `POST /__seed {"llm": {...}}` replaces any of them per test.
    llm: {
      // POST {KB_ENDPOINT}/qa -- DirAskGPT (v1).
      // tybotRoute/test/conversation-askgpt_test.js:93
      qa: {
        answer: 'this is mock gpt reply',
        success: true,
        source_url: 'http://test'
      },
      // POST {KB_ENDPOINT_QA}/ask (and /thinking) -- DirAiPrompt, DirAiCondition.
      // tybotRoute/test/conversation-ai_prompt_test.js:351 and
      // tybotRoute/test/ai_directive_units_test.js:229 for prompt_token_info.
      ask: {
        answer: 'this is the answer',
        chat_history_dict: {}
      },
      // POST {KB_ENDPOINT_QA | KB_ENDPOINT_QA_GPU}/qa -- DirAskGPTV2.
      // tybotRoute/test/conversation-askgptv2_test.js:106 (+ :1146 for citations).
      namespaceQa: {
        answer: 'this is mock kb reply',
        success: true,
        id: '123456789',
        ids: ['9876543210', '0123456789'],
        source: 'http://gethelp.test.com/article',
        sources: ['TextArticle', 'http://gethelp.test.com/article'],
        prompt_token_size: 762,
        content_chunks: ['this is the chunk 1', 'this is the chunk 2']
      },
      // POST {OPENAI_ENDPOINT}/chat/completions -- DirGptTask.
      // tybotRoute/test/conversation-gpt_task_test.js:94
      completion: {
        id: 'chatcmpl-7ydspsF20mgTsl4g9yTK8LNbDDYAp',
        object: 'chat.completion',
        created: 1694687347,
        model: 'gpt-3.5-turbo-0613',
        choices: [
          { index: 0, message: { role: 'assistant', content: 'this is the answer' }, finish_reason: 'stop' }
        ],
        usage: { prompt_tokens: 30, completion_tokens: 48, total_tokens: 78 }
      },
      // what each route was asked, oldest first
      asked: { qa: [], ask: [], namespaceQa: [], completion: [] }
    },

    // -------------------------------------------------------------- vendors
    //
    // The six external systems. Each holds what the mock RECEIVED (so a test
    // can assert the contact was really created) and, for Qapla, what it is to
    // answer with.
    vendors: {
      brevo: { contacts: [], nextId: 6 },      // nextId: the unit stub answers { id: 6 }
      customerio: { submissions: [] },
      hubspot: { contacts: [] },
      // trackingNumber -> { status, result, error }; seed with
      // `{"shipments": {"AB123": {"status": "IN TRANSIT"}}}`
      qapla: { shipments: {}, lookups: [] },
      make: { triggers: [] },
      whatsapp: { broadcasts: [] }
    },
    // anything the mock could not model faithfully, so a test cannot pass for
    // the wrong reason without noticing
    warnings: [],
    options: {
      // GET /:projectId/requests/:requestId answers 404 for a request that was
      // never seeded -- which is what the shipped journeys expect, and the
      // branch production takes for a conversation the platform has not
      // created yet. Seed `{"options":{"autoCreateRequests":true}}` to have the
      // mock materialise a request the moment a message is posted into it.
      autoCreateRequests: false
    }
  };
}

let state = freshState();

// ---------------------------------------------------------------------------
// PLUMBING
// ---------------------------------------------------------------------------

function record(entry) {
  entry.at = new Date().toISOString();
  entry.seq = recorded.length;
  recorded.push(entry);
  console.log(`[mock-tiledesk] ${entry.kind} ${entry.method} ${entry.path}`
    + (entry.requestId ? ` requestId=${entry.requestId}` : '')
    + (entry.failure ? ` INJECTED=${entry.failure}` : '')
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

/**
 * A response that is NOT json. Two vendors genuinely answer this way and the
 * callers depend on it:
 *
 *   * Customer.io answers a submit with 204 and NO body at all, which is why
 *     CustomerioService passes `fallbackToRequestData` (utils/http then hands
 *     the REQUEST body to the callback). Answering `{}` here would hide that.
 *   * Make answers plain text ("Accepted" in
 *     tybotRoute/test/conversation-make_test.js:99) and MakeService does not
 *     check the status or parse anything.
 *
 * A handler asks for one by returning `{ status, text }` (text may be null for
 * a bodiless response).
 */
function raw(res, status, text, contentType) {
  if (text === null || text === undefined) {
    res.writeHead(status);
    return res.end();
  }
  res.writeHead(status, {
    'Content-Type': contentType || 'text/plain',
    'Content-Length': Buffer.byteLength(text)
  });
  res.end(text);
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

/** "/a/b/" -> ["a","b"] */
function segmentsOf(path) {
  return path.split('/').filter((s) => s.length > 0);
}

/**
 * Match one route pattern ("/:projectId/requests/:requestId/close") against a
 * concrete path. Returns the captured params, or null.
 */
function matchPattern(pattern, segments) {
  const parts = segmentsOf(pattern);
  if (parts.length !== segments.length) return null;
  const params = {};
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].startsWith(':')) {
      params[parts[i].slice(1)] = decodeURIComponent(segments[i]);
    }
    else if (parts[i] !== segments[i]) {
      return null;
    }
  }
  return params;
}

/** How many segments of a pattern are literal -- the more, the more specific. */
function specificity(pattern) {
  return segmentsOf(pattern).filter((s) => !s.startsWith(':')).length;
}

/**
 * The most specific route for this method+path, so "/projects/:id/isopen"
 * always wins over a "/:projectId/..." pattern of the same length, whatever
 * order the table happens to be written in.
 */
function resolveRoute(method, segments) {
  let best = null;
  for (const route of ROUTES) {
    if (route.method !== method) continue;
    const params = matchPattern(route.path, segments);
    if (!params) continue;
    if (!best || specificity(route.path) > specificity(best.route.path)) {
      best = { route, params };
    }
  }
  return best;
}

/**
 * An armed failure for this call, if any. A rule matches on the ROUTE PATTERN
 * ("/:projectId/requests/:requestId/close") or on the concrete path; its method
 * may be omitted or "*" to match any.
 */
function takeFailure(method, path, pattern) {
  for (let i = 0; i < failures.length; i++) {
    const rule = failures[i];
    if (rule.method && rule.method !== '*' && rule.method !== method) continue;
    if (rule.path !== pattern && rule.path !== path) continue;
    if (rule.remaining > 0) {
      rule.remaining -= 1;
      if (rule.remaining === 0) failures.splice(i, 1);
    }
    return rule.mode;
  }
  return null;
}

/** Serve an armed failure. Returns true when the response has been sent. */
function serveFailure(res, req, mode) {
  if (mode === 'drop') {
    // A hard transport drop: no status line at all. This is the shape of
    // failure that axios reports with no `error.response`.
    req.socket.destroy();
    return true;
  }
  if (mode === 'malformed') {
    // 200 with a Content-Type that lies: the body is not JSON. axios throws
    // while parsing, so the caller sees a rejected request, not a bad object.
    const body = '{"success": tru';
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body)
    });
    res.end(body);
    return true;
  }
  if (mode === '401' || mode === 401) {
    return json(res, 401, { success: false, msg: 'Unauthorized (injected)' }), true;
  }
  // default: 500
  return json(res, 500, { success: false, msg: 'Internal Server Error (injected)' }), true;
}

function warn(message) {
  state.warnings.push({ at: new Date().toISOString(), message });
  console.log(`[mock-tiledesk] WARNING ${message}`);
}

// ---------------------------------------------------------------------------
// STATE HELPERS
// ---------------------------------------------------------------------------

/**
 * The request document. Auto-vivified so that a conversation the platform has
 * never heard of is still observable in `GET /__state`; `exists` is what
 * decides whether `GET /:projectId/requests/:requestId` answers 200 or 404.
 */
function requestFor(projectId, requestId) {
  let r = state.requests[requestId];
  if (!r) {
    r = state.requests[requestId] = {
      request_id: requestId,          // (read) routes/messageRoutes.js, DirectivesChatbotPlug
      id_project: projectId,          // (read) DirectivesChatbotPlug -> context.projectId
      status: 100,                    // TiledeskClient.UNASSIGNED_STATUS
      participants: [],
      department: null,               // (read) DirectivesChatbotPlug: department._id
      lead: null,                     // (read) DirAddTags: request.lead._id
      tags: [],
      closed: false,
      bot_id: null,
      messages: [],
      exists: false
    };
  }
  return r;
}

/** The request as the API serves it: no mock bookkeeping, no message log. */
function publicRequest(r) {
  const { exists, messages, ...doc } = r;
  return doc;
}

function leadFor(leadId) {
  let l = state.leads[leadId];
  if (!l) {
    l = state.leads[leadId] = { _id: leadId, attributes: null, tags: [] };
  }
  return l;
}

let counter = 0;
function newId(prefix) {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter}`;
}

// ---------------------------------------------------------------------------
// DATA TABLES
// ---------------------------------------------------------------------------
//
// The condition vocabulary below is THE MOCK'S OWN. This repository only ever
// sends `equals`, `eq` and `gt` (tybotRoute/test/conversation-data_table_bot.js,
// data_directive_units_test.js) and does not document the platform's full
// operator set, so an operator the mock does not know matches NOTHING and
// records a warning in `state.warnings` -- a test must not pass because the
// mock quietly treated an unknown operator as "true".

function evalCondition(row, condition) {
  const actual = row.data ? row.data[condition.column] : undefined;
  const expected = condition.value;
  switch (condition.operator) {
    case 'equals':
    case 'eq':
      return String(actual) === String(expected);
    case 'not_equals':
    case 'ne':
      return String(actual) !== String(expected);
    case 'gt': return Number(actual) > Number(expected);
    case 'gte': return Number(actual) >= Number(expected);
    case 'lt': return Number(actual) < Number(expected);
    case 'lte': return Number(actual) <= Number(expected);
    case 'contains': return String(actual).includes(String(expected));
    case 'exists': return actual !== undefined && actual !== null;
    default:
      warn(`data-table condition operator "${condition.operator}" is not modelled; it matches nothing`);
      return false;
  }
}

function selectRows(rows, conditions, mustMatch) {
  if (!conditions || conditions.length === 0) return rows.slice();
  const any = String(mustMatch || 'all').toLowerCase() === 'any';
  return rows.filter((row) => any
    ? conditions.some((c) => evalCondition(row, c))
    : conditions.every((c) => evalCondition(row, c)));
}

function tableFor(tableId) {
  if (!state.tables[tableId]) state.tables[tableId] = [];
  return state.tables[tableId];
}

function newRow(tableId, data, idRow) {
  return {
    _id: newId('row'),
    id_row: idRow || newId('idrow'),
    id_table: tableId,
    data: data || {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

/** One document when exactly one row is affected, the array otherwise. */
function rowsResult(rows) {
  return rows.length === 1 ? rows[0] : rows;
}

// ---------------------------------------------------------------------------
// THE ROUTE TABLE
// ---------------------------------------------------------------------------
//
// { method, path, kind, handler({ params, query, body, path, method }) }
//
// `kind` is the label the call is recorded under; GET /__recorded filters on
// it, and `message`, `request-lookup` and `event` are the three kinds the
// shipped journeys already know about -- do not rename them.
//
// A handler returns { status, body } or just a body (200 is assumed).

const ROUTES = [

  // ------------------------------------------------------------- requests

  // The reply the visitor would see.
  // Caller: TiledeskApiService.sendSupportMessage -> TiledeskClient.sendSupportMessage,
  // which only checks status 200 and a non-empty body; nothing is read out of it.
  {
    method: 'POST', path: '/:projectId/requests/:requestId/messages', kind: 'message',
    handler: ({ params, body }) => {
      const r = requestFor(params.projectId, params.requestId);
      if (state.options.autoCreateRequests) r.exists = true;
      r.messages.push({ at: new Date().toISOString(), message: body });
      return { success: true };
    }
  },

  // Caller: routes/messageRoutes.js -> TiledeskClient.getRequestById, which reads
  // `request_id` / `id_project` (DirectivesChatbotPlug), `department._id`,
  // `bot_id` and `draft`; DirAddTags reads `request.lead._id`.
  // 404 for a request that was never seeded: the client resolves null on a 404
  // and messageRoutes then synthesises its own request, which is the branch the
  // shipped journeys exercise.
  {
    method: 'GET', path: '/:projectId/requests/:requestId', kind: 'request-lookup',
    handler: ({ params }) => {
      const r = state.requests[params.requestId];
      if (!r || !r.exists) return { status: 404, body: { success: false } };
      return publicRequest(r);
    }
  },

  // Caller: DirClose -> TiledeskClient.closeRequest. Reads nothing but the error.
  {
    method: 'PUT', path: '/:projectId/requests/:requestId/close', kind: 'request-close',
    handler: ({ params }) => {
      const r = requestFor(params.projectId, params.requestId);
      r.closed = true;
      r.status = 1000;          // the mock's marker for "closed"; nothing reads it
      r.closedAt = new Date().toISOString();
      return { success: true };
    }
  },

  // Caller: DirMoveToAgent -> TiledeskClient.moveToAgent. Reads nothing but the error.
  {
    method: 'PUT', path: '/:projectId/requests/:requestId/agent', kind: 'request-agent',
    handler: ({ params }) => {
      const r = requestFor(params.projectId, params.requestId);
      r.status = 200;           // TiledeskClient.ASSIGNED_STATUS
      r.movedToAgent = true;
      return { success: true };
    }
  },

  // Caller: TiledeskClient.addRequestParticipant, body `{ member }`. Reads nothing.
  {
    method: 'POST', path: '/:projectId/requests/:requestId/participants', kind: 'request-participants',
    handler: ({ params, body }) => {
      const r = requestFor(params.projectId, params.requestId);
      const member = body && body.member;
      if (member && !r.participants.includes(member)) r.participants.push(member);
      return { success: true };
    }
  },

  // Caller: DirMoveToUnassigned -> TiledeskClient.updateRequestParticipants; the
  // body IS the participants array (it sends []). Reads nothing.
  {
    method: 'PUT', path: '/:projectId/requests/:requestId/participants', kind: 'request-participants',
    handler: ({ params, body }) => {
      const r = requestFor(params.projectId, params.requestId);
      r.participants = Array.isArray(body) ? body.slice() : [];
      return { success: true };
    }
  },

  // Caller: TiledeskClient.deleteRequestParticipant. Reads nothing.
  {
    method: 'DELETE', path: '/:projectId/requests/:requestId/participants/:participantId', kind: 'request-participants',
    handler: ({ params }) => {
      const r = requestFor(params.projectId, params.requestId);
      r.participants = r.participants.filter((p) => p !== params.participantId);
      return { success: true };
    }
  },

  // Caller: DirDepartment -> TiledeskClient.updateRequestDepartment, body
  // `{ departmentid, nobot? }` (TiledeskClient.agent() sends nobot: true).
  // Reads nothing out of the response.
  {
    method: 'PUT', path: '/:projectId/requests/:requestId/departments', kind: 'request-department',
    handler: ({ params, body }) => {
      const r = requestFor(params.projectId, params.requestId);
      const depId = body && body.departmentid;
      const dep = state.departments.find((d) => d._id === depId);
      r.department = dep ? dep : (depId ? { _id: depId } : null);
      r.nobot = body ? body.nobot : undefined;
      return { success: true };
    }
  },

  // Caller: DirReplaceBotV2 / DirReplaceBotV3 -> TiledeskApiService.replaceBot.
  // Body is `{ name } | { slug } | { id }`; the ONLY field either directive
  // reads back is `resbody?.replaced_bot_root_id`, which it feeds to the
  // analytics event. The mock answers with it only when the bot has been seeded
  // (`{"bots": {"<id|slug|name>": {"root_id": "..."}}}`) -- otherwise the field
  // is absent and the directive's `|| botName` fallback is exercised, which is
  // the honest thing to do rather than echoing the request back.
  {
    method: 'PUT', path: '/:projectId/requests/:requestId/replace', kind: 'request-replace',
    handler: ({ params, body }) => {
      const r = requestFor(params.projectId, params.requestId);
      const key = body && (body.id || body.slug || body.name);
      r.bot_id = key || r.bot_id;
      r.replaced = { at: new Date().toISOString(), body: body };
      const bot = key ? state.bots[key] : null;
      if (bot && bot.root_id) {
        return { success: true, replaced_bot_root_id: bot.root_id };
      }
      return { success: true };
    }
  },

  // Caller: DirAddTags -> TiledeskApiService.updateRequestTags. The body is the
  // FULL tag array (`[{ tag, color }]`) and the directive only needs a truthy
  // response.
  {
    method: 'PUT', path: '/:projectId/requests/:requestId/tag', kind: 'request-tag',
    handler: ({ params, body }) => {
      const r = requestFor(params.projectId, params.requestId);
      r.tags = Array.isArray(body) ? body.slice() : r.tags;
      return { success: true, tags: r.tags };
    }
  },

  // No caller in this repository posts to this path (the tag update is the PUT
  // above). Served identically so a future caller is not answered by the
  // catch-all.
  {
    method: 'POST', path: '/:projectId/requests/:requestId/tag', kind: 'request-tag',
    handler: ({ params, body }) => {
      const r = requestFor(params.projectId, params.requestId);
      const incoming = Array.isArray(body) ? body : (body ? [body] : []);
      r.tags = r.tags.concat(incoming);
      return { success: true, tags: r.tags };
    }
  },

  // ---------------------------------------------------------------- leads

  // Caller: DirContactUpdate -> TiledeskApiService.updateLead ->
  // TiledeskClient.updateLead. The body is the native attributes flattened, plus
  // `attributes` and `tags`. Nothing is read out of the response.
  {
    method: 'PUT', path: '/:projectId/leads/:leadId', kind: 'lead-update',
    handler: ({ params, body }) => {
      const lead = leadFor(params.leadId);
      Object.assign(lead, body || {});
      lead._id = params.leadId;
      lead.updatedAt = new Date().toISOString();
      return { success: true };
    }
  },

  // Caller: DirAddTags -> TiledeskApiService.updateLeadTags. NOTE the body shape
  // differs from the request-tag route: this one is a plain array of strings.
  // Only a truthy response is needed.
  {
    method: 'PUT', path: '/:projectId/leads/:leadId/tag', kind: 'lead-tag',
    handler: ({ params, body }) => {
      const lead = leadFor(params.leadId);
      lead.tags = Array.isArray(body) ? body.slice() : lead.tags;
      return { success: true, tags: lead.tags };
    }
  },

  // No caller posts here; the lead tag update is the PUT above. Kept for the
  // same reason as the request-tag POST.
  {
    method: 'POST', path: '/:projectId/leads/:leadId/tag', kind: 'lead-tag',
    handler: ({ params, body }) => {
      const lead = leadFor(params.leadId);
      const incoming = Array.isArray(body) ? body : (body ? [body] : []);
      lead.tags = lead.tags.concat(incoming);
      return { success: true, tags: lead.tags };
    }
  },

  // ----------------------------------------------------------------- tags

  // Caller: DirAddTags.addNewTag -> TiledeskApiService.addTag, body
  // `{ tag, color }`. `return resbody ? true : false` -- truthiness only.
  // TiledeskClient.addTag posts to "/tags/"; trailing slashes are normalised.
  {
    method: 'POST', path: '/:projectId/tags', kind: 'tag-create',
    handler: ({ body }) => {
      const tag = body && body.tag ? body : null;
      if (tag && !state.tags.find((t) => t.tag === tag.tag)) state.tags.push(tag);
      return { success: true, tag: tag };
    }
  },

  // No caller in this repository reads the project tag list. Served from state
  // so a test can inspect it over HTTP as well as through GET /__state.
  {
    method: 'GET', path: '/:projectId/tags', kind: 'tag-list',
    handler: () => state.tags
  },

  // --------------------------------------------------------------- events

  // Caller: DirFireTiledeskEvent -> TiledeskClient.fireEvent, body
  // `{ name, attributes }`. Only the error is read.
  {
    method: 'POST', path: '/:projectId/events', kind: 'tiledesk-event',
    handler: ({ params, body }) => {
      state.events.push({ at: new Date().toISOString(), projectId: params.projectId, event: body });
      return { success: true };
    }
  },

  // ------------------------------------------------------------ chatbots

  // Caller: DirReplaceBot -> TiledeskClient.replaceBotByName -> findBotByName ->
  // getAllBots, which iterates the response as an ARRAY and reads `.name` and
  // `._id`. An object here (what the catch-all used to answer) makes
  // `bots.length` undefined, the loop never runs and every v1 replace fails with
  // "Bot not found" -- so the route has to exist for that path to be reachable
  // at all. Nothing else in this repository reads the bot list.
  {
    method: 'GET', path: '/:projectId/faq_kb', kind: 'chatbot-list',
    handler: () => state.chatbots
  },

  // ---------------------------------------------------------- departments

  // Caller: DirDepartment.moveToDepartment -> TiledeskClient.getAllDepartments.
  // Reads `deps[i].name`, `._id`, `.hasBot` and `.id_bot`. Seed with
  // `{"departments":[{"_id":"...","name":"sales","hasBot":true,"id_bot":"..."}]}`.
  {
    method: 'GET', path: '/:projectId/departments/allstatus', kind: 'departments',
    handler: () => state.departments
  },

  // TiledeskClient.getDepartments (active departments only). No caller in this
  // repository uses it; served from the same state.
  {
    method: 'GET', path: '/:projectId/departments', kind: 'departments',
    handler: () => state.departments
  },

  // ------------------------------------------------------------- projects

  // Callers: DirIfOpenHours -> TiledeskApiService.isOpen (reads `resbody.isopen`)
  // and DirIfOnlineAgents / DirIfOnlineAgentsV2 -> TiledeskClient.openNow (reads
  // `result.isopen`). `?timeSlot=` selects a slot when one has been seeded under
  // `{"openHours":{"slots":{"<slotId>":false}}}`.
  {
    method: 'GET', path: '/projects/:projectId/isopen', kind: 'isopen',
    handler: ({ query }) => {
      const slot = query.get('timeSlot');
      const isopen = (slot && Object.prototype.hasOwnProperty.call(state.openHours.slots, slot))
        ? state.openHours.slots[slot]
        : state.openHours.isopen;
      return { isopen: isopen === true };
    }
  },

  // Callers: DirIfOnlineAgentsV2 -> TiledeskApiService.availableAgents (sends
  // `?raw=true` and an optional `&department=`) and DirIfOnlineAgents ->
  // TiledeskClient.getProjectAvailableAgents (no query at all). BOTH read only
  // `agents.length`, so the body is an array either way.
  // NOT MODELLED: what the real API returns when `raw` is false or absent -- no
  // caller in this repository looks at anything but the length, so there is
  // nothing here to ground a different shape in. `raw` and `department` are on
  // the recording, and `department` filters on an agent's `departments` array
  // when the seeded agents carry one.
  {
    method: 'GET', path: '/projects/:projectId/users/availables', kind: 'available-agents',
    handler: ({ query }) => {
      const departmentId = query.get('department');
      if (!departmentId) return state.agents;
      return state.agents.filter((a) => !Array.isArray(a.departments)
        || a.departments.includes(departmentId));
    }
  },

  // --------------------------------------------------------- integrations

  // Callers: IntegrationService.getKeyFromIntegrations (reads
  // `integration.value.apikey`) and IntegrationService.getIntegration, whose
  // consumers read `value.url`, `value.apikey`, `value.token` and
  // `value.servers[]` (AIController.resolveLLMConfig, DirAiPrompt's mcp lookup).
  // An integration that was never seeded answers 200 with `value: null`, which
  // both service methods turn into `null` -- the same outcome as "not
  // configured". NOT GROUNDED: whether the real platform 404s instead; no caller
  // can tell the difference, both branches resolve null.
  {
    method: 'GET', path: '/:projectId/integration/name/:name', kind: 'integration',
    handler: ({ params }) => {
      const integration = state.integrations[params.name];
      if (integration) return integration;
      return { name: params.name, value: null };
    }
  },

  // --------------------------------------------------------- kb / kbsettings

  // Caller: KbSettingsService.getKeyFromKbSettings -> `resbody.gptkey`.
  {
    method: 'GET', path: '/:projectId/kbsettings', kind: 'kbsettings',
    handler: () => Object.assign({ success: true }, state.kbsettings)
  },

  // Caller: KbService.getNamespaceOrNull -> `namespaces.find(n => n.name === name)`
  // / `n.id === id`. An array.
  {
    method: 'GET', path: '/:projectId/kb/namespace/all', kind: 'kb-namespaces',
    handler: () => state.namespaces
  },

  // Caller: DirAddKbContent -> KbService.addContent -> `resbody?.success === true`.
  {
    method: 'POST', path: '/:projectId/kb', kind: 'kb-content',
    handler: ({ body }) => {
      state.kb.contents.push({ at: new Date().toISOString(), content: body });
      return { success: true };
    }
  },

  // Caller: DirAskGPTV2 -> KbService.addAnsweredQuestion. The promise is
  // `.catch`ed and the value dropped; nothing is read.
  {
    method: 'POST', path: '/:projectId/kb/answered', kind: 'kb-answered',
    handler: ({ body }) => {
      state.kb.answered.push({ at: new Date().toISOString(), question: body });
      return { success: true };
    }
  },

  // Caller: DirAskGPTV2 -> KbService.addUnansweredQuestion. Same as above.
  {
    method: 'POST', path: '/:projectId/kb/unanswered', kind: 'kb-unanswered',
    handler: ({ body }) => {
      state.kb.unanswered.push({ at: new Date().toISOString(), question: body });
      return { success: true };
    }
  },

  // --------------------------------------------------------------- quotas

  // Caller: QuotasService.checkQuoteAvailability -> `resbody.isAvailable === true`.
  {
    method: 'GET', path: '/:projectId/quotes/tokens', kind: 'quotas',
    handler: () => ({ isAvailable: state.quotas.isAvailable === true })
  },

  // Caller: QuotasService.updateQuote. Resolves `true` on any 2xx; the body is
  // never read. The increment is accumulated so a test can assert on the total.
  {
    method: 'POST', path: '/:projectId/quotes/incr/tokens', kind: 'quotas-incr',
    handler: ({ body }) => {
      state.quotas.increments.push({ at: new Date().toISOString(), usage: body });
      const n = body && typeof body.tokens === 'number' ? body.tokens : 0;
      state.quotas.tokens += n;
      return { success: true };
    }
  },

  // ------------------------------------------------------------------ mcp

  // Caller: McpService.fetchNativeServers. THE BODY IS DELIBERATELY IGNORED by
  // the caller -- the call is made for its side effect (the platform refreshes
  // the `native_mcp:servers` cache entry, which the directive re-reads through
  // tdcache), so only the error matters. GET is what the service sends; the POST
  // twin below exists only so a POST is not swallowed by the catch-all.
  {
    method: 'GET', path: '/:projectId/mcp/native', kind: 'mcp-native',
    handler: () => { state.mcp.calls += 1; return { success: true, servers: state.mcp.native }; }
  },
  {
    method: 'POST', path: '/:projectId/mcp/native', kind: 'mcp-native',
    handler: () => { state.mcp.calls += 1; return { success: true, servers: state.mcp.native }; }
  },

  // ----------------------------------------------------------- data tables

  // Caller: DirDataTables 'get' -> DataTablesService.listRows (GET, with
  // `must_match` / `match` / `conditions` as QUERY parameters, `conditions`
  // JSON-encoded). The result is handed to the flow unnormalised, so it is the
  // array of row documents.
  {
    method: 'GET', path: '/:projectId/tables/:tableId/rows/list', kind: 'datatable-list',
    handler: ({ params, query }) => {
      const rows = tableFor(params.tableId);
      let conditions = null;
      const raw = query.get('conditions');
      if (raw) {
        try { conditions = JSON.parse(raw); }
        catch (e) { warn('data-table conditions were not valid JSON: ' + raw); }
      }
      return selectRows(rows, conditions, query.get('must_match') || query.get('match'));
    }
  },

  // Caller: DirDataTables 'insert' -> DataTablesService.insertRow, body
  // `{ data, id_row? }`. The result goes through `#extractRowData`, which reads
  // `row.data` -- so the response is the row document.
  {
    method: 'POST', path: '/:projectId/tables/:tableId/row/insert', kind: 'datatable-insert',
    handler: ({ params, body }) => {
      const row = newRow(params.tableId, body && body.data, body && body.id_row);
      tableFor(params.tableId).push(row);
      return row;
    }
  },

  // Caller: DirDataTables 'update' -> DataTablesService.updateRow (PUT), body
  // `{ id_row?, must_match?, conditions?, data }`. `#normalizeResult` accepts a
  // single row document or an array of them.
  {
    method: 'PUT', path: '/:projectId/tables/:tableId/row/update', kind: 'datatable-update',
    handler: ({ params, body }) => {
      const rows = tableFor(params.tableId);
      const targets = (body && body.id_row)
        ? rows.filter((r) => r.id_row === body.id_row)
        : selectRows(rows, body && body.conditions, body && (body.must_match || body.match));
      for (const row of targets) {
        row.data = Object.assign({}, row.data, (body && body.data) || {});
        row.updatedAt = new Date().toISOString();
      }
      return rowsResult(targets);
    }
  },

  // Caller: DirDataTables 'upsert' -> DataTablesService.upsertRow (PUT), body as
  // update plus `multi?`. Inserts when nothing matches.
  {
    method: 'PUT', path: '/:projectId/tables/:tableId/row/upsert', kind: 'datatable-upsert',
    handler: ({ params, body }) => {
      const rows = tableFor(params.tableId);
      let targets = (body && body.id_row)
        ? rows.filter((r) => r.id_row === body.id_row)
        : selectRows(rows, body && body.conditions, body && (body.must_match || body.match));
      if (targets.length === 0) {
        const row = newRow(params.tableId, body && body.data, body && body.id_row);
        rows.push(row);
        return row;
      }
      if (body && body.multi !== true) targets = targets.slice(0, 1);
      for (const row of targets) {
        row.data = Object.assign({}, row.data, (body && body.data) || {});
        row.updatedAt = new Date().toISOString();
      }
      return rowsResult(targets);
    }
  },

  // Caller: DirDataTables 'delete' -> DataTablesService.deleteRow (PUT), body
  // `{ id_row?, must_match?, conditions? }`. Returns the removed row documents.
  {
    method: 'PUT', path: '/:projectId/tables/:tableId/row/delete', kind: 'datatable-delete',
    handler: ({ params, body }) => {
      const rows = tableFor(params.tableId);
      const targets = (body && body.id_row)
        ? rows.filter((r) => r.id_row === body.id_row)
        : selectRows(rows, body && body.conditions, body && (body.must_match || body.match));
      state.tables[params.tableId] = rows.filter((r) => !targets.includes(r));
      return rowsResult(targets);
    }
  },

  // ------------------------------------------------------------ speech to text

  // Caller: services/AIService.speechToText, which resolves the whole body.
  // NOT GROUNDED: nothing in this repository consumes that resolved value (the
  // service has no production caller, only unit tests that stub HttpUtils), so
  // the real response shape cannot be determined here. The mock answers with
  // whatever `POST /__seed {"transcription": {...}}` supplied, and a bare
  // `{ success: true }` otherwise -- enough to exercise the resolve path
  // without pretending to know the field names.
  {
    method: 'POST', path: '/:projectId/llm/transcription', kind: 'transcription',
    handler: ({ body }) => {
      state.lastTranscriptionRequest = body;
      return state.transcription || { success: true };
    }
  },

  // ==========================================================================
  // AI / LLM
  // ==========================================================================
  //
  // These are NOT Tiledesk platform routes: they are the LLM and vendor
  // services, whose base urls the connector reads from their own environment
  // variables. docker-compose.integration.yml points every one of them at this
  // process under a DISTINCT PATH PREFIX, because several of them would
  // otherwise collide -- "/qa" is both KB_ENDPOINT's route and
  // KB_ENDPOINT_QA's, and they answer different shapes:
  //
  //   KB_ENDPOINT         = http://mock-tiledesk:3001/llm/kb
  //   KB_ENDPOINT_QA      = http://mock-tiledesk:3001/llm/qa
  //   KB_ENDPOINT_QA_GPU  = http://mock-tiledesk:3001/llm/gpu
  //   OPENAI_ENDPOINT     = http://mock-tiledesk:3001/llm/openai/v1
  //   BREVO_ENDPOINT      = http://mock-tiledesk:3001/vendor/brevo/v3
  //   CUSTOMERIO_ENDPOINT = http://mock-tiledesk:3001/vendor/customerio/v1
  //   HUBSPOT_ENDPOINT    = http://mock-tiledesk:3001/vendor/hubspot/v3/   <- trailing slash
  //   QAPLA_ENDPOINT      = http://mock-tiledesk:3001/vendor/qapla
  //   MAKE_ENDPOINT       = http://mock-tiledesk:3001/vendor/make
  //   WHATSAPP_ENDPOINT   = http://mock-tiledesk:3001/vendor/whatsapp
  //
  // Change a prefix there and you must change it here; nothing derives one
  // from the other, and a mismatch shows up as a `kind: "other"` recording.
  //
  // NOT IMPLEMENTED, and it cannot be: the OpenAI ASSISTANTS routes that
  // DirAssistant uses (POST /threads, /threads/:id/messages, /threads/:id/runs,
  // GET /threads/:id/runs/:runId, GET /threads/:id/messages). Every one of them
  // is built from `const OPENAI_API_BASE = "https://api.openai.com/v1"`, a
  // hardcoded literal in services/OpenAIAssistantsService.js:34 with NO
  // environment variable and no settings key behind it. No value in this
  // compose file can redirect that service at this mock, so implementing the
  // routes here would produce an endpoint nothing can ever reach.

  // Caller: DirAskGPT -> LlmAskService.askLegacyKb (POST {KB_ENDPOINT}/qa, no
  // headers, the key travels in the body as `gptkey`). The directive reads
  // `resbody.answer`, `resbody.source_url` and branches on
  // `resbody.success === true`.
  // The three 400s reproduce the stub in
  // tybotRoute/test/conversation-askgpt_test.js:93 -- a request missing one of
  // the mandatory fields must NOT be answered as a success, or a broken caller
  // would still make a journey pass.
  {
    method: 'POST', path: '/llm/kb/qa', kind: 'llm-qa',
    handler: ({ body }) => {
      state.llm.asked.qa.push({ at: new Date().toISOString(), body: body });
      if (!body || !body.question) return { status: 400, body: { error: 'question field is mandatory' } };
      if (!body.kbid) return { status: 400, body: { error: 'kbid field is mandatory' } };
      if (!body.gptkey) return { status: 400, body: { error: 'gptkey field is mandatory' } };
      return state.llm.qa;
    }
  },

  // Callers: DirAiPrompt and DirAiCondition -> LlmAskService.ask
  // (POST {KB_ENDPOINT_QA}/ask). Both read `resbody.answer`; DirAiPrompt also
  // reads `resbody.reasoning_content` and `resbody.prompt_token_info
  // .total_tokens`, which are absent from the default body and only appear
  // when seeded -- exactly as they are absent from the unit stub unless that
  // test needs them.
  {
    method: 'POST', path: '/llm/qa/ask', kind: 'llm-ask',
    handler: ({ body }) => {
      state.llm.asked.ask.push({ at: new Date().toISOString(), path: '/ask', body: body });
      return state.llm.ask;
    }
  },

  // The reasoning twin: DirAiPrompt posts to "/thinking" instead of "/ask"
  // when the action asks for reasoning. Same service method, same response
  // shape (`answer` plus `reasoning_content`), so the same body.
  {
    method: 'POST', path: '/llm/qa/thinking', kind: 'llm-ask',
    handler: ({ body }) => {
      state.llm.asked.ask.push({ at: new Date().toISOString(), path: '/thinking', body: body });
      return state.llm.ask;
    }
  },

  // Caller: DirAskGPTV2 -> LlmAskService.askNamespace
  // (POST {KB_ENDPOINT_QA}/qa with "Authorization: JWT <token>"). It branches on
  // `resbody.success === true` and reads `answer`, `source`, `content_chunks`,
  // `chunks` (chunks_only), `citations` (citations) and `prompt_token_size`.
  {
    method: 'POST', path: '/llm/qa/qa', kind: 'llm-namespace-qa',
    handler: ({ body }) => {
      state.llm.asked.namespaceQa.push({ at: new Date().toISOString(), endpoint: 'cpu', body: body });
      if (!body || !body.question) return { status: 400, body: { error: 'question field is mandatory' } };
      if (!body.model) return { status: 400, body: { error: 'model field is mandatory' } };
      return state.llm.namespaceQa;
    }
  },

  // The same call, sent to KB_ENDPOINT_QA_GPU instead, which endpoints
  // .qaEndpoint(hybrid) selects when the namespace's `hybrid === true`. Same
  // body; `endpoint: "gpu"` on the recording is how a test tells them apart.
  {
    method: 'POST', path: '/llm/gpu/qa', kind: 'llm-namespace-qa',
    handler: ({ body }) => {
      state.llm.asked.namespaceQa.push({ at: new Date().toISOString(), endpoint: 'gpu', body: body });
      if (!body || !body.question) return { status: 400, body: { error: 'question field is mandatory' } };
      if (!body.model) return { status: 400, body: { error: 'model field is mandatory' } };
      return state.llm.namespaceQa;
    }
  },

  // Caller: DirGptTask -> OpenAIService.chatCompletions
  // (POST {OPENAI_ENDPOINT}/chat/completions, "Authorization: Bearer <key>").
  // It reads `resbody.choices[0].message.content` and, on the public key,
  // `resbody.usage.total_tokens`. The 400s are the stub's, at
  // tybotRoute/test/conversation-gpt_task_test.js:94.
  {
    method: 'POST', path: '/llm/openai/v1/chat/completions', kind: 'openai-completion',
    handler: ({ body }) => {
      state.llm.asked.completion.push({ at: new Date().toISOString(), body: body });
      if (!body || !body.model) return { status: 400, body: { error: 'you must provide a model parameter' } };
      if (!body.messages) return { status: 400, body: { error: "'messages' is a required property" } };
      if (body.messages.length === 0) return { status: 400, body: { error: "'[] is too short - 'messages'" } };
      return state.llm.completion;
    }
  },

  // ==========================================================================
  // VENDORS
  // ==========================================================================

  // Caller: BrevoService.createContact -> DirBrevo. ACCEPTED STATUS 200 OR 201
  // (the service's own ACCEPTED_STATUS_CODES); 201 is what Brevo answers a
  // create with, and what the stub in
  // tybotRoute/test/conversation-brevo_test.js:111 sends. DirBrevo does not
  // read a single field out of the body -- it JSON.stringifies the whole thing
  // into assignResultTo -- so `{ id }` is the shape, not a guess at more.
  {
    method: 'POST', path: '/vendor/brevo/v3/contacts', kind: 'brevo',
    handler: ({ body }) => {
      const id = state.vendors.brevo.nextId++;
      state.vendors.brevo.contacts.push({ at: new Date().toISOString(), id: id, contact: body });
      return { status: 201, body: { id: id } };
    }
  },

  // Caller: CustomerioService.submitForm -> DirCustomerio. ACCEPTED STATUS 200
  // OR 204, and the real service answers 204 with an EMPTY body -- which is the
  // whole reason the service passes `fallbackToRequestData`. Answering with a
  // json body here would leave that path untested, so this route answers
  // exactly as tybotRoute/test/conversation-customerio_test.js:113 does:
  // `res.sendStatus(204)`, no body.
  {
    method: 'POST', path: '/vendor/customerio/v1/forms/:formId/submit', kind: 'customerio',
    handler: ({ params, body }) => {
      state.vendors.customerio.submissions.push({
        at: new Date().toISOString(), formId: params.formId, data: body && body.data
      });
      return { status: 204, text: null };
    }
  },

  // Caller: HubspotService.batchCreateContacts -> DirHubspot. Note the path:
  // the base url carries the trailing slash and the service appends
  // "objects/contacts/batch/create" with no separator. ACCEPTED STATUS 200 OR
  // 201. DirHubspot assigns the WHOLE body to assignResultTo and reads no
  // field, so the envelope is reproduced from the stub at
  // tybotRoute/test/conversation-hubspot_test.js:116, with the results built
  // from the `inputs` actually sent.
  {
    method: 'POST', path: '/vendor/hubspot/v3/objects/contacts/batch/create', kind: 'hubspot',
    handler: ({ body }) => {
      const startedAt = new Date().toISOString();
      const inputs = (body && Array.isArray(body.inputs)) ? body.inputs : [];
      const results = inputs.map((input) => {
        const record = {
          id: String(1000 + state.vendors.hubspot.contacts.length + 1),
          properties: Object.assign({}, input && input.properties),
          createdAt: startedAt,
          updatedAt: startedAt,
          archived: false
        };
        state.vendors.hubspot.contacts.push(record);
        return record;
      });
      return {
        status: 201,
        body: {
          status: 'COMPLETE',
          results: results,
          startedAt: startedAt,
          completedAt: new Date().toISOString()
        }
      };
    }
  },

  // Caller: QaplaService.getShipment -> DirQapla. The credential is a QUERY
  // parameter (`apiKey`), not a header -- that is Qapla's api. DirQapla digs
  // `resbody.getShipment.shipments[0].status.qaplaStatus.status`,
  // `.getShipment.result` and `.getShipment.error` out of the body, so those
  // are the only fields modelled; the envelope is the stub's, at
  // tybotRoute/test/conversation-qapla_test.js:116.
  // Seed with `{"shipments": {"<trackingNumber>": {"status": "IN TRANSIT"}}}`.
  // NOT GROUNDED: what the real Qapla answers for a tracking number it does not
  // know. Nothing in this repository shows that response, so rather than invent
  // an error code the mock returns the same envelope with an empty `shipments`
  // array (which leaves DirQapla's status at its `null` default) and records a
  // warning, so a test cannot read meaning into it by accident.
  {
    method: 'GET', path: '/vendor/qapla/getShipment', kind: 'qapla',
    handler: ({ query }) => {
      const trackingNumber = query.get('trackingNumber');
      state.vendors.qapla.lookups.push({
        at: new Date().toISOString(), trackingNumber: trackingNumber, apiKey: query.get('apiKey')
      });
      const shipment = trackingNumber ? state.vendors.qapla.shipments[trackingNumber] : null;
      if (!shipment) {
        warn(`qapla: no shipment seeded for trackingNumber "${trackingNumber}"; `
          + 'answering an empty shipments array -- the real "not found" shape is not grounded');
        return { getShipment: { result: null, error: null, shipments: [] } };
      }
      return {
        getShipment: {
          result: shipment.result !== undefined ? shipment.result : 'OK',
          error: shipment.error !== undefined ? shipment.error : null,
          shipments: [
            { status: { qaplaStatus: { status: shipment.status } } }
          ]
        }
      };
    }
  },

  // Caller: MakeService.trigger -> DirMake. MakeService checks NO status and
  // parses nothing -- it hands the whole axios response back and DirMake reads
  // `res.status` off it -- so the body is deliberately the plain string the
  // stub sends (tybotRoute/test/conversation-make_test.js:99), not json. A json
  // body here would make this the one place in the suite where Make looks like
  // every other vendor, which is exactly the thing MakeService documents it is
  // not.
  {
    method: 'POST', path: '/vendor/make/make', kind: 'make',
    handler: ({ body }) => {
      state.vendors.make.triggers.push({ at: new Date().toISOString(), body: body });
      return { status: 200, text: 'Accepted' };
    }
  },

  // Callers: WhatsappService.broadcast -> DirSendWhatsapp (which branches on
  // `resbody.success === true`) and DirWhatsappByAttribute (which forwards the
  // whole body). Shape and message text from the stub at
  // tybotRoute/test/conversation-send_whatsapp_test.js:101.
  {
    method: 'POST', path: '/vendor/whatsapp/tiledesk/broadcast', kind: 'whatsapp',
    handler: ({ body }) => {
      state.vendors.whatsapp.broadcasts.push({ at: new Date().toISOString(), payload: body });
      return { success: true, message: 'Job started. Send messages in queue.' };
    }
  }
];

// ---------------------------------------------------------------------------
// SEEDING
// ---------------------------------------------------------------------------

/**
 * POST /__seed - preload state. Every key is optional; only the keys present
 * are touched, so several seeds compose.
 */
function seed(payload) {
  const applied = [];
  if (!payload || typeof payload !== 'object') return applied;

  if (payload.requests) {
    const list = Array.isArray(payload.requests) ? payload.requests : Object.values(payload.requests);
    for (const incoming of list) {
      const id = incoming.request_id || incoming.requestId || incoming._id;
      if (!id) { warn('seeded request without a request_id was ignored'); continue; }
      const r = requestFor(incoming.id_project || null, id);
      Object.assign(r, incoming);
      r.request_id = id;
      // A seeded request is a request the platform knows about, so the lookup
      // answers 200 for it.
      r.exists = true;
      if (!Array.isArray(r.messages)) r.messages = [];
    }
    applied.push('requests');
  }

  if (payload.leads) {
    const list = Array.isArray(payload.leads) ? payload.leads : Object.values(payload.leads);
    for (const incoming of list) {
      const id = incoming._id || incoming.lead_id || incoming.id;
      if (!id) { warn('seeded lead without an _id was ignored'); continue; }
      Object.assign(leadFor(id), incoming, { _id: id });
    }
    applied.push('leads');
  }

  if (payload.tags) { state.tags = payload.tags.slice(); applied.push('tags'); }
  if (payload.departments) { state.departments = payload.departments.slice(); applied.push('departments'); }
  if (payload.agents) { state.agents = payload.agents.slice(); applied.push('agents'); }
  if (payload.namespaces) { state.namespaces = payload.namespaces.slice(); applied.push('namespaces'); }
  if (payload.bots) { Object.assign(state.bots, payload.bots); applied.push('bots'); }
  if (payload.chatbots) { state.chatbots = payload.chatbots.slice(); applied.push('chatbots'); }

  if (payload.integrations) {
    // { "<name>": { value: {...} } } or [{ name, value }]
    const list = Array.isArray(payload.integrations)
      ? payload.integrations
      : Object.entries(payload.integrations).map(([name, v]) => Object.assign({ name }, v));
    for (const incoming of list) {
      if (!incoming.name) { warn('seeded integration without a name was ignored'); continue; }
      state.integrations[incoming.name] = Object.assign(
        { _id: newId('integration'), name: incoming.name }, incoming);
    }
    applied.push('integrations');
  }

  if (payload.kbsettings) { Object.assign(state.kbsettings, payload.kbsettings); applied.push('kbsettings'); }
  if (payload.quotas) { Object.assign(state.quotas, payload.quotas); applied.push('quotas'); }
  if (payload.openHours) {
    if (typeof payload.openHours.isopen === 'boolean') state.openHours.isopen = payload.openHours.isopen;
    if (payload.openHours.slots) Object.assign(state.openHours.slots, payload.openHours.slots);
    applied.push('openHours');
  }
  if (payload.mcp && payload.mcp.native) { state.mcp.native = payload.mcp.native.slice(); applied.push('mcp'); }
  if (payload.transcription) { state.transcription = payload.transcription; applied.push('transcription'); }

  if (payload.tables) {
    for (const [tableId, rows] of Object.entries(payload.tables)) {
      state.tables[tableId] = (rows || []).map((r) => (r && r.data)
        ? Object.assign(newRow(tableId, r.data, r.id_row), r)
        : newRow(tableId, r, null));
    }
    applied.push('tables');
  }

  if (payload.llm) {
    // Per response, REPLACED not merged: a test that seeds `{"qa": {"answer":
    // "x"}}` means "answer with exactly this", so a leftover `success: true`
    // from the default must not survive and silently keep the true branch.
    for (const key of ['qa', 'ask', 'namespaceQa', 'completion']) {
      if (payload.llm[key]) state.llm[key] = payload.llm[key];
    }
    applied.push('llm');
  }

  if (payload.shipments) {
    Object.assign(state.vendors.qapla.shipments, payload.shipments);
    applied.push('shipments');
  }

  if (payload.options) { Object.assign(state.options, payload.options); applied.push('options'); }

  return applied;
}

// ---------------------------------------------------------------------------
// THE SERVER
// ---------------------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://mock-tiledesk');
  // TiledeskClient.addTag posts to "/{projectId}/tags/", with a trailing slash,
  // and KbService to "/kb/answered/" -- normalise so one pattern serves both.
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname;
  const segments = segmentsOf(path);
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

  if (method === 'GET' && path === '/__state') {
    return json(res, 200, {
      state: state,
      failures: failures,
      recorded: recorded.length
    });
  }

  if ((method === 'POST' || method === 'DELETE') && path === '/__reset') {
    const previous = recorded.length;
    recorded = [];
    failures = [];
    state = freshState();
    counter = 0;
    console.log(`[mock-tiledesk] reset, dropped ${previous} recordings, state and armed failures`);
    return json(res, 200, { ok: true, dropped: previous });
  }

  if (method === 'POST' && path === '/__seed') {
    const payload = await readBody(req);
    const applied = seed(payload);
    console.log(`[mock-tiledesk] seeded: ${applied.join(', ') || '(nothing)'}`);
    return json(res, 200, { ok: true, seeded: applied });
  }

  if (method === 'POST' && path === '/__fail') {
    // { method, path, mode: "500"|"401"|"malformed"|"drop", times }
    // `path` is a ROUTE PATTERN ("/:projectId/requests/:requestId/close") or a
    // concrete path; `times` defaults to 1, and 0 or -1 means "until reset".
    const payload = (await readBody(req)) || {};
    if (!payload.path) {
      return json(res, 400, { ok: false, error: 'path is mandatory' });
    }
    const rule = {
      method: payload.method ? String(payload.method).toUpperCase() : '*',
      path: payload.path,
      mode: String(payload.mode || '500'),
      remaining: (payload.times === 0 || payload.times === -1) ? Infinity : (payload.times || 1)
    };
    failures.push(rule);
    console.log(`[mock-tiledesk] armed ${rule.mode} on ${rule.method} ${rule.path} x${rule.remaining}`);
    return json(res, 200, { ok: true, armed: rule, failures: failures });
  }

  if ((method === 'POST' || method === 'DELETE') && path === '/__fail/clear') {
    const dropped = failures.length;
    failures = [];
    return json(res, 200, { ok: true, dropped: dropped });
  }

  const body = await readBody(req);

  // --------------------------------------------------------- analytics

  // observability/AnalyticsClient posts to `${ANALYTICS_INGEST_URL}/events`,
  // which the integration stack points at this process. Distinct from the
  // Tiledesk `POST /:projectId/events` route above (one segment, not two).
  if (method === 'POST' && path === '/events') {
    const mode = takeFailure(method, path, '/events');
    record({
      kind: 'event',
      method, path,
      requestId: (body && body.payload && body.payload.request_id) || null,
      failure: mode || undefined,
      body: body
    });
    if (mode) return serveFailure(res, req, mode);
    return json(res, 200, { success: true });
  }

  // ------------------------------------------------------- Tiledesk API

  const matched = resolveRoute(method, segments);

  if (matched) {
    const { route, params } = matched;
    const mode = takeFailure(method, path, route.path);

    record({
      kind: route.kind,
      method, path,
      pattern: route.path,
      projectId: params.projectId || null,
      // The LLM and vendor routes carry no request id in their PATH, but the
      // connector puts one in the body -- `request_id` (DirAskGPT, DirAskGPTV2)
      // or `transaction_id` (DirSendWhatsapp) -- so `GET /__recorded?requestId=`
      // can filter them too, which is how the journeys tie a vendor call to the
      // conversation that made it.
      requestId: params.requestId
        || (body && (body.request_id || body.transaction_id))
        || null,
      query: Object.fromEntries(url.searchParams.entries()),
      authorization: req.headers['authorization'] || null,
      failure: mode || undefined,
      body: body
    });

    // The failure is served INSTEAD of the handler, so no state changes: an
    // injected 500 leaves the request exactly as it was.
    if (mode) return serveFailure(res, req, mode);

    let result;
    try {
      result = route.handler({ params, query: url.searchParams, body, path, method });
    }
    catch (err) {
      console.error(`[mock-tiledesk] handler for ${route.path} threw:`, err);
      return json(res, 500, { success: false, error: String(err && err.message) });
    }
    if (result && typeof result === 'object' && !Array.isArray(result)
        && typeof result.status === 'number' && 'body' in result) {
      return json(res, result.status, result.body);
    }
    // `{ status, text }` is the non-json answer: Customer.io's bodiless 204 and
    // Make's plain-text 200. See raw().
    if (result && typeof result === 'object' && !Array.isArray(result)
        && typeof result.status === 'number' && 'text' in result) {
      return raw(res, result.status, result.text);
    }
    return json(res, 200, result);
  }

  // Anything else the connector reaches for: recorded, and answered
  // successfully so a test never fails on an unmodelled side call.
  const mode = takeFailure(method, path, path);
  record({
    kind: 'other',
    method, path,
    requestId: segments[1] === 'requests' ? segments[2] : null,
    failure: mode || undefined,
    body: body
  });
  if (mode) return serveFailure(res, req, mode);
  return json(res, 200, { success: true });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[mock-tiledesk] listening on ${PORT}`);
});
