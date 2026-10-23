import assert from 'node:assert/strict';
import test from 'node:test';
import { pageMatchesQuery } from '../deploy-dn/crapper-keeper/js/search-match.js';

test('matches a word in the middle of the body, ignoring case', () => {
    const page = { title: 'Minutes', contentPlain: 'The Bylaws were read.' };
    assert.equal(pageMatchesQuery(page, 'bylaws'), true);
    assert.equal(pageMatchesQuery(page, 'BYLAWS'), true);
});

test('matches the title when the body does not contain the query', () => {
    const page = { title: 'WayStation packet', contentPlain: 'See attached.' };
    assert.equal(pageMatchesQuery(page, 'packet'), true);
});

test('does not match a different note', () => {
    const page = { title: 'Groceries', contentPlain: 'milk' };
    assert.equal(pageMatchesQuery(page, 'bylaws'), false);
});
