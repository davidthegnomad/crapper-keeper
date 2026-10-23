import test from 'node:test';
import assert from 'node:assert/strict';
import { decryptVault, encryptVault, VAULT_ITERATIONS } from '../deploy-dn/crapper-keeper/js/vault-crypto.js';
import { createSecret, publicVaultList, removeSecret, updateSecret } from '../deploy-dn/crapper-keeper/js/vault-data.js';

test('vault round trip hides the secret and rejects the wrong passphrase', async () => {
    const secret = 's3cret-vault-value';
    const { blob } = await encryptVault(
        [{ id: '1', title: 'Bank', username: 'ada', secret, notes: 'door' }],
        'correct horse battery',
        { iterations: 1000 }
    );
    assert.equal(blob.ciphertext.includes(secret), false);
    assert.equal(JSON.stringify(blob).includes(secret), false);
    const opened = await decryptVault(blob, 'correct horse battery');
    assert.equal(opened.entries[0].secret, secret);
    await assert.rejects(() => decryptVault(blob, 'wrong passphrase'), /did not open/);
    assert.ok(VAULT_ITERATIONS >= 100000);
});

test('public vault list has titles only', () => {
    const { entries } = createSecret([], { title: 'Email', username: 'ada@example.com', secret: 'hidden-token', notes: 'nope' });
    const pub = publicVaultList(entries);
    assert.deepEqual(Object.keys(pub[0]).sort(), ['id', 'title']);
    assert.equal(JSON.stringify(pub).includes('hidden-token'), false);
    const renamed = updateSecret(entries, { title: 'Email', username: 'ada2' });
    assert.equal(renamed[0].username, 'ada2');
    assert.equal(renamed[0].secret, 'hidden-token');
    assert.equal(removeSecret(entries, { title: 'Email' }).length, 0);
});
