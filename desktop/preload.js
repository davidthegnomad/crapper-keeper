/**
 * The web app can ask the desktop shell to run the local models.
 * No Node APIs are exposed to the page.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ckDesktop', {
    modelsStatus: () => ipcRenderer.invoke('models:status'),
    downloadModels: () => ipcRenderer.invoke('models:download'),
    skipModels: () => ipcRenderer.invoke('models:skip'),
    openSetup: () => ipcRenderer.invoke('models:open-setup'),
    onProgress: (cb) => {
        const fn = (_event, data) => cb(data);
        ipcRenderer.on('models:progress', fn);
        return () => ipcRenderer.removeListener('models:progress', fn);
    },
    ask: (payload) => ipcRenderer.invoke('assistant:ask', payload),
    minutes: (transcript) => ipcRenderer.invoke('assistant:minutes', transcript),
    transcribe: (wav) => ipcRenderer.invoke('assistant:transcribe', wav),
    apiInfo: () => ipcRenderer.invoke('api:info'),
    onToolCall: (cb) => {
        const fn = (_event, data) => cb(data);
        ipcRenderer.on('ck-tool-call', fn);
        return () => ipcRenderer.removeListener('ck-tool-call', fn);
    },
    submitToolResult: (msg) => ipcRenderer.send('ck-tool-result', msg),
});
