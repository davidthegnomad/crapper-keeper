/**
 * Crapper Keeper — Windows/macOS/Linux desktop shell.
 * Loads the live web app. On-device models live in this process, not in the page.
 */

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const crypto = require('node:crypto');
const path = require('node:path');
const engines = require('./engines');
const { complete, completeMinutes } = require('./run-llm');
const { transcribe } = require('./run-whisper');
const { startToolApi } = require('./tool-api');

const START_URL = process.env.CK_START_URL || 'https://davidthegnomadorg.web.app/crapper-keeper/';
const PRELOAD = path.join(__dirname, 'preload.js');

let setupWindow = null;
let apiReady = Promise.resolve(null);

function notebookWindow() {
    return BrowserWindow.getAllWindows().find((win) => {
        if (win.isDestroyed()) return false;
        try {
            return win.webContents.getURL().startsWith('http');
        } catch {
            return false;
        }
    });
}

function callTool(name, args) {
    const win = notebookWindow();
    if (!win) return Promise.reject(new Error('Open Crapper Keeper and sign in first.'));
    const id = crypto.randomBytes(8).toString('hex');
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            ipcMain.removeListener('ck-tool-result', onResult);
            reject(new Error('The notebook did not answer. Sign in, then try again.'));
        }, 60000);
        function onResult(_event, msg) {
            if (!msg || msg.id !== id) return;
            clearTimeout(timer);
            ipcMain.removeListener('ck-tool-result', onResult);
            if (msg.ok) resolve(msg.result);
            else reject(new Error(msg.error || 'The tool failed.'));
        }
        ipcMain.on('ck-tool-result', onResult);
        win.webContents.send('ck-tool-call', { id, name, arguments: args });
    });
}

function isOAuthPopup(url) {
    try {
        const u = new URL(url);
        return (
            u.hostname === 'accounts.google.com' ||
            u.hostname.endsWith('.google.com') ||
            u.hostname.endsWith('.firebaseapp.com') ||
            u.hostname.endsWith('.web.app')
        );
    } catch {
        return false;
    }
}

function webPrefs() {
    return {
        preload: PRELOAD,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
    };
}

function createWindow() {
    const win = new BrowserWindow({
        width: 1280,
        height: 840,
        minWidth: 720,
        minHeight: 520,
        backgroundColor: '#2a0a4a',
        title: 'Crapper Keeper',
        autoHideMenuBar: true,
        icon: path.join(__dirname, '..', 'deploy-dn', 'crapper-keeper', 'icons', 'icon-512.png'),
        webPreferences: webPrefs(),
    });

    win.webContents.setWindowOpenHandler(({ url }) => {
        if (isOAuthPopup(url)) {
            return {
                action: 'allow',
                overrideBrowserWindowOptions: {
                    width: 520,
                    height: 680,
                    autoHideMenuBar: true,
                    webPreferences: webPrefs(),
                },
            };
        }
        shell.openExternal(url);
        return { action: 'deny' };
    });

    const ua = win.webContents.getUserAgent().replace(/\sElectron\/\S+/g, '');
    win.loadURL(START_URL, { userAgent: ua });
    return win;
}

function broadcast(data) {
    for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send('models:progress', data);
    }
}

function openSetup() {
    if (setupWindow && !setupWindow.isDestroyed()) {
        setupWindow.focus();
        return;
    }
    const parent = BrowserWindow.getAllWindows().find((win) => !win.isDestroyed()) || null;
    setupWindow = new BrowserWindow({
        width: 480,
        height: 440,
        parent: parent || undefined,
        modal: Boolean(parent),
        resizable: false,
        minimizable: false,
        maximizable: false,
        title: 'Set up notes',
        backgroundColor: '#2a0a4a',
        autoHideMenuBar: true,
        webPreferences: webPrefs(),
    });
    setupWindow.on('closed', () => {
        engines.cancel();
        setupWindow = null;
    });
    setupWindow.loadFile(path.join(__dirname, 'setup.html'));
}

function registerIpc() {
    ipcMain.handle('models:status', () => engines.status());
    ipcMain.handle('models:skip', () => {
        engines.markSkipped();
        return { ok: true };
    });
    ipcMain.handle('models:open-setup', () => {
        openSetup();
        return { ok: true };
    });
    ipcMain.handle('models:download', async () => {
        try {
            await engines.install(broadcast);
            return { ok: true, status: engines.status() };
        } catch (err) {
            return { ok: false, error: err.message || 'The download did not finish.' };
        }
    });
    ipcMain.handle('assistant:ask', async (_event, payload) => {
        const message = String(payload && payload.message || '').slice(0, 4000);
        const snapshot = String(payload && payload.snapshot || '').slice(0, 8000);
        if (!message.trim()) return { ok: false, error: 'Say what you want changed.' };
        const current = engines.status();
        if (!current.ready) {
            return { ok: false, error: 'The notes model is not installed yet.', needsSetup: true };
        }
        try {
            const text = await complete(current.llamaBin, current.notesModel, message, snapshot);
            return { ok: true, text };
        } catch (err) {
            return { ok: false, error: err.message || 'The notes model did not answer.' };
        }
    });
    ipcMain.handle('assistant:minutes', async (_event, transcript) => {
        const current = engines.status();
        if (!current.ready) {
            return { ok: false, error: 'The notes model is not installed yet.', needsSetup: true };
        }
        try {
            const text = await completeMinutes(current.llamaBin, current.notesModel, transcript);
            return { ok: true, text };
        } catch (err) {
            return { ok: false, error: err.message || 'The notes model did not answer.' };
        }
    });
    ipcMain.handle('api:info', () => apiReady);
    ipcMain.handle('assistant:transcribe', async (_event, bytes) => {
        const current = engines.status();
        if (!current.whisper) {
            return {
                ok: false,
                error: current.includesSpeech
                    ? 'Download the speech model before recording.'
                    : 'Voice notes are not available on this Mac yet.',
                needsSetup: current.includesSpeech,
            };
        }
        const buf = Buffer.from(bytes || []);
        if (buf.length < 44 || buf.length > 30 * 1024 * 1024 || buf.toString('ascii', 0, 4) !== 'RIFF') {
            return { ok: false, error: 'That recording was empty or too long.' };
        }
        try {
            const text = await transcribe(current.whisperBin, current.speechModel, buf);
            return { ok: true, text };
        } catch (err) {
            return { ok: false, error: err.message || 'The recording could not be transcribed.' };
        }
    });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        const win = BrowserWindow.getAllWindows()[0];
        if (win) {
            if (win.isMinimized()) win.restore();
            win.focus();
        }
    });
    registerIpc();
    app.whenReady().then(() => {
        createWindow();
        const current = engines.status();
        if (current.supported && !current.ready && !current.skipped) openSetup();
        apiReady = startToolApi({ userData: app.getPath('userData'), callTool }).then((started) => ({
            baseUrl: started.info.baseUrl,
            port: started.info.port,
            token: started.info.token,
        })).catch(() => null);
    });
    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') app.quit();
    });
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
}
