var assert = require('assert');
const { DirInviteHuman } = require('../tiledeskChatbotPlugs/directives/DirInviteHuman');
const { Filler } = require('../tiledeskChatbotPlugs/Filler');

describe('DirInviteHuman.resolveMembers', function () {

  const filler = new Filler();

  it('returns an empty list for empty values', () => {
    assert.deepStrictEqual(DirInviteHuman.resolveMembers(undefined, {}, filler), []);
    assert.deepStrictEqual(DirInviteHuman.resolveMembers(null, {}, filler), []);
    assert.deepStrictEqual(DirInviteHuman.resolveMembers('', {}, filler), []);
    assert.deepStrictEqual(DirInviteHuman.resolveMembers('  , ;\n ', {}, filler), []);
  });

  it('splits on comma, semicolon and newline, trims and removes duplicates', () => {
    const members = DirInviteHuman.resolveMembers(' a@acme.it, b@acme.it;c@acme.it\nb@acme.it ', {}, filler);
    assert.deepStrictEqual(members, ['a@acme.it', 'b@acme.it', 'c@acme.it']);
  });

  it('expands a variable holding an array', () => {
    const members = DirInviteHuman.resolveMembers('{{oncall}}, ops@acme.it', { oncall: ['a@acme.it', 'b@acme.it'] }, filler);
    assert.deepStrictEqual(members, ['a@acme.it', 'b@acme.it', 'ops@acme.it']);
  });

  it('expands a dotted variable path and a comma-separated string variable', () => {
    const variables = { payload: { oncall: ['a@acme.it'] }, backup: 'b@acme.it, c@acme.it' };
    const members = DirInviteHuman.resolveMembers('{{payload.oncall}};{{ backup }}', variables, filler);
    assert.deepStrictEqual(members, ['a@acme.it', 'b@acme.it', 'c@acme.it']);
  });

  it('expands a variable holding a JSON array string', () => {
    const members = DirInviteHuman.resolveMembers('{{oncall}}', { oncall: '["a@acme.it","b@acme.it"]' }, filler);
    assert.deepStrictEqual(members, ['a@acme.it', 'b@acme.it']);
  });

  it('fills placeholders embedded in text and drops unknown variables', () => {
    const members = DirInviteHuman.resolveMembers('team-{{team}}@acme.it, {{unknown}}', { team: 'sre' }, filler);
    assert.deepStrictEqual(members, ['team-sre@acme.it']);
  });

  it('accepts an array of members', () => {
    const members = DirInviteHuman.resolveMembers(['a@acme.it', '{{oncall}}'], { oncall: 'b@acme.it' }, filler);
    assert.deepStrictEqual(members, ['a@acme.it', 'b@acme.it']);
  });
});

describe('DirInviteHuman.fixToken', function () {
  it('prefixes JWT only when missing', () => {
    assert.strictEqual(DirInviteHuman.fixToken('abc'), 'JWT abc');
    assert.strictEqual(DirInviteHuman.fixToken('JWT abc'), 'JWT abc');
  });
});

describe('DirInviteHuman.errorSummary', function () {
  it('extracts the server error text and never touches config/request headers', () => {
    const err = {
      message: 'Request failed with status code 422',
      config: { headers: { Authorization: 'JWT SECRET' } },
      request: { _header: 'Authorization: JWT SECRET' },
      response: {
        status: 422,
        data: { success: false, error: 'Invite human requires a conversation started by a webhook' }
      }
    };
    const summary = DirInviteHuman.errorSummary(err);
    assert.deepStrictEqual(summary, {
      message: 'Invite human requires a conversation started by a webhook',
      status: 422,
      data: { success: false, error: 'Invite human requires a conversation started by a webhook' }
    });
    assert.strictEqual(JSON.stringify(summary).includes('SECRET'), false);
  });

  it('falls back to err.message when there is no response', () => {
    const summary = DirInviteHuman.errorSummary(new Error('socket hang up'));
    assert.deepStrictEqual(summary, { message: 'socket hang up', status: undefined, data: undefined });
  });
});
