import assert from 'node:assert/strict';
import test from 'node:test';
import { assemblePreviewDoc, SHELL_VIEWS } from '../deploy-dn/crapper-keeper/js/shell-view-data.js';

test('view menu includes notebook, slate, preview, and stickies', () => {
    assert.deepEqual(SHELL_VIEWS.map((view) => view.id), ['notebook', 'slate', 'preview', 'stickies', 'vault']);
});

test('preview document keeps a closing script tag from breaking out', () => {
    const doc = assemblePreviewDoc({
        html: '<p>Hi</p>',
        css: 'p { color: red; }',
        js: 'document.write("</script><h1>nope</h1>")',
    });
    assert.match(doc, /<p>Hi<\/p>/);
    assert.equal(doc.includes('</script><h1>'), false);
    assert.match(doc, /<\\\/script>/);
});
