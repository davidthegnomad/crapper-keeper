/**
 * Downloads llama.cpp, whisper.cpp, and the two model files into app data.
 * Nothing here is bundled into the website installer.
 */

const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { MODELS, packFor } = require('./engine-manifest');

let activeReq = null;
let stop = false;
let job = null;

function modelRoot() {
    const { app } = require('electron');
    return path.join(app.getPath('userData'), 'ck-models');
}

function findBinary(root, names) {
    const found = new Map();
    const stack = [root];
    while (stack.length) {
        const dir = stack.pop();
        let entries = [];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
        for (const ent of entries) {
            const full = path.join(dir, ent.name);
            if (ent.isDirectory()) stack.push(full);
            else if (names.includes(ent.name)) found.set(ent.name, full);
        }
    }
    for (const name of names) {
        if (found.has(name)) return found.get(name);
    }
    return null;
}

function fileSize(file) {
    try { return fs.statSync(file).size; } catch { return 0; }
}

function inspect(root, pack, limits = {}) {
    const notesMin = limits.notes ?? MODELS.notes.minBytes;
    const speechMin = limits.speech ?? MODELS.speech.minBytes;
    const notes = path.join(root, MODELS.notes.file);
    const speech = path.join(root, MODELS.speech.file);
    const llamaBin = findBinary(path.join(root, 'llama'), ['llama-cli', 'llama-cli.exe']);
    const whisperBin = findBinary(path.join(root, 'whisper'), ['whisper-cli', 'whisper-cli.exe', 'main.exe', 'main']);
    const notesOk = fileSize(notes) >= notesMin;
    const speechOk = fileSize(speech) >= speechMin;
    const speechSupported = Boolean(pack && pack.whisper);
    return {
        supported: Boolean(pack),
        includesSpeech: speechSupported,
        ready: Boolean(pack && llamaBin && notesOk),
        whisper: Boolean(speechSupported && whisperBin && speechOk),
        skipped: fs.existsSync(path.join(root, 'skipped')),
        llamaBin,
        whisperBin,
        notesModel: notesOk ? notes : null,
        speechModel: speechOk ? speech : null,
        platform: pack ? pack.id : 'unsupported',
    };
}

function status() {
    const root = modelRoot();
    const pack = packFor(process.platform, process.arch);
    return inspect(root, pack);
}

function markSkipped() {
    const root = modelRoot();
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, 'skipped'), '1');
}

function cancel() {
    stop = true;
    if (activeReq) activeReq.destroy();
}

function downloadFile(url, dest, onBytes) {
    return new Promise((resolve, reject) => {
        const part = `${dest}.part`;
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        const file = fs.createWriteStream(part);
        let settled = false;
        const fail = (err) => {
            if (settled) return;
            settled = true;
            activeReq = null;
            file.destroy();
            fs.rm(part, { force: true }, () => reject(err instanceof Error ? err : new Error('Download failed.')));
        };
        const request = (next, hops) => {
            if (stop) return fail(new Error('Download cancelled.'));
            if (hops > 6) return fail(new Error('Download redirected too many times.'));
            const lib = next.startsWith('http:') ? http : https;
            const req = lib.get(next, { headers: { 'User-Agent': 'CrapperKeeper/1.3' } }, (res) => {
                if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
                    res.resume();
                    return request(new URL(res.headers.location, next).toString(), hops + 1);
                }
                if (res.statusCode !== 200) {
                    res.resume();
                    return fail(new Error(`Download failed (${res.statusCode}).`));
                }
                const total = Number(res.headers['content-length'] || 0);
                let got = 0;
                res.on('data', (chunk) => {
                    got += chunk.length;
                    if (onBytes) onBytes(got, total);
                });
                res.on('error', fail);
                file.on('error', fail);
                res.pipe(file);
                file.on('finish', () => {
                    if (settled) return;
                    settled = true;
                    activeReq = null;
                    file.close(() => {
                        try {
                            fs.renameSync(part, dest);
                            resolve(total || got);
                        } catch (err) {
                            reject(err);
                        }
                    });
                });
            });
            activeReq = req;
            req.on('error', fail);
        };
        request(url, 0);
    });
}

function extract(archive, dest) {
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(dest, { recursive: true });
    const result = spawnSync('tar', ['-xf', archive, '-C', dest], { encoding: 'utf8' });
    fs.rm(archive, { force: true }, () => {});
    if (result.status !== 0) {
        throw new Error((result.stderr || '').trim() || 'Could not unpack the notes engine.');
    }
}

async function ensureEngine(root, kind, url, names, onProgress, index, count) {
    const dest = path.join(root, kind);
    const existing = findBinary(dest, names);
    if (existing) return existing;
    const archive = path.join(os.tmpdir(), `ck-${kind}-${process.pid}`);
    const label = kind === 'llama' ? 'Notes engine' : 'Speech engine';
    await downloadFile(url, archive, (got, total) => {
        onProgress({ label: `${label} (${index} of ${count})`, index, count, got, total });
    });
    if (stop) throw new Error('Download cancelled.');
    onProgress({ label: `Unpacking ${label.toLowerCase()}…`, index, count, got: 1, total: 1 });
    extract(archive, dest);
    const bin = findBinary(dest, names);
    if (!bin) throw new Error(`The ${label.toLowerCase()} did not include a program this computer can run.`);
    if (process.platform !== 'win32') fs.chmodSync(bin, 0o755);
    return bin;
}

async function ensureModel(root, spec, label, onProgress, index, count) {
    const dest = path.join(root, spec.file);
    if (fileSize(dest) >= spec.minBytes) return dest;
    fs.rm(dest, { force: true }, () => {});
    await downloadFile(spec.url, dest, (got, total) => {
        onProgress({ label: `${label} (${index} of ${count})`, index, count, got, total });
    });
    if (fileSize(dest) < spec.minBytes) {
        fs.rm(dest, { force: true }, () => {});
        throw new Error(`${label} download was incomplete.`);
    }
    return dest;
}

async function doInstall(onProgress) {
    stop = false;
    const root = modelRoot();
    const pack = packFor(process.platform, process.arch);
    if (!pack) throw new Error('This computer is not supported yet.');
    fs.mkdirSync(root, { recursive: true });
    const steps = [pack.llama, MODELS.notes, pack.whisper, pack.whisper && MODELS.speech].filter(Boolean);
    const count = steps.length;
    let index = 1;
    await ensureEngine(root, 'llama', pack.llama, ['llama-cli', 'llama-cli.exe'], onProgress, index, count);
    index += 1;
    await ensureModel(root, MODELS.notes, 'Notes model', onProgress, index, count);
    if (pack.whisper) {
        index += 1;
        await ensureEngine(root, 'whisper', pack.whisper, ['whisper-cli', 'whisper-cli.exe', 'main.exe', 'main'], onProgress, index, count);
        index += 1;
        await ensureModel(root, MODELS.speech, 'Speech model', onProgress, index, count);
    }
    fs.rm(path.join(root, 'skipped'), { force: true }, () => {});
    onProgress({ label: 'Ready', index: count, count, got: 1, total: 1, done: true });
    return status();
}

function install(onProgress) {
    if (job) return job;
    job = doInstall(onProgress || (() => {})).finally(() => { job = null; });
    return job;
}

module.exports = {
    status,
    inspect,
    install,
    cancel,
    markSkipped,
    findBinary,
    modelRoot,
};
