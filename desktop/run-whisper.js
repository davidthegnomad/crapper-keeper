/**
 * Turns a 16 kHz mono WAV into text with the local whisper.cpp binary.
 */

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function transcribe(binary, model, wavBuffer) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ck-wav-'));
    const wav = path.join(dir, 'in.wav');
    const outBase = path.join(dir, 'out');
    fs.writeFileSync(wav, wavBuffer);
    const args = ['-m', model, '-f', wav, '-l', 'en', '-np', '-otxt', '-of', outBase];
    return new Promise((resolve, reject) => {
        const libDir = path.dirname(binary);
        const child = spawn(binary, args, {
            cwd: libDir,
            env: {
                ...process.env,
                LD_LIBRARY_PATH: [libDir, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':'),
                DYLD_LIBRARY_PATH: [libDir, process.env.DYLD_LIBRARY_PATH].filter(Boolean).join(':'),
            },
        });
        let out = '';
        let err = '';
        const timer = setTimeout(() => child.kill('SIGKILL'), 180000);
        child.stdout.on('data', (buf) => { out += buf.toString(); });
        child.stderr.on('data', (buf) => { err += buf.toString(); });
        child.on('error', (error) => {
            clearTimeout(timer);
            fs.rm(dir, { recursive: true, force: true }, () => {});
            reject(error);
        });
        child.on('close', (code) => {
            clearTimeout(timer);
            let text = '';
            try { text = fs.readFileSync(`${outBase}.txt`, 'utf8'); } catch { text = out; }
            fs.rm(dir, { recursive: true, force: true }, () => {});
            text = text.trim();
            if (!text) {
                reject(new Error((err || '').trim().slice(0, 400) || `Speech model stopped (${code}).`));
                return;
            }
            resolve(text);
        });
    });
}

module.exports = { transcribe };
