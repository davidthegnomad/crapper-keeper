import { createRequire } from 'node:module';
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { TOOL_NAMES, gateTools, parseAssistantReply, userAskedToDelete } from '../deploy-dn/crapper-keeper/js/assistant-plan.js';

const require = createRequire(import.meta.url);
const { packFor, MODELS } = require('../desktop/engine-manifest.js');
const { findBinary, inspect } = require('../desktop/engines.js');
const schema = JSON.parse(readFileSync(new URL('../desktop/assistant-schema.json', import.meta.url), 'utf8'));

test('tool names match the model schema', () => {
    assert.deepEqual(schema.properties.tools.items.properties.name.enum, TOOL_NAMES);
});

test('reply parser keeps one JSON object and drops unknown tools', () => {
    const parsed = parseAssistantReply('Sure ```json {"say":"Renamed it.","tools":[{"name":"rename_notebook","args":{"id":"nb1","title":"Trips"}},{"name":"run_shell","args":{"cmd":"rm"}}]} trailing');
    assert.equal(parsed.say, 'Renamed it.');
    assert.deepEqual(parsed.tools, [{ name: 'rename_notebook', args: { id: 'nb1', title: 'Trips' } }]);
});

test('parser handles braces inside the spoken sentence', () => {
    const parsed = parseAssistantReply('{"say":"Kept the {braces}.","tools":[]}');
    assert.equal(parsed.say, 'Kept the {braces}.');
    assert.deepEqual(parsed.tools, []);
});

test('deletes are ignored unless the user asked', () => {
    const tools = [{ name: 'delete_page', args: { id: 'p1' } }, { name: 'create_sticky', args: { text: 'Hi' } }];
    const blocked = gateTools(tools, 'tidy this page');
    assert.deepEqual(blocked.tools.map((tool) => tool.name), ['create_sticky']);
    assert.equal(blocked.blocked.length, 1);
    const allowed = gateTools(tools, 'please delete that page');
    assert.equal(allowed.tools.length, 2);
    assert.equal(userAskedToDelete('get rid of the sticky'), true);
    assert.equal(userAskedToDelete('Rewrite the current page. Do not delete anything.'), false);
    assert.equal(userAskedToDelete('do not delete the title, delete the page'), true);
});

test('linux has both engines and mac has notes only', () => {
    const linux = packFor('linux', 'x64');
    assert.ok(linux.llama.includes('llama-b11840-bin-ubuntu-x64'));
    assert.ok(linux.whisper.includes('whisper-bin-ubuntu-x64'));
    const mac = packFor('darwin', 'arm64');
    assert.ok(mac.llama.includes('macos-arm64'));
    assert.equal(mac.whisper, null);
    assert.equal(packFor('freebsd', 'x64'), null);
    assert.ok(MODELS.notes.minBytes > 800_000_000);
    assert.ok(MODELS.speech.minBytes >= 400_000_000);
});

test('installed files are detected without downloading', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'ck-models-'));
    try {
        const before = inspect(root, packFor('linux', 'x64'), { notes: 4, speech: 4 });
        assert.equal(before.ready, false);
        assert.equal(before.whisper, false);
        mkdirSync(path.join(root, 'llama', 'nested'), { recursive: true });
        writeFileSync(path.join(root, 'llama', 'nested', 'llama-cli'), '');
        writeFileSync(path.join(root, MODELS.notes.file), '12345');
        mkdirSync(path.join(root, 'whisper'), { recursive: true });
        writeFileSync(path.join(root, 'whisper', 'whisper-cli'), '');
        writeFileSync(path.join(root, MODELS.speech.file), '12345');
        const after = inspect(root, packFor('linux', 'x64'), { notes: 4, speech: 4 });
        assert.equal(after.ready, true);
        assert.equal(after.whisper, true);
        assert.equal(findBinary(path.join(root, 'llama'), ['llama-cli', 'llama-cli.exe']).endsWith('llama-cli'), true);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});
