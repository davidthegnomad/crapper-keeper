/**
 * Vault screen. Names are visible after unlock. Secret fields stay masked.
 */

import {
    createVault,
    createVaultSecret,
    deleteVaultSecret,
    eraseVault,
    listSecrets,
    lockVault,
    rekeyVault,
    unlockVault,
    updateVaultSecret,
    vaultMode,
} from './vault-session.js';

function field(labelText, type) {
    const label = document.createElement('label');
    label.textContent = labelText;
    const input = document.createElement(type === 'area' ? 'textarea' : 'input');
    if (type !== 'area') input.type = type || 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    label.appendChild(input);
    return { label, input };
}

function button(text, className) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = className || 'shell-add';
    el.textContent = text;
    return el;
}

export function mountVaultPanel(root) {
    let activeId = '';
    let reveal = false;

    async function paint() {
        const mode = await vaultMode();
        root.replaceChildren();
        if (mode === 'open') paintOpen();
        else paintGate(mode);
    }

    function paintGate(mode) {
        const wrap = document.createElement('form');
        wrap.className = 'vault-gate';
        wrap.autocomplete = 'off';
        wrap.addEventListener('submit', (event) => event.preventDefault());
        const title = document.createElement('h2');
        title.textContent = mode === 'new' ? 'Create a vault' : 'Vault is locked';
        const copy = document.createElement('p');
        copy.textContent = mode === 'new'
            ? 'Secrets are encrypted before they are saved. The passphrase is not stored. If you forget it, the vault cannot be opened.'
            : 'Enter the vault passphrase. It is not stored on this account.';
        const phrase = field('Passphrase', 'password');
        phrase.input.autocomplete = mode === 'new' ? 'new-password' : 'current-password';
        const again = field('Confirm passphrase', 'password');
        again.input.autocomplete = 'new-password';
        if (mode !== 'new') again.label.hidden = true;
        const status = document.createElement('p');
        status.className = 'vault-status';
        const go = button(mode === 'new' ? 'Create vault' : 'Unlock', 'shell-add');
        wrap.append(title, copy, phrase.label, again.label, status, go);
        if (mode === 'locked') {
            const erase = button('Erase vault', 'shell-add vault-danger');
            erase.addEventListener('click', async () => {
                if (!window.confirm('Erase the vault on this account? The saved secrets cannot be recovered.')) return;
                await eraseVault();
                activeId = '';
                paint();
            });
            wrap.appendChild(erase);
        }
        go.addEventListener('click', async () => {
            go.disabled = true;
            status.textContent = mode === 'new' ? 'Creating…' : 'Unlocking…';
            try {
                if (mode === 'new') {
                    if (phrase.input.value !== again.input.value) throw new Error('The passphrases do not match.');
                    const synced = await createVault(phrase.input.value);
                    status.textContent = synced ? '' : 'Created on this device. Cloud save failed.';
                } else {
                    await unlockVault(phrase.input.value);
                }
                phrase.input.value = '';
                again.input.value = '';
                await paint();
            } catch (err) {
                status.textContent = err.message || 'The vault did not open.';
                go.disabled = false;
            }
        });
        root.appendChild(wrap);
    }

    function paintOpen() {
        const items = listSecrets();
        if (!items.some((item) => item.id === activeId)) activeId = items[0] ? items[0].id : '';
        const bar = document.createElement('div');
        bar.className = 'vault-toolbar';
        const add = button('New secret');
        const lock = button('Lock');
        const rekey = button('Change passphrase');
        bar.append(add, lock, rekey);
        const body = document.createElement('div');
        body.className = 'vault-body';
        const list = document.createElement('div');
        list.className = 'vault-list';
        const editor = document.createElement('form');
        editor.className = 'vault-editor';
        editor.autocomplete = 'off';
        editor.addEventListener('submit', (event) => event.preventDefault());
        body.append(list, editor);
        root.append(bar, body);

        function drawList() {
            list.replaceChildren();
            const current = listSecrets();
            if (!current.length) {
                const empty = document.createElement('p');
                empty.className = 'vault-status';
                empty.textContent = 'No secrets yet.';
                list.appendChild(empty);
                return;
            }
            for (const item of current) {
                const row = button(item.title || 'Untitled', 'vault-row');
                if (item.id === activeId) row.classList.add('active');
                row.addEventListener('click', () => {
                    activeId = item.id;
                    reveal = false;
                    drawList();
                    drawEditor();
                });
                list.appendChild(row);
            }
        }

        function drawEditor() {
            editor.replaceChildren();
            const current = listSecrets().find((item) => item.id === activeId);
            if (!current) return;
            const name = field('Name', 'text');
            const username = field('Username', 'text');
            const secret = field('Secret', reveal ? 'text' : 'password');
            const notes = field('Notes', 'area');
            name.input.value = current.title;
            username.input.value = current.username;
            secret.input.value = current.secret;
            notes.input.value = current.notes;
            const row = document.createElement('div');
            row.className = 'vault-actions';
            const save = button('Save');
            const show = button(reveal ? 'Hide' : 'Show');
            const copy = button('Copy secret');
            const del = button('Delete', 'shell-add vault-danger');
            const status = document.createElement('p');
            status.className = 'vault-status';
            row.append(save, show, copy, del);
            editor.append(name.label, username.label, secret.label, notes.label, row, status);
            save.addEventListener('click', async () => {
                save.disabled = true;
                try {
                    const synced = await updateVaultSecret({
                        id: current.id,
                        title: name.input.value,
                        username: username.input.value,
                        secret: secret.input.value,
                        notes: notes.input.value,
                    });
                    status.textContent = synced.synced ? 'Encrypted and saved.' : 'Saved on this device. Cloud save failed.';
                    drawList();
                } catch (err) {
                    status.textContent = err.message || 'Save failed.';
                } finally {
                    save.disabled = false;
                }
            });
            show.addEventListener('click', () => {
                reveal = !reveal;
                secret.input.type = reveal ? 'text' : 'password';
                show.textContent = reveal ? 'Hide' : 'Show';
            });
            copy.addEventListener('click', async () => {
                const value = secret.input.value;
                if (!value) {
                    status.textContent = 'There is no secret to copy.';
                    return;
                }
                try {
                    await navigator.clipboard.writeText(value);
                    status.textContent = 'Copied.';
                    setTimeout(async () => {
                        try {
                            const now = await navigator.clipboard.readText();
                            if (now === value) await navigator.clipboard.writeText('');
                        } catch { /* leave the clipboard alone */ }
                    }, 20000);
                } catch {
                    status.textContent = 'Copy was blocked by the browser.';
                }
            });
            del.addEventListener('click', async () => {
                if (!window.confirm('Delete this secret?')) return;
                await deleteVaultSecret({ id: current.id });
                activeId = '';
                reveal = false;
                drawList();
                drawEditor();
            });
        }

        add.addEventListener('click', async () => {
            const created = await createVaultSecret({ title: 'Untitled', secret: '' });
            activeId = created.id;
            reveal = false;
            drawList();
            drawEditor();
        });
        lock.addEventListener('click', () => {
            lockVault();
            activeId = '';
            reveal = false;
            paint();
        });
        rekey.addEventListener('click', () => {
            editor.replaceChildren();
            const next = field('New passphrase', 'password');
            const again = field('Confirm new passphrase', 'password');
            next.input.autocomplete = 'new-password';
            again.input.autocomplete = 'new-password';
            const save = button('Save new passphrase');
            const cancel = button('Cancel');
            const status = document.createElement('p');
            status.className = 'vault-status';
            editor.append(next.label, again.label, save, cancel, status);
            cancel.addEventListener('click', drawEditor);
            save.addEventListener('click', async () => {
                save.disabled = true;
                try {
                    if (next.input.value !== again.input.value) throw new Error('The passphrases do not match.');
                    const synced = await rekeyVault(next.input.value);
                    next.input.value = '';
                    again.input.value = '';
                    status.textContent = synced ? 'Passphrase changed.' : 'Passphrase changed on this device. Cloud save failed.';
                } catch (err) {
                    status.textContent = err.message || 'The passphrase was not changed.';
                    save.disabled = false;
                }
            });
        });
        drawList();
        drawEditor();
    }

    paint();
}
