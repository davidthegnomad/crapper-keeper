import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
    buildRagFiles,
    buildZip,
    pageBody,
    safeSegment,
} from '../deploy-dn/crapper-keeper/js/rag-export.js';

const sample = {
    notebookTitle: 'Micah 6:8',
    vault: { secret: 'hidden-vault-token' },
    sections: [{
        title: 'Governance',
        pages: [{
            id: 'page-1',
            title: 'Bylaws',
            pageMode: 'html',
            contentSource: '<h1>Ignore</h1><p>The board meets monthly.</p>',
            subpages: [{
                id: 'page-2',
                title: 'Quorum',
                pageMode: 'markdown',
                contentSource: 'Three members make a quorum.',
            }],
        }],
    }],
};

test('rag files name the notebook, chapter, and page', () => {
    const files = buildRagFiles(sample);
    const bylaws = files.find((file) => file.path.endsWith('Bylaws.md'));
    const quorum = files.find((file) => file.path.includes('Quorum.md'));
    assert.equal(bylaws.path, 'Micah 6 8/Governance/Bylaws.md');
    assert.match(bylaws.markdown, /page_id: "page-1"/);
    assert.match(bylaws.markdown, /notebook: "Micah 6:8"/);
    assert.match(bylaws.markdown, /chapter: "Governance"/);
    assert.match(bylaws.markdown, /The board meets monthly/);
    assert.equal(bylaws.markdown.includes('<p>'), false);
    assert.match(quorum.path, /Bylaws\/Quorum\.md$/);
    assert.equal(JSON.stringify(files).includes('hidden-vault-token'), false);
});

test('html pages export plain text and unsafe path characters are removed', () => {
    assert.equal(pageBody({ pageMode: 'html', contentSource: '<p>Hello <b>there</b></p>' }), 'Hello there');
    assert.equal(safeSegment('a/b:c*d'), 'a b c d');
});

test('zip can be unpacked', () => {
    const files = buildRagFiles(sample);
    const bytes = buildZip(files, new Date('2026-10-23T12:00:00Z'));
    const dir = mkdtempSync(path.join(tmpdir(), 'ck-rag-'));
    const zipPath = path.join(dir, 'notes.zip');
    try {
        writeFileSync(zipPath, bytes);
        const listing = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' });
        assert.match(listing, /Bylaws\.md/);
        assert.match(listing, /README\.md/);
        const text = execFileSync('unzip', ['-p', zipPath, files.find((file) => file.path.endsWith('Bylaws.md')).path], { encoding: 'utf8' });
        assert.match(text, /The board meets monthly/);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
