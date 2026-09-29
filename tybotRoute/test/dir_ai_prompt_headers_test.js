var assert = require('assert');
const { DirAiPrompt } = require('../tiledeskChatbotPlugs/directives/DirAiPrompt');

describe('DirAiPrompt header values', function() {

  it('strips backslashes and newlines from an email body', () => {
    const emailBody = '-- \n' +
      'Giovanni Troisi\n' +
      '\n' +
      'Software Engineer\n' +
      'Tiledesk\n' +
      '[image: emailAddress] giovanni@tiledesk.com\n' +
      '[image: website] https://tiledesk.com/\n' +
      'Attachments:\n' +
      '[7.pdf](https://stage.eks.tiledesk.com/api/files/download?path=uploads/7.pdf)\n';

    const value = DirAiPrompt.sanitizeHeaderValue(emailBody);

    assert.strictEqual(value.includes('\\'), false);
    assert.strictEqual(/[\r\n]/.test(value), false);
    assert.ok(value.includes('Giovanni Troisi'));
    assert.ok(value.includes('giovanni@tiledesk.com'));
    assert.ok(value.includes('https://tiledesk.com/'));
    assert.ok(value.includes('[7.pdf](https://stage.eks.tiledesk.com/api/files/download?path=uploads/7.pdf)'));
  });

  it('decodes literal \\n sequences before dropping remaining backslashes', () => {
    const value = DirAiPrompt.sanitizeHeaderValue('hello\\nworld\\tend');
    assert.strictEqual(value, 'hello world end');
  });

  it('writes a header-safe x-last-user-text', () => {
    const headers = DirAiPrompt.prototype.mergeHeadersWithVariables.call({}, {}, {
      'x-last-user-text': 'Ciao\\n-- \nGiovanni\\nTroisi'
    });
    assert.strictEqual(headers['x-last-user-text'], 'Ciao -- Giovanni Troisi');
  });

});
