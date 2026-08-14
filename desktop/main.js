/**
 * Crapper Keeper — Windows/macOS desktop shell.
 * Loads the live Firebase web app so Markdown/HTML-HTMX stay in sync with hosting.
 */

const { app, BrowserWindow, shell } = require('electron');
const path = require('node:path');

const START_URL = 'https://davidthegnomadorg.web.app/crapper-keeper/';

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
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
        },
    });

    win.webContents.setWindowOpenHandler(({ url }) => {
        if (isOAuthPopup(url)) {
            return {
                action: 'allow',
                overrideBrowserWindowOptions: {
                    width: 520,
                    height: 680,
                    autoHideMenuBar: true,
                    webPreferences: {
                        nodeIntegration: false,
                        contextIsolation: true,
                        sandbox: true,
                    },
                },
            };
        }
        shell.openExternal(url);
        return { action: 'deny' };
    });

    const ua = win.webContents.getUserAgent().replace(/\sElectron\/\S+/g, '');
    win.loadURL(START_URL, { userAgent: ua });
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
    app.whenReady().then(createWindow);
    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') app.quit();
    });
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
}
