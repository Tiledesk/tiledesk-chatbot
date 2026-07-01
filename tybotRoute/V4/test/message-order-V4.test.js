// Regression: i messaggi V4 devono partire con timestamp DISTINTI e crescenti,
// altrimenti il web widget (sort stabile per timestamp + insert in testa) li
// mostra in ordine invertito. Il `MessageSenderV4` spazia gli invii consecutivi
// di almeno `V4_MSG_MIN_GAP_MS`. Forziamo un gap piccolo per tenere il test veloce.
process.env.V4_MSG_MIN_GAP_MS = '40';

const { MessageSenderV4 } = require('../MessageSender-V4.js');
const { ok, run, summary } = require('./harness-V4.js');

(async () => {
  await run('MessageSender: invii consecutivi spaziati (anti-collisione timestamp)', async () => {
    const sender = new MessageSenderV4({
      projectId: 'p', requestId: 'r', token: 't',
      tilebotEndpoint: 'http://localhost:9999', botName: 'bot', params: {},
    });
    // Stub dell'HTTP: registra l'istante d'invio e richiama subito il callback.
    const sentAt = [];
    sender.apiext.sendSupportMessageExt = (_body, _pid, _rid, _tok, cb) => {
      sentAt.push(Date.now());
      cb(null);
    };

    // Tre messaggi back-to-back (nessun delayMs): senza throttle avrebbero
    // timestamp ravvicinati/collidenti.
    await sender.sendV4Messages([{ text: 'm1' }, { text: 'm2' }, { text: 'm3' }], {});

    ok(sentAt.length === 3, '3 messaggi inviati');
    const gap1 = sentAt[1] - sentAt[0];
    const gap2 = sentAt[2] - sentAt[1];
    ok(gap1 >= 38, 'gap m1→m2 >= ~40ms (misurato ' + gap1 + ')');
    ok(gap2 >= 38, 'gap m2→m3 >= ~40ms (misurato ' + gap2 + ')');
  });

  await run('MessageSender: primo (e unico) messaggio non viene ritardato', async () => {
    const sender = new MessageSenderV4({
      projectId: 'p', requestId: 'r', token: 't',
      tilebotEndpoint: 'http://localhost:9999', botName: 'bot', params: {},
    });
    sender.apiext.sendSupportMessageExt = (_b, _p, _r, _t, cb) => cb(null);
    const t0 = Date.now();
    await sender.sendV4Messages([{ text: 'solo' }], {});
    ok(Date.now() - t0 < 40, 'nessuna attesa per il primo messaggio');
  });

  summary();
})();
