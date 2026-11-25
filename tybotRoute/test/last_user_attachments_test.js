const assert = require('assert');
const { TiledeskChatbotUtil } = require('../utils/TiledeskChatbotUtil');
const messages = require('./fixtures/request-attributes-messages');
const snapshot = require('./fixtures/request-attributes-snapshot.json');
const { runUpdateRequestAttributes } = require('./helpers/requestAttributesRunner');

const NEW_KEY = 'lastUserAttachments';
const byId = Object.fromEntries(messages.map(m => [m.id, m.message]));

describe('updateRequestAttributes - existing attributes unchanged', function () {

  // request-attributes-snapshot.json was written on main before lastUserAttachments existed:
  // every attribute written or deleted then must be written or deleted now, same order, same value.
  // Compared as JSON, the form attributes are stored in (fields set to undefined drop out).
  const asJson = (v) => JSON.parse(JSON.stringify(v));
  messages.forEach(({ id, message }) => {
    it(`${id}: same attributes as before, apart from ${NEW_KEY}`, async () => {
      const now = await runUpdateRequestAttributes(message);
      assert.deepStrictEqual(asJson(now.added.filter(([k]) => k !== NEW_KEY)), snapshot[id].added);
      assert.deepStrictEqual(now.deleted, snapshot[id].deleted);
    });
  });

  it('the email "attachments" attribute keeps its original shape', async () => {
    const now = await runUpdateRequestAttributes(byId['email-with-attachments']);
    const attachments = now.added.find(([k]) => k === 'attachments')[1];
    assert.deepStrictEqual(attachments, byId['email-with-attachments'].attributes.attachments);
  });
});

describe('updateRequestAttributes - lastUserAttachments', function () {

  const lastUserAttachments = async (id) => {
    const now = await runUpdateRequestAttributes(byId[id]);
    const found = now.added.filter(([k]) => k === NEW_KEY);
    assert.ok(found.length <= 1, 'written at most once');
    return found.length ? found[0][1] : undefined;
  };

  it('widget image', async () => {
    assert.deepStrictEqual(await lastUserAttachments('widget-image'), [
      { name: 'photo 1.png', url: byId['widget-image'].metadata.src, type: 'image/png', size: 2048 }
    ]);
  });

  it('widget file', async () => {
    assert.deepStrictEqual(await lastUserAttachments('widget-file'), [
      { name: 'Biglietti.pdf', url: byId['widget-file'].metadata.src, type: 'application/pdf', size: 10240 }
    ]);
  });

  it('WhatsApp image without name and type: both taken from the url', async () => {
    assert.deepStrictEqual(await lastUserAttachments('whatsapp-image'), [
      { name: 'wa-img-123.jpeg', url: byId['whatsapp-image'].metadata.src, type: 'image/jpeg' }
    ]);
  });

  it('WhatsApp document and video', async () => {
    assert.deepStrictEqual((await lastUserAttachments('whatsapp-document'))[0].type, 'application/pdf');
    assert.deepStrictEqual(await lastUserAttachments('whatsapp-video'), [
      { name: 'video.mp4', url: byId['whatsapp-video'].metadata.src, type: 'video/mp4' }
    ]);
  });

  it('Telegram photo, document and video', async () => {
    assert.deepStrictEqual(await lastUserAttachments('telegram-photo'), [
      { name: 'file_7.jpg', url: byId['telegram-photo'].metadata.src, type: 'image/jpeg' }
    ]);
    assert.strictEqual((await lastUserAttachments('telegram-document'))[0].name, 'report.docx');
    assert.deepStrictEqual(await lastUserAttachments('telegram-video'), [
      { name: 'clip.mp4', url: byId['telegram-video'].metadata.src, type: 'video/mp4' }
    ]);
  });

  it('email: one entry per attachment, the name is the last part of filename', async () => {
    const atts = byId['email-with-attachments'].attributes.attachments;
    assert.deepStrictEqual(await lastUserAttachments('email-with-attachments'), [
      { name: 'Biglietti.pdf', url: atts[0].url, type: 'application/pdf' },
      { name: 'WhatsApp Image 2026-10-15 at 17.59.07.jpeg', url: atts[1].url, type: 'image/jpeg' }
    ]);
  });

  it('email from tiledesk-smtp-server: the attachments are read from the payload', async () => {
    const atts = byId['email-connector-payload'].attributes.payload.attachments;
    assert.deepStrictEqual(await lastUserAttachments('email-connector-payload'), [
      { name: 'Biglietti.pdf', url: atts[0].url, type: 'application/pdf' },
      { name: 'WhatsApp Image 2026-10-15 at 17.59.06.jpeg', url: atts[1].url, type: 'image/jpeg' }
    ]);
  });

  it('email from tiledesk-smtp-server: "attachments" (from the payload) keeps its original shape', async () => {
    const now = await runUpdateRequestAttributes(byId['email-connector-payload']);
    const attachments = now.added.find(([k]) => k === 'attachments')[1];
    assert.deepStrictEqual(attachments, byId['email-connector-payload'].attributes.payload.attachments);
  });

  it('a list in attributes.attachments wins over the payload one, no file counted twice', () => {
    const out = TiledeskChatbotUtil.buildLastUserAttachments({ attributes: {
      attachments: [{ filename: 'a.pdf', url: 'https://x/a.pdf' }],
      payload: { attachments: [{ filename: 'a.pdf', url: 'https://x/a.pdf' }, { filename: 'b.pdf', url: 'https://x/b.pdf' }] } } });
    assert.deepStrictEqual(out.map(f => f.name), ['a.pdf']);
  });

  ['widget-text', 'email-without-attachments', 'webhook-payload', 'image-without-src',
    'file-without-metadata', 'email-attachments-not-array', 'internal-sender'].forEach(id => {
    it(`${id}: not written when the message brings no file`, async () => {
      assert.strictEqual(await lastUserAttachments(id), undefined);
    });
  });
});

describe('buildLastUserAttachments - unexpected data never throws', function () {

  const cases = [
    undefined, null, 'text', 42, {},
    { type: 'image', metadata: null },
    { type: 'image', metadata: 'not-an-object' },
    { type: 'file', metadata: { src: 12345 } },
    { type: 'file', metadata: { src: '' } },
    { type: 'text', metadata: { src: 'https://x/a.pdf' } },
    { attributes: null },
    { attributes: { attachments: null } },
    { attributes: { attachments: {} } },
    { attributes: { attachments: [null, 1, 'x', {}, { url: 5 }, { filename: 'a.pdf' }] } }
  ];

  cases.forEach((message, i) => {
    it(`case ${i}: returns an empty list`, () => {
      assert.deepStrictEqual(TiledeskChatbotUtil.buildLastUserAttachments(message), []);
    });
  });

  it('keeps the good entries of a list with broken ones', () => {
    const out = TiledeskChatbotUtil.buildLastUserAttachments({ attributes: { attachments: [null, { url: 'https://x/files/download?path=a%20b.pdf' }] } });
    assert.deepStrictEqual(out, [{ name: 'a b.pdf', url: 'https://x/files/download?path=a%20b.pdf', type: 'application/pdf' }]);
  });

  it('odd names and urls: a name and a type are always there', () => {
    const out = TiledeskChatbotUtil.buildLastUserAttachments({ type: 'image', metadata: { src: 'not a url %E0%A4%A', name: '  ' } });
    assert.strictEqual(out.length, 1);
    assert.strictEqual(typeof out[0].name, 'string');
    assert.strictEqual(out[0].type, 'image/*');
    const sized = TiledeskChatbotUtil.buildLastUserAttachments({ type: 'file', metadata: { src: 'https://x/y.bin', size: 'big' } });
    assert.strictEqual(sized[0].size, undefined);
    assert.strictEqual(sized[0].type, 'application/octet-stream');
  });
});
