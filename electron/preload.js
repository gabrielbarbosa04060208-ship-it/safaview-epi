// SafeView EPI — v1
// preload.js — bridge entre renderer (React) e main process (Node.js)
// contextIsolation: true — expõe apenas o necessário via contextBridge
const { contextBridge, ipcRenderer, shell } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // URLs do servidor local
  apiUrl:   'http://127.0.0.1:3001',  // Express API (sessões, SQLite)
  wsUrl:    'ws://127.0.0.1:3001',    // WebSocket de sessões (broadcast)
  aiWsUrl:  'ws://127.0.0.1:3002',    // WebSocket do AI Engine Python (frames)

  // Abre links externos no navegador padrão do SO
  openExternal: (url) => {
    if (typeof url === 'string' && url.startsWith('https://'))
      shell.openExternal(url);
  },

  // Controles da janela (frame: false — sem barra nativa do SO)
  windowControls: {
    minimize:       () => ipcRenderer.send('window-minimize'),
    maximizeToggle: () => ipcRenderer.invoke('window-maximize-toggle'),
    close:          () => ipcRenderer.send('window-close'),
  },

  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),

  // Chat IA — NUNCA fazer fetch externo no renderer
  // O Chromium intercepta SSE. IPC → main → Node.js → API externa.
  chatAsk: (payload) => ipcRenderer.invoke('chat:ask', payload),
});
