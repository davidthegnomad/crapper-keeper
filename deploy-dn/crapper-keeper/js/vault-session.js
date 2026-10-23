/**
 * Unlocked vault state. Secret values stay in memory until Lock.
 * Saved copies are ciphertext only.
 */

import { readVaultRecord, writeVaultRecord, deleteVaultRecord } from './firebase-db.js';
import { decryptVault, encryptVault, encryptWithKey } from './vault-crypto.js';
import { createSecret, publicVaultList, removeSecret, sanitizeEntries, updateSecret } from './vault-data.js';

const LOCAL_KEY = 'ck-vault-blob';

let key = null;
let entries = [];
let record = null;

function stamp(blob) {
    const value = blob && blob.updatedAt;
    if (typeof value === 'number') return value;
    if (value && typeof value.toMillis === 'function') return value.toMillis();
    return 0;
}

function readLocal() {
    try {
        const raw = localStorage.getItem(LOCAL_KEY);
        if (!raw) return null;
        const blob = JSON.parse(raw);
        if (!blob || !blob.ciphertext) return null;
        return blob;
    } catch {
        return null;
    }
}

function writeLocal(blob) {
    const saved = { ...blob, updatedAt: Date.now() };
    delete saved.key;
    localStorage.setItem(LOCAL_KEY, JSON.stringify(saved));
    return saved;
}

async function loadRecord() {
    let cloud = null;
    try { cloud = await readVaultRecord(); } catch { cloud = null; }
    const local = readLocal();
    if (cloud && local) return stamp(cloud) >= stamp(local) ? cloud : local;
    return cloud || local;
}

async function persist(blob) {
    if (!blob || typeof blob.ciphertext !== 'string' || typeof blob.salt !== 'string') {
        throw new Error('Refusing to save an unlocked vault.');
    }
    const saved = writeLocal(blob);
    record = saved;
    try {
        await writeVaultRecord(saved);
    } catch {
        return false;
    }
    return true;
}

function requireOpen() {
    if (!key) throw new Error('Unlock the vault first.');
}

export function vaultIsUnlocked() {
    return Boolean(key);
}

export function vaultTitles() {
    if (!key) return [];
    return publicVaultList(entries);
}

export function listSecrets() {
    if (!key) return [];
    return sanitizeEntries(entries).map((entry) => ({ ...entry }));
}

export async function vaultMode() {
    if (key) return 'open';
    record = await loadRecord();
    return record ? 'locked' : 'new';
}

export async function createVault(passphrase) {
    const { blob, key: next } = await encryptVault([], passphrase);
    entries = [];
    key = next;
    record = blob;
    return persist(blob);
}

export async function unlockVault(passphrase) {
    const blob = record || await loadRecord();
    if (!blob) throw new Error('There is no vault yet.');
    const opened = await decryptVault(blob, passphrase);
    entries = sanitizeEntries(opened.entries);
    key = opened.key;
    record = blob;
}

export function lockVault() {
    key = null;
    entries = [];
}

export async function rekeyVault(passphrase) {
    requireOpen();
    const { blob, key: next } = await encryptVault(entries, passphrase);
    key = next;
    return persist(blob);
}

async function persistCurrent() {
    requireOpen();
    const blob = await encryptWithKey(entries, key, record.salt, record.iterations);
    return persist(blob);
}

export async function createVaultSecret(patch) {
    requireOpen();
    const result = createSecret(entries, patch);
    entries = result.entries;
    const synced = await persistCurrent();
    return { id: result.id, synced };
}

export async function updateVaultSecret(patch) {
    requireOpen();
    const next = updateSecret(entries, patch);
    if (!next) throw new Error('Vault item not found.');
    entries = next;
    const synced = await persistCurrent();
    return { synced };
}

export async function deleteVaultSecret(patch) {
    requireOpen();
    const next = removeSecret(entries, patch);
    if (!next) throw new Error('Vault item not found.');
    entries = next;
    const synced = await persistCurrent();
    return { synced };
}

export async function eraseVault() {
    lockVault();
    record = null;
    try { localStorage.removeItem(LOCAL_KEY); } catch { /* ignore */ }
    try { await deleteVaultRecord(); } catch { /* still erased on this device */ }
}
