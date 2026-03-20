// SafeView 4.0 - v49 | Feito por Gabriel Madureira em 14/03/2026
const { contextBridge, ipcRenderer, shell } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  apiUrl: 'http://127.0.0.1:3001',
  wsUrl:  'ws://127.0.0.1:3001',

  openExternal: (url) => {
    if (typeof url === 'string' && url.startsWith('https://')) {
      shell.openExternal(url);
    }
  },

  windowControls: {
    minimize:       () => ipcRenderer.send('window-minimize'),
    maximizeToggle: () => ipcRenderer.invoke('window-maximize-toggle'),
    close:          () => ipcRenderer.send('window-close'),
  },

  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),

  chatAsk: (payload) => ipcRenderer.invoke('chat:ask', payload),
});
