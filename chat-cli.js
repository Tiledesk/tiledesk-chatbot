#!/usr/bin/env node
/**
 * chat-cli.js — "widget da terminale" per testare il chatbot runtime SENZA widget.
 *
 * Apre UNA conversazione (guest anonimo + request_id) verso il server-V4, che
 * instrada al bot del department; poi cicla: scrivi un messaggio → lo invia →
 * mostra le risposte del bot (testo + bottoni + media) → ripeti.
 * Clicca un bottone digitando il suo numero [n] (o il testo). `/quit` per uscire.
 *
 * Flusso reale: tu → server-V4 :3000 → (department.id_bot) → chatbot :3003 →
 * risposte async → GET messages (le leggiamo qui).
 *
 * Uso:
 *   node chat-cli.js
 *   SERVER=http://localhost:3000 PROJECT_ID=... DEPARTMENT_ID=... node chat-cli.js
 *   NOSTART=1 node chat-cli.js     # non inviare \start all'apertura
 *   BOT_ID=<chatbotId> ADMIN_TOKEN=<jwt> node chat-cli.js
 *                                  # testa uno SPECIFICO chatbot v3 passando il suo id:
 *                                  # il department (id_bot===BOT_ID) viene risolto da solo.
 *
 * Prereq: server-V4 :3000, chatbot :3003, Mongo, Redis attivi.
 */
'use strict';
const http = require('http');
const readline = require('readline');
const crypto = require('crypto');

const SERVER = process.env.SERVER || 'http://localhost:3000';
const PROJECT_ID = process.env.PROJECT_ID || '69f1cbdb6feaec8a287caf1a';
// DEPARTMENT_ID: se passi BOT_ID viene sovrascritto col department che instrada a quel bot.
let DEPARTMENT_ID = process.env.DEPARTMENT_ID || '69f1cbdb6feaec8a287caf1e';
// BOT_ID: chatbot id da testare. Risolve da solo il department (id_bot===BOT_ID).
const BOT_ID = process.env.BOT_ID || '';
// ADMIN_TOKEN: JWT admin, serve SOLO con BOT_ID per leggere l'elenco department.
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const POLL_SECONDS = Number(process.env.POLL_SECONDS || 12);
const AUTOSTART = process.env.NOSTART !== '1';
// DEBUG=1 → stampa il JSON grezzo inviato al server (body POST) e quello ricevuto
// (i nuovi `messages`, cioè ciò che il web-widget riceve e renderizza).
const DEBUG = process.env.DEBUG === '1' || process.env.DEBUG === 'true';

function req(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(SERVER + path);
    const data = body ? JSON.stringify(body) : null;
    if (DEBUG) {
      console.log(`\n[DEBUG →] ${method} ${u.pathname}${u.search}  (inviato al server)`);
      if (body) console.log(JSON.stringify(body, null, 2));
    }
    const opts = {
      method,
      hostname: u.hostname,
      port: u.port || 80,
      path: u.pathname + u.search,
      headers: Object.assign(
        { 'Content-Type': 'application/json' },
        data ? { 'Content-Length': Buffer.byteLength(data) } : {},
        headers,
      ),
    };
    const r = http.request(opts, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}: ${buf.slice(0, 200)}`));
        try { resolve(buf ? JSON.parse(buf) : {}); } catch (e) { reject(e); }
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let GTOKEN, GID, RID;
let seen = 0;
let lastButtons = [];

// Stampa i messaggi nuovi del BOT (non guest, non system) comparsi da `seen` in poi.
function renderNew(msgs) {
  lastButtons = [];
  for (let i = seen; i < msgs.length; i++) {
    const m = msgs[i];
    if (m.sender === GID || m.sender === 'system') continue;
    const cmds = (m.attributes && m.attributes.commands) || [];
    if (cmds.length === 0 && m.text) console.log('🤖 ' + m.text);
    for (const c of cmds) {
      if (c.type === 'wait') continue;
      const mm = c.message || {};
      const att = (mm.attributes && mm.attributes.attachment) || {};
      if (mm.text) console.log('🤖 ' + mm.text);
      if (mm.metadata && mm.metadata.src) console.log(`   [${mm.type || 'media'}: ${mm.metadata.src}]`);
      const btns = att.buttons || [];
      for (const b of btns) if (b && b.value) lastButtons.push(b.value);
      const gal = att.gallery || [];
      gal.forEach((g, idx) => {
        console.log(`   [card ${idx + 1}: ${g.title || ''}${g.preview && g.preview.src ? ' — ' + g.preview.src : ''}]`);
        for (const b of (g.buttons || [])) if (b && b.value) lastButtons.push(b.value);
      });
    }
  }
  if (lastButtons.length > 0) {
    console.log('   bottoni: ' + lastButtons.map((v, i) => `[${i + 1}] ${v}`).join('   '));
  }
  seen = msgs.length;
}

// Processa i nuovi messaggi ricevuti: opzionale dump DEBUG + render.
// Ritorna true se tra i nuovi c'è almeno un messaggio del BOT.
function handleNewMessages(msgs) {
  if (!Array.isArray(msgs) || msgs.length <= seen) return false;
  if (DEBUG) {
    console.log(`\n[DEBUG ←] ${msgs.length - seen} nuovo/i messaggio/i (raw, come li riceve il web-widget):`);
    console.log(JSON.stringify(msgs.slice(seen), null, 2));
  }
  const hasBot = msgs.slice(seen).some((m) => m.sender !== GID && m.sender !== 'system');
  renderNew(msgs);
  return hasBot;
}

async function sendAndPoll(text) {
  await req('POST', `/${PROJECT_ID}/requests/${RID}/messages`,
    { text, senderFullname: 'WidgetSim', departmentid: DEPARTMENT_ID, type: 'text' },
    { Authorization: GTOKEN });
  let gotBot = false;
  for (let i = 0; i < POLL_SECONDS; i++) {
    await sleep(1000);
    let msgs;
    try { msgs = await req('GET', `/${PROJECT_ID}/requests/${RID}/messages`, null, { Authorization: GTOKEN }); }
    catch (e) {
      if (DEBUG) { console.log('[DEBUG] poll error (retry): ' + e.message); }
      continue;
    }
    if (handleNewMessages(msgs)) gotBot = true;
    // se ho già visto risposte del bot, do 1s di grazia per messaggi multipli, poi torno al prompt
    if (gotBot && i >= 2) break;
  }
  if (!gotBot) console.log('   (nessuna risposta del bot entro ' + POLL_SECONDS + 's)');
}

// Risolve il department il cui id_bot === botId, così da testare uno SPECIFICO
// chatbot v3 passando il suo id. Richiede ADMIN_TOKEN: l'elenco department non è
// accessibile al guest anonimo.
async function resolveDepartmentForBot(botId) {
  if (!ADMIN_TOKEN) {
    throw new Error('BOT_ID impostato ma manca ADMIN_TOKEN (JWT admin) per risolvere il department del bot.');
  }
  const auth = ADMIN_TOKEN.startsWith('JWT ') ? ADMIN_TOKEN : 'JWT ' + ADMIN_TOKEN;
  const deps = await req('GET', `/${PROJECT_ID}/departments`, null, { Authorization: auth });
  const dep = Array.isArray(deps) ? deps.find((d) => d.id_bot === botId) : null;
  if (!dep) {
    throw new Error(`Nessun department con id_bot=${botId} nel project ${PROJECT_ID}. Assegna il bot a un department prima di testarlo.`);
  }
  console.log(`   bot ${botId} → department ${dep._id} (${dep.name || 'senza nome'})`);
  return dep._id;
}

async function main() {
  if (BOT_ID) {
    DEPARTMENT_ID = await resolveDepartmentForBot(BOT_ID);
  }
  const guest = await req('POST', '/auth/signinAnonymously', { id_project: PROJECT_ID, firstname: 'WidgetSim' });
  GTOKEN = guest.token;
  GID = guest.user._id;
  RID = `support-group-${PROJECT_ID}-${crypto.randomUUID().replace(/-/g, '')}`;
  console.log(`\n💬 Conversazione aperta  (guest=${GID})`);
  console.log(`   request_id=${RID}`);
  console.log('   Scrivi un messaggio e premi invio. Clicca un bottone col suo numero. "/quit" per uscire.\n');

  if (AUTOSTART) {
    console.log('… invio \\start (apertura conversazione)');
    await sendAndPoll('\\start');
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = () => rl.question('\n🧑 > ', async (line) => {
    line = line.trim();
    if (line === '/quit') { rl.close(); return; }
    if (!line) return ask();
    // numero → click sul bottone corrispondente
    if (/^\d+$/.test(line) && lastButtons.length >= Number(line)) {
      line = lastButtons[Number(line) - 1];
      console.log(`   (click: ${line})`);
    }
    try { await sendAndPoll(line); } catch (e) { console.log('   errore: ' + e.message); }
    ask();
  });
  rl.on('close', () => { console.log('\n👋 Fine conversazione.'); process.exit(0); });
  ask();
}

main().catch((e) => { console.error('Errore fatale:', e.message); process.exit(1); });
