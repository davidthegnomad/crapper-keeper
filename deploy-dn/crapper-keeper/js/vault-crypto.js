/**
 * Encrypts vault entries in the browser. The passphrase never leaves this function.
 */

export const VAULT_ITERATIONS = 310000;

function bytesToB64(bytes) {
    const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let text = '';
    for (let i = 0; i < arr.length; i++) text += String.fromCharCode(arr[i]);
    return btoa(text);
}

function b64ToBytes(text) {
    const bin = atob(String(text || ''));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

async function deriveKey(passphrase, salt, iterations) {
    const base = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(passphrase),
        'PBKDF2',
        false,
        ['deriveKey']
    );
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
        base,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

export async function encryptWithKey(entries, key, salt, iterations) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plain = new TextEncoder().encode(JSON.stringify(entries));
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain);
    return {
        v: 1,
        salt,
        iterations,
        iv: bytesToB64(iv),
        ciphertext: bytesToB64(new Uint8Array(cipher)),
    };
}

export async function encryptVault(entries, passphrase, prior = null) {
    const phrase = String(passphrase || '');
    if (phrase.length < 8) throw new Error('Use at least 8 characters.');
    const saltBytes = prior && prior.salt ? b64ToBytes(prior.salt) : crypto.getRandomValues(new Uint8Array(16));
    const iterations = prior && prior.iterations ? prior.iterations : VAULT_ITERATIONS;
    const key = await deriveKey(phrase, saltBytes, iterations);
    const blob = await encryptWithKey(entries, key, bytesToB64(saltBytes), iterations);
    return { blob, key };
}

export async function decryptVault(blob, passphrase) {
    const phrase = String(passphrase || '');
    if (!blob || !blob.ciphertext || !blob.salt || !blob.iv) throw new Error('Vault data is missing.');
    const key = await deriveKey(phrase, b64ToBytes(blob.salt), blob.iterations || VAULT_ITERATIONS);
    let plain;
    try {
        plain = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: b64ToBytes(blob.iv) },
            key,
            b64ToBytes(blob.ciphertext)
        );
    } catch {
        throw new Error('That passphrase did not open the vault.');
    }
    let parsed;
    try {
        parsed = JSON.parse(new TextDecoder().decode(plain));
    } catch {
        throw new Error('That passphrase did not open the vault.');
    }
    if (!Array.isArray(parsed)) throw new Error('That passphrase did not open the vault.');
    return { entries: parsed, key };
}
