// SafeView EPI — v1 | Feito por Gabriel Madureira
const express = require('express');
const cors    = require('cors');
const http    = require('http');
const { WebSocketServer } = require('ws');
const { randomUUID } = require('crypto');
const { initDb, queryAll, queryOne, run, saveFlushed } = require('./database');

const app         = express();
const server      = http.createServer(app);
const wss         = new WebSocketServer({ server });
const PORT        = 3001;
const activeSockets = new Set(); // rastreia todos os sockets HTTP abertos

server.on('connection', (socket) => {
  activeSockets.add(socket);
  socket.on('close', () => activeSockets.delete(socket));
});

app.use(cors());
// Limite aumentado para 10mb: o body /chat inclui o sessionsContext completo
app.use(express.json({ limit: '10mb' }));

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(c => { if (c.readyState === 1) c.send(msg); });
}
wss.on('connection', ws => {
  console.log('[WS] cliente conectado');
  ws.on('close', () => console.log('[WS] cliente desconectado'));
});

// GET /sessions
app.get('/sessions', (req, res) => {
  try {
    const limitRaw  = parseInt(req.query.limit, 10);
    const offsetRaw = parseInt(req.query.offset, 10);
    const limit  = Number.isFinite(limitRaw)  && limitRaw  > 0 ? limitRaw  : 200;
    const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;
    const data   = queryAll(
      `SELECT * FROM sessoes_de_monitoramento ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    const countRow = queryOne(`SELECT COUNT(*) as count FROM sessoes_de_monitoramento`);
    res.json({ data, count: countRow ? countRow.count : 0 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /sessions/:id
app.get('/sessions/:id', (req, res) => {
  try {
    const session = queryOne(
      `SELECT * FROM sessoes_de_monitoramento WHERE id = ?`, [req.params.id]
    );
    if (!session) return res.status(404).json({ error: 'Sessão não encontrada' });
    res.json(session);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /sessions
app.post('/sessions', (req, res) => {
  try {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ error: 'Body ausente ou Content-Type inválido.' });
    }
    const {
      id = randomUUID(),
      duracao_segundos     = 0,
      eventos_sem_capacete = 0,
      eventos_sem_colete   = 0,
      eventos_sem_luvas    = 0,
      eventos_sem_oculos   = 0,
      nivel_risco          = 0,
      pico_risco           = 0,
      total_alertas        = 0,
      nome_funcionario     = null,
      local_trabalho       = null,
      trabalho_realizado   = null,
      informacoes_adicionais = null,
    } = req.body;

    // created_at gerado pelo Node.js em ISO UTC (com Z):
    // sql.js roda em WASM sem acesso ao timezone do SO, então
    // datetime('now','localtime') retorna UTC — incorreto para usuários UTC-3.
    const created_at = new Date().toISOString();

    run(
      `INSERT INTO sessoes_de_monitoramento
        (id, created_at, duracao_segundos,
         eventos_sem_capacete, eventos_sem_colete, eventos_sem_luvas, eventos_sem_oculos,
         nivel_risco, pico_risco, total_alertas,
         nome_funcionario, local_trabalho, trabalho_realizado, informacoes_adicionais)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, created_at, duracao_segundos,
       eventos_sem_capacete, eventos_sem_colete, eventos_sem_luvas, eventos_sem_oculos,
       nivel_risco, pico_risco, total_alertas,
       nome_funcionario, local_trabalho, trabalho_realizado, informacoes_adicionais]
    );

    const saved = queryOne(`SELECT * FROM sessoes_de_monitoramento WHERE id = ?`, [id]);
    broadcast({ type: 'SESSION_CREATED', session: saved });
    res.status(201).json(saved);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /sessions/:id
app.patch('/sessions/:id', (req, res) => {
  try {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ error: 'Body ausente ou Content-Type inválido.' });
    }
    const allowed = [
      'duracao_segundos',
      'eventos_sem_capacete', 'eventos_sem_colete',
      'eventos_sem_luvas',    'eventos_sem_oculos',
      'nivel_risco', 'pico_risco', 'total_alertas',
      'nome_funcionario', 'local_trabalho',
      'trabalho_realizado', 'informacoes_adicionais'
    ];
    const entries = Object.entries(req.body).filter(([k]) => allowed.includes(k));
    if (!entries.length) return res.status(400).json({ error: 'Nenhum campo válido' });

    const sets   = entries.map(([k]) => `${k} = ?`).join(', ');
    const values = [...entries.map(([, v]) => v), req.params.id];
    run(`UPDATE sessoes_de_monitoramento SET ${sets} WHERE id = ?`, values);
    // saveFlushed: a atualização final de sessão (endSession) é crítica.
    // Garante persistência síncrona imediata, protegendo contra perda de dados.
    saveFlushed();

    const updated = queryOne(`SELECT * FROM sessoes_de_monitoramento WHERE id = ?`, [req.params.id]);
    if (!updated) return res.status(404).json({ error: 'Sessão não encontrada' });
    broadcast({ type: 'SESSION_UPDATED', session: updated });
    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /sessions/:id
app.delete('/sessions/:id', (req, res) => {
  try {
    const existing = queryOne(`SELECT id FROM sessoes_de_monitoramento WHERE id = ?`, [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Sessão não encontrada' });
    run(`DELETE FROM sessoes_de_monitoramento WHERE id = ?`, [req.params.id]);
    broadcast({ type: 'SESSION_DELETED', id: req.params.id });
    res.status(204).end();
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /debug-chat — testa a conexão com a API sem precisar do frontend
app.get('/debug-chat', async (req, res) => {
  const key      = req.query.key || '';
  const provider = req.query.provider || 'groq';
  if (!key) {
    return res.json({
      status: 'sem chave',
      instrucao: 'Use: http://127.0.0.1:3001/debug-chat?key=SUA_CHAVE&provider=groq',
    });
  }
  try {
    let url, headers, body;
    if (provider === 'groq') {
      url     = 'https://api.groq.com/openai/v1/chat/completions';
      headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key };
      body    = JSON.stringify({ model: 'llama-3.1-8b-instant', messages: [{ role: 'user', content: 'Responda apenas: OK' }], max_tokens: 10 });
    } else {
      url     = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + key;
      headers = { 'Content-Type': 'application/json' };
      body    = JSON.stringify({ systemInstruction: { parts: [{ text: 'Você é um assistente.' }] }, contents: [{ role: 'user', parts: [{ text: 'Responda apenas: OK' }] }], generationConfig: { maxOutputTokens: 10 } });
    }
    const r    = await fetch(url, { method: 'POST', headers, body });
    const data = await r.json();
    const text = provider === 'groq'
      ? data?.choices?.[0]?.message?.content
      : data?.candidates?.[0]?.content?.parts?.[0]?.text;
    res.json({ status: r.status, ok: r.ok, text, error: data?.error || null });
  } catch (err) {
    res.json({ status: 'exception', error: err.message });
  }
});

// POST /chat — Groq (provider='groq') ou Gemini (provider='gemini')
app.post('/chat', async (req, res) => {
  let step = 'init';
  try {
    step = 'parse_body';
    const { messages, sessionsContext, geminiApiKey, groqApiKey, provider = 'groq' } = req.body;

    step = 'select_key';
    const API_KEY = provider === 'groq'
      ? (groqApiKey || process.env.GROQ_API_KEY || '')
      : (geminiApiKey || process.env.GEMINI_API_KEY || '');

    if (!API_KEY) {
      return res.status(401).json({ error: `Chave ${provider.toUpperCase()} não configurada. Acesse ⚙️.` });
    }

    const safeContext = (typeof sessionsContext === 'string' && sessionsContext.trim())
      ? sessionsContext : 'Nenhuma sessão registrada ainda.';

    // Sistema: contexto de segurança industrial, não mais fadiga
    const systemPrompt =
      'Você é o assistente de segurança do SafeView EPI Dashboard.\n\n' +
      'DADOS DAS INSPEÇÕES:\n' + safeContext + '\n\n' +
      'INSTRUÇÕES:\n' +
      '- Responda sempre em português brasileiro.\n' +
      '- Use markdown quando apropriado.\n' +
      '- Níveis de risco: Baixo (<30% alertas), Moderado (30-60%), Alto (>60%).\n' +
      '- Os eventos possíveis são: sem capacete, sem colete, sem luvas, sem óculos de proteção.\n' +
      '- Ajude a identificar padrões de não-conformidade, horários críticos e funcionários em risco.\n' +
      '- Sugira ações preventivas baseadas nos dados apresentados.';

    // ── GROQ ─────────────────────────────────────────────────────────────────
    if (provider === 'groq') {
      step = 'build_groq_messages';
      const openAiMessages = [
        { role: 'system', content: systemPrompt },
        ...messages
          .filter(m => m.content && typeof m.content === 'string' && m.content.trim())
          .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content.trim() })),
      ];

      step = 'groq_fetch';
      // SEM AbortController para evitar problemas com Electron
      // stream: false — CRÍTICO: stream:true quebra no Electron (Chromium intercepta SSE)
      const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + API_KEY },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: openAiMessages,
          stream: false,
          max_tokens: 2048,
          temperature: 0.7,
        }),
      });

      step = 'groq_read_text';
      const groqRaw = await groqResponse.text();

      step = 'groq_parse_json';
      const groqData = JSON.parse(groqRaw);

      step = 'groq_extract_text';
      if (!groqResponse.ok) {
        const errMsg = groqData?.error?.message || groqRaw.slice(0, 200);
        return res.status(groqResponse.status).json({ error: 'Groq ' + groqResponse.status + ': ' + errMsg });
      }

      const groqText = groqData?.choices?.[0]?.message?.content || '';
      if (!groqText) {
        return res.status(502).json({ error: 'Groq não retornou texto. Raw: ' + groqRaw.slice(0, 300) });
      }

      step = 'send_response';
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.write('data: ' + JSON.stringify(groqText) + '\n\n');
      res.write('data: "[DONE]"\n\n');
      res.end();
      return;
    }

    // ── GEMINI ────────────────────────────────────────────────────────────────
    step = 'build_gemini_body';
    const geminiContents = messages
      .filter(m => m.content && typeof m.content === 'string' && m.content.trim())
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content.trim() }],
      }));

    if (geminiContents.length === 0 || geminiContents[0].role !== 'user') {
      return res.status(400).json({ error: 'Mensagens inválidas para Gemini.' });
    }

    const GEMINI_MODELS = [
      'gemini-2.0-flash',
      'gemini-1.5-flash',
      'gemini-1.5-flash-8b',
    ];

    let geminiText  = '';
    let geminiStatus = null;
    let geminiError  = '';

    for (const model of GEMINI_MODELS) {
      step = 'gemini_fetch_' + model;
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;
      const geminiResponse = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // systemInstruction em camelCase — snake_case causa 400 em alguns gateways
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: geminiContents,
          // Sem candidateCount — inválido para generateContent e causa 400
          generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
        }),
      });

      geminiStatus = geminiResponse.status;
      const geminiRaw  = await geminiResponse.text();
      const geminiData = JSON.parse(geminiRaw);

      if (geminiResponse.ok) {
        geminiText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (geminiText) break;
      }
      geminiError = geminiData?.error?.message || geminiRaw.slice(0, 200);
    }

    if (!geminiText) {
      return res.status(geminiStatus || 500).json({ error: geminiError || 'Gemini não retornou texto.' });
    }

    step = 'send_gemini_response';
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.write('data: ' + JSON.stringify(geminiText) + '\n\n');
    res.write('data: "[DONE]"\n\n');
    res.end();

  } catch (err) {
    const detail = 'step=' + step + ' name=' + err.name + ' msg=' + err.message;
    console.error('[Chat] ERRO INESPERADO:', detail);
    if (res.headersSent) { res.end(); return; }
    res.status(500).json({ error: detail });
  }
});

async function startServer() {
  await initDb(); // banco ANTES do servidor
  return new Promise((resolve, reject) => {
    server.once('error', (err) => { reject(err); });
    server.listen(PORT, '127.0.0.1', () => {
      server.off('error', reject);
      console.log(`[Server] http://127.0.0.1:${PORT}`);
      resolve();
    });
  });
}

function stopServer() {
  wss.clients.forEach(ws => ws.terminate());
  // Destrói todos os sockets HTTP ativos (inclui streams SSE do /chat)
  // Sem isso, server.close() trava enquanto houver stream em andamento
  activeSockets.forEach(socket => socket.destroy());
  return new Promise(resolve => {
    const timeout = setTimeout(resolve, 3000);
    server.close(() => { clearTimeout(timeout); resolve(); });
  });
}

module.exports = { startServer, stopServer };
