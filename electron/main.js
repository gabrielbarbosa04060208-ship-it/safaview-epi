// SafeView EPI — v1
const { app, BrowserWindow, session, dialog, Menu, ipcMain } = require('electron');
const path   = require('path');
const fs     = require('fs');
const { spawn } = require('child_process');
const { startServer, stopServer } = require('./server');
const { assertProjectReady } = require('./preflight');

Menu.setApplicationMenu(null);

let safeviewWindow  = null;
let dashboardWindow = null;
let aiProcess       = null;
let aiRestartTimer  = null;
let isShuttingDown  = false;

const ICON_PATH = path.join(__dirname, 'icon.ico');

function resolvePythonCommand() {
  const isWin = process.platform === 'win32';
  const venvPy = isWin
    ? path.join(__dirname, '..', 'ai_engine', 'venv', 'Scripts', 'python.exe')
    : path.join(__dirname, '..', 'ai_engine', 'venv', 'bin', 'python');

  if (fs.existsSync(venvPy)) {
    return { cmd: venvPy, args: [] };
  }

  // Fallbacks para quando o setup.bat ainda não criou o venv
  if (isWin) {
    return { cmd: 'py', args: ['-3'] };
  }
  return { cmd: 'python3', args: [] };
}

function scheduleAiRestart(reason) {
  if (isShuttingDown || aiRestartTimer) return;
  console.log(`[AI] Agendando reinício em 3s (${reason}).`);
  aiRestartTimer = setTimeout(() => {
    aiRestartTimer = null;
    startAiEngine();
  }, 3000);
}

// ── AI Engine (Python subprocess) ────────────────────────────────────────────
function startAiEngine() {
  const engineScript = path.join(__dirname, '..', 'ai_engine', 'engine.py');

  if (!fs.existsSync(engineScript)) {
    console.log('[AI] engine.py não encontrado — AI Engine não iniciado.');
    return;
  }

  if (aiProcess) {
    return;
  }

  const { cmd, args } = resolvePythonCommand();
  const spawnArgs = [...args, 'engine.py'];

  console.log(`[AI] Iniciando: ${cmd} ${spawnArgs.join(' ')}`);

  aiProcess = spawn(cmd, spawnArgs, {
    cwd:   path.join(__dirname, '..', 'ai_engine'),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  aiProcess.stdout.on('data', (d) => process.stdout.write(`[AI] ${d}`));
  aiProcess.stderr.on('data', (d) => process.stderr.write(`[AI ERR] ${d}`));
  aiProcess.on('error', (err) => {
    console.error('[AI] Falha ao iniciar Python:', err.message);
    console.error('[AI] Verifique se Python está instalado e se o venv foi criado pelo setup.bat.');
    aiProcess = null;
    scheduleAiRestart('erro ao iniciar processo');
  });
  aiProcess.on('close', (code) => {
    console.log(`[AI] Processo encerrado (código ${code})`);
    aiProcess = null;
    if (!isShuttingDown && code !== 0) {
      scheduleAiRestart(`saída inesperada (código ${code})`);
    }
  });
}

function stopAiEngine() {
  isShuttingDown = true;
  if (aiRestartTimer) {
    clearTimeout(aiRestartTimer);
    aiRestartTimer = null;
  }
  if (aiProcess) {
    aiProcess.kill();
    aiProcess = null;
  }
}

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

// ── Chat IA via IPC ───────────────────────────────────────────────────────────
// CRÍTICO: renderer nunca faz fetch externo — Chromium intercepta SSE.
ipcMain.handle('chat:ask', async (event, { messages, sessionsContext, groqApiKey, geminiApiKey, provider }) => {
  const key = provider === 'groq'
    ? (groqApiKey || process.env.GROQ_API_KEY || '')
    : (geminiApiKey || process.env.GEMINI_API_KEY || '');

  if (!key) throw new Error('Chave ' + provider.toUpperCase() + ' não configurada. Acesse ⚙️.');
  if (!Array.isArray(messages) || messages.length === 0) throw new Error('Nenhuma mensagem para enviar.');

  const safeContext = (typeof sessionsContext === 'string' && sessionsContext.trim())
    ? sessionsContext : 'Nenhuma inspeção registrada ainda.';

  const systemPrompt =
    'Você é o assistente de segurança do SafeView EPI Dashboard.\n\n' +
    'DADOS DAS INSPEÇÕES:\n' + safeContext + '\n\n' +
    'INSTRUÇÕES:\n' +
    '- Responda sempre em português brasileiro.\n' +
    '- Use markdown quando apropriado.\n' +
    '- Níveis de risco: Baixo (<30%), Moderado (30-60%), Alto (>60%).\n' +
    '- Os eventos são: sem capacete, sem colete, sem luvas, sem óculos de proteção.\n' +
    '- Ajude a identificar padrões de não-conformidade, horários críticos e funcionários em risco.';

  if (provider === 'groq') {
    const msgs = [
      { role: 'system', content: systemPrompt },
      ...messages
        .filter(m => m.content?.trim())
        .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content.trim() })),
    ];
    const res  = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      // stream: false — NUNCA stream:true no Electron
      body:    JSON.stringify({ model: 'llama-3.1-8b-instant', messages: msgs, stream: false, max_tokens: 2048 }),
    });
    const data = JSON.parse(await res.text());
    if (!res.ok) throw new Error('Groq ' + res.status + ': ' + (data?.error?.message || ''));
    const text = data?.choices?.[0]?.message?.content;
    if (!text) throw new Error('Groq não retornou texto.');
    return text;
  }

  // Gemini com fallback de modelos
  const MODELS = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-flash-8b'];
  let lastError = '';
  for (const model of MODELS) {
    const url  = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    const contents = messages
      .filter(m => m.content?.trim())
      .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content.trim() }] }));
    // systemInstruction camelCase — snake_case causa 400 INVALID_ARGUMENT
    const r    = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig:  { temperature: 0.7, maxOutputTokens: 2048 },
      }),
    });
    const data = await r.json();
    if (r.ok) {
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return text;
    }
    lastError = data?.error?.message || '';
  }
  throw new Error('Gemini falhou: ' + lastError.slice(0, 200));
});

// ── Janelas ───────────────────────────────────────────────────────────────────
function createSafeviewWindow() {
  safeviewWindow = new BrowserWindow({
    width: 1024, height: 768, minWidth: 800, minHeight: 600,
    title: 'SafeView EPI — Detector de EPI',
    autoHideMenuBar: true, frame: false, icon: ICON_PATH,
    webPreferences: {
      nodeIntegration: false, contextIsolation: true,
      webSecurity: false, allowRunningInsecureContent: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  safeviewWindow.loadFile(path.join(__dirname, '..', 'apps', 'safeview', 'dist', 'index.html'));
  safeviewWindow.on('closed', () => { safeviewWindow = null; });
  safeviewWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12') { safeviewWindow.webContents.toggleDevTools(); event.preventDefault(); }
  });
}

function createDashboardWindow() {
  dashboardWindow = new BrowserWindow({
    width: 1400, height: 900, minWidth: 900, minHeight: 600,
    title: 'SafeView EPI — Dashboard',
    autoHideMenuBar: true, frame: false, icon: ICON_PATH,
    webPreferences: {
      nodeIntegration: false, contextIsolation: true,
      webSecurity: false, allowRunningInsecureContent: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  dashboardWindow.loadFile(path.join(__dirname, '..', 'apps', 'dashboard', 'dist', 'index.html'));
  dashboardWindow.on('closed', () => { dashboardWindow = null; });
  dashboardWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12') { dashboardWindow.webContents.toggleDevTools(); event.preventDefault(); }
  });
}

// ── Inicialização ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  try {
    assertProjectReady();
  } catch (err) {
    dialog.showErrorBox('SafeView EPI — Configuração Incompleta', err.message);
    app.quit();
    return;
  }

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: " +
          "http://127.0.0.1:3001 ws://127.0.0.1:3001 ws://127.0.0.1:3002 https: wss:"
        ],
      },
    });
  });

  try {
    await startServer();
  } catch (err) {
    dialog.showErrorBox(
      'SafeView EPI — Erro ao Iniciar',
      `Não foi possível iniciar o servidor interno.\n\nCausa: ${err.message}\n\n` +
      `Verifique se outra instância já está aberta, ou reinicie o computador.`
    );
    app.quit();
    return;
  }

  startAiEngine();    // inicia Python depois que o Express já está no ar
  createSafeviewWindow();
  createDashboardWindow();

  app.on('activate', () => {
    if (!aiProcess) startAiEngine();
    if (!safeviewWindow)  createSafeviewWindow();
    if (!dashboardWindow) createDashboardWindow();
  });
}).catch((err) => {
  dialog.showErrorBox('SafeView EPI — Erro Inesperado', `Detalhes: ${err.message}`);
  app.quit();
});

app.on('window-all-closed', () => {
  stopAiEngine();
  stopServer().finally(() => {
    if (process.platform !== 'darwin') app.quit();
  });
});
