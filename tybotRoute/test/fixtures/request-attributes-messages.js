// Incoming messages used to pin what TiledeskChatbotUtil.updateRequestAttributes writes.
// Shapes taken from the channels: widget (chat21), WhatsApp and Telegram connectors
// (TiledeskWhatsappTranslator / TiledeskTelegramTranslator) and the email channel
// (real values from a stage test of 25/11/2026, ids shortened).

const FILES = 'https://stage.eks.tiledesk.com/api/files/download?path=uploads/users/6790b6c75ee3a700132d046f/files';

const request = (extra = {}) => ({
  request_id: 'support-group-p1-r1',
  language: 'it-IT,it;q=0.9',
  sourcePage: 'https://example.com/page',
  userAgent: 'Mozilla/5.0',
  location: { country: 'IT', city: 'Rome' },
  requester: { isAuthenticated: false },
  lead: { _id: 'lead1', email: 'lead@example.com', fullname: 'Lead Name', lead_id: 'lead-abc' },
  department: { _id: 'dep1', name: 'Default' },
  ...extra
});

const base = (id, fields) => ({
  _id: 'msg-' + id,
  sender: 'user1',
  channel: { name: 'chat21' },
  request: request(),
  ...fields
});

module.exports = [
  { id: 'widget-text', message: base('widget-text', { type: 'text', text: 'hello' }) },

  { id: 'widget-image', message: base('widget-image', {
      type: 'image', text: '',
      metadata: { name: 'photo 1.png', src: `${FILES}/aaa/photo%201.png`, width: 640, height: 480, type: 'image/png', uid: 'u1', size: 2048 } }) },

  { id: 'widget-file', message: base('widget-file', {
      type: 'file', text: '[Biglietti.pdf](' + FILES + '/bbb/Biglietti.pdf)',
      metadata: { name: 'Biglietti.pdf', src: `${FILES}/bbb/Biglietti.pdf`, type: 'application/pdf', uid: 'u2', size: 10240 } }) },

  { id: 'whatsapp-image', message: base('whatsapp-image', {
      channel: { name: 'whatsapp' }, type: 'image', text: 'Image attached',
      metadata: { src: 'https://api.tiledesk.com/v3/files/download?path=wa-img-123.jpeg' } }) },

  { id: 'whatsapp-document', message: base('whatsapp-document', {
      channel: { name: 'whatsapp' }, type: 'file', text: '[Dowload document](https://api.tiledesk.com/v3/files/download?path=wa-doc-123.pdf)',
      metadata: { name: 'document.pdf', type: 'application/pdf', src: 'https://api.tiledesk.com/v3/files/download?path=wa-doc-123.pdf' } }) },

  { id: 'whatsapp-video', message: base('whatsapp-video', {
      channel: { name: 'whatsapp' }, type: 'file',
      metadata: { name: 'video.mp4', type: 'video/mp4', src: 'https://api.tiledesk.com/v3/files/download?path=wa-video-123.mp4' } }) },

  { id: 'telegram-photo', message: base('telegram-photo', {
      channel: { name: 'telegram' }, type: 'image', text: '',
      metadata: { src: 'https://api.telegram.org/file/botTOKEN/photos/file_7.jpg', width: 1280, height: 960 } }) },

  { id: 'telegram-document', message: base('telegram-document', {
      channel: { name: 'telegram' }, type: 'file', text: '',
      metadata: { name: 'report.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', src: 'https://api.telegram.org/file/botTOKEN/documents/file_8.docx' } }) },

  { id: 'telegram-video', message: base('telegram-video', {
      channel: { name: 'telegram' }, type: 'video', text: '',
      metadata: { src: 'https://api.telegram.org/file/botTOKEN/videos/file_9.mp4', name: 'clip.mp4', type: 'video/mp4' } }) },

  { id: 'email-with-attachments', message: base('email-with-attachments', {
      channel: { name: 'email' }, type: 'text',
      text: 'testo email\nAttachments:\n[Biglietti.pdf](' + FILES + '/f69/Biglietti.pdf)',
      attributes: {
        email_subject: 'Oggetto test email',
        email_toEmail: '6b069712@6790c1a05ee3a700132d4fa0.email.stage.tiledesk.com',
        email_fromEmail: 'sender@example.com',
        email_messageId: '<CAAoNFROU1jo@mail.gmail.com>',
        email_replyTo: 'support-group-6790c1a05ee3a700132d4fa0-1795597726343@email.stage.tiledesk.com',
        attachments: [
          { filename: 'uploads/users/6790b6c75ee3a700132d046f/files/f69/Biglietti.pdf', url: `${FILES}/f69/Biglietti.pdf` },
          { filename: 'uploads/users/6790b6c75ee3a700132d046f/files/f96/WhatsApp Image 2026-10-15 at 17.59.07.jpeg', url: `${FILES}/f96/WhatsApp%20Image%202026-10-15%20at%2017.59.07.jpeg` }
        ]
      } }) },

  // the shape tiledesk-smtp-server 1.1.1 sends (lib/message-builder.js): the attachments are
  // in attributes.payload.attachments, and the engine turns every payload key into an attribute
  { id: 'email-connector-payload', message: base('email-connector-payload', {
      channel: { name: 'email' }, type: 'text',
      text: 'testo email\nAttachments:\n[Biglietti.pdf](' + FILES + '/837/Biglietti.pdf)\n',
      attributes: {
        email_toEmail: '6b069712c0419e0013c6f5a9@6790c1a05ee3a700132d4fa0.email.stage.tiledesk.com',
        email_toName: '',
        email_subject: 'test v3 allegati',
        email_fromEmail: 'sender@example.com',
        email_fromName: 'Sender Name',
        email_messageId: '<CAAoNFRP2Wf1uJ93@mail.gmail.com>',
        email_references: '',
        email_replyTo: 'support-group-6790c1a05ee3a700132d4fa0-1795602991909@email.stage.tiledesk.com',
        email_cc: '[]',
        email_eml: '[Original eml message](https://stage.eks.tiledesk.com/api/files/download?path=uploads/eml/abc.eml)',
        link: ['https://stage.eks.tiledesk.com/api/files/download?path=uploads/eml/abc.eml'],
        payload: {
          attachments: [
            { filename: 'uploads/users/6790b6c75ee3a700132d046f/files/837/Biglietti.pdf', url: `${FILES}/837/Biglietti.pdf` },
            { filename: 'uploads/users/6790b6c75ee3a700132d046f/files/197/WhatsApp Image 2026-10-15 at 17.59.06.jpeg', url: `${FILES}/197/WhatsApp%20Image%202026-10-15%20at%2017.59.06.jpeg` }
          ]
        }
      } }) },

  { id: 'email-without-attachments', message: base('email-without-attachments', {
      channel: { name: 'email' }, type: 'text', text: 'solo testo',
      attributes: { email_subject: 'Senza allegati', email_fromEmail: 'sender@example.com', email_messageId: '<id2@mail.gmail.com>' } }) },

  { id: 'webhook-payload', message: base('webhook-payload', {
      type: 'text', text: '/start',
      request: request({ attributes: { payload: { order: 42, customer: { name: 'Ann' } }, start_type: 'webhook' } }),
      attributes: { payload: { source: 'crm' } } }) },

  { id: 'image-without-src', message: base('image-without-src', { type: 'image', text: '', metadata: {} }) },

  { id: 'file-without-metadata', message: base('file-without-metadata', { type: 'file', text: 'x' }) },

  { id: 'email-attachments-not-array', message: base('email-attachments-not-array', {
      channel: { name: 'email' }, type: 'text', text: 'x', attributes: { attachments: 'not-a-list' } }) },

  { id: 'internal-sender', message: base('internal-sender', { sender: '_tdinternal', type: 'text', text: 'internal' }) }
];
