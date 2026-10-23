import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { minutesTitle, parseMinutesReply, renderMinutes } from '../deploy-dn/crapper-keeper/js/minutes.js';

const require = createRequire(import.meta.url);
const { checkToolCall, handleApi, publicResult } = require('../desktop/tool-guard.cjs');

test('minutes keep transcript facts and drop invented lines', () => {
    const transcript = 'Ada said the board meets monthly. The grant is due Friday. Ada will file the form.';
    const reply = JSON.stringify({
        attendees: 'Ada',
        discussion: 'The board meets monthly.',
        decisions: 'The grant is due Friday.',
        actions: [{ who: 'Ada', what: 'file the form', when: 'Friday' }, { who: 'Bob', what: 'embezzle the funds', when: '' }],
    });
    const fields = parseMinutesReply(reply, transcript);
    assert.equal(fields.attendees, 'Ada');
    assert.match(fields.discussion, /board meets monthly/);
    assert.equal(fields.actions.length, 1);
    assert.match(fields.actions[0], /Ada/);
    assert.equal(fields.actions.some((line) => /embezzle|Bob/.test(line)), false);
    const page = renderMinutes(fields, transcript);
    assert.match(page, /## Attendees/);
    assert.match(page, /## Discussion/);
    assert.match(page, /## Decisions/);
    assert.match(page, /## Action items/);
    assert.match(page, /## Transcript/);
    assert.equal(minutesTitle(new Date(2026, 9, 23)), 'Minutes 2026-10-23');
});

test('tool api rejects vault tools and unconfirmed deletes', async () => {
    assert.equal(checkToolCall('delete_secret', { id: '1', confirm: true }).ok, false);
    assert.match(checkToolCall('delete_page', { id: '1' }).error, /confirm/);
    assert.equal(checkToolCall('delete_page', { id: '1', confirm: true }).ok, true);
    const stripped = publicResult({ title: 'Bank', secret: 'hidden-token', notes: 'ok' });
    assert.equal(stripped.secret, undefined);
    assert.equal(stripped.notes, 'ok');
    const denied = await handleApi({
        method: 'GET', url: '/v1/tools', headers: {}, body: '', token: 't', callTool: async () => ({}),
    });
    assert.equal(denied.status, 401);
    const listed = await handleApi({
        method: 'GET', url: '/v1/tools', headers: { authorization: 'Bearer t' }, body: '', token: 't', callTool: async () => ({}),
    });
    assert.equal(listed.status, 200);
    assert.equal(listed.body.tools.some((tool) => tool.function.name === 'export_rag'), true);
    assert.equal(listed.body.tools.some((tool) => tool.function.name === 'delete_secret'), false);
    const called = await handleApi({
        method: 'POST',
        url: '/v1/tools/call',
        headers: { authorization: 'Bearer t' },
        body: JSON.stringify({ name: 'read_page', arguments: { id: 'p1', secret: 'nope' } }),
        token: 't',
        callTool: async (name, args) => ({ name, id: args.id, secret: 'hidden-token' }),
    });
    assert.equal(called.status, 200);
    assert.equal(called.body.result.secret, undefined);
    assert.equal(called.body.result.id, 'p1');
});
