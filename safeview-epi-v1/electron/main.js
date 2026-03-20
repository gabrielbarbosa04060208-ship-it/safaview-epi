// SafeView 4.0 - v49 | Feito por Gabriel Madureira em 14/03/2026
const { app, BrowserWindow, session, dialog, Menu, ipcMain } = require('electron');
const path = require('path');
const { startServer, stopServer } = require('./server');

Menu.setApplicationMenu(null);

let safeviewWindow    = null;
let dashboardWindow   = null;
let safeviewEpiWindow = null;

const ICON_PATH = path.join(__dirname, 'icon.ico');

// ── Controles de janela via IPC ───────────────────────────────────────────────
ipcMain.on('window-minimize', (e) => {
  BrowserWindow.fromWebContents(e.sender)?.minimize();
});
ipcMain.handle('window-maximize-toggle', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!win) return false;
  if (win.isMaximized()) win.unmaximize(); else win.maximize();
  return win.isMaximized();
});
ipcMain.handle('window-is-maximized', (e) => {
  return BrowserWindow.fromWebContents(e.sender)?.isMaximized() ?? false;
});
ipcMain.on('window-close', (e) => {
  BrowserWindow.fromWebContents(e.sender)?.close();
});

// IPC: chat:ask — renderer chama, main faz o fetch para Groq/Gemini
ipcMain.handle('chat:ask', async (event, { messages, sessionsContext, groqApiKey, geminiApiKey, provider }) => {
  const key = provider === 'groq'
    ? (groqApiKey || process.env.GROQ_API_KEY || '')
    : (geminiApiKey || process.env.GEMINI_API_KEY || '');

  if (!key) throw new Error('Chave ' + provider.toUpperCase() + ' não configurada. Acesse ⚙️.');
  if (!Array.isArray(messages) || messages.length === 0) throw new Error('Nenhuma mensagem para enviar.');

  const safeContext = (typeof sessionsContext === 'string' && sessionsContext.trim())
    ? sessionsContext : 'Nenhuma sessão registrada ainda.';

  const systemPrompt = 'Você é o assistente de IA do SafeView Dashboard.\n\nDADOS DAS SESSÕES:\n' + safeContext + '\n\nINSTRUÇÕES:\n- Responda sempre em português brasileiro.\n- Use markdown quando apropriado.\n- Níveis de fadiga: Baixa (<30%), Moderada (30-60%), Alta (>60%).';

  if (provider === 'groq') {
    const openAiMessages = [
      { role: 'system', content: systemPrompt },
      ...messages
        .filter(m => m.content && typeof m.content === 'string' && m.content.trim())
        .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content.trim() })),
    ];

    const models = ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile', 'gemma2-9b-it'];
    let lastError = '';

    for (const model of models) {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
        body: JSON.stringify({ model, messages: openAiMessages, stream: false, max_tokens: 2048, temperature: 0.7 }),
      });
      const raw = await res.text();
      if (!res.ok) { lastError = raw; if (res.status === 404 || res.status === 429) continue; break; }
      const data = JSON.parse(raw);
      const text = data?.choices?.[0]?.message?.content;
      if (text) return text;
    }
    throw new Error('Groq falhou: ' + lastError.slice(0, 200));
  }

  // Gemini
  const geminiContents = messages
    .filter(m => m.content && typeof m.content === 'string' && m.content.trim())
    .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content.trim() }] }));

  if (!geminiContents.length || geminiContents[0].role !== 'user')
    throw new Error('Mensagens inválidas para Gemini.');

  const models = ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash', 'gemini-1.5-flash-8b'];
  let lastError = '';
  for (const model of models) {
    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + key,
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: systemPrompt }] }, contents: geminiContents, generationConfig: { temperature: 0.7, maxOutputTokens: 2048 } }) }
    );
    const raw = await res.text();
    if (!res.ok) { lastError = raw; const isQuota = raw.includes('limit: 0') || raw.includes('PerDay'); if (isQuota) continue; break; }
    const data = JSON.parse(raw);
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) return text;
  }
  throw new Error('Gemini falhou: ' + lastError.slice(0, 200));
});

// ── Janelas ───────────────────────────────────────────────────────────────────
function createSafeviewWindow() {
  safeviewWindow = new BrowserWindow({
    width: 1024, height: 768,
    minWidth: 800, minHeight: 600,
    title: 'SafeView 4.0 — Detector de Fadiga',
    autoHideMenuBar: true,
    frame: false,
    icon: ICON_PATH,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      allowRunningInsecureContent: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  const indexPath = path.join(__dirname, '..', 'apps', 'safeview', 'dist', 'index.html');
  safeviewWindow.loadFile(indexPath);
  safeviewWindow.on('closed', () => { safeviewWindow = null; });
  safeviewWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12') { safeviewWindow.webContents.toggleDevTools(); event.preventDefault(); }
  });
}

function createDashboardWindow() {
  dashboardWindow = new BrowserWindow({
    width: 1400, height: 900,
    minWidth: 900, minHeight: 600,
    title: 'SafeView Dashboard',
    autoHideMenuBar: true,
    frame: false,
    icon: ICON_PATH,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      allowRunningInsecureContent: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  const indexPath = path.join(__dirname, '..', 'apps', 'dashboard', 'dist', 'index.html');
  dashboardWindow.loadFile(indexPath);
  dashboardWindow.on('closed', () => { dashboardWindow = null; });
  dashboardWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12') { dashboardWindow.webContents.toggleDevTools(); event.preventDefault(); }
  });
}

function createSafeviewEpiWindow() {
  safeviewEpiWindow = new BrowserWindow({
    width: 800, height: 700,
    minWidth: 480, minHeight: 600,
    title: 'SafeView EPI — Detector de EPIs',
    autoHideMenuBar: true,
    frame: false,
    icon: ICON_PATH,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      allowRunningInsecureContent: true,
      preload: path.join(__dirname, 'preload.js'),
      // Partition isolada — habilita SharedArrayBuffer para onnxruntime-web
      // sem afetar SafeView Fadiga (MediaPipe CDN) nem Dashboard (Groq/Gemini)
      partition: 'persist:safeview-epi',
    },
  });
  const indexPath = path.join(__dirname, '..', 'apps', 'safeview-epi', 'dist', 'index.html');
  safeviewEpiWindow.loadFile(indexPath);
  safeviewEpiWindow.on('closed', () => { safeviewEpiWindow = null; });
  safeviewEpiWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12') { safeviewEpiWindow.webContents.toggleDevTools(); event.preventDefault(); }
  });
}

app.whenReady().then(async () => {
  // CSP global para SafeView Fadiga e Dashboard
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: http://127.0.0.1:3001 ws://127.0.0.1:3001 https: wss:"
        ]
      }
    });
  });

  // Sessão isolada para SafeView EPI — COOP/COEP necessários para SharedArrayBuffer
  const epiSession = session.fromPartition('persist:safeview-epi');
  epiSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: http://127.0.0.1:3001 ws://127.0.0.1:3001 https: wss:"
        ],
        'Cross-Origin-Opener-Policy':   ['same-origin'],
        'Cross-Origin-Embedder-Policy': ['require-corp'],
      }
    });
  });

  try {
    await startServer();
  } catch (err) {
    dialog.showErrorBox(
      'SafeView — Erro ao Iniciar',
      `Não foi possível iniciar o servidor interno.\n\nCausa: ${err.message}\n\nSolução: Verifique se outra instância do SafeView já está aberta, ou reinicie o computador e tente novamente.`
    );
    app.quit();
    return;
  }

  createSafeviewWindow();
  createDashboardWindow();
  createSafeviewEpiWindow();

  app.on('activate', () => {
    if (!safeviewWindow)    createSafeviewWindow();
    if (!dashboardWindow)   createDashboardWindow();
    if (!safeviewEpiWindow) createSafeviewEpiWindow();
  });
}).catch((err) => {
  dialog.showErrorBox('SafeView — Erro Inesperado', `Ocorreu um erro inesperado na inicialização.\n\nDetalhes: ${err.message}`);
  app.quit();
});

app.on('window-all-closed', () => {
  stopServer().finally(() => {
    if (process.platform !== 'darwin') app.quit();
  });
});
