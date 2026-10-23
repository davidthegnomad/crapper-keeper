/**
 * Vault entry list helpers. These never encrypt and never add secret fields to a public list.
 */

function clip(value, max) {
    return String(value ?? '').slice(0, max);
}

function newId() {
    return `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function sanitizeEntries(value) {
    if (!Array.isArray(value)) return [];
    return value.slice(0, 500).map((item) => ({
        id: clip(item && item.id, 80).trim() || newId(),
        title: clip(item && item.title, 200).trim(),
        username: clip(item && item.username, 200),
        secret: clip(item && item.secret, 8000),
        notes: clip(item && item.notes, 8000),
    }));
}

export function publicVaultList(entries) {
    return sanitizeEntries(entries).map((entry) => ({
        id: entry.id,
        title: entry.title || 'Untitled',
    }));
}

function findEntry(entries, patch) {
    const id = clip(patch && patch.id, 80).trim();
    if (id) {
        const byId = entries.find((entry) => entry.id === id);
        if (byId) return byId;
    }
    const title = clip(patch && patch.title, 200).trim().toLowerCase();
    if (!title) return null;
    return entries.find((entry) => entry.title.toLowerCase() === title) || null;
}

export function createSecret(entries, patch = {}) {
    const list = sanitizeEntries(entries);
    const note = {
        id: newId(),
        title: clip(patch.title, 200).trim() || 'Untitled',
        username: clip(patch.username, 200),
        secret: clip(patch.secret, 8000),
        notes: clip(patch.notes, 8000),
    };
    list.unshift(note);
    return { entries: list, id: note.id };
}

export function updateSecret(entries, patch = {}) {
    const list = sanitizeEntries(entries);
    const note = findEntry(list, patch);
    if (!note) return null;
    if (patch.title != null) note.title = clip(patch.title, 200).trim() || note.title;
    if (patch.username != null) note.username = clip(patch.username, 200);
    if (patch.secret != null) note.secret = clip(patch.secret, 8000);
    if (patch.notes != null) note.notes = clip(patch.notes, 8000);
    return list;
}

export function removeSecret(entries, patch = {}) {
    const list = sanitizeEntries(entries);
    const note = findEntry(list, patch);
    if (!note) return null;
    return list.filter((entry) => entry.id !== note.id);
}
