// SafeView 4.0 - v49 | Feito por Gabriel Madureira em 14/03/2026
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
const activeSockets = new Set();

server.on('connection', (socket) => {
  activeSockets.add(socket);
  socket.on('close', () => activeSockets.delete(socket));
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(c => { if (c.readyState === 1) c.send(msg); });
}
wss.on('connection', ws => {
  console.log('[WS] cliente conectado');
  ws.on('close', () => console.log('[WS] cliente desconectado'));
});

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

app.get('/sessions/:id', (req, res) => {
  try {
    const session = queryOne(
      `SELECT * FROM sessoes_de_monitoramento WHERE id = ?`, [req.params.id]
    );
    if (!session) return res.status(404).json({ error: 'Sessão não encontrada' });
    res.json(session);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/sessions', (req, res) => {
  try {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ error: 'Body ausente ou Content-Type inválido.' });
    }
    const {
      id = randomUUID(),
      duracao_segundos = 0, eventos_bocejos = 0, eventos_olhos_fechados = 0,
      media_fadiga = 0, pico_fadiga = 0, total_alertas = 0,
      nome_funcionario = null, local_trabalho = null,
      trabalho_realizado = null, informacoes_adicionais = null,
    } = req.body;

    const created_at = new Date().toISOString();

    run(
      `INSERT INTO sessoes_de_monitoramento
        (id, created_at, duracao_segundos, eventos_bocejos, eventos_olhos_fechados,
         media_fadiga, pico_fadiga, total_alertas, nome_funcionario,
         local_trabalho, trabalho_realizado, informacoes_adicionais)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, created_at, duracao_segundos, eventos_bocejos, eventos_olhos_fechados,
       media_fadiga, pico_fadiga, total_alertas, nome_funcionario,
       local_trabalho, trabalho_realizado, informacoes_adicionais]
    );

    const saved = queryOne(`SELECT * FROM sessoes_de_monitoramento WHERE id = ?`, [id]);
    broadcast({ type: 'SESSION_CREATED', session: saved });
    res.status(201).json(saved);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/sessions/:id', (req, res) => {
  try {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ error: 'Body ausente ou Content-Type inválido.' });
    }
    const allowed = ['duracao_segundos','eventos_bocejos','eventos_olhos_fechados',
                     'media_fadiga','pico_fadiga','total_alertas','nome_funcionario',
                     'local_trabalho','trabalho_realizado','informacoes_adicionais'];
    const entries = Object.entries(req.body).filter(([k]) => allowed.includes(k));
    if (!entries.length) return res.status(400).json({ error: 'Nenhum campo válido' });

    const sets   = entries.map(([k]) => `${k} = ?`).join(', ');
    const values = [...entries.map(([, v]) => v), req.params.id];
    run(`UPDATE sessoes_de_monitoramento SET ${sets} WHERE id = ?`, values);
    saveFlushed();

    const updated = queryOne(`SELECT * FROM sessoes_de_monitoramento WHERE id = ?`, [req.params.id]);
    broadcast({ type: 'SESSION_UPDATED', session: updated });
    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/sessions/:id', (req, res) => {
  try {
    run(`DELETE FROM sessoes_de_monitoramento WHERE id = ?`, [req.params.id]);
    broadcast({ type: 'SESSION_DELETED', id: req.params.id });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/chat-test', async (req, res) => {
  const { groqApiKey = '', geminiApiKey = '', provider = 'groq' } = req.body || {};
  const log = [];
  const L = (msg) => { console.log('[chat-test]', msg); log.push(msg); };
  L('provider=' + provider);
  const key = provider === 'groq' ? groqApiKey : geminiApiKey;
  L('key usada=' + (key ? key.slice(0,8)+'...' : 'VAZIA'));
  if (!key) return res.json({ ok: false, log, error: 'Chave vazia para provider=' + provider });
  try {
    if (provider === 'groq') {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
        body: JSON.stringify({ model: 'llama-3.1-8b-instant', messages: [{role:'system',content:'Assistente.'},{role:'user',content:'Diga: OK'}], max_tokens: 5, stream: false }),
        signal: AbortSignal.timeout(15000),
      });
      L('Groq HTTP status=' + r.status);
      const txt = await r.text();
      let data = {}; try { data = JSON.parse(txt); } catch {}
      return res.json({ ok: r.ok, status: r.status, text: data?.choices?.[0]?.message?.content, error: data?.error, raw: txt.slice(0,300), log });
    } else {
      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + key, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemInstruction:{parts:[{text:'Assistente.'}]}, contents:[{role:'user',parts:[{text:'Diga: OK'}]}], generationConfig:{maxOutputTokens:5} }),
        signal: AbortSignal.timeout(15000),
      });
      L('Gemini HTTP status=' + r.status);
      const txt = await r.text();
      let data = {}; try { data = JSON.parse(txt); } catch {}
      return res.json({ ok: r.ok, status: r.status, text: data?.candidates?.[0]?.content?.parts?.[0]?.text, error: data?.error, raw: txt.slice(0,300), log });
    }
  } catch (err) {
    L('EXCECAO: ' + err.message);
    return res.json({ ok: false, log, error: err.message });
  }
});

app.post('/chat', async (req, res) => {
  let step = 'init';
  try {
    step = 'parse_body';
    const { messages, sessionsContext, geminiApiKey, groqApiKey, provider = 'groq' } = req.body;
    step = 'select_key';
    const API_KEY = provider === 'groq'
      ? (groqApiKey || process.env.GROQ_API_KEY || '')
      : (geminiApiKey || process.env.GEMINI_API_KEY || '');
    step = 'validate_key';
    if (!API_KEY) return res.status(400).json({ error: 'Chave ' + provider.toUpperCase() + ' não configurada. Acesse ⚙️.' });
    step = 'validate_messages';
    if (!Array.isArray(messages) || messages.length === 0) return res.status(400).json({ error: 'Nenhuma mensagem para enviar.' });
    step = 'build_context';
    const safeContext = (typeof sessionsContext === 'string' && sessionsContext.trim()) ? sessionsContext : 'Nenhuma sessão registrada ainda.';
    const systemPrompt = 'Você é o assistente de IA do SafeView Dashboard.\n\nDADOS:\n' + safeContext + '\n\nINSTRUÇÕES:\n- Responda em português.\n- Use markdown.\n- Níveis: Baixa (<30%), Moderada (30-60%), Alta (>60%).';

    if (provider === 'groq') {
      const openAiMessages = [
        { role: 'system', content: systemPrompt },
        ...messages.filter(m => m.content && typeof m.content === 'string' && m.content.trim()).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content.trim() })),
      ];
      const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + API_KEY },
        body: JSON.stringify({ model: 'llama-3.1-8b-instant', messages: openAiMessages, stream: false, max_tokens: 2048, temperature: 0.7 }),
      });
      const groqRaw  = await groqResponse.text();
      const groqData = JSON.parse(groqRaw);
      if (!groqResponse.ok) return res.status(groqResponse.status).json({ error: groqData?.error?.message || groqRaw.slice(0,200) });
      const groqText = groqData?.choices?.[0]?.message?.content || '';
      if (!groqText) return res.status(502).json({ error: 'Groq não retornou texto.' });
      res.setHeader('Content-Type', 'text/event-stream');
      res.write('data: ' + JSON.stringify(groqText) + '\n\n');
      res.write('data: "[DONE]"\n\n');
      res.end();
      return;
    }

    const geminiContents = messages.filter(m => m.content && typeof m.content === 'string' && m.content.trim()).map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content.trim() }] }));
    if (geminiContents.length === 0 || geminiContents[0].role !== 'user') return res.status(400).json({ error: 'Mensagens inválidas para Gemini.' });
    const GEMINI_MODELS = ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash', 'gemini-1.5-flash-8b'];
    let geminiText = '', geminiStatus = 0, geminiError = '';
    for (const model of GEMINI_MODELS) {
      const geminiResponse = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + API_KEY, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: systemPrompt }] }, contents: geminiContents, generationConfig: { temperature: 0.7, maxOutputTokens: 2048 } }),
      });
      geminiStatus = geminiResponse.status;
      const geminiRaw  = await geminiResponse.text();
      const geminiData = JSON.parse(geminiRaw);
      if (!geminiResponse.ok) { geminiError = geminiData?.error?.message || geminiRaw.slice(0,200); const isQuota = geminiError.includes('limit: 0') || geminiError.includes('PerDay'); if (isQuota) continue; break; }
      geminiText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (geminiText) break;
    }
    if (!geminiText) return res.status(geminiStatus || 500).json({ error: geminiError || 'Gemini não retornou texto.' });
    res.setHeader('Content-Type', 'text/event-stream');
    res.write('data: ' + JSON.stringify(geminiText) + '\n\n');
    res.write('data: "[DONE]"\n\n');
    res.end();
  } catch (err) {
    const detail = 'step=' + step + ' msg=' + err.message;
    console.error('[Chat] ERRO:', detail);
    if (res.headersSent) { res.end(); return; }
    res.status(500).json({ error: detail });
  }
});

async function startServer() {
  await initDb();
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
  activeSockets.forEach(socket => socket.destroy());
  return new Promise(resolve => {
    const timeout = setTimeout(resolve, 3000);
    server.close(() => { clearTimeout(timeout); resolve(); });
  });
}

module.exports = { startServer, stopServer };
